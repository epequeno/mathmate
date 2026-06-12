import SwiftUI
import os

// MARK: - Logging

private let log = Logger(subsystem: "com.mathmate", category: "app-launch")

// MARK: - App-wide keyboard shortcut notification names

extension Notification.Name {
    /// ⌘N  — create a new session in the active project
    static let mathMateNewSession      = Notification.Name("MathMateNewSession")
    /// ⌘⇧N — open the new-project sheet
    static let mathMateNewProject      = Notification.Name("MathMateNewProject")
    /// ⌘[  — navigate to the previous session
    static let mathMatePreviousSession = Notification.Name("MathMatePreviousSession")
    /// ⌘]  — navigate to the next session
    static let mathMateNextSession     = Notification.Name("MathMateNextSession")
}

@main
struct MathMateApp: App {
    init() {
        // Force the app to appear in the Dock and accept focus,
        // even when launched via `swift run` from the command line.
        NSApplication.shared.setActivationPolicy(.regular)
        NSApplication.shared.activate(ignoringOtherApps: true)
        if let config = ConfigurationManager.shared.loadModelsConfig() {
            log.info("Successfully loaded \(config.providers.count) providers.")
        }
        if let appConfig = ConfigurationManager.shared.loadAppConfig() {
            log.info("LaTeX engine: \(appConfig.latex.engine)")
        }
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
        }
        .commands {
            // MARK: File menu additions
            CommandGroup(after: .newItem) {
                Button("New Session") {
                    NotificationCenter.default.post(name: .mathMateNewSession, object: nil)
                }
                .keyboardShortcut("n", modifiers: .command)

                Button("New Project") {
                    NotificationCenter.default.post(name: .mathMateNewProject, object: nil)
                }
                .keyboardShortcut("n", modifiers: [.command, .shift])
            }

            // MARK: Navigate menu
            CommandMenu("Navigate") {
                Button("Previous Session") {
                    NotificationCenter.default.post(name: .mathMatePreviousSession, object: nil)
                }
                .keyboardShortcut("[", modifiers: .command)

                Button("Next Session") {
                    NotificationCenter.default.post(name: .mathMateNextSession, object: nil)
                }
                .keyboardShortcut("]", modifiers: .command)

                Divider()

                Button("Chat") {
                    NotificationCenter.default.post(
                        name: Notification.Name("MathMateSwitchTab"), object: MainTab.chat)
                }
                .keyboardShortcut("1", modifiers: .command)

                Button("Vault") {
                    NotificationCenter.default.post(
                        name: Notification.Name("MathMateSwitchTab"), object: MainTab.vault)
                }
                .keyboardShortcut("2", modifiers: .command)

                Button("Overview") {
                    NotificationCenter.default.post(
                        name: Notification.Name("MathMateSwitchTab"), object: MainTab.overview)
                }
                .keyboardShortcut("3", modifiers: .command)
            }
        }
        Settings {
            SettingsView()
        }
    }
}
