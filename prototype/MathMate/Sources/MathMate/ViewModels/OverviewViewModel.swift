import Foundation

// MARK: - Overview ViewModel

@MainActor
@Observable
final class OverviewViewModel {
    let project: MathProject

    var sessionCount: Int = 0
    var totalMessages: Int = 0
    var vaultNoteCount: Int = 0
    var lastActive: Date? = nil
    var recentSessions: [SessionHeader] = []
    var recentMessageCounts: [UUID: Int] = [:]

    // AI Summary
    var summaryText: String? = nil
    var summaryGeneratedAt: Date? = nil
    var isGeneratingSummary: Bool = false
    var summaryError: String? = nil

    private let sessionStore = SessionStore()
    private let vaultVM = VaultViewModel()

    // MARK: - Init

    init(project: MathProject) {
        self.project = project
        loadStats()
    }

    func refresh() {
        loadStats()
    }

    // MARK: - Load Stats

    private func loadStats() {
        // Session count
        let allHeaders = sessionStore.allHeaders(forProjectId: project.id)
        sessionCount = allHeaders.count

        // Total messages, last active, recent sessions
        totalMessages = 0
        lastActive = allHeaders.first?.lastActivity
        recentSessions = Array(allHeaders.prefix(5))

        for session in recentSessions {
            let count = sessionStore.countMessages(for: session.id)
            recentMessageCounts[session.id] = count
            totalMessages += count
        }

        // Vault note count
        if project.vaultExists {
            vaultVM.bindVault(project.vaultPath)
            vaultVM.refreshNotes()
            vaultNoteCount = vaultVM.notes.count
        } else {
            vaultNoteCount = 0
        }

        // Load cached summary
        loadCachedSummary()
    }

    // MARK: - AI Summary

    private let summaryKeyPrefix = "overview_summary_"
    private let summaryDateKeyPrefix = "overview_summary_date_"

    private func loadCachedSummary() {
        let defaults = UserDefaults.standard
        summaryText = defaults.string(forKey: summaryKeyPrefix + project.id.uuidString)
        if let dateDouble = defaults.object(forKey: summaryDateKeyPrefix + project.id.uuidString) as? TimeInterval {
            summaryGeneratedAt = Date(timeIntervalSince1970: dateDouble)
        }
    }

    private func cacheSummary(text: String) {
        let defaults = UserDefaults.standard
        defaults.set(text, forKey: summaryKeyPrefix + project.id.uuidString)
        defaults.set(Date().timeIntervalSince1970, forKey: summaryDateKeyPrefix + project.id.uuidString)
    }

    /// Generates a lightweight AI summary from recent session content.
    /// Currently uses a placeholder. Future: lightweight LLM call.
    func generateSummary() async {
        guard !isGeneratingSummary else { return }
        isGeneratingSummary = true
        summaryError = nil

        // Simulated generation delay
        do {
            try await Task.sleep(nanoseconds: 1_500_000_000) // 1.5s

            let recentSessionTexts = recentSessions.prefix(3).map { session in
                let messages = sessionStore.loadMessages(for: session.id)
                let userMessages = messages.filter { $0.isUser }
                let topics = userMessages.prefix(3).map { $0.content.prefix(80) }
                return "Session \"\(session.displayName)\": " + topics.joined(separator: "; ")
            }.joined(separator: "\n")

            // Placeholder summary
            summaryText = """
            **Project Overview**
            \(sessionCount) session(s), \(totalMessages) total messages, \(vaultNoteCount) vault notes.

            Recent topics covered:
            \(recentSessionTexts.isEmpty ? "No sessions yet. Start a session to begin tracking." : recentSessionTexts)
            """
            cacheSummary(text: summaryText!)
        } catch {
            summaryError = error.localizedDescription
        }

        isGeneratingSummary = false
    }

    /// Time since last summary generation, as a readable string.
    var summaryFreshness: String? {
        guard let date = summaryGeneratedAt else { return nil }
        let interval = Date().timeIntervalSince(date)
        if interval < 60 { return "just now" }
        if interval < 3600 { return "\(Int(interval / 60))m ago" }
        if interval < 86400 { return "\(Int(interval / 3600))h ago" }
        return "\(Int(interval / 86400))d ago"
    }
}