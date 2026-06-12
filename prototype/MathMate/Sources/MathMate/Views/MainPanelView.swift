import SwiftUI

// MARK: - Main Panel Shell

struct MainPanelView: View {
    let session: SessionHeader
    let projectVM: ProjectViewModel
    let onSelectSession: (SessionHeader) -> Void

    @State private var activeTab: MainTab = .chat
    @State private var chatVM = ChatViewModel()
    @State private var showContextPanel = false
    @State private var projectPendingEdit: MathProject? = nil

    private var activeProject: MathProject? {
        projectVM.projects.first(where: { $0.id == session.projectId })
    }

    var body: some View {
        VStack(spacing: 0) {
            // Toolbar
            MainToolbarView(
                session: session,
                project: activeProject,
                chatVM: chatVM,
                activeTab: $activeTab,
                showContextPanel: $showContextPanel,
                onEditProject: { project in
                    projectPendingEdit = project
                }
            )

            Divider()

            // Tab bar
            TabBarView(activeTab: $activeTab)

            Divider()

            // Tab content
            HStack(spacing: 0) {
                switch activeTab {
                case .chat:
                    ChatView(viewModel: chatVM, activeProject: activeProject)
                case .vault:
                    VaultView(activeProject: activeProject)
                case .overview:
                    if let project = activeProject {
                        OverviewView(project: project, onSelectSession: { session in
                            onSelectSession(session)
                            activeTab = .chat
                        })
                    } else {
                        OverviewPlaceholderView(project: nil)
                    }
                }

                if showContextPanel, activeTab == .chat {
                    Divider()
                    ContextPanelView(viewModel: chatVM)
                        .frame(width: 272)
                        .transition(.move(edge: .trailing))
                }
            }
        }
        .background(AppTheme.background)
        .sheet(item: $projectPendingEdit) { project in
            ProjectConfigurationSheet(projectVM: projectVM, editingProject: project)
        }
        .onAppear {
            chatVM.activeProject = activeProject
            // Restore session messages if this is an existing session
            if chatVM.currentSession?.id != session.id {
                chatVM.currentSession = session
                let messages = chatVM.sessionStore.loadMessages(for: session.id)
                if !messages.isEmpty {
                    chatVM.messages = messages
                    chatVM.recalculateTokenCache()
                }
            }
        }
        .onChange(of: session.id) { _, newId in
            // Load the new session's messages
            if chatVM.currentSession?.id != newId {
                chatVM.messages = []
                chatVM.currentSession = SessionStore().allHeaders().first(where: { $0.id == newId }) ?? session
                let messages = chatVM.sessionStore.loadMessages(for: newId)
                if !messages.isEmpty {
                    chatVM.messages = messages
                    chatVM.recalculateTokenCache()
                }
            }
        }
        // ⌘①/②/③ via menu bar — also handled by TabBarView buttons, but the notification
        // path covers the case where focus is outside the tab bar.
        .onReceive(NotificationCenter.default.publisher(for: Notification.Name("MathMateSwitchTab"))) { notification in
            if let tab = notification.object as? MainTab {
                activeTab = tab
            }
        }
    }
}

// MARK: - Main Toolbar

struct MainToolbarView: View {
    let session: SessionHeader
    let project: MathProject?
    @Bindable var chatVM: ChatViewModel
    @Binding var activeTab: MainTab
    @Binding var showContextPanel: Bool
    let onEditProject: (MathProject) -> Void

    @State private var showModelSelector = false
    @State private var isEditingName = false
    @State private var editedName = ""
    @State private var isHoveringName = false
    @State private var showClearConfirmation = false

    var body: some View {
        HStack(spacing: 0) {
            // Breadcrumb + title
            VStack(alignment: .leading, spacing: 2) {
                // Breadcrumb
                HStack(spacing: 4) {
                    if let project {
                        Text(project.name)
                            .font(.system(size: 11))
                            .foregroundColor(AppTheme.textSecondary)
                        if activeTab != .overview {
                            Text("/")
                                .font(.system(size: 11))
                                .foregroundColor(AppTheme.textTertiary)
                            Text(session.displayName)
                                .font(.system(size: 11))
                                .foregroundColor(AppTheme.textSecondary)
                        }
                    } else if let displayName = chatVM.currentSession?.displayName {
                        Text(displayName)
                            .font(.system(size: 11))
                            .foregroundColor(AppTheme.textSecondary)
                    }
                }

                // Title
                HStack(spacing: 8) {
                    if activeTab == .overview {
                        Text(project?.name ?? "Overview")
                            .font(.system(size: 18, weight: .bold))
                            .foregroundColor(AppTheme.textPrimary)
                    } else if isEditingName {
                        TextField("", text: $editedName)
                            .font(.system(size: 18, weight: .bold))
                            .foregroundColor(AppTheme.textPrimary)
                            .textFieldStyle(.plain)
                            .frame(minWidth: 150, maxWidth: 300)
                            .onSubmit {
                                saveEditedName()
                            }
                            .onExitCommand {
                                isEditingName = false
                            }
                    } else if let displayName = chatVM.currentSession?.displayName {
                        Text(displayName)
                            .font(.system(size: 18, weight: .bold))
                            .foregroundColor(isHoveringName ? AppTheme.accent : AppTheme.textPrimary)
                            .onHover { hovering in
                                isHoveringName = hovering
                            }
                            .onTapGesture {
                                editedName = session.displayName
                                isEditingName = true
                            }
                            .help("Click to rename session")
                    }

                    // PDF Textbook Link (main window)
                    if let project, project.hasValidTextbook, let path = project.textbookPath, let displayName = project.textbookDisplayName {
                        HStack(spacing: 4) {
                            Button {
                                NSWorkspace.shared.open(URL(fileURLWithPath: path))
                            } label: {
                                HStack(spacing: 4) {
                                    Image(systemName: "book")
                                        .font(.system(size: 11, weight: .semibold))
                                    Text(displayName)
                                        .font(.system(size: 11, weight: .medium))
                                        .lineLimit(1)
                                }
                                .foregroundColor(AppTheme.accent)
                                .padding(.horizontal, 8)
                                .padding(.vertical, 3)
                                .background(AppTheme.accentSubtle)
                                .cornerRadius(4)
                            }
                            .buttonStyle(.plain)
                            .help("Open textbook PDF: \(path)")

                            Button {
                                onEditProject(project)
                            } label: {
                                Image(systemName: "arrow.triangle.2.circlepath")
                                    .font(.system(size: 11, weight: .semibold))
                                    .foregroundColor(AppTheme.accent)
                                    .padding(5)
                                    .background(AppTheme.accentSubtle)
                                    .cornerRadius(4)
                            }
                            .buttonStyle(.plain)
                            .help("Replace textbook PDF for this project")
                        }
                    }
                }
            }

            Spacer()

            // Model selector pill + context usage
            if activeTab == .chat {
                modelPillButton
                    .padding(.trailing, 8)

                contextUsageIndicator
                    .padding(.trailing, 10)
            }

            // Action icons
            HStack(spacing: 8) {
                // Chat mode picker
                if activeTab == .chat {
                    Menu {
                        ForEach(ChatMode.allCases) { mode in
                            Button {
                                chatVM.chatMode = mode
                            } label: {
                                HStack {
                                    if chatVM.chatMode == mode {
                                        Image(systemName: "checkmark")
                                            .font(.system(size: 10, weight: .bold))
                                    } else {
                                        Image(systemName: "circle")
                                            .font(.system(size: 10))
                                            .opacity(0)
                                    }
                                    VStack(alignment: .leading, spacing: 1) {
                                        Text(mode.displayName)
                                            .font(.system(size: 12))
                                        Text(mode.shortDescription)
                                            .font(.system(size: 10))
                                            .foregroundColor(.secondary)
                                    }
                                }
                            }
                        }
                    } label: {
                        HStack(spacing: 4) {
                            Image(systemName: "graduationcap")
                                .font(.system(size: 12))
                            Text(chatVM.chatMode.displayName)
                                .font(.system(size: 11, weight: .medium))
                            Image(systemName: "chevron.down")
                                .font(.system(size: 9))
                        }
                        .foregroundColor(AppTheme.textSecondary)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(AppTheme.surface)
                        .cornerRadius(6)
                        .overlay(
                            RoundedRectangle(cornerRadius: 6)
                                .stroke(AppTheme.border, lineWidth: 0.5)
                        )
                    }
                    .help("Tutor mode: \(chatVM.chatMode.displayName)")
                }

                // Clear
                Button {
                    showClearConfirmation = true
                } label: {
                    Image(systemName: "trash")
                        .font(.system(size: 14))
                        .foregroundColor(AppTheme.textSecondary)
                }
                .buttonStyle(.plain)
                .help("Clear Chat (⌘⌫)")
                .keyboardShortcut(.delete, modifiers: .command)
                .confirmationDialog(
                    "Clear Chat History?",
                    isPresented: $showClearConfirmation,
                    titleVisibility: .visible
                ) {
                    Button("Clear", role: .destructive) {
                        chatVM.clearChat()
                    }
                    Button("Cancel", role: .cancel) {}
                } message: {
                    Text("This will delete all messages in this session. This action cannot be undone.")
                }

                // Context panel toggle
                if activeTab == .chat {
                    Button {
                        withAnimation(.easeInOut(duration: 0.2)) {
                            showContextPanel.toggle()
                        }
                    } label: {
                        Image(systemName: "chart.bar.doc.horizontal")
                            .font(.system(size: 14))
                            .foregroundColor(showContextPanel ? AppTheme.accent : AppTheme.textSecondary)
                    }
                    .buttonStyle(.plain)
                    .help("Toggle Context Panel (⌘⌥P)")
                    .keyboardShortcut("p", modifiers: [.command, .option])
                }
            }
        }
        .padding(EdgeInsets(top: 12, leading: 20, bottom: 12, trailing: 20))
        .background(AppTheme.background)
    }

    // MARK: - Context Usage

    private var contextTokensUsed: Int {
        chatVM.cachedTotalTokens
    }

    private var contextUsageFraction: Double {
        let limit = max(chatVM.contextLimit, 1)
        return min(Double(contextTokensUsed) / Double(limit), 1.0)
    }

    private var contextUsagePercent: Int {
        Int((contextUsageFraction * 100).rounded())
    }

    private var contextIsHigh: Bool {
        contextUsageFraction >= 0.8
    }

    private var contextAccentColor: Color {
        contextIsHigh ? AppTheme.red : AppTheme.accent
    }

    @ViewBuilder
    private var contextUsageIndicator: some View {
        Button {
            showContextPanel.toggle()
        } label: {
            HStack(spacing: 8) {
                Text("Ctx \(contextUsagePercent)%")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(contextAccentColor)

                GeometryReader { geo in
                    ZStack(alignment: .leading) {
                        RoundedRectangle(cornerRadius: 3)
                            .fill(AppTheme.border)
                            .frame(height: 6)

                        RoundedRectangle(cornerRadius: 3)
                            .fill(contextAccentColor)
                            .frame(width: geo.size.width * contextUsageFraction, height: 6)
                    }
                }
                .frame(width: 56, height: 6)
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(contextIsHigh ? AppTheme.red.opacity(0.10) : AppTheme.backgroundElevated)
            .overlay(
                RoundedRectangle(cornerRadius: 14)
                    .stroke(contextIsHigh ? AppTheme.red : AppTheme.border, lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: 14))
            .overlay(
                RoundedRectangle(cornerRadius: 14)
                    .stroke(showContextPanel ? AppTheme.accent : Color.clear, lineWidth: 1.5)
            )
        }
        .buttonStyle(.plain)
        .help("Click to open context and usage panel")
    }

    // MARK: - Model Pill

    @ViewBuilder
    private var modelPillButton: some View {
        Button {
            showModelSelector = true
        } label: {
            HStack(spacing: 6) {
                if let model = chatVM.selectedModel {
                    let modelName = model.model.components(separatedBy: "/").last ?? model.model
                    Text(modelName)
                        .font(.system(size: 12, weight: .medium))
                        .lineLimit(1)
                    Text(model.provider)
                        .font(.system(size: 10, weight: .medium))
                        .foregroundColor(AppTheme.textSecondary)
                }
            }
            .foregroundColor(showModelSelector ? AppTheme.accent : AppTheme.textPrimary)
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
            .background(
                showModelSelector
                    ? AppTheme.accent.opacity(0.08)
                    : AppTheme.backgroundElevated
            )
            .cornerRadius(20)
            .overlay(
                RoundedRectangle(cornerRadius: 20)
                    .stroke(showModelSelector ? AppTheme.accent : AppTheme.border, lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
        .help("Change AI model and provider")
        .popover(isPresented: $showModelSelector, arrowEdge: .bottom) {
            ModelSelectorView(viewModel: chatVM, isPresented: $showModelSelector)
        }
        .onChange(of: session.id) { _, _ in
            isEditingName = false
        }
    }

    private func saveEditedName() {
        let trimmed = editedName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            isEditingName = false
            return
        }
        var updated = session
        updated.customName = trimmed
        try? SessionStore().updateHeader(updated)
        chatVM.currentSession = updated
        NotificationCenter.default.post(name: Notification.Name("MathMateSessionDidUpdate"), object: updated)
        isEditingName = false
    }
}

// MARK: - Tab Bar

struct TabBarView: View {
    @Binding var activeTab: MainTab

    var body: some View {
        HStack(spacing: 0) {
            ForEach(Array(MainTab.allCases.enumerated()), id: \.element.rawValue) { index, tab in
                Button {
                    activeTab = tab
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: tab.iconName)
                            .font(.system(size: 13))
                            .foregroundColor(activeTab == tab ? AppTheme.accent : AppTheme.textSecondary)
                        Text(tab.rawValue)
                            .font(.system(size: 13, weight: activeTab == tab ? .semibold : .regular))
                            .foregroundColor(activeTab == tab ? AppTheme.accent : AppTheme.textSecondary)
                    }
                    .padding(EdgeInsets(top: 10, leading: 16, bottom: 9, trailing: 16))
                    .overlay(alignment: .bottom) {
                        if activeTab == tab {
                            Rectangle()
                                .fill(AppTheme.accent)
                                .frame(height: 2)
                        }
                    }
                }
                .buttonStyle(.plain)
                .contentShape(Rectangle())
                .help("Switch to \(tab.rawValue) tab (⌘\(index + 1))")
                .keyboardShortcut(KeyEquivalent(Character(String(index + 1))), modifiers: .command)
            }
            Spacer()
        }
        .background(AppTheme.background)
        .overlay(alignment: .bottom) {
            Rectangle()
                .fill(AppTheme.border)
                .frame(height: 1)
        }
    }
}

// MARK: - Overview Placeholder

struct OverviewPlaceholderView: View {
    let project: MathProject?

    var body: some View {
        VStack(spacing: 16) {
            Spacer()
            Image(systemName: "clock")
                .font(.system(size: 42))
                .foregroundColor(AppTheme.textTertiary)
            Text("Overview")
                .font(.title3)
                .foregroundColor(AppTheme.textPrimary)
            Text("Project stats, AI summary, and key topics coming soon.")
                .font(.caption)
                .foregroundColor(AppTheme.textSecondary)
            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(AppTheme.background)
    }
}
