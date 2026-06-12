import SwiftUI

// MARK: - New Project Setup

struct NewProjectSetupView: View {
    @Bindable var projectVM: ProjectViewModel
    var onProjectCreated: ((MathProject) -> Void)? = nil

    @State private var draftName = ""
    @State private var createVault = true
    @State private var textbookPath: String? = nil
    @State private var defaultModel = "google/gemini-3.1-flash-lite"
    @State private var defaultChatMode: ChatMode = .socratic

    var body: some View {
        VStack(spacing: 0) {
            Spacer()

            ScrollView {
                VStack(spacing: 24) {
                    // Header
                    VStack(spacing: 8) {
                        Image(systemName: "book.closed")
                            .font(.system(size: 36))
                            .foregroundColor(AppTheme.accent)

                        Text("Welcome to MathMate")
                            .font(.system(size: 24, weight: .bold))
                            .foregroundColor(AppTheme.textPrimary)

                        Text("Create your first project to get started.")
                            .font(.system(size: 13))
                            .foregroundColor(AppTheme.textSecondary)
                    }

                    // Form card
                    VStack(alignment: .leading, spacing: 16) {
                        Group {
                            Text("Project Name")
                                .font(.system(size: 12, weight: .semibold))
                                .foregroundColor(AppTheme.textSecondary)
                            TextField("e.g. Calculus I", text: $draftName)
                                .textFieldStyle(.roundedBorder)
                                .font(.system(size: 13))
                        }

                        Divider()

                        // Synapse vault
                        Toggle(isOn: $createVault) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text("Create Synapse vault")
                                    .font(.system(size: 13, weight: .medium))
                                Text("Stored at ~/.mathmate/projects/\(draftName.trimmingCharacters(in: .whitespaces).isEmpty ? "<Name>" : draftName.trimmingCharacters(in: .whitespaces))/")
                                    .font(.system(size: 11))
                                    .foregroundColor(AppTheme.textTertiary)
                            }
                        }
                        .toggleStyle(.switch)

                        // Textbook
                        HStack {
                            TextField("Textbook PDF (optional)", text: Binding(
                                get: { textbookPath ?? "" },
                                set: { textbookPath = $0.isEmpty ? nil : $0 }
                            ))
                                .textFieldStyle(.roundedBorder)
                                .font(.system(size: 13))
                            Button("Browse…") {
                                let panel = NSOpenPanel()
                                panel.canChooseFiles = true
                                panel.canChooseDirectories = false
                                panel.allowedContentTypes = [.pdf]
                                panel.prompt = "Select"
                                if panel.runModal() == .OK, let url = panel.url {
                                    textbookPath = url.path
                                }
                            }
                        }

                        Divider()

                        // Session defaults
                        Text("New Session Defaults")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundColor(AppTheme.textSecondary)

                        HStack {
                            Text("Model")
                                .font(.system(size: 13))
                                .frame(width: 80, alignment: .leading)
                            TextField("Model ID", text: $defaultModel)
                                .textFieldStyle(.roundedBorder)
                                .font(.system(size: 12, design: .monospaced))
                        }

                        HStack {
                            Text("Style")
                                .font(.system(size: 13))
                                .frame(width: 80, alignment: .leading)
                            Picker("", selection: $defaultChatMode) {
                                ForEach(ChatMode.allCases) { mode in
                                    Text(mode.displayName).tag(mode)
                                }
                            }
                            .labelsHidden()
                            .frame(width: 200)
                        }

                        if let error = projectVM.errorMessage {
                            HStack(spacing: 6) {
                                Image(systemName: "exclamationmark.triangle.fill")
                                    .foregroundColor(.orange)
                                Text(error)
                                    .font(.caption)
                                    .foregroundColor(.secondary)
                            }
                        }

                        // Create button
                        HStack {
                            Spacer()
                            Button {
                                createProject()
                            } label: {
                                HStack(spacing: 6) {
                                    Image(systemName: "plus")
                                        .font(.system(size: 12, weight: .semibold))
                                    Text("Create Project")
                                        .font(.system(size: 13, weight: .semibold))
                                }
                                .foregroundColor(.white)
                                .padding(.horizontal, 24)
                                .padding(.vertical, 10)
                                .background(AppTheme.accentFill)
                                .cornerRadius(8)
                            }
                            .buttonStyle(.plain)
                            .disabled(draftName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                        }
                    }
                    .padding(20)
                    .background(AppTheme.surface)
                    .cornerRadius(12)
                    .overlay(
                        RoundedRectangle(cornerRadius: 12)
                            .stroke(AppTheme.border, lineWidth: 1)
                    )
                    .frame(width: 480)
                }
                .padding(.horizontal, 40)
            }

            Spacer()

            Text("MathMate can make mistakes. Verify important results.")
                .font(.system(size: 10))
                .foregroundColor(AppTheme.textTertiary)
                .padding(.bottom, 16)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(AppTheme.background)
        .onAppear {
            projectVM.errorMessage = nil
        }
    }

    private func createProject() {
        let name = draftName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty else { return }

        let vaultPath: String
        if createVault {
            // Auto-create vault under ~/.mathmate/projects/<ProjectName>/
            let home = FileManager.default.homeDirectoryForCurrentUser
            vaultPath = home.appendingPathComponent(".mathmate/projects/\(name)").path
        } else {
            vaultPath = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(".mathmate/projects/\(name)").path
        }

        projectVM.createProject(
            name: name,
            vaultPath: vaultPath,
            textbookPath: textbookPath,
            defaultModel: defaultModel,
            defaultChatMode: defaultChatMode
        )
        if projectVM.errorMessage == nil, let newProject = projectVM.projects.last {
            onProjectCreated?(newProject)
        }
    }
}

// MARK: - New Session Setup

/// Shown when projects exist but no session is selected — lets the user start a new session.
struct NewSessionSetupView: View {
    @Bindable var projectVM: ProjectViewModel
    @Binding var selectedSession: SessionHeader?

    @State private var newSessionModel: String = ""
    @State private var newSessionChatMode: ChatMode = .socratic
    @State private var newSessionName: String = ""
    @State private var showModelPicker = false
    @State private var modelPickerQuery = ""

    /// All available models from enabled providers.
    private var allModels: [(provider: String, model: String)] {
        guard let modelsConfig = ConfigurationManager.shared.loadModelsConfig() else { return [] }
        var result: [(String, String)] = []
        for providerConfig in modelsConfig.providers where providerConfig.enabled {
            for model in providerConfig.models {
                result.append((providerConfig.name, model))
            }
        }
        return result
    }

    /// Filtered model list matching the search query.
    private var filteredModels: [(provider: String, model: String)] {
        guard !modelPickerQuery.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            return allModels
        }
        let q = modelPickerQuery.lowercased()
        return allModels.filter {
            $0.model.lowercased().contains(q) || $0.provider.lowercased().contains(q)
        }
    }
    private let sessionStore = SessionStore()

    var body: some View {
        VStack(spacing: 0) {
            Spacer()

            ScrollView {
                VStack(spacing: 24) {
                    // Header
                    VStack(spacing: 8) {
                        Image(systemName: "folder")
                            .font(.system(size: 36))
                            .foregroundColor(AppTheme.accent)

                        Text(activeProject?.name ?? "Select a Project")
                            .font(.system(size: 22, weight: .bold))
                            .foregroundColor(AppTheme.textPrimary)

                        if let project = activeProject, project.hasValidTextbook {
                            Text("Textbook: \(project.textbookDisplayName ?? "")")
                                .font(.system(size: 12))
                                .foregroundColor(AppTheme.textTertiary)
                        }
                    }

                    // New Session card
                    VStack(alignment: .leading, spacing: 16) {
                        Text("Start a New Session")
                            .font(.system(size: 14, weight: .semibold))

                        HStack {
                            Text("Model")
                                .font(.system(size: 13))
                                .frame(width: 60, alignment: .leading)
                            Button {
                                modelPickerQuery = ""
                                showModelPicker = true
                            } label: {
                                HStack(spacing: 6) {
                                    Text(newSessionModel.isEmpty ? "Select a model..." : newSessionModel)
                                        .font(.system(size: 12, design: .monospaced))
                                        .lineLimit(1)
                                    Image(systemName: "chevron.down")
                                        .font(.system(size: 9))
                                        .foregroundColor(AppTheme.textTertiary)
                                }
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(.horizontal, 8)
                                .padding(.vertical, 5)
                                .background(AppTheme.surface)
                                .cornerRadius(6)
                                .overlay(
                                    RoundedRectangle(cornerRadius: 6)
                                        .stroke(AppTheme.border, lineWidth: 0.5)
                                )
                            }
                            .buttonStyle(.plain)
                            .popover(isPresented: $showModelPicker, arrowEdge: .bottom) {
                                modelPickerPopover
                            }
                        }

                        HStack {
                            Text("Style")
                                .font(.system(size: 13))
                                .frame(width: 60, alignment: .leading)
                            Picker("", selection: $newSessionChatMode) {
                                ForEach(ChatMode.allCases) { mode in
                                    Text(mode.displayName).tag(mode)
                                }
                            }
                            .labelsHidden()
                            .frame(width: 200)
                        }

                        HStack {
                            Text("Name")
                                .font(.system(size: 13))
                                .frame(width: 60, alignment: .leading)
                            TextField("Session name (optional)", text: $newSessionName)
                                .textFieldStyle(.roundedBorder)
                                .font(.system(size: 13))
                        }

                        if let project = activeProject, project.hasValidTextbook {
                            HStack(spacing: 4) {
                                Image(systemName: "book")
                                    .font(.system(size: 11))
                                Text("Context: \(project.textbookDisplayName ?? "")")
                                    .font(.system(size: 12))
                            }
                            .foregroundColor(AppTheme.textTertiary)
                        }

                        HStack {
                            Spacer()
                            Button {
                                startNewSession()
                            } label: {
                                HStack(spacing: 6) {
                                    Image(systemName: "play.fill")
                                        .font(.system(size: 12))
                                    Text("Start Session")
                                        .font(.system(size: 13, weight: .semibold))
                                }
                                .foregroundColor(.white)
                                .padding(.horizontal, 24)
                                .padding(.vertical, 10)
                                .background(AppTheme.accentFill)
                                .cornerRadius(8)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(20)
                    .background(AppTheme.surface)
                    .cornerRadius(12)
                    .overlay(
                        RoundedRectangle(cornerRadius: 12)
                            .stroke(AppTheme.border, lineWidth: 1)
                    )
                    .frame(width: 440)

                    // Recent sessions section
                    if !recentSessions.isEmpty {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Recent Sessions")
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundColor(AppTheme.textSecondary)
                                .padding(.horizontal, 4)

                            ForEach(recentSessions.prefix(5)) { session in
                                Button {
                                    selectedSession = session
                                } label: {
                                    HStack {
                                        VStack(alignment: .leading, spacing: 2) {
                                            Text(session.displayName)
                                                .font(.system(size: 13, weight: .medium))
                                            Text(session.lastActivity.formatted(date: .abbreviated, time: .shortened))
                                                .font(.system(size: 11))
                                                .foregroundColor(AppTheme.textTertiary)
                                        }
                                        Spacer()
                                        Image(systemName: "chevron.right")
                                            .font(.system(size: 10))
                                            .foregroundColor(AppTheme.textTertiary)
                                    }
                                    .padding(.horizontal, 12)
                                    .padding(.vertical, 8)
                                    .background(AppTheme.surface.opacity(0.6))
                                    .cornerRadius(6)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                        .frame(width: 440)
                    }
                }
                .padding(.horizontal, 40)
            }

            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(AppTheme.background)
        .onAppear {
            // Seed defaults from the active project
            if let project = activeProject {
                newSessionModel = project.defaultModel
                newSessionChatMode = project.defaultChatMode
            }
        }
        .onChange(of: projectVM.selectedProject) { _, _ in
            if let project = activeProject {
                newSessionModel = project.defaultModel
                newSessionChatMode = project.defaultChatMode
            }
        }
    }

    /// Popover view for browsing and selecting a model.
    private var modelPickerPopover: some View {
        VStack(spacing: 0) {
            // Search
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass")
                    .font(.system(size: 12))
                    .foregroundColor(AppTheme.textTertiary)
                TextField("Search models…", text: $modelPickerQuery)
                    .textFieldStyle(.plain)
                    .font(.system(size: 13))
            }
            .padding(EdgeInsets(top: 10, leading: 14, bottom: 10, trailing: 14))
            .background(AppTheme.background)

            Divider()

            // Model list
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 0) {
                    ForEach(filteredModels, id: \.model) { entry in
                        Button {
                            newSessionModel = entry.model
                            showModelPicker = false
                        } label: {
                            HStack(spacing: 8) {
                                Text(entry.model)
                                    .font(.system(size: 12, design: .monospaced))
                                    .foregroundColor(entry.model == newSessionModel ? .accentColor : .primary)
                                Spacer()
                                Text(entry.provider)
                                    .font(.system(size: 10))
                                    .foregroundColor(.secondary)
                            }
                            .padding(.horizontal, 14)
                            .padding(.vertical, 7)
                            .background(
                                entry.model == newSessionModel
                                    ? Color.accentColor.opacity(0.1)
                                    : Color.clear
                            )
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)

                        Divider()
                            .padding(.leading, 14)
                    }
                }
            }
            .frame(maxHeight: 300)
        }
        .frame(width: 340)
        .background(AppTheme.surface)
        .cornerRadius(10)
        .overlay(
            RoundedRectangle(cornerRadius: 10)
                .stroke(AppTheme.border, lineWidth: 0.5)
        )
    }

    private var activeProject: MathProject? {
        projectVM.selectedProject ?? projectVM.projects.first
    }

    private var recentSessions: [SessionHeader] {
        guard let project = activeProject else { return [] }
        return sessionStore.allHeaders(forProjectId: project.id)
            .sorted { $0.lastActivity > $1.lastActivity }
    }

    private func startNewSession() {
        guard let project = activeProject else { return }
        let model = newSessionModel.isEmpty ? project.defaultModel : newSessionModel
        let sessionName = newSessionName.trimmingCharacters(in: .whitespacesAndNewlines)
        let header = SessionHeader(
            id: UUID(),
            name: sessionName.isEmpty ? "New Session" : sessionName,
            customName: nil,
            createdAt: Date(),
            lastActivity: Date(),
            model: model,
            provider: "",
            projectId: project.id
        )
        try? sessionStore.createSession(header: header)
        selectedSession = header
        NotificationCenter.default.post(name: Notification.Name("MathMateSessionDidUpdate"), object: header)
    }
}

// MARK: - Step View

struct StepView: View {
    let number: String
    let title: String
    let description: String

    var body: some View {
        VStack(spacing: 8) {
            ZStack {
                Circle()
                    .fill(AppTheme.accentSubtle)
                    .frame(width: 40, height: 40)
                Text(number)
                    .font(.system(size: 16, weight: .bold))
                    .foregroundColor(AppTheme.accent)
            }
            Text(title)
                .font(.system(size: 13, weight: .semibold))
                .foregroundColor(AppTheme.textPrimary)
            Text(description)
                .font(.system(size: 11))
                .foregroundColor(AppTheme.textSecondary)
                .multilineTextAlignment(.center)
                .frame(width: 160)
        }
    }
}
