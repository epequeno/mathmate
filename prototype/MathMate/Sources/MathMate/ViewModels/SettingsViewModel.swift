import SwiftUI
import AppKit

/// Shared state for the Settings window, managing loading/saving of app and model configs.
@MainActor
@Observable
final class SettingsViewModel {
    // MARK: - General
    var appearanceMode: AppearanceMode = .system

    enum AppearanceMode: String, CaseIterable, Identifiable {
        case system = "System"
        case light = "Light"
        case dark = "Dark"
        var id: String { rawValue }
    }

    // MARK: - Models
    var providers: [ProviderConfig] = []

    // MARK: - Chat
    var systemPrompt: String = ""
    var selectedPreset: SettingsStore.Preset = .mathTutor
    var maxTokens: Int = 4096

    // MARK: - Memory

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

    // MARK: - Initialization
    init() {
        loadAll()
    }

    func loadAll() {
        loadAppearance()
        loadProviders()
        loadChat()
    }

    // MARK: - Appearance (UserDefaults)
    private let appearanceKey = "settings_appearanceMode"

    private func loadAppearance() {
        let raw = UserDefaults.standard.string(forKey: appearanceKey) ?? AppearanceMode.system.rawValue
        appearanceMode = AppearanceMode(rawValue: raw) ?? .system
        applyAppearance()
    }

    func saveAppearance() {
        UserDefaults.standard.set(appearanceMode.rawValue, forKey: appearanceKey)
        applyAppearance()
    }

    private func applyAppearance() {
        switch appearanceMode {
        case .light:  NSApplication.shared.appearance = NSAppearance(named: .aqua)
        case .dark:   NSApplication.shared.appearance = NSAppearance(named: .darkAqua)
        case .system: NSApplication.shared.appearance = nil
        }
    }

    // MARK: - Providers
    private func loadProviders() {
        guard let config = ConfigurationManager.shared.loadModelsConfig() else { return }
        providers = config.providers
    }

    func saveProviders() {
        let config = ConfigurationManager.AppConfigModels(providers: providers)
        ConfigurationManager.shared.saveModelsConfig(config)
    }

    func toggleProvider(_ name: String) {
        guard let index = providers.firstIndex(where: { $0.name == name }) else { return }
        providers[index].enabled.toggle()
        saveProviders()
    }

    // MARK: - Chat
    private func loadChat() {
        guard let config = ConfigurationManager.shared.loadAppConfig() else {
            systemPrompt = SettingsStore.Preset.mathTutor.prompt
            selectedPreset = .mathTutor
            maxTokens = 4096
            return
        }
        systemPrompt = config.chat.systemPrompt ?? SettingsStore.Preset.mathTutor.prompt
        // Try to match preset
        if let matched = SettingsStore.Preset.allCases.first(where: { $0.prompt == systemPrompt }) {
            selectedPreset = matched
        } else {
            selectedPreset = .custom
        }
        maxTokens = config.chat.maxTokens ?? 4096
    }

    func saveChat() {
        guard let config = ConfigurationManager.shared.loadAppConfig() else { return }
        let updatedChat = AppConfig.ChatConfig(
            systemPrompt: systemPrompt,
            maxTokens: maxTokens,
            temperature: config.chat.temperature
        )
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
        if !SettingsStore.Preset.allCases.contains(where: { $0.prompt == newPrompt }) {
            selectedPreset = .custom
        }
    }
}