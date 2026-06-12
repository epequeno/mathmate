import Foundation
import os

// MARK: - Model

struct ProviderPricing: Codable, Equatable, Sendable {
    let input: Double
    let output: Double
    let contextWindow: Int

    init(input: Double, output: Double, contextWindow: Int = 128000) {
        self.input = input
        self.output = output
        self.contextWindow = contextWindow
    }
}

// MARK: - OpenRouter API response

private struct OpenRouterModelEntry: Decodable {
    let id: String
    let context_length: Int?
    let pricing: OpenRouterPricingEntry?
}

private struct OpenRouterPricingEntry: Decodable {
    let prompt: String?
    let completion: String?
}

private struct OpenRouterApiResponse: Decodable {
    let data: [OpenRouterModelEntry]?
}

// MARK: - Cache file

private struct PricingCache: Codable, Sendable {
    let models: [String: ProviderPricing]
    let fetchedAt: Date
}

// MARK: - Thread-safe cache holder

/// Holds the runtime cache behind os_unfair_lock for Swift 6 Sendability.
/// `@unchecked` because `os_unfair_lock` and the cached `ProviderPricing` values
/// are not recognized as Sendable by the compiler. All access is lock-protected.
private final class PricingCacheManager: @unchecked Sendable {
    static let shared = PricingCacheManager()

    private var _cache: [String: ProviderPricing] = [:]
    private var _metadata: PricingCache?
    private var lock = os_unfair_lock()

    var cache: [String: ProviderPricing] {
        os_unfair_lock_lock(&lock); defer { os_unfair_lock_unlock(&lock) }
        return _cache
    }

    var metadata: PricingCache? {
        os_unfair_lock_lock(&lock); defer { os_unfair_lock_unlock(&lock) }
        return _metadata
    }

    func setCache(_ models: [String: ProviderPricing], metadata: PricingCache?) {
        os_unfair_lock_lock(&lock); defer { os_unfair_lock_unlock(&lock) }
        _cache = models
        _metadata = metadata
    }
}

// MARK: - Main API

/// Provides model pricing and context window data.
///
/// Pricing is sourced from:
/// 1. **Runtime cache** — fetched from OpenRouter API and persisted in UserDefaults.
/// 2. **Bundled JSON** — `model_prices.json` shipped with the app as a bootstrap.
/// 3. **Hardcoded fallback** — a couple of essential models.
///
/// Call `refreshFromAPI()` periodically (or from Settings on demand) to keep data fresh.
enum ModelPricing {

    // MARK: - Public API

    /// Look up pricing data for a model by its full OpenRouter ID string.
    static func lookup(model: String) -> ProviderPricing {
        let rt = cacheManager.cache
        // 1) Runtime cache (from UserDefaults)
        if let exact = rt[model] { return exact }
        if let prefix = prefixMatch(model: model, in: rt) { return prefix }

        // 2) Bundled JSON bootstrap
        if let exact = bootstrapTable[model] { return exact }
        if let prefix = prefixMatch(model: model, in: bootstrapTable) { return prefix }

        // 3) Hardcoded fallback
        if let exact = fallbackTable[model] { return exact }

        return ProviderPricing(input: 0.0, output: 0.0, contextWindow: 128_000)
    }

    /// When the runtime cache was last fetched from the API (nil if never fetched).
    static var lastRefreshedAt: Date? {
        cacheManager.metadata?.fetchedAt
    }

    /// Number of models in the runtime cache.
    static var cachedModelCount: Int {
        cacheManager.cache.count
    }

    /// Fetch the latest pricing from the OpenRouter public API and cache it.
    ///
    /// Runs the network request on a background thread. Call from any `Task`.
    static func refreshFromAPI() async throws {
        let url = URL(string: "https://openrouter.ai/api/v1/models")!
        let (data, _) = try await URLSession.shared.data(from: url)

        let response = try JSONDecoder().decode(OpenRouterApiResponse.self, from: data)
        guard let entries = response.data else {
            throw ModelPricingError.emptyResponse
        }

        var models: [String: ProviderPricing] = [:]
        for entry in entries {
            guard let ctx = entry.context_length, ctx > 0 else { continue }
            guard let p = entry.pricing,
                  let promptStr = p.prompt, let completionStr = p.completion,
                  let promptVal = Double(promptStr), let completionVal = Double(completionStr)
            else { continue }

            let promptPerM = (promptVal * 1_000_000).roundedToTwo
            let completionPerM = (completionVal * 1_000_000).roundedToTwo
            models[entry.id] = ProviderPricing(input: promptPerM, output: completionPerM, contextWindow: ctx)
        }

        let cache = PricingCache(models: models, fetchedAt: Date())

        // Persist to UserDefaults
        if let encoded = try? JSONEncoder().encode(cache) {
            UserDefaults.standard.set(encoded, forKey: cacheKey)
        }

        // Update in-memory cache
        cacheManager.setCache(models, metadata: cache)
    }

    // MARK: - Error

    enum ModelPricingError: LocalizedError {
        case emptyResponse

        var errorDescription: String? {
            switch self {
            case .emptyResponse: return "OpenRouter returned an empty model list."
            }
        }
    }

    // MARK: - Private

    private static let cacheKey = "MathMate_ModelPricingCache"
    private static let cacheManager = PricingCacheManager.shared

    /// Load runtime cache from UserDefaults on first module access.
    private static let _primeCache: Void = {
        guard let data = UserDefaults.standard.data(forKey: cacheKey),
              let cache = try? JSONDecoder().decode(PricingCache.self, from: data)
        else { return }
        cacheManager.setCache(cache.models, metadata: cache)
    }()

    /// Bundled JSON bootstrap — shipped with the app as a cold-start fallback.
    private static let bootstrapTable: [String: ProviderPricing] = {
        guard let url = Bundle.module.url(forResource: "model_prices", withExtension: "json") else { return [:] }
        guard let data = try? Data(contentsOf: url) else { return [:] }

        // The bundled JSON has shape { "models": { ... }, "_meta": { ... } }
        struct BundleWrapper: Decodable {
            let models: [String: ProviderPricing]
        }
        guard let decoded = try? JSONDecoder().decode(BundleWrapper.self, from: data) else { return [:] }
        return decoded.models
    }()

    /// Hardcoded fallback for essential models when nothing else is available.
    private static let fallbackTable: [String: ProviderPricing] = [
        "openrouter/auto": ProviderPricing(input: 0.0, output: 0.0, contextWindow: 2_000_000),
        "moonshotai/kimi-k2.6": ProviderPricing(input: 0.0, output: 0.0, contextWindow: 128_000),
    ]

    /// Prefix-based matching for version-suffixed model IDs.
    private static func prefixMatch(model: String, in table: [String: ProviderPricing]) -> ProviderPricing? {
        for (key, pricing) in table {
            if model.hasPrefix(key) || key.hasPrefix(model) {
                return pricing
            }
        }
        return nil
    }
}

// MARK: - Helpers

private extension Double {
    var roundedToTwo: Double {
        (self * 100).rounded() / 100
    }
}
