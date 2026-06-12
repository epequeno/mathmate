import Foundation
import AppKit
import os

private let log = Logger(subsystem: "com.mathmate", category: "chat")

// MARK: - Supporting Types

struct ToolEvent: Codable {
    enum Status: String, Codable {
        case pending
        case running
        case success
        case failure
    }

    let id: UUID
    let toolName: String
    let status: Status
    let summary: String
    let timestamp: Date
    /// Duration in seconds. Nil until the event completes.
    var duration: TimeInterval?
    /// The tool input (arguments JSON), shown in the expanded timeline detail.
    var input: String?
    /// The full tool output, shown in the expanded timeline detail.
    var output: String?

    init(toolName: String, status: Status, summary: String, timestamp: Date = Date(), duration: TimeInterval? = nil, input: String? = nil, output: String? = nil) {
        self.id = UUID()
        self.toolName = toolName
        self.status = status
        self.summary = summary
        self.timestamp = timestamp
        self.duration = duration
        self.input = input
        self.output = output
    }

    /// A short human-readable duration string like "1.2s" or "340ms".
    var durationText: String {
        guard let d = duration else { return "" }
        if d < 1.0 { return String(format: "%.0fms", d * 1000) }
        return String(format: "%.1fs", d)
    }
}

struct Message: Identifiable, Codable {
    let id: UUID
    var units: [ResponseUnit]     // typed, ordered segments (assistant messages)
    var parts: [PartItem]         // flat parts (user messages, or backward compat)
    var thinkingText: String      // always plain text, always assistant-only
    let isUser: Bool
    var isStreaming: Bool
    var tokenUsage: TokenUsage?
    var timestamp: Date
    var toolEvents: [ToolEvent]
    /// Combined flagged state: true if top-level is flagged OR any unit is flagged.
    var isFlagged: Bool {
        if topLevelIsFlagged { return true }
        return units.contains { $0.isFlagged }
    }
    
    /// Storage for the top-level flag (used for user messages).
    var topLevelIsFlagged: Bool = false

    // MARK: - Initializers

    /// Primary init for assistant messages with units.
    init(units: [ResponseUnit], thinkingText: String = "", isUser: Bool = false, isStreaming: Bool = false, toolEvents: [ToolEvent] = []) {
        self.id = UUID()
        self.units = units
        self.parts = []
        self.thinkingText = thinkingText
        self.isUser = isUser
        self.isStreaming = isStreaming
        self.tokenUsage = nil
        self.timestamp = Date()
        self.toolEvents = toolEvents
        self.topLevelIsFlagged = false
    }

    /// Init for user messages (flat parts, no units).
    init(parts: [PartItem], isUser: Bool = true, isStreaming: Bool = false) {
        self.id = UUID()
        self.units = []
        self.parts = parts
        self.thinkingText = ""
        self.isUser = isUser
        self.isStreaming = isStreaming
        self.tokenUsage = nil
        self.timestamp = Date()
        self.toolEvents = []
        self.topLevelIsFlagged = false
    }

    /// Convenience init that wraps raw ContentPart array with stable IDs.
    init(contentParts: [ContentPart], thinkingText: String = "", isUser: Bool, isStreaming: Bool = false, toolEvents: [ToolEvent] = []) {
        self.init(parts: contentParts.map { PartItem($0) }, isUser: isUser, isStreaming: isStreaming)
        self.thinkingText = thinkingText
        self.toolEvents = toolEvents
    }

    // MARK: - Codable

    enum CodingKeys: String, CodingKey {
        case id, units, parts, thinkingText, isUser, isStreaming, tokenUsage, timestamp, toolEvents, isFlagged, topLevelIsFlagged
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(UUID.self, forKey: .id)
        // Try decoding new units format first
        if let decodedUnits = try? container.decode([ResponseUnit].self, forKey: .units), !decodedUnits.isEmpty {
            units = decodedUnits
            parts = []
        } else {
            // Backward compat: decode flat parts
            units = []
            if let wrappedParts = try? container.decode([PartItem].self, forKey: .parts) {
                parts = wrappedParts
            } else {
                let rawParts = try container.decode([ContentPart].self, forKey: .parts)
                parts = rawParts.map { PartItem($0) }
            }
        }
        thinkingText = try container.decode(String.self, forKey: .thinkingText)
        isUser = try container.decode(Bool.self, forKey: .isUser)
        isStreaming = try container.decode(Bool.self, forKey: .isStreaming)
        tokenUsage = try container.decodeIfPresent(TokenUsage.self, forKey: .tokenUsage)
        timestamp = try container.decode(Date.self, forKey: .timestamp)
        toolEvents = try container.decodeIfPresent([ToolEvent].self, forKey: .toolEvents) ?? []
        
        // Handle migration of isFlagged to topLevelIsFlagged
        if let top = try? container.decode(Bool.self, forKey: .topLevelIsFlagged) {
            topLevelIsFlagged = top
        } else if let legacy = try? container.decode(Bool.self, forKey: .isFlagged) {
            topLevelIsFlagged = legacy
        } else {
            topLevelIsFlagged = false
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(id, forKey: .id)
        try container.encode(units, forKey: .units)
        try container.encode(parts, forKey: .parts)
        try container.encode(thinkingText, forKey: .thinkingText)
        try container.encode(isUser, forKey: .isUser)
        try container.encode(isStreaming, forKey: .isStreaming)
        try container.encodeIfPresent(tokenUsage, forKey: .tokenUsage)
        try container.encode(timestamp, forKey: .timestamp)
        try container.encode(toolEvents, forKey: .toolEvents)
        try container.encode(topLevelIsFlagged, forKey: .topLevelIsFlagged)
    }

    // MARK: - Backward-compatible computed properties

    /// All content parts flattened across all units (for legacy rendering paths).
    var allParts: [PartItem] {
        if !units.isEmpty {
            return units.flatMap { unit in
                unit.parts.map { PartItem(id: UUID(), part: $0) }
            }
        }
        return parts
    }

    /// Backward-compat: joined text parts — used by LaTeXView and all existing callsites
    var content: String {
        if !units.isEmpty {
            return units.flatMap { $0.parts }.compactMap {
                if case .text(let s) = $0 { return s }
                return nil
            }.joined()
        }
        return parts.compactMap { if case .text(let s) = $0.part { return s }; return nil }.joined()
    }

    /// Backward-compat: image attachments in this message
    var images: [ImageAttachment] {
        if !units.isEmpty {
            return units.flatMap { $0.parts }.compactMap {
                if case .image(let img) = $0 { return img }
                return nil
            }
        }
        return parts.compactMap { if case .image(let img) = $0.part { return img }; return nil }
    }

    /// Backward-compat: all tool events (from both units and top-level)
    var allToolEvents: [ToolEvent] {
        if !units.isEmpty {
            return units.flatMap { $0.toolEvents }
        }
        return toolEvents
    }

    // MARK: - Unit Management

    /// Appends a new unit and returns it (for streaming pipeline).
    @discardableResult
    mutating func appendUnit(_ type: ResponseUnitType, displayLabel: String? = nil) -> ResponseUnit {
        let unit = ResponseUnit(type: type, displayLabel: displayLabel)
        units.append(unit)
        return unit
    }

    /// Returns the last unit, or nil if none.
    var lastUnit: ResponseUnit? {
        units.last
    }

    /// Returns the index of the last unit, or nil.
    var lastUnitIndex: Int? {
        units.indices.last
    }

    /// Appends a ContentPart to the last unit. If no units exist, creates an explanation unit.
    mutating func appendPartToLastUnit(_ part: ContentPart) {
        if units.isEmpty {
            appendUnit(.explanation)
        }
        units[units.count - 1].parts.append(part)
    }

    /// Appends text to the last unit's last text part, or creates a new text part.
    mutating func appendTextToLastUnit(_ text: String) {
        if units.isEmpty {
            appendUnit(.explanation)
        }
        let idx = units.count - 1
        if let lastPartIdx = units[idx].parts.indices.last,
           case .text(let existing) = units[idx].parts[lastPartIdx] {
            units[idx].parts[lastPartIdx] = .text(existing + text)
        } else {
            units[idx].parts.append(.text(text))
        }
    }

    /// Appends a tool event to the last unit. If no units exist, creates a toolBlock unit.
    mutating func appendToolEventToLastUnit(_ event: ToolEvent) {
        if units.isEmpty || units.last?.type != .toolBlock {
            appendUnit(.toolBlock)
        }
        units[units.count - 1].toolEvents.append(event)
    }

    // MARK: - Legacy Mutation Helpers (for user messages and backward compat)

    /// Appends a raw ContentPart, wrapping it with a stable UUID.
    mutating func appendPart(_ part: ContentPart) {
        if isUser {
            parts.append(PartItem(part))
        } else {
            appendPartToLastUnit(part)
        }
    }

    /// Appends text, creating a new PartItem.
    mutating func appendText(_ text: String) {
        if isUser {
            parts.append(PartItem(.text(text)))
        } else {
            appendTextToLastUnit(text)
        }
    }

    /// If the last part is `.text`, appends `text` to it in-place.
    /// Otherwise appends a new `.text` part.
    mutating func appendTextToLastPart(_ text: String) {
        if isUser {
            if let lastIndex = parts.indices.last,
               case .text(let existing) = parts[lastIndex].part {
                parts[lastIndex] = PartItem(.text(existing + text))
            } else {
                appendText(text)
            }
        } else {
            appendTextToLastUnit(text)
        }
    }

    /// Returns true if the last part is `.text` whose content ends with `suffix`.
    func lastPartTextEndsWith(_ suffix: String) -> Bool {
        if !units.isEmpty {
            guard let lastUnit = units.last,
                  let last = lastUnit.parts.last,
                  case .text(let t) = last else { return false }
            return t.hasSuffix(suffix)
        }
        guard let last = parts.last, case .text(let t) = last.part else { return false }
        return t.hasSuffix(suffix)
    }
}

// MARK: - Equatable (fast path for streaming diffing)

extension Message: Equatable {
    static func == (lhs: Message, rhs: Message) -> Bool {
        // Identity + scalar fields must match.
        // We intentionally skip deep parts comparison — parts identity is
        // already stable via PartItem.id, and content equality is expensive
        // for large messages during streaming.
        lhs.id == rhs.id
        && lhs.isUser == rhs.isUser
        && lhs.isStreaming == rhs.isStreaming
        && lhs.isFlagged == rhs.isFlagged
        && lhs.thinkingText.count == rhs.thinkingText.count
        && lhs.units.count == rhs.units.count
        && lhs.parts.count == rhs.parts.count
        && lhs.toolEvents.count == rhs.toolEvents.count
    }
}

@MainActor
@Observable
class ChatViewModel {
    var messages: [Message] = []
    var input: String = ""
    var isLoading: Bool = false
    var showContextDrawer: Bool = false
    var errorMessage: String? = nil

    // Cached token counts (avoids O(n) reduce on every render)
    private(set) var cachedPromptTokens: Int = 0
    private(set) var cachedCompletionTokens: Int = 0
    private(set) var cachedReasoningTokens: Int = 0
    var cachedTotalTokens: Int { cachedPromptTokens + cachedCompletionTokens + cachedReasoningTokens }

    // Session persistence
    var currentSession: SessionHeader? = nil {
        didSet {
            Task { @MainActor in
                settingsStore.lastOpenedSessionId = currentSession?.id
                settingsStore.lastOpenedProjectId = activeProject?.id
            }
        }
    }
    var sessionStore = SessionStore()
    let settingsStore = SettingsStore()

    // Active project context
    var activeProject: MathProject? = nil

    // Session-level computing properties
    var sessionStart: Date? { messages.first?.timestamp }
    var lastActivity: Date? { messages.last?.timestamp }
    var contextLimit: Int {
        guard let model = currentModel else { return 128000 }
        return ModelPricing.lookup(model: model).contextWindow
    }

    var totalTokens: Int {
        cachedPromptTokens + cachedCompletionTokens
    }

    var estimatedCost: Double {
        guard let model = currentModel else { return 0.0 }
        let pricing = ModelPricing.lookup(model: model)
        let inputM = Double(cachedPromptTokens) / 1_000_000
        let outputM = Double(cachedCompletionTokens) / 1_000_000
        return (inputM * pricing.input) + (outputM * pricing.output)
    }

    // MARK: - Token Cache Management

    /// Recalculates the full token cache from all messages. Call on session load.
    func recalculateTokenCache() {
        var prompt = 0, completion = 0, reasoning = 0
        for msg in messages {
            if let u = msg.tokenUsage {
                prompt += u.promptTokens
                completion += u.completionTokens
                reasoning += u.reasoningTokens
            }
        }
        cachedPromptTokens = prompt
        cachedCompletionTokens = completion
        cachedReasoningTokens = reasoning
    }

    /// Incrementally updates the token cache when a message's usage changes.
    private func updateTokenCache(oldUsage: TokenUsage?, newUsage: TokenUsage?) {
        if let old = oldUsage {
            cachedPromptTokens -= old.promptTokens
            cachedCompletionTokens -= old.completionTokens
            cachedReasoningTokens -= old.reasoningTokens
        }
        if let new = newUsage {
            cachedPromptTokens += new.promptTokens
            cachedCompletionTokens += new.completionTokens
            cachedReasoningTokens += new.reasoningTokens
        }
    }

    var availableModels: [(provider: String, model: String)] = []
    var selectedModelIndex: Int = 0

    // MARK: - Chat Modes

    /// The active chat mode for the current session. Defaults to `.mathTutor`.
    var chatMode: ChatMode = .mathTutor

    // Config
    private var providers: [ProviderConfig] = []
    var currentProviders: [ProviderConfig] {
        providers
    }
    private var systemPrompt: String? = nil
    private var maxTokens: Int? = nil

    // Memory
    private(set) var memoryStore: MemoryStore = MemoryStore()
    private var memoryEngine: MemoryEngine {
        MemoryEngine(store: memoryStore)
    }

    // MARK: - Memory Settings (UserDefaults-backed)

    /// Whether memory context is injected into model prompts.
    var memoryEnabled: Bool {
        get { UserDefaults.standard.object(forKey: memoryEnabledKey) as? Bool ?? true }
        set { UserDefaults.standard.set(newValue, forKey: memoryEnabledKey) }
    }

    /// Maximum memory items to inject per turn.
    var maxMemoryItems: Int {
        get {
            let stored = UserDefaults.standard.integer(forKey: maxMemoryItemsKey)
            return stored > 0 ? stored : 6
        }
        set { UserDefaults.standard.set(max(1, newValue), forKey: maxMemoryItemsKey) }
    }

    private let memoryEnabledKey = "MathMate_MemoryEnabled"
    private let maxMemoryItemsKey = "MathMate_MaxMemoryItems"

    // MARK: - Vision Model Filter

    /// Whether the model selector should only show models that support vision (image input).
    var filterVisionModels: Bool {
        get { UserDefaults.standard.object(forKey: filterVisionModelsKey) as? Bool ?? true }
        set { UserDefaults.standard.set(newValue, forKey: filterVisionModelsKey) }
    }

    private let filterVisionModelsKey = "MathMate_FilterVisionModels"

    // MARK: - Flagging

    @MainActor
    func toggleFlag(for messageId: UUID, unitId: UUID? = nil) {
        guard let index = messages.firstIndex(where: { $0.id == messageId }) else { return }
        
        if let uId = unitId {
            // Toggle flag for specific unit
            if let unitIndex = messages[index].units.firstIndex(where: { $0.id == uId }) {
                messages[index].units[unitIndex].isFlagged.toggle()
            }
        } else {
            // Toggle flag for message as a whole (user message or legacy)
            messages[index].topLevelIsFlagged.toggle()
        }
        
        // Persist the update
        if let sessionId = currentSession?.id {
            try? sessionStore.replaceMessages(messages, to: sessionId, header: currentSession)
        }
    }

    @MainActor
    init() {
        Task {
            await loadConfig()
            try? await memoryStore.open()
        }
    }

    // MARK: - Config

    private struct OpenRouterModelResponse: Codable {
        struct ModelData: Codable {
            let id: String
        }
        let data: [ModelData]
    }

    @MainActor
    private func fetchRemoteModels(for provider: ProviderConfig) async throws -> [String] {
        guard let url = URL(string: "\(provider.baseURL)/models") else { return [] }
        
        var request = URLRequest(url: url)
        if let key = provider.apiKey {
            request.setValue("Bearer \(key)", forHTTPHeaderField: "Authorization")
        }
        
        let (data, _) = try await URLSession.shared.data(for: request)
        let response = try JSONDecoder().decode(OpenRouterModelResponse.self, from: data)
        return response.data.map { $0.id }
    }

    @MainActor
    func loadConfig() async {
        guard let config = ConfigurationManager.shared.loadModelsConfig() else { return }
        providers = config.providers

        // Build flat list of all available models across all providers
        availableModels = []
        var defaultIndex: Int?
        
        for provider in providers {
            var models = provider.models
            if provider.fetchModels {
                do {
                    models = try await fetchRemoteModels(for: provider)
                } catch {
                    log.error("Failed to fetch models for \(provider.name): \(error.localizedDescription)")
                }
            }
            
            for model in models {
                availableModels.append((provider: provider.name, model: model))
                if model == provider.defaultModel && provider.name == providers.first?.name {
                    defaultIndex = availableModels.count - 1
                }
            }
        }

        // Find the default model across all providers
        if defaultIndex == nil {
            for (index, entry) in availableModels.enumerated() {
                if let provider = providers.first(where: { $0.name == entry.provider }),
                   entry.model == provider.defaultModel {
                    defaultIndex = index
                    break
                }
            }
        }

        let savedProvider = UserDefaults.standard.string(forKey: "MathMate_SelectedProvider")
        let savedModel = UserDefaults.standard.string(forKey: "MathMate_SelectedModel")

        var foundSavedIndex: Int?
        if let savedProvider, let savedModel {
            foundSavedIndex = availableModels.firstIndex(where: { $0.provider == savedProvider && $0.model == savedModel })
        }

        if let foundSavedIndex {
            selectedModelIndex = foundSavedIndex
        } else if let defaultIndex = defaultIndex {
            selectedModelIndex = defaultIndex
        }

        // Load app config for system prompt
        if let appConfig = ConfigurationManager.shared.loadAppConfig() {
            systemPrompt = appConfig.chat.systemPrompt
            maxTokens = appConfig.chat.maxTokens
        }
    }

    @MainActor
    func refreshConfig() {
        if let appConfig = ConfigurationManager.shared.loadAppConfig() {
            systemPrompt = appConfig.chat.systemPrompt
            maxTokens = appConfig.chat.maxTokens
        }
    }

    // MARK: - Current Provider

    private var currentProvider: ModelProvider? {
        guard !availableModels.isEmpty, selectedModelIndex < availableModels.count else { return nil }
        let selected = availableModels[selectedModelIndex]
        guard let providerConfig = providers.first(where: { $0.name == selected.provider }) else { return nil }
        return ProviderFactory.create(config: providerConfig)
    }

    var currentModel: String? {
        guard !availableModels.isEmpty, selectedModelIndex < availableModels.count else { return nil }
        return availableModels[selectedModelIndex].model
    }

    private var currentProviderName: String? {
        guard !availableModels.isEmpty, selectedModelIndex < availableModels.count else { return nil }
        return availableModels[selectedModelIndex].provider
    }

    var pendingImages: [ImageAttachment] = []

    // MARK: - Image Attachment

    /// Loads an image from a file URL and adds it to pending images.
    /// File I/O is offloaded to a background thread to avoid blocking the main actor.
    @MainActor
    func attachImage(from url: URL) {
        let mimeType = _mimeType(for: url)
        Task.detached(priority: .userInitiated) {
            guard let data = try? Data(contentsOf: url) else { return }
            await MainActor.run {
                self.pendingImages.append(ImageAttachment(source: .base64(data: data, mimeType: mimeType), altText: nil))
            }
        }
    }

    /// Loads the first image from the system pasteboard and adds it to pending images.
    /// Returns true if an image was found and added.
    @MainActor
    func attachImageFromClipboard() -> Bool {
        #if canImport(AppKit)
        // Try common image types; use string rawValue for JPEG since there's no .jpeg member
        let pngType = NSPasteboard.PasteboardType.png
        let tiffType = NSPasteboard.PasteboardType.tiff
        let jpegType = NSPasteboard.PasteboardType(rawValue: "public.jpeg")

        var mimeType = "image/png"
        var imageData: Data?

        if let data = NSPasteboard.general.data(forType: pngType) {
            imageData = data
            mimeType = "image/png"
        } else if let data = NSPasteboard.general.data(forType: jpegType) {
            imageData = data
            mimeType = "image/jpeg"
        } else if let data = NSPasteboard.general.data(forType: tiffType) {
            imageData = data
            mimeType = "image/tiff"
        }

        guard let data = imageData else { return false }
        pendingImages.append(ImageAttachment(source: .base64(data: data, mimeType: mimeType), altText: nil))
        return true
        #else
        return false
        #endif
    }

    /// Removes the pending image.
    @MainActor
    func removePendingImage(_ image: ImageAttachment) {
        pendingImages.removeAll { $0.id == image.id }
    }

    /// Removes the pending image at the given index.
    @MainActor
    func removePendingImage(at index: Int) {
        guard index >= 0, index < pendingImages.count else { return }
        pendingImages.remove(at: index)
    }

    /// Returns a MIME type string for the given file URL based on its extension.
    /// Pure function — no actor isolation needed.
    private nonisolated func _mimeType(for url: URL) -> String {
        switch url.pathExtension.lowercased() {
        case "png": return "image/png"
        case "jpg", "jpeg": return "image/jpeg"
        case "gif": return "image/gif"
        case "webp": return "image/webp"
        case "tiff", "tif": return "image/tiff"
        default: return "image/png"
        }
    }

    // MARK: - Send Message

    @MainActor
    func sendMessage() async {
        if isLoading {
            cancelGeneration()
            return
        }

        let trimmedInput = input.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedInput.isEmpty || !pendingImages.isEmpty else { return }

        if pendingImages.isEmpty, trimmedInput.hasPrefix("/") {
            input = ""
            await handleSlashCommand(trimmedInput)
            return
        }

        refreshConfig()

        // Proactive context management when nearing limit.
        await maybeAutoCompactIfNeeded()

        // Lazy session creation
        if currentSession == nil {
            let header = SessionHeader(
                id: UUID(),
                name: "New Session",
                customName: nil,
                createdAt: Date(),
                lastActivity: Date(),
                model: currentModel ?? "unknown",
                provider: currentProviderName ?? "unknown",
                projectId: activeProject?.id
            )
            try? sessionStore.createSession(header: header)
            currentSession = header
        }

        guard let provider = currentProvider, let model = currentModel else {
            errorMessage = ProviderError.noProviderConfigured.errorDescription
            return
        }

        var rawParts: [ContentPart] = []
        if !input.isEmpty {
            rawParts.append(.text(input))
            input = ""
        }
        for img in pendingImages {
            rawParts.append(.image(img))
        }
        pendingImages = []

        // Add user message
        let userMessage = Message(contentParts: rawParts, isUser: true)
        messages.append(userMessage)

        // Persist user message
        if let sessionId = currentSession?.id {
            try? sessionStore.appendMessage(userMessage, to: sessionId)
        }

        // Add empty streaming assistant message with initial explanation unit
        var assistantMessage = Message(units: [ResponseUnit(type: .explanation)], isUser: false, isStreaming: true)
        assistantMessage.units[0].parts = [.text("")]
        messages.append(assistantMessage)
        let assistantIndex = messages.count - 1
        isLoading = true
        errorMessage = nil

        activeStreamTask = Task {
            do {
                // Build conversation history for the model.
                // Strip images from all messages except the latest user message
                // (the one just sent). Old images waste context and confuse the
                // model into re-addressing problems the user has moved on from.
                // The messages array ends with [..., newUserMsg, emptyAssistantPlaceholder].
                let latestUserMessageIndex = messages.count - 2

                var history: [MessagePayload] = []
                for (i, msg) in messages.enumerated() {
                    let role: MessagePayload.Role = msg.isUser ? .user : .assistant
                    let rawParts = msg.allParts.map { $0.part }

                    let parts: [ContentPart]
                    if msg.isUser && i == latestUserMessageIndex {
                        parts = rawParts // keep images for the current question
                    } else {
                        parts = rawParts.map { part in
                            if case .image = part {
                                return .text("[Image]")
                            }
                            return part
                        }
                    }

                    history.append(MessagePayload(role: role, parts: parts))
                }

                // Retrieve and inject memory context if enabled
                let memoryContextBlock: String
                if memoryEnabled {
                    let topicHints = PromptAssemblyService.topicHints(from: userMessage, recentMessages: messages.dropLast().suffix(5))
                    if !topicHints.isEmpty {
                        if let scored = try? await memoryEngine.retrieveRelevantMemory(query: topicHints, limit: maxMemoryItems) {
                            memoryContextBlock = memoryEngine.buildMemoryContextBlock(from: scored)
                        } else {
                            memoryContextBlock = ""
                        }
                    } else {
                        memoryContextBlock = ""
                    }
                } else {
                    memoryContextBlock = ""
                }

                let effectiveSystemPrompt = _effectiveSystemPrompt(base: systemPrompt)
                if let effectiveSystemPrompt, !effectiveSystemPrompt.isEmpty {
                    history.insert(MessagePayload.text(.system, effectiveSystemPrompt), at: 0)
                }
                if !memoryContextBlock.isEmpty {
                    history.insert(MessagePayload.text(.system, memoryContextBlock), at: min(1, history.count))
                }

                let stream = provider.streamMessage(history, model: model, maxTokens: maxTokens)

                for try await token in stream {
                    try Task.checkCancellation()
                    if let usage = token.usage {
                        let oldUsage = messages[assistantIndex].tokenUsage
                        messages[assistantIndex].tokenUsage = usage
                        updateTokenCache(oldUsage: oldUsage, newUsage: usage)
                    }
                    if let thinking = token.thinking {
                        messages[assistantIndex].thinkingText += thinking
                    }
                    if let text = token.text {
                        StreamCoordinator.appendAssistantText(text, to: &messages, at: assistantIndex)
                    }
                }

                messages[assistantIndex].isStreaming = false

                // Persist completed assistant message
                if let sessionId = currentSession?.id {
                    try? sessionStore.appendMessage(messages[assistantIndex], to: sessionId)
                }

                // Auto-name session after first assistant message completes
                await autoNameSessionIfNeeded()
            } catch is CancellationError {
                // Handled gracefully: simply stop
            } catch {
                // Ensure there's at least one unit with content
                if messages[assistantIndex].units.isEmpty {
                    messages[assistantIndex].appendUnit(.explanation)
                }
                let unitIdx = messages[assistantIndex].units.count - 1
                if messages[assistantIndex].units[unitIdx].parts.isEmpty {
                    messages[assistantIndex].appendTextToLastUnit("")
                }
                if case .text(let existing) = messages[assistantIndex].units[unitIdx].parts[0] {
                    messages[assistantIndex].units[unitIdx].parts[0] = .text(existing + "Error: \(error.localizedDescription)")
                } else {
                    messages[assistantIndex].appendTextToLastUnit("Error: \(error.localizedDescription)")
                }
                messages[assistantIndex].isStreaming = false
                errorMessage = error.localizedDescription
            }

            isLoading = false
            if !messages.isEmpty {
                messages[messages.count - 1].isStreaming = false
            }
            if activeStreamTask?.isCancelled == false {
                activeStreamTask = nil
            }
        }
    }

    private func _effectiveSystemPrompt(base: String?) -> String? {
        PromptAssemblyService.effectiveSystemPrompt(
            base: base,
            chatMode: chatMode,
            activeProjectName: activeProject?.name
        )
    }

    // MARK: - Slash Commands

    private let compactionKeepRecentTokens = 12_000
    private let autoCompactionThreshold: Double = 0.85

    @MainActor
    private func handleSlashCommand(_ commandInput: String) async {
        let trimmed = commandInput.trimmingCharacters(in: .whitespacesAndNewlines)
        let parts = trimmed.split(maxSplits: 1, whereSeparator: { $0.isWhitespace })
        let command = String(parts.first ?? "").lowercased()
        let args = parts.count > 1 ? String(parts[1]).trimmingCharacters(in: .whitespacesAndNewlines) : ""

        switch command {
        case "/compact":
            if args.lowercased() == "restore" || args.lowercased() == "undo" {
                await restoreLatestCompactionSnapshot()
            } else {
                await compactContext(customInstructions: args.isEmpty ? nil : args, reason: .manual, emitFeedback: true)
            }
        case "/wrap-up", "/wrapup", "/wrap":
            showWrapUpConfirmation = true
        case "/flags":
            var filterType: ResponseUnitType? = nil
            let trimmedArgs = args.trimmingCharacters(in: .whitespacesAndNewlines)
            let typeArgStr = String(trimmedArgs.dropFirst(5)).trimmingCharacters(in: .whitespacesAndNewlines)
            if trimmedArgs.hasPrefix("type:") && !typeArgStr.isEmpty {
                let typeArg = typeArgStr
                filterType = ResponseUnitType(rawValue: typeArg.lowercased())
            }
            
            // Collect all flagged units across messages
            var allFlaggedUnits: [(message: Message, unit: ResponseUnit)] = []
            for msg in messages where !msg.isUser && !msg.units.isEmpty {
                let unitsToCheck = filterType != nil ? msg.units.filter({ $0.isFlagged && $0.type == filterType }) : msg.units.filter(\.isFlagged)
                allFlaggedUnits.append(contentsOf: unitsToCheck.map { (msg, $0) })
            }
            
            // Also check top-level flagged messages (user messages or legacy)
            let topLevelFlagged = messages.filter { $0.topLevelIsFlagged }
            
            if allFlaggedUnits.isEmpty && topLevelFlagged.isEmpty {
                let filterHint = filterType != nil ? " (filtered by type: \(filterType!.rawValue))" : ""
                appendLocalAssistantMessage("No flagged content in this session.\(filterHint) Hover over a message or explanation and click the flag icon to mark it as important.")
            } else {
                var lines: [String] = []
                
                if filterType != nil {
                    lines.append("Flagged content — filtered by type: \(filterType!.rawValue) (\(allFlaggedUnits.count + topLevelFlagged.count) total)")
                } else {
                    lines.append("Flagged content (\(allFlaggedUnits.count + topLevelFlagged.count)):")
                }
                
                // Show top-level flagged messages
                for msg in topLevelFlagged {
                    let role = msg.isUser ? "You" : "Assistant"
                    let preview = msg.content.prefix(120).replacingOccurrences(of: "\n", with: " ")
                    lines.append("- ★ [\((role))] \(preview)")
                }
                
                // Show flagged units grouped by message
                if !allFlaggedUnits.isEmpty {
                    let grouped = Dictionary(grouping: allFlaggedUnits) { $0.message.id }
                    for (_, entries) in grouped.sorted(by: { $0.key.uuidString < $1.key.uuidString }) {
                        let firstMsg = entries.first!.message
                        let msgPreview = firstMsg.content.prefix(60).replacingOccurrences(of: "\n", with: " ")
                        lines.append("  └─ Message: \(msgPreview)…")
                        for (_, unit) in entries {
                            let unitPreview = unit.parts.compactMap { part -> String? in
                                if case .text(let t) = part { return t }
                                return nil
                            }.joined().prefix(100).replacingOccurrences(of: "\n", with: " ")
                            lines.append("    ★ [\(unit.type.rawValue) | \(unit.displayLabel)] \(unitPreview)")
                        }
                    }
                }
                
                lines.append("")
                lines.append("Tip: Use '/flags type:<type>' to filter by unit type. Available types: \(ResponseUnitType.allCases.map(\.rawValue).joined(separator: ", "))")
                
                appendLocalAssistantMessage(lines.joined(separator: "\n"))
            }
        case "/remember":
            guard !args.isEmpty else {
                appendLocalAssistantMessage("Usage: /remember <fact>. Tell me something to remember about you.")
                return
            }
            do {
                let fact = args.trimmingCharacters(in: .whitespacesAndNewlines)
                let item = MemoryItem(
                    kind: .preference,
                    content: fact,
                    confidence: 1.0,
                    status: .active,
                    sourceKind: .manual
                )
                try await memoryStore.addMemoryItem(item)
                appendLocalAssistantMessage("✓ Remembered: \(fact)")
            } catch {
                appendLocalAssistantMessage("Failed to save memory: \(error.localizedDescription)")
            }
        case "/forget":
            guard !args.isEmpty else {
                appendLocalAssistantMessage("Usage: /forget <id or search text>. Use /memory to find IDs.")
                return
            }
            let trimmedArg = args.trimmingCharacters(in: .whitespacesAndNewlines)
            if let uuid = UUID(uuidString: trimmedArg) {
                do {
                    try await memoryStore.forgetMemoryItem(id: uuid)
                    appendLocalAssistantMessage("✓ Forgotten memory: \(uuid.uuidString.prefix(8))…")
                } catch {
                    appendLocalAssistantMessage("Could not forget: \(error.localizedDescription)")
                }
            } else {
                // Search by content
                do {
                    let all = try await memoryStore.listMemoryItems(filter: MemoryListFilter(status: .active, sortBy: .createdAt, sortOrder: .descending, limit: 50))
                    let lower = trimmedArg.lowercased()
                    let matches = all.filter { $0.content.lowercased().contains(lower) }
                    if matches.isEmpty {
                        appendLocalAssistantMessage("No active memories matching \"\(trimmedArg)\"")
                    } else if matches.count == 1 {
                        let m = matches[0]
                        try await memoryStore.forgetMemoryItem(id: m.id)
                        appendLocalAssistantMessage("✓ Forgotten: \(m.content.prefix(120))")
                    } else {
                        var lines = ["\(matches.count) memories match \"\(trimmedArg)\" — use the ID to forget one:"]
                        for m in matches {
                            let idStr = String(m.id.uuidString.prefix(8))
                            lines.append("  \(idStr)… [\(m.kind.rawValue)] \(m.content.prefix(100))")
                        }
                        appendLocalAssistantMessage(lines.joined(separator: "\n"))
                    }
                } catch {
                    appendLocalAssistantMessage("Search failed: \(error.localizedDescription)")
                }
            }
        case "/memory":
            do {
                let active = try await memoryStore.listMemoryItems(filter: MemoryListFilter(status: .active, sortBy: .createdAt, sortOrder: .descending, limit: 50))
                let archived = try await memoryStore.countItems(status: .archived)
                let total = try await memoryStore.countItems()
                if active.isEmpty {
                    appendLocalAssistantMessage("No active memories. Add one with /remember or flag messages with the ★ icon.")
                } else {
                    var lines = ["Active memories (\(active.count)) — \(total) total, \(archived) archived:"]
                    for (i, item) in active.enumerated() {
                        let kind = item.kind.rawValue
                        let conf = String(format: "%.0f%%", item.confidence * 100)
                        let flag = item.isFlaggedReference ? "★ " : ""
                        let idStr = String(item.id.uuidString.prefix(8))
                        let ago = formatRelativeTime(item.createdAt)
                        lines.append("\(i + 1). \(flag)[\(kind)] \(item.content.prefix(160)) — \(conf), \(ago) (id: \(idStr)…)")
                    }
                    appendLocalAssistantMessage(lines.joined(separator: "\n"))
                }
            } catch {
                appendLocalAssistantMessage("Failed to load memories: \(error.localizedDescription)")
            }
        case "/help", "/commands":
            appendLocalAssistantMessage("""
            Available commands:
            - /wrap-up — generate a structured session wrap-up and save it to your vault.
            - /compact [instructions] — summarize older context and keep recent messages.
            - /compact restore — restore the latest pre-compaction snapshot for this session.
            - /flags — list all flagged messages in this session.
            - /remember <fact> — save something to remember about you.
            - /forget <id or text> — remove a memory by ID or search text.
            - /memory — list all active memories with confidence and IDs.
            - /help — show available slash commands.
            """)
        default:
            appendLocalAssistantMessage("Unknown command: \(command). Try /help")
        }
    }

    private enum CompactionReason: String {
        case manual
        case automatic
    }

    @MainActor
    private func compactContext(customInstructions: String?, reason: CompactionReason, emitFeedback: Bool) async {
        guard !messages.isEmpty else {
            if emitFeedback { appendLocalAssistantMessage("Nothing to compact yet.") }
            return
        }

        let cutIndex = _findCompactionCutIndex(keepRecentTokens: compactionKeepRecentTokens)
        guard cutIndex > 0 else {
            if emitFeedback { appendLocalAssistantMessage("Not enough older context to compact yet.") }
            return
        }

        let olderMessages = Array(messages[..<cutIndex])
        let keptMessages = Array(messages[cutIndex...])
        let tokensBefore = messages.reduce(0) { $0 + _estimatedTokens(for: $1) }
        let summary = await _generateCompactionSummary(from: olderMessages, customInstructions: customInstructions)

        var snapshotPath: String?
        if let sessionId = currentSession?.id {
            snapshotPath = try? sessionStore.createCompactionSnapshot(for: sessionId).path
        }

        let compactedSummary = Message(
            contentParts: [.text("## Compacted Context Summary\n\n\(summary)")],
            isUser: false
        )

        messages = [compactedSummary] + keptMessages

        if var session = currentSession {
            session.lastActivity = Date()
            currentSession = session
            try? sessionStore.replaceMessages(messages, to: session.id, header: session)

            let compactionEntry = SessionCompactionEntry(
                summary: summary,
                firstKeptMessageIndex: cutIndex,
                tokensBefore: tokensBefore,
                customInstructions: customInstructions,
                snapshotPath: snapshotPath
            )
            try? sessionStore.appendCompactionEntry(compactionEntry, to: session.id)
        }

        if emitFeedback {
            let mode = reason == .automatic ? "Auto-compaction" : "Compaction"
            appendLocalAssistantMessage("\(mode) complete. Summarized \(olderMessages.count) older messages and kept \(keptMessages.count) recent messages.")
        }
    }

    @MainActor
    private func restoreLatestCompactionSnapshot() async {
        guard let sessionId = currentSession?.id else {
            appendLocalAssistantMessage("No active session to restore.")
            return
        }

        do {
            guard let restored = try sessionStore.restoreLatestCompactionSnapshot(for: sessionId) else {
                appendLocalAssistantMessage("No compaction snapshot found for this session.")
                return
            }
            messages = sessionStore.loadMessages(for: sessionId)
            recalculateTokenCache()
            appendLocalAssistantMessage("Restored snapshot: \(restored.lastPathComponent)")
        } catch {
            appendLocalAssistantMessage("Failed to restore snapshot: \(error.localizedDescription)")
        }
    }

    @MainActor
    private func maybeAutoCompactIfNeeded() async {
        guard contextLimit > 0 else { return }
        let usage = Double(totalTokens) / Double(contextLimit)
        guard usage >= autoCompactionThreshold else { return }
        await compactContext(
            customInstructions: "Prioritize preserving currently active problem-solving state and unresolved steps.",
            reason: .automatic,
            emitFeedback: true
        )
    }

    private func _findCompactionCutIndex(keepRecentTokens: Int) -> Int {
        guard messages.count > 2 else { return 0 }

        var runningTokens = 0
        var firstKeptIndex = messages.count

        for index in stride(from: messages.count - 1, through: 0, by: -1) {
            runningTokens += _estimatedTokens(for: messages[index])
            if runningTokens > keepRecentTokens {
                firstKeptIndex = min(index + 1, messages.count - 1)
                break
            }
        }

        guard firstKeptIndex > 0, firstKeptIndex < messages.count else { return 0 }
        return firstKeptIndex
    }

    private func _estimatedTokens(for message: Message) -> Int {
        if let usage = message.tokenUsage {
            let measured = usage.promptTokens + usage.completionTokens + usage.reasoningTokens
            if measured > 0 { return measured }
        }

        let textChars = message.content.count + message.thinkingText.count + message.toolEvents.reduce(0) { $0 + $1.summary.count }
        let imageCost = message.images.count * 512
        return max(1, (textChars / 4) + imageCost)
    }

    @MainActor
    private func _generateCompactionSummary(from olderMessages: [Message], customInstructions: String?) async -> String {
        let serializedConversation = _serializeForCompaction(olderMessages)

        guard let provider = currentProvider, let model = currentModel else {
            return _fallbackCompactionSummary(from: olderMessages)
        }

        var prompt = """
        Summarize the following earlier conversation history so a tutor can continue seamlessly.
        Preserve user goals, constraints, progress, unresolved questions, and any critical formulas.

        ⚠️ FLAG-PRESERVATION RULE: Any segment marked [IMPORTANT - FLAGGED ...] MUST be preserved
        verbatim in the summary — do NOT paraphrase, condense, or omit flagged content.
        Include flagged segments under a dedicated "Flagged Content (verbatim)" section.

        Return markdown with these sections:
        ## Goal
        ## Constraints & Preferences
        ## Progress
        ## Next Steps
        ## Critical Context
        ## Flagged Content (verbatim)

        Conversation:
        \(serializedConversation)
        """

        if let customInstructions, !customInstructions.isEmpty {
            prompt += "\n\nAdditional instructions:\n\(customInstructions)"
        }

        do {
            let payload = [MessagePayload.text(.user, prompt)]
            let summary = try await provider.sendMessage(payload, model: model, maxTokens: 1200)
            let trimmed = summary.trimmingCharacters(in: .whitespacesAndNewlines)
            if trimmed.isEmpty { return _fallbackCompactionSummary(from: olderMessages) }
            return trimmed
        } catch {
            return _fallbackCompactionSummary(from: olderMessages)
        }
    }

    private func _serializeForCompaction(_ history: [Message]) -> String {
        var lines: [String] = []

        for message in history {
            let role = message.isUser ? "User" : "Assistant"
            
            // Check for flagged units in assistant messages — preserve verbatim
            let flaggedUnits = message.units.filter { $0.isFlagged }
            if !flaggedUnits.isEmpty {
                for unit in flaggedUnits {
                    let text = unit.parts.compactMap { part -> String? in
                        if case .text(let t) = part { return t }
                        return nil
                    }.joined(separator: "\n")
                    lines.append("[FLAGGED UNIT: \(unit.type.rawValue) | \(unit.displayLabel)] ⭐ PRESERVE VERBATIM ⭐")
                    lines.append(text)
                    lines.append("[END FLAGGED UNIT]")
                }
            }
            
            // For user messages or legacy flagged messages
            if (message.isUser || message.units.isEmpty) && message.topLevelIsFlagged {
                lines.append("[FLAGGED USER MESSAGE] ⭐ PRESERVE VERBATIM ⭐")
                lines.append(message.content)
                lines.append("[END FLAGGED USER MESSAGE]")
            } else if !message.content.isEmpty {
                lines.append("[\(role)]: \(message.content)")
            }
            
            if !message.thinkingText.isEmpty {
                lines.append("[Assistant thinking]: \(message.thinkingText)")
            }
            if !message.toolEvents.isEmpty {
                let eventSummary = message.allToolEvents
                    .map { "\($0.toolName): \($0.status.rawValue) — \($0.summary)" }
                    .joined(separator: "; ")
                lines.append("[Tool events]: \(eventSummary)")
            }
        }

        return lines.joined(separator: "\n")
    }

    private func _fallbackCompactionSummary(from olderMessages: [Message]) -> String {
        let userMessages = olderMessages.filter { $0.isUser }
        let assistantMessages = olderMessages.filter { !$0.isUser }
        let goal = userMessages.last?.content.prefix(240) ?? "Continue math tutoring from prior context"
        let assistantLast = assistantMessages.last?.content.prefix(240) ?? "No assistant summary available"

        // Collect flagged content for the fallback summary
        let flaggedUnits = olderMessages.flatMap { $0.units }.filter { $0.isFlagged }
        var flaggedSection = ""
        if !flaggedUnits.isEmpty {
            var lines = ["- Compacted \(olderMessages.count) messages (\(flaggedUnits.count) flagged units preserved below)"]
            for unit in flaggedUnits {
                let text = unit.parts.compactMap { part -> String? in
                    if case .text(let t) = part { return t }
                    return nil
                }.joined(separator: "\n").prefix(200)
                lines.append("  ★ [\(unit.displayLabel)] \(text)")
            }
            flaggedSection = "\n\n## Flagged Content (verbatim)\n" + lines.joined(separator: "\n")
        }

        return """
        ## Goal
        \(goal)

        ## Constraints & Preferences
        - Preserve math-first tutoring style.
        - Keep reasoning trace visible as plain text.

        ## Progress
        - Older context compacted from \(olderMessages.count) messages.
        - Last assistant content before compaction: \(assistantLast)

        ## Next Steps
        1. Continue from recent messages.
        2. Clarify any unresolved steps from the latest exchange.

        ## Critical Context
        - Compaction used fallback summarization due provider unavailability.
        \(flaggedSection)
        """
    }

    @MainActor
    private func appendLocalAssistantMessage(_ text: String) {
        guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        var unit = ResponseUnit(type: .explanation)
        unit.parts = [.text(text)]
        let localMessage = Message(units: [unit], isUser: false)
        messages.append(localMessage)
        if let sessionId = currentSession?.id {
            try? sessionStore.appendMessage(localMessage, to: sessionId)
        }
    }

    // MARK: - Auto-Naming

    /// Generates a short title from the first user message after the first stream completes.
    @MainActor
    private func autoNameSessionIfNeeded() async {
        guard let session = currentSession,
              session.customName == nil,
              session.name == "New Session",
              let firstUserMsg = messages.first(where: { $0.isUser }),
              !firstUserMsg.content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        else { return }

        let title = await generateTitle(from: firstUserMsg.content)
        var updated = session
        updated.name = title
        currentSession = updated
        try? sessionStore.updateHeader(updated)
    }

    /// Generate a short title (≤ 6 words) from the given text.
    private func generateTitle(from text: String) async -> String {
        let cleaned = text
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .components(separatedBy: .newlines)
            .first ?? text

        // Truncate to reasonable length, on word boundary if possible
        let maxLen = 40
        if cleaned.count <= maxLen {
            return cleaned
        }
        let truncated = String(cleaned.prefix(maxLen))
        if let lastSpace = truncated.lastIndex(of: " ") {
            return String(truncated[..<lastSpace])
        }
        return truncated
    }

    // MARK: - Convenience

    @MainActor
    func clearChat() {
        messages = []
        errorMessage = nil
        currentSession = nil
        chatMode = .mathTutor
        cancelGeneration()
    }

    // Stream cancellation and flow control

    private var activeStreamTask: Task<Void, Never>? = nil

    @MainActor
    func cancelGeneration() {
        if isLoading {
            activeStreamTask?.cancel()
            activeStreamTask = nil
            isLoading = false
            if !messages.isEmpty {
                messages[messages.count - 1].isStreaming = false
            }
        }
    }

    @MainActor
    func retryLastTurn() async {
        await _retryLastTurnInternal()
    }

    @MainActor
    func regenerateLastResponse() async {
        await _retryLastTurnInternal()
    }

    private func _retryLastTurnInternal() async {
        guard !isLoading else { return }

        // Clean up last assistant message
        if let last = messages.last, !last.isUser {
            messages.removeLast()
            if let sessionId = currentSession?.id {
                try? sessionStore.replaceMessages(messages, to: sessionId, header: currentSession)
            }
        }

        // Clean up last user message and restore to input
        guard let lastUserMsg = messages.last, lastUserMsg.isUser else { return }
        messages.removeLast()
        if let sessionId = currentSession?.id {
            try? sessionStore.replaceMessages(messages, to: sessionId, header: currentSession)
        }

        var textParts: [String] = []
        var images: [ImageAttachment] = []
        for partItem in lastUserMsg.parts {
            switch partItem.part {
            case .text(let t):
                textParts.append(t)
            case .image(let img):
                images.append(img)
            }
        }

        input = textParts.joined(separator: "\n")
        pendingImages = images

        await sendMessage()
    }

    // MARK: - Wrap-Up

    /// Quick confirmation alert for auto wrap-up.
    var showWrapUpConfirmation: Bool = false
    /// True while auto wrap-up is generating + saving.
    var isAutoWrappingUp: Bool = false
    /// Result message shown after auto wrap-up completes.
    var wrapUpResult: String?
    /// True if the last auto wrap-up succeeded (controls result alert style).
    var wrapUpResultIsSuccess: Bool = false

    // Legacy sheet state — kept for toolbar access if needed.
    var isShowingWrapUpSheet: Bool = false
    var wrapUpDraft: WrapUpDraft?
    var isGeneratingWrapUp: Bool = false
    var wrapUpError: String?
    var wrapUpSaveSuccess: Bool = false

    let wrapUpService = WrapUpService()

    @MainActor
    var noVaultConfigured: Bool {
        if let project = activeProject {
            return !project.vaultExists
        }
        guard let config = ConfigurationManager.shared.loadAppConfig() else { return true }
        return config.synapse.vaults?.isEmpty ?? true
    }

    /// Generates a structured wrap-up draft by streaming a request to the current model.
    @MainActor
    func generateWrapUpDraft() async {
        guard !isGeneratingWrapUp else { return }
        isGeneratingWrapUp = true
        wrapUpError = nil
        wrapUpDraft = nil

        guard let provider = currentProvider, let model = currentModel else {
            wrapUpError = "No model configured"
            isGeneratingWrapUp = false
            return
        }

        do {
            let draft = try await wrapUpService.generateDraft(
                messages: messages,
                provider: provider,
                model: model
            )
            // Patch in the actual session ID
            let draftWithSession = WrapUpDraft(
                title: draft.title,
                markdown: draft.markdown,
                generatedAt: draft.generatedAt,
                sessionId: currentSession?.id.uuidString ?? "unknown"
            )
            wrapUpDraft = draftWithSession
        } catch {
            wrapUpError = "Generation failed: \(error.localizedDescription)"
        }

        isGeneratingWrapUp = false
    }

    /// Saves the wrap-up markdown to the configured Synapse study log directory.
    /// Returns the absolute file path on success, nil on failure.
    @MainActor
    func saveWrapUpToVault(title: String, markdown: String) async -> String? {
        wrapUpSaveSuccess = false
        wrapUpError = nil

        do {
            let path = try wrapUpService.saveToVault(
                title: title,
                markdown: markdown,
                activeProject: activeProject
            )
            wrapUpSaveSuccess = true
            wrapUpDraft = nil
            return path
        } catch let error as WrapUpError {
            wrapUpError = error.localizedDescription
            return nil
        } catch {
            wrapUpError = "Save failed: \(error.localizedDescription)"
            return nil
        }
    }

    /// Auto wrap-up: generate + save in one go, no manual review.
    /// Called after the user confirms the quick alert.
    @MainActor
    func autoWrapUp() async {
        guard !isAutoWrappingUp else { return }
        isAutoWrappingUp = true
        wrapUpResult = nil

        guard let provider = currentProvider, let model = currentModel else {
            wrapUpResult = "No model configured"
            wrapUpResultIsSuccess = false
            isAutoWrappingUp = false
            return
        }

        do {
            let markdown = try await wrapUpService.generateMarkdown(
                messages: messages,
                provider: provider,
                model: model
            )

            guard !markdown.isEmpty else {
                wrapUpResult = "Generation returned empty"
                wrapUpResultIsSuccess = false
                isAutoWrappingUp = false
                return
            }

            let title = currentSession?.name ?? "Session Wrap-Up"
            let path = await saveWrapUpToVault(title: title, markdown: markdown)

            if let path {
                wrapUpResult = "Saved to \(URL(fileURLWithPath: path).lastPathComponent)"
                wrapUpResultIsSuccess = true

                // Extract memory candidates in the background
                let memoryVM = MemoryViewModel(store: memoryStore)
                await memoryVM.extractFromSession(
                    messages: messages,
                    projectId: activeProject?.id
                )
            } else {
                wrapUpResult = wrapUpError ?? "Failed to save"
                wrapUpResultIsSuccess = false
            }
        } catch {
            wrapUpResult = "Error: \(error.localizedDescription)"
            wrapUpResultIsSuccess = false
        }

        isAutoWrappingUp = false
    }

    /// Formats a date as a human-readable relative time string (e.g. "2h ago", "3d ago").
    private func formatRelativeTime(_ date: Date) -> String {
        let interval = Date().timeIntervalSince(date)
        switch interval {
        case ..<60: return "just now"
        case ..<3600: return "\(Int(interval / 60))m ago"
        case ..<86400: return "\(Int(interval / 3600))h ago"
        case ..<2592000: return "\(Int(interval / 86400))d ago"
        case ..<31536000: return "\(Int(interval / 2592000))mo ago"
        default: return "\(Int(interval / 31536000))y ago"
        }
    }

    // MARK: - Display name

    var selectedModel: (provider: String, model: String)? {
        guard !availableModels.isEmpty, selectedModelIndex < availableModels.count else { return nil }
        return availableModels[selectedModelIndex]
    }

    var selectedModelDisplayName: String {
        guard let selected = selectedModel else { return "No Model" }
        return "\(selected.provider) / \(selected.model)"
    }

    /// Select a model by exact provider + model name match
    func selectModel(provider: String, model: String) {
        if let index = availableModels.firstIndex(where: { $0.provider == provider && $0.model == model }) {
            selectedModelIndex = index
            UserDefaults.standard.set(provider, forKey: "MathMate_SelectedProvider")
            UserDefaults.standard.set(model, forKey: "MathMate_SelectedModel")
        }
    }
}
