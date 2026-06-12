import SwiftUI

// MARK: - Project Configuration Sheet

struct ProjectConfigurationSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Bindable var projectVM: ProjectViewModel
    let editingProject: MathProject?
    /// Called after a *new* project is successfully created. Not called on edit.
    var onProjectCreated: ((MathProject) -> Void)? = nil

    @State private var draftName = ""
    @State private var draftVaultPath = ""
    @State private var draftTextbookPath: String? = nil
    @State private var draftDefaultModel = "google/gemini-3.1-flash-lite"
    @State private var draftDefaultChatMode: ChatMode = .socratic

    private var isEditing: Bool { editingProject != nil }
    private var titleText: String { isEditing ? "Edit Project" : "Create Project" }
    private var subtitleText: String {
        isEditing
            ? "Update the project name, vault path, or textbook PDF."
            : "Create a new project to get started."
    }
    private var actionText: String { isEditing ? "Save Changes" : "Create Project" }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(titleText)
                .font(.title3)
                .fontWeight(.semibold)

            Text(subtitleText)
                .foregroundColor(.secondary)
                .padding(.vertical, 8)

            Divider()

            Group {
                TextField("Project Name", text: $draftName)

                HStack {
                    TextField("Vault Path", text: $draftVaultPath)
                        .textFieldStyle(.roundedBorder)
                    Button("Browse…") {
                        chooseVaultDirectory()
                    }
                }

                HStack {
                    TextField("Textbook PDF Path (optional)", text: Binding(
                        get: { draftTextbookPath ?? "" },
                        set: { draftTextbookPath = $0.isEmpty ? nil : $0 }
                    ))
                    .textFieldStyle(.roundedBorder)
                    Button("Browse…") {
                        chooseTextbookFile()
                    }
                }
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

            HStack {
                Spacer()

                Button("Cancel") {
                    dismiss()
                }
                .keyboardShortcut(.cancelAction)

                Button(actionText) {
                    if var project = editingProject {
                        project.name = draftName
                        project.vaultPath = draftVaultPath
                        project.textbookPath = draftTextbookPath
                        projectVM.updateProject(project)
                    } else {
                        projectVM.createProject(
                            name: draftName,
                            vaultPath: draftVaultPath,
                            textbookPath: draftTextbookPath,
                            defaultModel: draftDefaultModel,
                            defaultChatMode: draftDefaultChatMode
                        )
                        if projectVM.errorMessage == nil, let newProject = projectVM.projects.last {
                            onProjectCreated?(newProject)
                        }
                    }
                    if projectVM.errorMessage == nil {
                        dismiss()
                    }
                }
                .disabled(draftName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || draftVaultPath.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                .keyboardShortcut(.defaultAction)
            }
        }
        .padding(16)
        .frame(width: 620)
        .onAppear {
            if let project = editingProject {
                draftName = project.name
                draftVaultPath = project.vaultPath
                draftTextbookPath = project.textbookPath
                draftDefaultModel = project.defaultModel
                draftDefaultChatMode = project.defaultChatMode
            } else {
                draftName = ""
                draftVaultPath = ""
                draftTextbookPath = nil
                draftDefaultModel = "google/gemini-3.1-flash-lite"
                draftDefaultChatMode = .socratic
            }
            projectVM.errorMessage = nil
        }
    }

    private func chooseVaultDirectory() {
        let panel = NSOpenPanel()
        panel.canChooseFiles = false
        panel.canChooseDirectories = true
        panel.allowsMultipleSelection = false
        panel.prompt = "Select"
        panel.message = "Choose a Synapse vault folder"
        if panel.runModal() == .OK, let url = panel.url {
            draftVaultPath = url.path
            if draftName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                draftName = url.lastPathComponent
            }
        }
    }

    private func chooseTextbookFile() {
        let panel = NSOpenPanel()
        panel.canChooseFiles = true
        panel.canChooseDirectories = false
        panel.allowsMultipleSelection = false
        panel.allowedContentTypes = [.pdf]
        panel.prompt = "Select"
        panel.message = "Choose a PDF textbook"
        if panel.runModal() == .OK, let url = panel.url {
            draftTextbookPath = url.path
        }
    }
}
