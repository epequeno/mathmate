import Foundation

struct ProviderConfig: Codable, Identifiable {
    var id: String { name }
    let name: String
    /// Whether this provider is enabled. Disabled providers are hidden from the model selector.
    var enabled: Bool = true
    /// Optional override for the env var name. Defaults to "{NAME}_API_KEY" (e.g. ANTHROPIC_API_KEY).
    let envKey: String?
    let baseURL: String
    let models: [String]
    let defaultModel: String
    var fetchModels: Bool = false

    /// Resolved environment variable name for this provider.
    var resolvedEnvKey: String {
        envKey ?? "\(name.uppercased().replacingOccurrences(of: "-", with: "_"))_API_KEY"
    }

    /// Reads the API key from the process environment.
    var apiKey: String? {
        ProcessInfo.processInfo.environment[resolvedEnvKey]
    }

    enum CodingKeys: String, CodingKey {
        case name, enabled, envKey, baseURL, models, defaultModel, fetchModels
    }

    init(name: String, enabled: Bool = true, envKey: String? = nil, baseURL: String, models: [String], defaultModel: String, fetchModels: Bool = false) {
        self.name = name
        self.enabled = enabled
        self.envKey = envKey
        self.baseURL = baseURL
        self.models = models
        self.defaultModel = defaultModel
        self.fetchModels = fetchModels
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        name = try container.decode(String.self, forKey: .name)
        enabled = try container.decodeIfPresent(Bool.self, forKey: .enabled) ?? true
        envKey = try container.decodeIfPresent(String.self, forKey: .envKey)
        baseURL = try container.decode(String.self, forKey: .baseURL)
        models = try container.decodeIfPresent([String].self, forKey: .models) ?? []
        defaultModel = try container.decode(String.self, forKey: .defaultModel)
        fetchModels = try container.decodeIfPresent(Bool.self, forKey: .fetchModels) ?? false
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(name, forKey: .name)
        try container.encode(enabled, forKey: .enabled)
        try container.encodeIfPresent(envKey, forKey: .envKey)
        try container.encode(baseURL, forKey: .baseURL)
        try container.encode(models, forKey: .models)
        try container.encode(defaultModel, forKey: .defaultModel)
    }
}

struct AppConfig: Codable {
    let latex: LaTeXConfig
    let synapse: SynapseConfig
    let chat: ChatConfig
    let ui: UIConfig

    enum CodingKeys: String, CodingKey {
        case latex, synapse, chat, ui, obsidian
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self.latex = try container.decode(LaTeXConfig.self, forKey: .latex)
        // Accept both "synapse" (new) and "obsidian" (legacy) keys
        if let synapse = try container.decodeIfPresent(SynapseConfig.self, forKey: .synapse) {
            self.synapse = synapse
        } else {
            self.synapse = try container.decode(SynapseConfig.self, forKey: .obsidian)
        }
        self.chat = try container.decode(ChatConfig.self, forKey: .chat)
        self.ui = try container.decode(UIConfig.self, forKey: .ui)
    }

    init(
        latex: LaTeXConfig,
        synapse: SynapseConfig,
        chat: ChatConfig,
        ui: UIConfig
    ) {
        self.latex = latex
        self.synapse = synapse
        self.chat = chat
        self.ui = ui
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(latex, forKey: .latex)
        try container.encode(synapse, forKey: .synapse)
        try container.encode(chat, forKey: .chat)
        try container.encode(ui, forKey: .ui)
    }

    struct LaTeXConfig: Codable {
        let engine: String
        let katexOptions: KaTeXOptions?
        let mathjaxOptions: MathJaxOptions?

        struct KaTeXOptions: Codable {
            let displayMode: Bool?
            let throwOnError: Bool?
            let errorColor: String?
        }

        struct MathJaxOptions: Codable {
            let tex: TexOptions?

            struct TexOptions: Codable {
                let inlineMath: [[String]]?
                let displayMath: [[String]]?
            }
        }
    }

    struct SynapseConfig: Codable {
        let vaults: [VaultConfig]?
        let studyLogPath: String?

        struct VaultConfig: Codable {
            let name: String
            let path: String
        }
    }

    struct ChatConfig: Codable {
        let systemPrompt: String?
        let maxTokens: Int?
        let temperature: Double?
    }

    struct UIConfig: Codable {
        let fontSize: Int?
        let showLatexPreview: Bool?
        let autoScroll: Bool?
    }
}

@MainActor
final class ConfigurationManager {
    static let shared = ConfigurationManager()
    private let configDirectory: URL = {
        FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(".mathmate")
    }()

    private init() {
        createConfigDirIfNeeded()
    }

    private func createConfigDirIfNeeded() {
        try? FileManager.default.createDirectory(at: configDirectory, withIntermediateDirectories: true)
    }

    /// Reads models config from disk or bundled template. I/O is safe from any actor.
    nonisolated func loadModelsConfig() -> AppConfigModels? {
        let fileURL = configDirectory.appendingPathComponent("models.json")
        // Try user config first
        if let data = try? Data(contentsOf: fileURL),
           let config = try? JSONDecoder().decode(AppConfigModels.self, from: data) {
            return config
        }
        // Fall back to bundled template if no user config exists
        if let templateURL = Bundle.module.url(forResource: "models", withExtension: "json"),
           let templateData = try? Data(contentsOf: templateURL),
           let config = try? JSONDecoder().decode(AppConfigModels.self, from: templateData) {
            return config
        }
        return nil
    }

    /// Saves models config to disk.
    nonisolated func saveModelsConfig(_ config: AppConfigModels) {
        let fileURL = configDirectory.appendingPathComponent("models.json")
        guard let data = try? JSONEncoder().encode(config) else { return }
        try? data.write(to: fileURL, options: .atomic)
    }

    /// Reads app config from disk.
    nonisolated func loadAppConfig() -> AppConfig? {
        let fileURL = configDirectory.appendingPathComponent("config.json")
        guard let data = try? Data(contentsOf: fileURL) else { return nil }
        return try? JSONDecoder().decode(AppConfig.self, from: data)
    }

    /// Saves app config to disk.
    nonisolated func saveAppConfig(_ config: AppConfig) {
        let fileURL = configDirectory.appendingPathComponent("config.json")
        guard let data = try? JSONEncoder().encode(config) else { return }
        try? data.write(to: fileURL, options: .atomic)
    }

    /// The models.json root structure
    struct AppConfigModels: Codable {
        var providers: [ProviderConfig]
    }
}
