import Foundation
import os

private let log = Logger(subsystem: "com.mathmate", category: "persistence")

/// Persists the list of MathProjects to `~/.mathmate/projects.json`.
@MainActor
final class ProjectStore {
    static let shared = ProjectStore()

    private let projectsFile: URL = {
        FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent(".mathmate/projects.json")
    }()

    private init() {
        createDirectoryIfNeeded()
    }

    // MARK: - CRUD

    func loadAll() -> [MathProject] {
        guard let data = try? Data(contentsOf: projectsFile) else { return [] }
        do {
            return try JSONDecoder().decode([MathProject].self, from: data)
        } catch {
            log.error("Failed to decode projects.json: \(error)")
            return []
        }
    }

    func save(_ projects: [MathProject]) {
        createDirectoryIfNeeded()
        do {
            let data = try JSONEncoder().encode(projects)
            try data.write(to: projectsFile, options: .atomic)
        } catch {
            log.error("Failed to save projects.json: \(error)")
        }
    }

    func createProject(name: String, vaultPath: String, textbookPath: String?, defaultModel: String = "google/gemini-3.1-flash-lite", defaultChatMode: ChatMode = .socratic) -> MathProject {
        let project = MathProject(
            name: name,
            vaultPath: vaultPath,
            textbookPath: textbookPath,
            defaultModel: defaultModel,
            defaultChatMode: defaultChatMode
        )
        var projects = loadAll()
        projects.append(project)
        save(projects)
        return project
    }

    func updateProject(_ project: MathProject) {
        var projects = loadAll()
        if let index = projects.firstIndex(where: { $0.id == project.id }) {
            projects[index] = project
            save(projects)
        }
    }

    func deleteProject(_ id: UUID) {
        var projects = loadAll()
        projects.removeAll(where: { $0.id == id })
        save(projects)
    }

    // MARK: - Helpers

    private func createDirectoryIfNeeded() {
        let dir = projectsFile.deletingLastPathComponent()
        try? FileManager.default.createDirectory(
            at: dir,
            withIntermediateDirectories: true
        )
    }
}
