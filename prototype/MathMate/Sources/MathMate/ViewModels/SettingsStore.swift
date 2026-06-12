import SwiftUI
import Combine

@Observable
@MainActor
final class SettingsStore {
    enum Preset: String, CaseIterable, Identifiable {
        case mathTutor = "Math Tutor"
        case socratic = "Socratic"
        case formalist = "Formalist"
        case custom = "Custom"
        
        var id: String { rawValue }
        
        var prompt: String {
            switch self {
            case .mathTutor:
                return "You are a patient and knowledgeable math tutor. Use KaTeX notation for all mathematical expressions (inline with \\( \\) and display with \\[ \\]). Always reason through problems step-by-step before stating the final answer. Adapt your explanation depth to the user's apparent level."
            case .socratic:
                return "You are an expert tutor who guides students through the Socratic method. Never give away the answer directly. Use questions to probe the student's understanding and lead them to discover the mathematical principles behind the problems they face."
            case .formalist:
                return "You are a rigorous mathematics professor. Emphasize definitions, proofs, and formal logic. Use precise mathematical language and always maintain high standards of notation. Provide clear arguments grounded in axiomatic foundations."
            case .custom:
                return ""
            }
        }
    }
    
    var systemPrompt: String = ""
    var selectedPreset: Preset = .mathTutor

    // Last-opened session/project for continuity on launch
    private let defaults = UserDefaults.standard
    private let lastOpenedSessionKey = "lastOpenedSessionId"
    private let lastOpenedProjectKey = "lastOpenedProjectId"

    var lastOpenedSessionId: UUID? {
        get {
            guard let uuidString = defaults.string(forKey: lastOpenedSessionKey) else { return nil }
            return UUID(uuidString: uuidString)
        }
        set {
            defaults.set(newValue?.uuidString, forKey: lastOpenedSessionKey)
        }
    }

    var lastOpenedProjectId: UUID? {
        get {
            guard let uuidString = defaults.string(forKey: lastOpenedProjectKey) else { return nil }
            return UUID(uuidString: uuidString)
        }
        set {
            defaults.set(newValue?.uuidString, forKey: lastOpenedProjectKey)
        }
    }
    
    init() {
        Task { @MainActor in
            self.load()
        }
    }
    
    @MainActor
    func load() {
        if let config = ConfigurationManager.shared.loadAppConfig(),
           let prompt = config.chat.systemPrompt {
            self.systemPrompt = prompt
            // Try to match preset
            if let matched = Preset.allCases.first(where: { $0.prompt == prompt }) {
                self.selectedPreset = matched
            } else {
                self.selectedPreset = .custom
            }
        } else {
            self.systemPrompt = Preset.mathTutor.prompt
        }
    }
    
    @MainActor
    func save() {
        guard let config = ConfigurationManager.shared.loadAppConfig() else { return }
        // Update prompt in chat config
        let updatedChat = AppConfig.ChatConfig(
            systemPrompt: systemPrompt,
            maxTokens: config.chat.maxTokens,
            temperature: config.chat.temperature
        )
        // Reconstruct app config (simplification for now)
        let newConfig = AppConfig(
            latex: config.latex,
            synapse: config.synapse,
            chat: updatedChat,
            ui: config.ui
        )
        ConfigurationManager.shared.saveAppConfig(newConfig)
    }
    
    func updatePrompt(_ newPrompt: String) {
        systemPrompt = newPrompt
        if !Preset.allCases.contains(where: { $0.prompt == newPrompt }) {
            selectedPreset = .custom
        }
    }
}
