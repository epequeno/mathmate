import Foundation

struct StreamToken {
    let thinking: String?
    let text: String?
    let usage: TokenUsage?
}

struct TokenUsage: Codable, Sendable {
    var promptTokens: Int
    var completionTokens: Int
    var reasoningTokens: Int
    var cacheReadTokens: Int
    var cacheWriteTokens: Int
}

struct ImageAttachment: Codable, Sendable, Identifiable {
    var id: UUID = UUID()
    var source: Source
    let altText: String?

    enum Source: Codable, Sendable {
        case base64(data: Data, mimeType: String)
        /// Disk-backed image — stored at `~/.mathmate/sessions/<sessionId>/images/<filename>`.
        /// Used after streaming completes to avoid holding large base64 Data in memory.
        case disk(sessionId: UUID, imageId: UUID, filename: String)
    }

    enum CodingKeys: String, CodingKey {
        case id, source, altText
    }

    init(id: UUID = UUID(), source: Source, altText: String? = nil) {
        self.id = id
        self.source = source
        self.altText = altText
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self.id = try container.decodeIfPresent(UUID.self, forKey: .id) ?? UUID()
        self.source = try container.decode(Source.self, forKey: .source)
        self.altText = try container.decodeIfPresent(String.self, forKey: .altText)
    }
}

/// A wrapper around ContentPart that provides stable identity for SwiftUI ForEach.
struct PartItem: Identifiable, Sendable, Codable {
    let id: UUID
    let part: ContentPart

    init(id: UUID = UUID(), part: ContentPart) {
        self.id = id
        self.part = part
    }

    init(_ part: ContentPart) {
        self.id = UUID()
        self.part = part
    }
}

// MARK: - ResponseUnit

/// The role a `ResponseUnit` plays in an assistant response.
enum ResponseUnitType: String, Codable, Sendable, CaseIterable {
    case thinking       // Raw reasoning trace — can collapse by default
    case explanation    // Teaching text + LaTeX — primary flag target
    case toolBlock      // Tool invocations + results
    case quizCard       // Native quiz primitive (free_response, multiple_choice)
    case hint           // Progressive hint stage
    case solutionReveal // Hidden solution, explicit user reveal
    case summary        // Compacted context — not flaggable
    case image          // Response-attached image
}

/// A named, typed segment within an assistant message.
struct ResponseUnit: Identifiable, Codable, Sendable {
    let id: UUID
    let type: ResponseUnitType
    var parts: [ContentPart]
    var toolEvents: [ToolEvent]
    var isFlagged: Bool
    let displayLabel: String

    init(id: UUID = UUID(), type: ResponseUnitType, parts: [ContentPart] = [], toolEvents: [ToolEvent] = [], isFlagged: Bool = false, displayLabel: String? = nil) {
        self.id = id
        self.type = type
        self.parts = parts
        self.toolEvents = toolEvents
        self.isFlagged = isFlagged
        self.displayLabel = displayLabel ?? type.defaultLabel
    }
}

extension ResponseUnitType {
    var defaultLabel: String {
        switch self {
        case .thinking: return "Thinking"
        case .explanation: return "Explanation"
        case .toolBlock: return "Tools"
        case .quizCard: return "Quiz"
        case .hint: return "Hint"
        case .solutionReveal: return "Solution"
        case .summary: return "Summary"
        case .image: return "Image"
        }
    }
}

enum ContentPart: Codable, Sendable {
    case text(String)
    case image(ImageAttachment)
}

struct MessagePayload: Sendable {
    enum Role { case system, user, assistant }
    let role: Role
    let parts: [ContentPart]

    static func text(_ role: Role, _ content: String) -> MessagePayload {
        MessagePayload(role: role, parts: [.text(content)])
    }
}

protocol ModelProvider: Sendable {
    func sendMessage(_ messages: [MessagePayload], model: String, maxTokens: Int?) async throws -> String
    func streamMessage(_ messages: [MessagePayload], model: String, maxTokens: Int?) -> AsyncThrowingStream<StreamToken, Error>
}

private extension ProviderConfig {
    func endpointURL(_ path: String) throws -> URL {
        let base = baseURL.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        guard let url = URL(string: "\(base)/\(path)") else {
            throw ProviderError.invalidEndpoint(baseURL: baseURL, path: path)
        }
        return url
    }
}

final class AnthropicProvider: ModelProvider, Sendable {
    let config: ProviderConfig
    init(config: ProviderConfig) { self.config = config }

    private func requireApiKey() throws -> String {
        guard let key = config.apiKey, !key.isEmpty else { throw ProviderError.missingApiKey(envVar: config.resolvedEnvKey) }
        return key
    }

    func sendMessage(_ messages: [MessagePayload], model: String, maxTokens: Int?) async throws -> String {
        let request = try buildRequest(messages: messages, model: model, maxTokens: maxTokens, stream: false)
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 else {
            let sCode = (response as? HTTPURLResponse)?.statusCode ?? 0
            let errorMsg = String(data: data, encoding: .utf8) ?? "Unknown Error"
            throw ProviderError.apiError(statusCode: sCode, message: errorMsg)
        }
        let json = try JSONSerialization.jsonObject(with: data) as? [String: Any]
        let contentBlocks = json?["content"] as? [[String: Any]] ?? []
        return contentBlocks.first { $0["type"] as? String == "text" }?["text"] as? String ?? ""
    }

    func streamMessage(_ messages: [MessagePayload], model: String, maxTokens: Int?) -> AsyncThrowingStream<StreamToken, Error> {
        let msgs = messages.map { $0 }
        return AsyncThrowingStream { continuation in
            Task {
                do {
                    let request = try buildRequest(messages: msgs, model: model, maxTokens: maxTokens, stream: true)
                    let (bytes, response) = try await URLSession.shared.bytes(for: request)
                    guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 else {
                        var errorBody = ""
                        for try await line in bytes.lines {
                            errorBody += line + "\n"
                        }
                        let sCode = (response as? HTTPURLResponse)?.statusCode ?? 0
                        throw ProviderError.apiError(statusCode: sCode, message: errorBody.isEmpty ? "Unknown Error" : errorBody)
                    }

                    for try await line in bytes.lines {
                        guard line.hasPrefix("data: ") else { continue }
                        let jsonString = String(line.dropFirst(6))
                        if jsonString == "[DONE]" { break }
                        guard let data = jsonString.data(using: .utf8), let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { continue }
                        guard let eventType = json["type"] as? String else { continue }

                        switch eventType {
                        case "content_block_delta":
                            if let delta = json["delta"] as? [String: Any] {
                                if let tx = delta["text"] as? String, !tx.isEmpty {
                                    continuation.yield(StreamToken(thinking: nil, text: tx, usage: nil))
                                }
                                if let th = delta["thinking"] as? String, !th.isEmpty {
                                    continuation.yield(StreamToken(thinking: th, text: nil, usage: nil))
                                }
                            }

                        case "message_delta":
                            if let usage = json["usage"] as? [String: Any] {
                                let tu = TokenUsage(promptTokens: 0, completionTokens: usage["output_tokens"] as? Int ?? 0, reasoningTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0)
                                continuation.yield(StreamToken(thinking: nil, text: nil, usage: tu))
                            }

                        default:
                            break
                        }
                    }
                    continuation.finish()
                } catch { continuation.finish(throwing: error) }
            }
        }
    }

    private func buildRequest(messages: [MessagePayload], model: String, maxTokens: Int?, stream: Bool) throws -> URLRequest {
        let apiKey = try requireApiKey()
        let url = try config.endpointURL("messages")
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(apiKey, forHTTPHeaderField: "x-api-key")
        request.setValue("2023-06-01", forHTTPHeaderField: "anthropic-version")

        let messageParts: [[String: Any]] = messages.compactMap { msg in
            switch msg.role {
            case .system:
                return nil
            case .user:
                let effectiveParts = ModelVisionRegistry.downgradeImages(in: msg.parts, model: model)
                let content: [[String: Any]] = effectiveParts.compactMap { part -> [String: Any]? in
                    if case .text(let s) = part { return ["type": "text", "text": s] }
                    if case .image(let img) = part {
                        if case .base64(let data, let mimeType) = img.source {
                            let base64String = data.base64EncodedString()
                            return [
                                "type": "image",
                                "source": [
                                    "type": "base64",
                                    "media_type": mimeType,
                                    "data": base64String
                                ]
                            ]
                        }
                        return nil
                    }
                    return nil
                }
                return ["role": "user", "content": content]
            case .assistant:
                let textParts = msg.parts.compactMap { part -> String? in
                    if case .text(let s) = part { return s }
                    return nil
                }
                if textParts.isEmpty { return nil }
                return ["role": "assistant", "content": textParts.map { ["type": "text", "text": $0] }]
            }
        }

        let systemPrompt = messages.first { $0.role == .system }?.parts.compactMap { part -> String? in
            if case .text(let s) = part { return s }
            return nil
        }.joined()

        var body: [String: Any] = ["model": model, "max_tokens": maxTokens ?? 4096, "stream": stream, "messages": messageParts]
        if let systemPrompt, !systemPrompt.isEmpty {
            body["system"] = systemPrompt
        }
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)
        return request
    }
}

final class OpenAIProvider: ModelProvider, Sendable {
    let config: ProviderConfig
    init(config: ProviderConfig) { self.config = config }

    private func requireApiKey() throws -> String {
        guard let key = config.apiKey, !key.isEmpty else { throw ProviderError.missingApiKey(envVar: config.resolvedEnvKey) }
        return key
    }

    func sendMessage(_ messages: [MessagePayload], model: String, maxTokens: Int?) async throws -> String {
        let request = try buildRequest(messages: messages, model: model, maxTokens: maxTokens, stream: false)
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 else {
            let sCode = (response as? HTTPURLResponse)?.statusCode ?? 0
            let errorMsg = String(data: data, encoding: .utf8) ?? "Unknown Error"
            throw ProviderError.apiError(statusCode: sCode, message: errorMsg)
        }
        let json = try JSONSerialization.jsonObject(with: data) as? [String: Any]
        let message = (json?["choices"] as? [[String: Any]])?.first?["message"] as? [String: Any]
        return message?["content"] as? String ?? ""
    }

    func streamMessage(_ messages: [MessagePayload], model: String, maxTokens: Int?) -> AsyncThrowingStream<StreamToken, Error> {
        let msgs = messages.map { $0 }
        return AsyncThrowingStream { continuation in
            Task {
                do {
                    let request = try buildRequest(messages: msgs, model: model, maxTokens: maxTokens, stream: true)
                    let (bytes, response) = try await URLSession.shared.bytes(for: request)
                    guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 else {
                        var errorBody = ""
                        for try await line in bytes.lines {
                            errorBody += line + "\n"
                        }
                        let sCode = (response as? HTTPURLResponse)?.statusCode ?? 0
                        throw ProviderError.apiError(statusCode: sCode, message: errorBody.isEmpty ? "Unknown Error" : errorBody)
                    }

                    for try await line in bytes.lines {
                        guard line.hasPrefix("data: ") else { continue }
                        let jsonString = String(line.dropFirst(6))
                        if jsonString == "[DONE]" { break }
                        guard let data = jsonString.data(using: .utf8),
                              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                              let choice = (json["choices"] as? [[String: Any]])?.first else {
                            continue
                        }

                        if let delta = choice["delta"] as? [String: Any] {
                            let reasoningKeys = ["reasoning_content", "reasoning", "thinking"]
                            for key in reasoningKeys {
                                if let raw = delta[key], let re = extractText(from: raw), !re.isEmpty {
                                    continuation.yield(StreamToken(thinking: re, text: nil, usage: nil))
                                }
                            }
                            if let rawContent = delta["content"], let ct = extractText(from: rawContent) {
                                let (th, tx) = extractThinkingTags(from: ct)
                                if let t1 = th, !t1.isEmpty { continuation.yield(StreamToken(thinking: t1, text: nil, usage: nil)) }
                                if !tx.isEmpty { continuation.yield(StreamToken(thinking: nil, text: tx, usage: nil)) }
                            }
                        }

                        if let usageDict = json["usage"] as? [String: Any] {
                            let usage = TokenUsage(
                                promptTokens: usageDict["prompt_tokens"] as? Int ?? 0,
                                completionTokens: usageDict["completion_tokens"] as? Int ?? 0,
                                reasoningTokens: ((usageDict["completion_tokens_details"] as? [String: Any])?["reasoning_tokens"] as? Int) ?? 0,
                                cacheReadTokens: ((usageDict["prompt_tokens_details"] as? [String: Any])?["cached_tokens"] as? Int) ?? 0,
                                cacheWriteTokens: 0
                            )
                            continuation.yield(StreamToken(thinking: nil, text: nil, usage: usage))
                        }
                    }
                    continuation.finish()
                } catch { continuation.finish(throwing: error) }
            }
        }
    }

    private func buildRequest(messages: [MessagePayload], model: String, maxTokens: Int?, stream: Bool) throws -> URLRequest {
        let apiKey = try requireApiKey()
        let url = try config.endpointURL("chat/completions")
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")

        let messageParts: [[String: Any]] = messages.compactMap { msg in
            switch msg.role {
            case .system, .user:
                let role = msg.role == .system ? "system" : "user"
                let effectiveParts = msg.role == .user ? ModelVisionRegistry.downgradeImages(in: msg.parts, model: model) : msg.parts
                let partsContent: [[String: Any]] = effectiveParts.compactMap { part -> [String: Any]? in
                    if case .text(let s) = part { return ["type": "text", "text": s] }
                    if case .image(let img) = part {
                        if case .base64(let data, let mimeType) = img.source {
                            let base64String = data.base64EncodedString()
                            return [
                                "type": "image_url",
                                "image_url": ["url": "data:\(mimeType);base64,\(base64String)"]
                            ]
                        }
                        return nil
                    }
                    return nil
                }
                // Preserve backward compat: if only one text part, send as string
                if partsContent.count == 1, let text = partsContent.first?["text"] as? String, role == "system" {
                    return ["role": role, "content": text]
                }
                return ["role": role, "content": partsContent]
            case .assistant:
                let contentString = msg.parts.compactMap { part -> String? in
                    if case .text(let s) = part { return s }
                    return nil
                }.joined()
                return ["role": "assistant", "content": contentString]
            }
        }

        let body: [String: Any] = ["model": model, "max_tokens": maxTokens ?? 4096, "stream": stream, "messages": messageParts]

        request.httpBody = try? JSONSerialization.data(withJSONObject: body)
        return request
    }
}

private func extractThinkingTags(from content: String) -> (thinking: String?, text: String) {
    let pattern = #"<thinking>([\s\S]*?)</thinking>"#
    guard let regex = try? NSRegularExpression(pattern: pattern, options: []) else { return (nil, content) }
    let range = NSRange(content.startIndex..., in: content)
    let matches = regex.matches(in: content, options: [], range: range)
    if matches.isEmpty { return (nil, content) }
    var th: [String] = [], tx: [String] = [], last = content.startIndex
    for m in matches {
        guard let f = Range(m.range, in: content), let c = Range(m.range(at: 1), in: content) else { continue }
        if f.lowerBound > last { tx.append(String(content[last..<f.lowerBound])) }
        th.append(String(content[c]))
        last = f.upperBound
    }
    if last < content.endIndex { tx.append(String(content[last..<content.endIndex])) }
    return (th.joined().isEmpty ? nil : th.joined(), tx.joined())
}

private func extractText(from raw: Any) -> String? {
    if let s = raw as? String { return s }
    if let d = raw as? [String: Any] {
        if let s = d["text"] as? String { return s }
        if let a = d["content"] as? [Any] { return a.compactMap { extractText(from: $0) }.joined() }
    }
    if let a = raw as? [Any] { return a.compactMap { extractText(from: $0) }.joined() }
    return nil
}

// MARK: - Vision Support

/// Determines whether a model ID supports image/vision inputs by matching against
/// well-known vision-capable model name fragments. This mirrors pi's approach:
/// rather than relying on a remote capabilities endpoint, we match on naming
/// patterns that are stable across providers.
enum ModelVisionRegistry {
    /// Substrings present in the model ID of known vision-capable models.
    private static let visionFragments: [String] = [
        // OpenAI
        "gpt-4o", "gpt-4-turbo", "gpt-4-vision", "o1", "o3", "o4",
        // Anthropic (all claude-3+ are vision-capable)
        "claude-3", "claude-sonnet", "claude-opus", "claude-haiku",
        // Google
        "gemini",
        // Meta Llama vision variants
        "llama-3.2", "llama-4",
        // Mistral vision
        "pixtral",
        // Qwen vision
        "qwen-vl", "qwen2-vl",
        // General vision tags used by many OpenRouter models
        "vision", "-vl", "-vision",
    ]

    static func supportsVision(model: String) -> Bool {
        let lower = model.lowercased()
        return visionFragments.contains { lower.contains($0) }
    }

    /// Replace `.image` ContentParts with a short text placeholder when the
    /// current model does not support vision, so mixed-history sessions can
    /// still be sent to text-only models without a 400/404 from the provider.
    static func downgradeImages(in parts: [ContentPart], model: String) -> [ContentPart] {
        guard !supportsVision(model: model) else { return parts }
        var result: [ContentPart] = []
        var lastWasPlaceholder = false
        for part in parts {
            if case .image = part {
                if !lastWasPlaceholder {
                    result.append(.text("(image omitted: model does not support vision)"))
                    lastWasPlaceholder = true
                }
            } else {
                result.append(part)
                lastWasPlaceholder = false
            }
        }
        return result
    }
}

enum ProviderFactory {
    static func create(config: ProviderConfig) -> ModelProvider {
        switch config.name.lowercased() {
        case "anthropic": return AnthropicProvider(config: config)
        default: return OpenAIProvider(config: config)
        }
    }
}

enum ProviderError: LocalizedError {
    case invalidResponse, apiError(statusCode: Int, message: String), noProviderConfigured, missingApiKey(envVar: String), invalidEndpoint(baseURL: String, path: String)
    var errorDescription: String? {
        switch self {
        case .invalidResponse: return "Invalid response"
        case .apiError(let s, let m): return "API error (\(s)): \(m)"
        case .noProviderConfigured: return "No provider configured"
        case .missingApiKey(let e): return "Key missing: \(e)"
        case .invalidEndpoint(let b, let p): return "Invalid endpoint: \(b)/\(p)"
        }
    }
}
