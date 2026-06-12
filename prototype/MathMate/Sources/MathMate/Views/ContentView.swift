import SwiftUI

// MARK: - Main Tab Enum

enum MainTab: String, CaseIterable {
    case chat = "Chat"
    case vault = "Vault"
    case overview = "Overview"

    var iconName: String {
        switch self {
        case .chat: return "bubble.left.and.bubble.right"
        case .vault: return "doc.text.magnifyingglass"
        case .overview: return "clock"
        }
    }
}

// MARK: - Content View (Root)

struct ContentView: View {
    @State private var projectVM = ProjectViewModel()
    @State private var selectedSession: SessionHeader? = nil
    @State private var showProjectSheet = false
    private let sessionStore = SessionStore()

    var body: some View {
        NavigationSplitView {
            SidebarView(projectVM: projectVM, selectedSession: $selectedSession, onProjectCreated: { project in
                createSessionAndSelect(in: project)
            })
        } detail: {
            if let session = selectedSession {
                MainPanelView(session: session, projectVM: projectVM, onSelectSession: { newSession in
                    selectedSession = newSession
                })
            } else if projectVM.projects.isEmpty {
                NewProjectSetupView(projectVM: projectVM, onProjectCreated: { project in
                    createSessionAndSelect(in: project)
                })
            } else {
                NewSessionSetupView(projectVM: projectVM, selectedSession: $selectedSession)
            }
        }
        .sheet(isPresented: $showProjectSheet) {
            ProjectConfigurationSheet(projectVM: projectVM, editingProject: nil, onProjectCreated: { project in
                createSessionAndSelect(in: project)
            })
        }
        .onAppear {
            restoreLastOpened()
        }
        .onChange(of: projectVM.selectedProject) { _, newProject in
            if let project = newProject {
                if selectedSession == nil {
                    // Auto-select most recent session for this project
                    let sessions = SessionStore().allHeaders(forProjectId: project.id)
                    if let mostRecent = sessions.first {
                        selectedSession = mostRecent
                    }
                }
            }
        }
        // MARK: Keyboard shortcut notification handlers
        .onReceive(NotificationCenter.default.publisher(for: .mathMateNewSession)) { _ in
            handleNewSession()
        }
        .onReceive(NotificationCenter.default.publisher(for: .mathMateNewProject)) { _ in
            showProjectSheet = true
        }
        .onReceive(NotificationCenter.default.publisher(for: .mathMatePreviousSession)) { _ in
            navigateSession(by: -1)
        }
        .onReceive(NotificationCenter.default.publisher(for: .mathMateNextSession)) { _ in
            navigateSession(by: +1)
        }
    }

    // MARK: - Session helpers

    /// Create a new session for `project` and immediately select it.
    private func createSessionAndSelect(in project: MathProject) {
        let header = SessionHeader(
            id: UUID(),
            name: "New Session",
            customName: nil,
            createdAt: Date(),
            lastActivity: Date(),
            model: project.defaultModel,
            provider: "",
            projectId: project.id
        )
        try? sessionStore.createSession(header: header)
        selectedSession = header
        NotificationCenter.default.post(name: Notification.Name("MathMateSessionDidUpdate"), object: header)
    }

    /// Create a new session in the project that owns the current session,
    /// falling back to the first project if nothing is selected.
    private func handleNewSession() {
        let targetProject: MathProject?
        if let currentProjectId = selectedSession?.projectId {
            targetProject = projectVM.projects.first(where: { $0.id == currentProjectId })
        } else {
            targetProject = projectVM.projects.first
        }
        guard let project = targetProject else { return }
        createSessionAndSelect(in: project)
    }

    /// Navigate to the previous (delta = -1) or next (delta = +1) session
    /// across all projects, ordered by lastActivity descending (same order as sidebar).
    private func navigateSession(by delta: Int) {
        let allSessions = projectVM.projects
            .flatMap { sessionStore.allHeaders(forProjectId: $0.id) }
            .sorted { $0.lastActivity > $1.lastActivity }
        guard !allSessions.isEmpty else { return }
        if let current = selectedSession,
           let idx = allSessions.firstIndex(where: { $0.id == current.id }) {
            let newIdx = (idx + delta + allSessions.count) % allSessions.count
            selectedSession = allSessions[newIdx]
        } else {
            selectedSession = allSessions.first
        }
    }

    private func restoreLastOpened() {
        // Access UserDefaults directly to avoid @MainActor SettingsStore isolation issues
        let defaults = UserDefaults.standard
        let lastProjectIdStr = defaults.string(forKey: "lastOpenedProjectId")
        let lastSessionIdStr = defaults.string(forKey: "lastOpenedSessionId")

        if let lastProjectIdStr,
           let lastProjectId = UUID(uuidString: lastProjectIdStr),
           let project = projectVM.projects.first(where: { $0.id == lastProjectId }) {
            projectVM.selectProject(project)
            if let lastSessionIdStr,
               let lastSessionId = UUID(uuidString: lastSessionIdStr) {
                let sessions = SessionStore().allHeaders(forProjectId: project.id)
                if let session = sessions.first(where: { $0.id == lastSessionId }) {
                    selectedSession = session
                    return
                }
                if let mostRecent = sessions.first {
                    selectedSession = mostRecent
                    return
                }
            }
        }
    }
}
