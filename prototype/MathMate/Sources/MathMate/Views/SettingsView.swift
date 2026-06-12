import SwiftUI
// MARK: - Settings Section Enum
enum SettingsSection: String, CaseIterable {
    case general = "General"
    case models = "Models"
    case chat = "Chat"
    case memory = "Memory"
    case about = "About"
    var icon: String {
        switch self {
        case .general: return "gearshape"
        case .models: return "cpu"
        case .chat: return "bubble.left.and.bubble.right"
        case .memory: return "square.stack.3d.up"
        case .about: return "info.circle"
        }
    }
}
// MARK: - Settings View (Root)
struct SettingsView: View {
    @State private var selectedSection: SettingsSection = .general
    @State private var settingsVM = SettingsViewModel()
    @State private var showMemoryManager = false
    var body: some View {
        HSplitView {
            // Sidebar
            settingsSidebar
                .frame(minWidth: 180, idealWidth: 200, maxWidth: 240)
            // Content
            settingsContent
                .frame(minWidth: 500, idealWidth: 600, maxWidth: .infinity)
        }
        .frame(width: 860, height: 580)
        .background(AppTheme.background)
        .sheet(isPresented: $showMemoryManager) {
            MemoryManagerView()
        }
    }
    // MARK: - Sidebar
    private var settingsSidebar: some View {
        VStack(alignment: .leading, spacing: 4) {
            // Header
            Text("Settings")
                .font(.system(size: 15, weight: .bold))
                .foregroundColor(AppTheme.textPrimary)
                .padding(EdgeInsets(top: 20, leading: 16, bottom: 12, trailing: 16))
            Divider()
                .foregroundColor(AppTheme.border)
            // Navigation items
            VStack(spacing: 2) {
                ForEach(SettingsSection.allCases, id: \.rawValue) { section in
                    Button {
                        selectedSection = section
                    } label: {
                        HStack(spacing: 8) {
                            Image(systemName: section.icon)
                                .font(.system(size: 13))
                                .foregroundColor(selectedSection == section ? AppTheme.accent : AppTheme.textSecondary)
                                .frame(width: 18)
                            Text(section.rawValue)
                                .font(.system(size: 13, weight: selectedSection == section ? .semibold : .regular))
                                .foregroundColor(selectedSection == section ? AppTheme.textPrimary : AppTheme.textSecondary)
                            Spacer()
                        }
                        .padding(EdgeInsets(top: 8, leading: 10, bottom: 8, trailing: 10))
                        .background(selectedSection == section ? AppTheme.surface : Color.clear)
                        .cornerRadius(7)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .padding(.horizontal, 6)
                }
            }
            .padding(.top, 8)
            Spacer()
        }
        .frame(maxHeight: .infinity)
        .background(AppTheme.backgroundElevated)
    }
    // MARK: - Content
    @ViewBuilder
    private var settingsContent: some View {
        switch selectedSection {
        case .general:
            SettingsGeneralView(settingsVM: settingsVM)
        case .models:
            SettingsModelsView(settingsVM: settingsVM)
        case .chat:
            SettingsChatView(settingsVM: settingsVM)
        case .memory:
            settingsMemoryView
        case .about:
            SettingsAboutView()
        }
    }
    private var settingsMemoryView: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("MEMORY")
                .font(.system(size: 11, weight: .semibold))
                .foregroundColor(AppTheme.textSecondary)
                .textCase(.uppercase)
                .kerning(0.04 * 11)
            Text("Agent Memory stores learner preferences, mastered concepts, and persistent context across sessions. Memory is built automatically from your conversations and wrap-ups.")
                .font(.system(size: 12))
                .foregroundColor(AppTheme.textSecondary)
            Button {
                showMemoryManager = true
            } label: {
                HStack(spacing: 8) {
                    Image(systemName: "square.stack.3d.up")
                        .font(.system(size: 13))
                    Text("Open Memory Manager")
                        .font(.system(size: 13, weight: .medium))
                }
                .foregroundColor(.white)
                .padding(.horizontal, 16)
                .padding(.vertical, 10)
                .background(AppTheme.accentFill)
                .cornerRadius(8)
            }
            .buttonStyle(.plain)
            Spacer()
        }
        .padding(28)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}