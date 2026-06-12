import Foundation
import AppKit

struct VaultNote: Identifiable {
    let id: String
    let title: String
    let relativePath: String
    let absolutePath: String
    let modifiedAt: Date?
}

@MainActor
@Observable
final class VaultViewModel {
    var notes: [VaultNote] = []
    var searchQuery: String = ""
    var errorMessage: String?

    /// Notes filtered by the current search query (title or path).
    var filteredNotes: [VaultNote] {
        guard !searchQuery.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            return notes
        }
        let query = searchQuery.lowercased()
        return notes.filter { note in
            note.title.lowercased().contains(query) ||
            note.relativePath.lowercased().contains(query)
        }
    }

    /// The currently bound vault path. When nil, the vault browser is empty.
    private(set) var vaultPath: String?

    init(vaultPath: String? = nil) {
        self.vaultPath = vaultPath
        if let path = vaultPath {
            refreshNotes(for: path)
        }
    }

    // MARK: - Binding

    func bindVault(_ path: String?) {
        vaultPath = path
        if let path = path {
            refreshNotes(for: path)
        } else {
            notes = []
            errorMessage = nil
        }
    }

    // MARK: - Notes Scanning

    func refreshNotes(for path: String? = nil) {
        let targetPath = path ?? vaultPath
        guard let targetPath, !targetPath.isEmpty else {
            notes = []
            errorMessage = nil
            return
        }

        let rootURL = URL(fileURLWithPath: targetPath)
        var isDir: ObjCBool = false
        guard FileManager.default.fileExists(atPath: rootURL.path, isDirectory: &isDir), isDir.boolValue else {
            notes = []
            errorMessage = "Vault path not found: \(targetPath)"
            return
        }

        errorMessage = nil
        let keys: [URLResourceKey] = [.isRegularFileKey, .contentModificationDateKey]
        let enumerator = FileManager.default.enumerator(
            at: rootURL,
            includingPropertiesForKeys: keys,
            options: [.skipsHiddenFiles, .skipsPackageDescendants]
        )

        var collected: [VaultNote] = []
        while let fileURL = enumerator?.nextObject() as? URL {
            guard fileURL.pathExtension.lowercased() == "md" else { continue }
            if fileURL.path.contains("/.synapse/") { continue }

            let values = try? fileURL.resourceValues(forKeys: Set(keys))
            guard values?.isRegularFile == true else { continue }

            let relative = fileURL.path.replacingOccurrences(of: rootURL.path + "/", with: "")
            let title = fileURL.deletingPathExtension().lastPathComponent
            collected.append(
                VaultNote(
                    id: relative,
                    title: title,
                    relativePath: relative,
                    absolutePath: fileURL.path,
                    modifiedAt: values?.contentModificationDate
                )
            )
        }

        notes = collected.sorted {
            ($0.modifiedAt ?? .distantPast) > ($1.modifiedAt ?? .distantPast)
        }
    }

    // MARK: - Open in Synapse

    func openInSynapse(_ note: VaultNote) {
        guard let vaultPath = self.vaultPath else { return }
        let vaultName = URL(fileURLWithPath: vaultPath).lastPathComponent
            .addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? ""
        let filePath = note.relativePath
            .addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? note.relativePath

        if let url = URL(string: "synapse://open?vault=\(vaultName)&file=\(filePath)") {
            NSWorkspace.shared.open(url)
        }
    }
}
