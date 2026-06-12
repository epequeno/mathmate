import SwiftUI

// MARK: - Sidebar

struct SidebarView: View {
    @Bindable var projectVM: ProjectViewModel
    @Binding var selectedSession: SessionHeader?
    var onProjectCreated: ((MathProject) -> Void)? = nil

    @State private var isShowingProjectSheet = false
    @State private var expandedProjectIds: Set<UUID> = []
    @State private var sessionStore = SessionStore()
    @State private var projectSessions: [UUID: [SessionHeader]] = [:]
    @State private var projectMessageCounts: [UUID: [UUID: Int]] = [:]
    @State private var projectPendingDelete: MathProject? = nil
    @State private var projectPendingEdit: MathProject? = nil
    @State private var vaultExpanded = true
    @State private var vaultSessions: [SessionHeader] = []
    @State private var vaultMessageCounts: [UUID: Int] = [:]

    var body: some View {
        VStack(spacing: 0) {
            // Header
            HStack {
                Text("MathMate")
                    .font(.system(size: 15, weight: .bold))
                    .foregroundColor(AppTheme.textPrimary)
                Spacer()
            }
            .padding(EdgeInsets(top: 20, leading: 16, bottom: 12, trailing: 16))

            Divider()

            if projectVM.projects.isEmpty {
                emptySidebar
            } else {
                projectsList
            }

            // Vault section (unattached sessions)
            if !vaultSessions.isEmpty {
                Divider()
                vaultSection
            }

            Divider()

            // New Project button (always visible)
            newProjectButton
        }
        .frame(minWidth: 240)
        .background(AppTheme.backgroundElevated)
        .sheet(isPresented: $isShowingProjectSheet) {
            ProjectConfigurationSheet(projectVM: projectVM, editingProject: nil, onProjectCreated: onProjectCreated)
        }
        .sheet(item: $projectPendingEdit) { project in
            ProjectConfigurationSheet(projectVM: projectVM, editingProject: project)
        }
        .onAppear {
            loadSessions()
        }
        .onChange(of: projectVM.projects.count) { _, _ in
            loadSessions()
        }
        .onReceive(NotificationCenter.default.publisher(for: Notification.Name("MathMateSessionDidUpdate"))) { notification in
            loadSessions()
            if let updated = notification.object as? SessionHeader, selectedSession?.id == updated.id {
                selectedSession = updated
            }
        }
        .confirmationDialog(
            "Delete project?",
            isPresented: Binding(
                get: { projectPendingDelete != nil },
                set: { if !$0 { projectPendingDelete = nil } }
            ),
            titleVisibility: .visible
        ) {
            Button("Delete", role: .destructive) {
                if let project = projectPendingDelete {
                    deleteProject(project)
                }
                projectPendingDelete = nil
            }
            Button("Cancel", role: .cancel) {
                projectPendingDelete = nil
            }
        } message: {
            Text("This permanently deletes the project and removes it from your workspace.")
        }
    }

    // MARK: - Empty Sidebar

    private var emptySidebar: some View {
        VStack(spacing: 10) {
            Spacer()
            Image(systemName: "folder")
                .font(.system(size: 28))
                .foregroundColor(AppTheme.textTertiary)
            Text("No projects yet.")
                .font(.system(size: 13))
                .foregroundColor(AppTheme.textSecondary)
            Text("Create one to get started.")
                .font(.system(size: 11))
                .foregroundColor(AppTheme.textTertiary)
            Spacer()
        }
        .frame(maxWidth: .infinity)
    }

    // MARK: - Projects List

    private var projectsList: some View {
        ScrollView {
            LazyVStack(spacing: 0) {
                ForEach(projectVM.projects) { project in
                    ProjectRowView(
                        project: project,
                        isExpanded: Binding(
                            get: { expandedProjectIds.contains(project.id) },
                            set: { expanded in
                                if expanded {
                                    expandedProjectIds.insert(project.id)
                                } else {
                                    expandedProjectIds.remove(project.id)
                                }
                            }
                        ),
                        sessions: projectSessions[project.id] ?? [],
                        messageCounts: projectMessageCounts[project.id] ?? [:],
                        selectedSession: $selectedSession,
                        onNewSession: { createSession(in: project) },
                        onSelectSession: { session in
                            selectedSession = session
                        },
                        onDeleteSession: { session in
                            deleteSession(session)
                        },
                        onRenameSession: { session, newName in
                            renameSession(session, to: newName)
                        },
                        onArchiveProject: {
                            archiveProject(project)
                        },
                        onEditProject: {
                            projectPendingEdit = project
                        },
                        onDeleteProject: {
                            projectPendingDelete = project
                        }
                    )
                }
            }
        }
    }

    // MARK: - Vault Section

    private var vaultSection: some View {
        VStack(spacing: 0) {
            Button(action: {
                withAnimation(.easeInOut(duration: 0.18)) {
                    vaultExpanded.toggle()
                }
            }) {
                HStack(spacing: 6) {
                    Image(systemName: "chevron.right")
                        .font(.system(size: 10, weight: .medium))
                        .foregroundColor(AppTheme.textSecondary)
                        .rotationEffect(.degrees(vaultExpanded ? 90 : 0))
                        .frame(width: 10, height: 10)

                    Text("VAULT")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(AppTheme.textPrimary)
                        .lineLimit(1)

                    Spacer()

                    Text("\(vaultSessions.count)")
                        .font(.system(size: 10))
                        .foregroundColor(AppTheme.textTertiary)
                        .padding(.horizontal, 5)
                        .background(AppTheme.surface)
                        .cornerRadius(8)
                }
                .padding(EdgeInsets(top: 6, leading: 12, bottom: 6, trailing: 16))
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            if vaultExpanded {
                ForEach(vaultSessions) { session in
                    SessionRowView(
                        session: session,
                        messageCount: vaultMessageCounts[session.id] ?? 0,
                        isSelected: selectedSession?.id == session.id,
                        onSelect: { selectedSession = session },
                        onDelete: { deleteSession(session) },
                        onArchive: { archiveSession(session) },
                        onRename: { newName in renameSession(session, to: newName) }
                    )
                }
            }
        }
    }

    // MARK: - New Project Button

    private var newProjectButton: some View {
        Button(action: {
            isShowingProjectSheet = true
        }) {
            HStack(spacing: 8) {
                Image(systemName: "plus")
                    .font(.system(size: 12, weight: .semibold))
                Text("New Project")
                    .font(.system(size: 13, weight: .semibold))
            }
            .foregroundColor(.white)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 9)
            .padding(.horizontal, 12)
            .background(AppTheme.accentFill)
            .cornerRadius(8)
        }
        .buttonStyle(.plain)
        .padding(12)
    }

    // MARK: - Helpers

    private func loadSessions() {
        // Load project-scoped sessions
        for project in projectVM.projects {
            let sessions = sessionStore.allHeaders(forProjectId: project.id).filter { !$0.isArchived }
            projectSessions[project.id] = sessions
            var counts: [UUID: Int] = [:]
            for session in sessions {
                counts[session.id] = sessionStore.countMessages(for: session.id)
            }
            projectMessageCounts[project.id] = counts
        }

        // Load vault sessions (unattached — no projectId)
        let allSessions = sessionStore.allHeaders()
        vaultSessions = allSessions.filter { $0.projectId == nil && !$0.isArchived }
        vaultMessageCounts = [:]
        for session in vaultSessions {
            vaultMessageCounts[session.id] = sessionStore.countMessages(for: session.id)
        }

        // Auto-expand project containing the last-opened or most recent session
        let storedId = SettingsStore().lastOpenedSessionId
        if let storedId {
            for (projectId, sessions) in projectSessions {
                if sessions.contains(where: { $0.id == storedId }) {
                    expandedProjectIds.insert(projectId)
                    return
                }
            }
            // Fall back to the project with the most recent session
            let allSessions = projectSessions.values.flatMap { $0 }
            if let newest = allSessions.max(by: { $0.lastActivity < $1.lastActivity }) {
                for (projectId, sessions) in projectSessions {
                    if sessions.contains(where: { $0.id == newest.id }) {
                        expandedProjectIds.insert(projectId)
                        break
                    }
                }
            }
        } else if !vaultSessions.isEmpty {
            // Default: no projects with sessions — keep vault collapsed
        } else {
            // Default: expand the first project
            if let first = projectVM.projects.first {
                expandedProjectIds.insert(first.id)
            }
        }
    }

    private func createSession(in project: MathProject) {
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
        loadSessions()
    }

    private func deleteSession(_ session: SessionHeader) {
        try? sessionStore.deleteSession(session.id)
        if selectedSession?.id == session.id {
            selectedSession = nil
        }
        loadSessions()
    }

    private func archiveSession(_ session: SessionHeader) {
        try? sessionStore.archiveSession(session.id)
        if selectedSession?.id == session.id {
            selectedSession = nil
        }
        loadSessions()
    }
    
    private func renameSession(_ session: SessionHeader, to newName: String) {
        var updated = session
        updated.customName = newName
        try? sessionStore.updateHeader(updated)
        if selectedSession?.id == session.id {
            selectedSession = updated
        }
        loadSessions()
    }

    private func archiveProject(_ project: MathProject) {
        if selectedSession?.projectId == project.id {
            selectedSession = nil
        }
        projectVM.archiveProject(project.id)
        loadSessions()
    }

    private func deleteProject(_ project: MathProject) {
        if selectedSession?.projectId == project.id {
            selectedSession = nil
        }
        projectVM.deleteProject(project.id)
        loadSessions()
    }
}

// MARK: - Project Row

struct ProjectRowView: View {
    let project: MathProject
    @Binding var isExpanded: Bool
    let sessions: [SessionHeader]
    let messageCounts: [UUID: Int]
    @Binding var selectedSession: SessionHeader?
    let onNewSession: () -> Void
    let onSelectSession: (SessionHeader) -> Void
    let onDeleteSession: (SessionHeader) -> Void
    let onRenameSession: (SessionHeader, String) -> Void
    let onArchiveProject: () -> Void
    let onEditProject: () -> Void
    let onDeleteProject: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            // Project header
            Button(action: {
                withAnimation(.easeInOut(duration: 0.18)) {
                    isExpanded.toggle()
                }
            }) {
                HStack(spacing: 6) {
                    // Chevron
                    Image(systemName: "chevron.right")
                        .font(.system(size: 10, weight: .medium))
                        .foregroundColor(AppTheme.textSecondary)
                        .rotationEffect(.degrees(isExpanded ? 90 : 0))
                        .frame(width: 10, height: 10)

                    Text(project.name.uppercased())
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(AppTheme.textPrimary)
                        .lineLimit(1)

                    Spacer()

                    // New session button
                    Button(action: onNewSession) {
                        Image(systemName: "plus")
                            .font(.system(size: 11, weight: .medium))
                            .foregroundColor(AppTheme.textSecondary)
                            .frame(width: 13, height: 13)
                    }
                    .buttonStyle(.plain)
                    .help("Create new session")
                    .opacity(0.5)
                    .onHover { _ in }
                }
                .padding(EdgeInsets(top: 6, leading: 12, bottom: 6, trailing: 16))
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .background(Color.clear)
            .contextMenu {
                Button("Edit Project…") {
                    onEditProject()
                }
                Divider()
                Button("Archive Project") {
                    onArchiveProject()
                }
                Divider()
                Button("Delete Project", role: .destructive) {
                    onDeleteProject()
                }
            }
            .onHover { _ in }

            // Session list (when expanded)
            if isExpanded {
                ForEach(sessions) { session in
                    SessionRowView(
                        session: session,
                        messageCount: messageCounts[session.id] ?? 0,
                        isSelected: selectedSession?.id == session.id,
                        onSelect: { onSelectSession(session) },
                        onDelete: { onDeleteSession(session) },
                        onArchive: { archiveSession(session) },
                        onRename: { newName in onRenameSession(session, newName) }
                    )
                }
            }
        }
        .background(Color.clear)
    }
}

// MARK: - Session Row

struct SessionRowView: View {
    let session: SessionHeader
    let messageCount: Int
    let isSelected: Bool
    let onSelect: () -> Void
    let onDelete: () -> Void
    let onArchive: (() -> Void)?
    let onRename: (String) -> Void

    @State private var isShowingRename = false
    @State private var renameText = ""

    var body: some View {
        Button(action: onSelect) {
            HStack(spacing: 8) {
                // Lines icon
                Image(systemName: "line.3.horizontal")
                    .font(.system(size: 10))
                    .foregroundColor(isSelected ? Color.white.opacity(0.8) : AppTheme.textSecondary)
                    .frame(width: 12, height: 12)

                VStack(alignment: .leading, spacing: 1) {
                    Text(session.displayName)
                        .font(.system(size: 13, weight: isSelected ? .medium : .regular))
                        .foregroundColor(isSelected ? .white : AppTheme.textPrimary)
                        .lineLimit(1)
                        .truncationMode(.tail)

                    HStack(spacing: 4) {
                        Text(session.lastActivity, style: .relative)
                            .font(.system(size: 11))
                            .foregroundColor(isSelected ? Color.white.opacity(0.6) : AppTheme.textSecondary)
                        if messageCount > 0 {
                            Text("· \(messageCount) msgs")
                                .font(.system(size: 11))
                                .foregroundColor(isSelected ? Color.white.opacity(0.6) : AppTheme.textSecondary)
                        }
                    }
                }

                Spacer()
            }
            .padding(EdgeInsets(top: 7, leading: 10, bottom: 7, trailing: 12))
            .background(isSelected ? AppTheme.accentFill : Color.clear)
            .cornerRadius(6)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .padding(.horizontal, 8)
        .padding(.vertical, 1)
        .contextMenu {
            Button("Rename") {
                renameText = session.displayName
                isShowingRename = true
            }
            Button("Archive") {
                onArchive!()
            }
            Divider()
            Button("Delete", role: .destructive, action: onDelete)
        }
        .alert("Rename Session", isPresented: $isShowingRename) {
            TextField("Session name", text: $renameText)
            Button("Cancel", role: .cancel) { }
            Button("Save") {
                let trimmed = renameText.trimmingCharacters(in: .whitespacesAndNewlines)
                if !trimmed.isEmpty {
                    onRename(trimmed)
                }
            }
        } message: {
            Text("Enter a new name for this session.")
        }
    }
}
