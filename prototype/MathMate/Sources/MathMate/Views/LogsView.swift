import SwiftUI

// MARK: - Study Logs Browser

struct LogsView: View {
    @State private var sessionStore = SessionStore()
    @State private var sessions: [SessionHeader] = []
    @State private var messageCounts: [UUID: Int] = [:]

    /// When provided, the view filters to sessions scoped to this project.
    var activeProject: MathProject?

    var body: some View {
        NavigationStack {
            List {
                ForEach(sessions, id: \.id) { session in
                    NavigationLink(destination: SessionDetailView(session: session, store: sessionStore)) {
                        LogSessionRowView(
                            session: session,
                            messageCount: messageCounts[session.id] ?? 0,
                            onRename: { newName in
                                renameSession(session, to: newName)
                            }
                        )
                    }
                    .contextMenu {
                        Button("Rename…") {
                            // Trigger rename via the row's double-click
                        }
                        Divider()
                        Button("Delete", role: .destructive) {
                            deleteSession(session)
                        }
                    }
                }
                .onDelete(perform: deleteAt)
            }
            .navigationTitle(activeProject.map { "\($0.name) — Logs" } ?? "Study Logs")
            .onAppear(perform: loadSessions)
            .onChange(of: activeProject?.id) { _, _ in
                loadSessions()
            }
            .toolbar {
                Button(action: loadSessions) {
                    Label("Refresh", systemImage: "arrow.clockwise")
                }
            }
        }
    }

    private func loadSessions() {
        sessions = sessionStore.allHeaders(forProjectId: activeProject?.id)
        messageCounts = [:]
        for session in sessions {
            messageCounts[session.id] = sessionStore.countMessages(for: session.id)
        }
    }
    
    private func deleteSession(_ session: SessionHeader) {
        try? sessionStore.deleteSession(session.id)
        loadSessions()
    }
    
    private func deleteAt(_ indices: IndexSet) {
        for index in indices {
            try? sessionStore.deleteSession(sessions[index].id)
        }
        loadSessions()
    }
    
    private func renameSession(_ session: SessionHeader, to newName: String) {
        var updated = session
        updated.customName = newName.isEmpty ? nil : newName
        try? sessionStore.updateHeader(updated)
        loadSessions()
    }
}

// MARK: - Session Row

struct LogSessionRowView: View {
    let session: SessionHeader
    let messageCount: Int
    let onRename: (String) -> Void
    
    @State private var isEditing = false
    @State private var editName = ""
    
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            // Name line — double-click to edit
            if isEditing {
                HStack {
                    TextField("Session name", text: $editName)
                        .textFieldStyle(.roundedBorder)
                        .onSubmit {
                            submitRename()
                        }
                        .onExitCommand {
                            isEditing = false
                        }
                    Button("Save") { submitRename() }
                        .buttonStyle(.borderedProminent)
                        .controlSize(.small)
                }
            } else {
                Text(session.displayName)
                    .font(.headline)
                    .lineLimit(1)
                    .onTapGesture(count: 2) {
                        isEditing = true
                        editName = session.displayName
                    }
            }
            
            // Metadata line
            HStack(spacing: 12) {
                Label(session.model, systemImage: "cpu")
                Text("·")
                Label("\(messageCount) messages", systemImage: "text.bubble")
                Text("·")
                Label(session.provider, systemImage: "network")
                Spacer()
                Text(session.lastActivity, style: .relative)
                    .foregroundColor(.secondary)
            }
            .font(.caption)
            .foregroundColor(.secondary)
        }
        .padding(.vertical, 4)
    }
    
    private func submitRename() {
        let trimmed = editName.trimmingCharacters(in: .whitespacesAndNewlines)
        if !trimmed.isEmpty {
            onRename(trimmed)
        }
        isEditing = false
    }
}

// MARK: - Session Detail (Read-Only Replay)

struct SessionDetailView: View {
    let session: SessionHeader
    nonisolated(unsafe) let store: SessionStore
    @State private var messages: [Message] = []
    @State private var isLoading = true
    
    var body: some View {
        VStack(spacing: 0) {
            // Session info header
            sessionInfoBar
            
            Divider()
            
            if isLoading {
                ProgressView("Loading session…")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if messages.isEmpty {
                VStack(spacing: 8) {
                    Image(systemName: "doc.text.magnifyingglass")
                        .font(.system(size: 42))
                        .foregroundColor(.secondary)
                    Text("No messages found")
                        .font(.title3)
                    Text("This session file may be empty or corrupted.")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ScrollViewReader { proxy in
                    ScrollView {
                        LazyVStack(alignment: .leading, spacing: 12) {
                            ForEach(messages) { message in
                                MessageRow(message: message)
                            }
                        }
                        .padding()
                    }
                }
            }
        }
        .navigationTitle(session.displayName)
        .onAppear(perform: loadMessages)
    }
    
    private var sessionInfoBar: some View {
        HStack(spacing: 16) {
            VStack(alignment: .leading, spacing: 2) {
                Text("Model")
                    .font(.caption)
                    .foregroundColor(.secondary)
                Text(session.model)
                    .font(.subheadline)
            }
            VStack(alignment: .leading, spacing: 2) {
                Text("Provider")
                    .font(.caption)
                    .foregroundColor(.secondary)
                Text(session.provider)
                    .font(.subheadline)
            }
            VStack(alignment: .leading, spacing: 2) {
                Text("Messages")
                    .font(.caption)
                    .foregroundColor(.secondary)
                Text("\(messages.count)")
                    .font(.subheadline)
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 2) {
                Text("Last active")
                    .font(.caption)
                    .foregroundColor(.secondary)
                Text(session.lastActivity, style: .relative)
                    .font(.subheadline)
            }
        }
        .padding()
        .background(Color(nsColor: .controlBackgroundColor))
    }
    
    private func loadMessages() {
        isLoading = true
        DispatchQueue.global(qos: .userInitiated).async {
            let loaded = store.loadMessages(for: session.id)
            DispatchQueue.main.async {
                messages = loaded
                isLoading = false
            }
        }
    }
}
