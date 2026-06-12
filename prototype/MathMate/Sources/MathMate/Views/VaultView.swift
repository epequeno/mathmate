import SwiftUI
import PDFKit

// MARK: - Vault View

struct VaultView: View {
    @State private var viewModel = VaultViewModel()

    /// When provided, the vault browser shows notes from this project's vault.
    var activeProject: MathProject?

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Text("Vault Browser")
                    .font(.headline)

                Spacer()

                if let project = activeProject {
                    HStack(spacing: 4) {
                        Image(systemName: "folder")
                        Text(project.name)
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                } else {
                    Text("No project selected")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }

                Button {
                    if let project = activeProject {
                        viewModel.bindVault(project.vaultPath)
                        viewModel.refreshNotes()
                    }
                } label: {
                    Image(systemName: "arrow.clockwise")
                }
                .buttonStyle(.borderless)
                .help("Reload vault notes")
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(Color(nsColor: .controlBackgroundColor))

            Divider()

            if activeProject == nil {
                VStack(spacing: 10) {
                    Image(systemName: "doc.text.magnifyingglass")
                        .font(.system(size: 42))
                        .foregroundColor(.secondary)
                    Text("No project selected")
                        .font(.title3)
                    Text("Select a project from the sidebar to browse its vault.")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if viewModel.notes.isEmpty && viewModel.errorMessage == nil {
                VStack(spacing: 10) {
                    Image(systemName: "doc.text.magnifyingglass")
                        .font(.system(size: 42))
                        .foregroundColor(.secondary)
                    Text("No markdown notes found")
                        .font(.title3)
                    Text("The project's vault is empty or the path is incorrect.")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if viewModel.filteredNotes.isEmpty && !viewModel.searchQuery.trimmingCharacters(in: .whitespaces).isEmpty {
                VStack(spacing: 10) {
                    HStack(spacing: 6) {
                        Image(systemName: "magnifyingglass")
                            .foregroundColor(.secondary)
                        TextField("Filter notes by title or path…", text: $viewModel.searchQuery)
                            .textFieldStyle(.roundedBorder)
                            .frame(maxWidth: 300)
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)

                    Divider()

                    Spacer()
                    Image(systemName: "tray")
                        .font(.system(size: 36))
                        .foregroundColor(.secondary)
                    Text("No notes match \"\(viewModel.searchQuery)\"")
                        .font(.title3)
                    Text("Try a different search term.")
                        .font(.caption)
                        .foregroundColor(.secondary)
                    Spacer()
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                // Search bar
                HStack(spacing: 6) {
                    Image(systemName: "magnifyingglass")
                        .foregroundColor(.secondary)
                    TextField("Filter notes by title or path…", text: $viewModel.searchQuery)
                        .textFieldStyle(.roundedBorder)
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 8)

                Divider()

                List(viewModel.filteredNotes) { note in
                    HStack(spacing: 10) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(note.title)
                                .font(.body)
                            Text(note.relativePath)
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }
                        Spacer()
                        Button {
                            viewModel.openInSynapse(note)
                        } label: {
                            Image(systemName: "arrow.up.forward.square")
                        }
                        .buttonStyle(.borderless)
                        .help("Open in Synapse")
                    }
                }
                .listStyle(.inset)
            }

            if let error = viewModel.errorMessage {
                Divider()
                HStack {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .foregroundColor(.orange)
                    Text(error)
                        .font(.caption)
                        .foregroundColor(.secondary)
                    Spacer()
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .background(Color.red.opacity(0.05))
            }
        }
        .onAppear {
            if let project = activeProject {
                viewModel.bindVault(project.vaultPath)
            }
        }
        .onChange(of: activeProject?.id) { _, _ in
            if let project = activeProject {
                viewModel.bindVault(project.vaultPath)
            } else {
                viewModel.bindVault(nil)
            }
        }
    }
}

// MARK: - Textbook PDF Viewer

struct TextbookView: View {
    let project: MathProject

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Text(project.textbookDisplayName ?? "Textbook")
                    .font(.headline)
                Spacer()
                if let path = project.textbookPath {
                    Text(path)
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(Color(nsColor: .controlBackgroundColor))

            Divider()

            if let path = project.textbookPath,
               FileManager.default.fileExists(atPath: path) {
                PDFKitView(url: URL(fileURLWithPath: path))
            } else {
                VStack(spacing: 10) {
                    Image(systemName: "doc.text")
                        .font(.system(size: 42))
                        .foregroundColor(.secondary)
                    Text("Textbook not found")
                        .font(.title3)
                    if let path = project.textbookPath {
                        Text(path)
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
    }
}

// MARK: - PDF Kit View

struct PDFKitView: NSViewRepresentable {
    let url: URL

    func makeNSView(context: Context) -> PDFView {
        let pdfView = PDFView()
        pdfView.document = PDFDocument(url: url)
        pdfView.autoScales = true
        return pdfView
    }

    func updateNSView(_ nsView: PDFView, context: Context) {}
}
