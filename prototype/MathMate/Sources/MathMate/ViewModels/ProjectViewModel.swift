import Foundation
import SwiftUI

/// Manages the list of projects and the active project selection.
@MainActor
@Observable
final class ProjectViewModel {
    var projects: [MathProject] = []
    var selectedProject: MathProject? = nil
    var errorMessage: String?

    init() {
        loadProjects()
    }

    // MARK: - Persistence

    func loadProjects() {
        // Hide archived projects from the primary sidebar list
        projects = ProjectStore.shared.loadAll().filter { $0.archivedAt == nil }
        // Validate selected project still exists
        if let selected = selectedProject,
           !projects.contains(where: { $0.id == selected.id }) {
            selectedProject = nil
        }
        // Auto-select first project if none selected and projects exist
        if selectedProject == nil, let first = projects.first {
            selectedProject = first
        }
        errorMessage = nil
    }

    // MARK: - CRUD

    func createProject(name: String, vaultPath: String, textbookPath: String?, defaultModel: String = "google/gemini-3.1-flash-lite", defaultChatMode: ChatMode = .socratic) {
        let trimmedName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedPath = vaultPath.trimmingCharacters(in: .whitespacesAndNewlines)

        guard !trimmedName.isEmpty else {
            errorMessage = "Project name cannot be empty"
            return
        }
        guard !trimmedPath.isEmpty else {
            errorMessage = "Vault path cannot be empty"
            return
        }

        let resolvedVaultURL = _resolveVaultURL(trimmedPath)

        // Check if vault already exists and is initialized
        let isExistingInitializedVault = _isInitializedSynapseVault(at: resolvedVaultURL)

        // Create vault directory if it doesn't exist (idempotent if already exists)
        do {
            try FileManager.default.createDirectory(at: resolvedVaultURL, withIntermediateDirectories: true)
        } catch {
            errorMessage = "Could not access vault directory: \(error.localizedDescription)"
            return
        }

        // Only initialize if the vault is not already a Synapse vault
        if !isExistingInitializedVault {
            do {
                try _initializeSynapseVault(at: resolvedVaultURL)
            } catch {
                errorMessage = "Could not initialize Synapse vault: \(error.localizedDescription)"
                return
            }
        }

        let project = ProjectStore.shared.createProject(
            name: trimmedName,
            vaultPath: trimmedPath,
            textbookPath: textbookPath,
            defaultModel: defaultModel,
            defaultChatMode: defaultChatMode
        )
        projects.append(project)
        selectedProject = project
        errorMessage = nil
    }

    func updateProject(_ project: MathProject) {
        guard !project.name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            errorMessage = "Project name cannot be empty"
            return
        }
        let resolvedVaultURL = _resolveVaultURL(project.vaultPath)
        guard _validateDirectoryPath(resolvedVaultURL.path) else {
            errorMessage = "Vault path must be an existing directory"
            return
        }
        
        // If the vault is not yet initialized as a Synapse vault, initialize it now
        if !_isInitializedSynapseVault(at: resolvedVaultURL) {
            do {
                try _initializeSynapseVault(at: resolvedVaultURL)
            } catch {
                errorMessage = "Could not initialize Synapse vault: \(error.localizedDescription)"
                return
            }
        }
        
        ProjectStore.shared.updateProject(project)
        if let index = projects.firstIndex(where: { $0.id == project.id }) {
            projects[index] = project
        }
        if selectedProject?.id == project.id {
            selectedProject = project
        }
        errorMessage = nil
    }

    func deleteProject(_ id: UUID) {
        // Remove project-scoped sessions as part of project deletion.
        let sessionStore = SessionStore()
        let scopedSessions = sessionStore.allHeaders(forProjectId: id)
        for session in scopedSessions {
            try? sessionStore.deleteSession(session.id)
        }

        ProjectStore.shared.deleteProject(id)
        projects.removeAll(where: { $0.id == id })
        if selectedProject?.id == id {
            selectedProject = projects.first
        }
        errorMessage = nil
    }

    func archiveProject(_ id: UUID) {
        let all = ProjectStore.shared.loadAll()
        guard let existing = all.first(where: { $0.id == id }) else { return }
        var archived = existing
        archived.archivedAt = Date()
        ProjectStore.shared.updateProject(archived)
        projects.removeAll(where: { $0.id == id })
        if selectedProject?.id == id {
            selectedProject = projects.first
        }
        errorMessage = nil
    }

    // MARK: - Selection

    func selectProject(_ project: MathProject?) {
        selectedProject = project
    }

    // MARK: - Validation

    private func _validateDirectoryPath(_ path: String) -> Bool {
        guard !path.isEmpty else { return false }
        var isDir: ObjCBool = false
        let exists = FileManager.default.fileExists(atPath: path, isDirectory: &isDir)
        return exists && isDir.boolValue
    }

    private func _resolveVaultURL(_ path: String) -> URL {
        let trimmed = path.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return URL(fileURLWithPath: "") }
        if trimmed.hasPrefix("/") {
            return URL(fileURLWithPath: trimmed)
        }
        return FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(trimmed)
    }

    /// Checks if a directory is already an initialized Synapse vault.
    /// Returns true if .synapse/ folder exists (implies MathMate folders may also exist).
    private func _isInitializedSynapseVault(at vaultURL: URL) -> Bool {
        let synapseFolderURL = vaultURL.appendingPathComponent(".synapse")
        var isDirectory: ObjCBool = false
        return FileManager.default.fileExists(atPath: synapseFolderURL.path, isDirectory: &isDirectory) && isDirectory.boolValue
    }

    private func _initializeSynapseVault(at vaultURL: URL) throws {
        // Synapse metadata folder
        let synapseConfigURL = vaultURL.appendingPathComponent(".synapse")
        try FileManager.default.createDirectory(at: synapseConfigURL, withIntermediateDirectories: true)

        // Minimal app config (safe if already exists)
        let appConfigURL = synapseConfigURL.appendingPathComponent("app.json")
        if !FileManager.default.fileExists(atPath: appConfigURL.path) {
            let defaultConfig = "{}"
            try defaultConfig.write(to: appConfigURL, atomically: true, encoding: .utf8)
        }

        // MathMate workspace folders
        let studyLogsURL = vaultURL.appendingPathComponent("MathMate/Study Logs")
        try FileManager.default.createDirectory(at: studyLogsURL, withIntermediateDirectories: true)
    }
}
