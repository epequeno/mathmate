import SwiftUI

// MARK: - Wrap Up Sheet

struct WrapUpSheetView: View {
    @Bindable var viewModel: ChatViewModel
    @Environment(\.dismiss) private var dismiss

    @State private var draftTitle: String = ""
    @State private var draftMarkdown: String = ""
    @State private var showSaveSuccess: Bool = false
    @State private var savedFilePath: String = ""

    var body: some View {
        VStack(spacing: 0) {
            // Header
            header

            Divider()

            // Content area
            if viewModel.isGeneratingWrapUp {
                generatingView
            } else if !draftMarkdown.isEmpty {
                editorView
            } else {
                emptyPromptView
            }

            // Bottom actions
            if !draftMarkdown.isEmpty || viewModel.isGeneratingWrapUp {
                Divider()
                bottomActions
            }
        }
        .frame(minWidth: 600, minHeight: 500)
        .alert("Saved to Synapse", isPresented: $showSaveSuccess) {
            Button("Open in Synapse") {
                openSavedFile()
            }
            Button("Done") {
                dismiss()
            }
        } message: {
            Text(savedFilePath)
        }
    }

    // MARK: - Header

    private var header: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text("Session Wrap-Up")
                    .font(.headline)
                Text("Convert this session into study notes for Synapse")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }

            Spacer()

            Button("Close") {
                dismiss()
            }
            .buttonStyle(.borderless)
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 14)
        .background(Color(nsColor: .controlBackgroundColor))
    }

    // MARK: - Empty prompt

    private var emptyPromptView: some View {
        VStack(spacing: 16) {
            Image(systemName: "checklist")
                .font(.system(size: 48))
                .foregroundColor(.secondary)
            Text("Generate a structured summary of this session")
                .font(.body)
            Text("The tutor will review the conversation and produce study notes: summary, key concepts, formulas, pitfalls, and practice plan.")
                .font(.caption)
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
                .frame(maxWidth: 400)
            Button {
                Task { await generateDraft() }
            } label: {
                Label("Generate Wrap-Up", systemImage: "sparkles")
            }
            .buttonStyle(.borderedProminent)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - Generating placeholder

    private var generatingView: some View {
        VStack(spacing: 12) {
            ProgressView()
                .controlSize(.large)
            Text("Generating wrap-up…")
                .font(.body)
                .foregroundColor(.secondary)
            Text("Reviewing session and building study notes")
                .font(.caption)
                .foregroundColor(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - Editor

    private var editorView: some View {
        VStack(alignment: .leading, spacing: 12) {
            // Title field
            HStack(spacing: 8) {
                Text("Title:")
                    .font(.subheadline)
                    .foregroundColor(.secondary)
                TextField("Session Wrap-Up — Topic", text: $draftTitle)
                    .textFieldStyle(.plain)
                    .font(.headline)
            }
            .padding(.horizontal, 20)
            .padding(.top, 16)

            // Markdown editor
            ScrollView {
                TextEditor(text: $draftMarkdown)
                    .font(.system(size: 13, design: .monospaced))
                    .scrollContentBackground(.hidden)
                    .padding(8)
            }
            .background(Color(nsColor: .textBackgroundColor))
            .cornerRadius(8)
            .padding(.horizontal, 20)

            // Error banner
            if let error = viewModel.wrapUpError {
                HStack {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .foregroundColor(.orange)
                    Text(error)
                        .font(.caption)
                        .foregroundColor(.secondary)
                    Spacer()
                }
                .padding(.horizontal, 20)
            }
        }
    }

    // MARK: - Bottom Actions

    private var bottomActions: some View {
        HStack(spacing: 12) {
            Button {
                Task { await generateDraft(regenerate: true) }
            } label: {
                Label("Regenerate", systemImage: "arrow.clockwise")
            }
            .buttonStyle(.bordered)
            .disabled(viewModel.isGeneratingWrapUp)

            Spacer()

            if viewModel.noVaultConfigured {
                VStack(alignment: .trailing, spacing: 2) {
                    Text("No Synapse vault configured")
                        .font(.caption)
                        .foregroundColor(.orange)
                    Text("Add synapse.vaults in ~/.mathmate/config.json")
                        .font(.caption2)
                        .foregroundColor(.secondary)
                }
            } else {
                Button {
                    Task { await saveToSynapse() }
                } label: {
                    Label("Save to Synapse", systemImage: "square.and.arrow.down")
                }
                .buttonStyle(.borderedProminent)
                .disabled(draftMarkdown.isEmpty || viewModel.wrapUpSaveSuccess)
            }
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 12)
        .background(Color(nsColor: .controlBackgroundColor))
    }

    // MARK: - Actions

    private func generateDraft(regenerate: Bool = false) async {
        draftTitle = viewModel.currentSession?.name ?? "Session Wrap-Up"
        await viewModel.generateWrapUpDraft()
        if let draft = viewModel.wrapUpDraft {
            draftTitle = draft.title
            draftMarkdown = draft.markdown
        }
    }

    private func saveToSynapse() async {
        let path = await viewModel.saveWrapUpToVault(title: draftTitle, markdown: draftMarkdown)
        if let path = path {
            savedFilePath = path
            showSaveSuccess = true

            // Extract memory candidates from session in the background
            let memoryVM = MemoryViewModel(store: viewModel.memoryStore)
            await memoryVM.extractFromSession(
                messages: viewModel.messages,
                projectId: viewModel.activeProject?.id
            )
        }
    }

    private func openSavedFile() {
        let fileURL = URL(fileURLWithPath: savedFilePath)
        let vaultName = (fileURL.deletingLastPathComponent().lastPathComponent).addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? ""
        let filePath = fileURL.lastPathComponent.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? ""
        if let synapseURL = URL(string: "synapse://open?vault=\(vaultName)&file=\(filePath)") {
            NSWorkspace.shared.open(synapseURL)
        }
    }
}