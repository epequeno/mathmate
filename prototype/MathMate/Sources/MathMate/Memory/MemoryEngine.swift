import Foundation

// MARK: - ScoredMemoryItem

/// A memory item paired with its relevance score.
struct ScoredMemoryItem: Sendable, Identifiable {
    let item: MemoryItem
    /// Composite relevance score in [0.0, 1.0].
    let score: Double

    var id: UUID { item.id }
}

// MARK: - MemoryEngine

/// Retrieval engine that scores memory items by relevance to a query.
///
/// Scoring combines:
/// - **Confidence** (40%): How certain we are about the memory.
/// - **Topical match** (35%): Word overlap between query and item content.
/// - **Recency** (15%): How recently the memory was created (decays over 90 days).
/// - **Flagged bonus** (10%): Extra weight for items extracted from user-flagged messages.
struct MemoryEngine {
    private let store: MemoryStore

    init(store: MemoryStore) {
        self.store = store
    }

    /// Retrieve the most relevant active memory items for the given query.
    ///
    /// - Parameters:
    ///   - query: Free-text query (typically the user's latest message).
    ///   - limit: Maximum number of results to return.
    ///   - minimumConfidence: Minimum confidence threshold (items below are excluded).
    /// - Returns: Scored memory items sorted by descending relevance.
    func retrieveRelevantMemory(
        query: String,
        limit: Int = 10,
        minimumConfidence: Double = 0.3
    ) async throws -> [ScoredMemoryItem] {
        let queryWords = tokenize(query)
        let filter = MemoryListFilter(
            status: .active,
            sortBy: .createdAt,
            sortOrder: .descending,
            limit: 100
        )
        let items = try await store.listMemoryItems(filter: filter)

        var scored: [ScoredMemoryItem] = []

        for item in items {
            guard item.confidence >= minimumConfidence else { continue }

            let score = computeScore(item: item, queryWords: queryWords)
            scored.append(ScoredMemoryItem(item: item, score: score))
        }

        scored.sort { $0.score > $1.score }
        return Array(scored.prefix(limit))
    }

    /// Build a compact human-readable memory context block for prompt injection.
    ///
    /// Returns a formatted string like:
    /// ```
    /// [Memory Context]
    /// - prefers hints before full solutions (conf: 0.95)
    /// - goal: pass Calculus I midterm in 3 weeks (conf: 0.90)
    /// ```
    func buildMemoryContextBlock(from scoredItems: [ScoredMemoryItem]) -> String {
        guard !scoredItems.isEmpty else { return "" }

        var lines = ["[Memory Context]"]
        for scored in scoredItems {
            let label: String
            switch scored.item.kind {
            case .preference: label = "preference"
            case .goal:       label = "goal"
            case .misconception: label = "misconception"
            case .concept:    label = "concept"
            case .habit:      label = "habit"
            case .behavior:   label = "behavior"
            case .observation: label = "observation"
            case .custom:     label = "note"
            }
            let confidenceTag = String(format: "(conf: %.2f)", scored.score)
            let flaggedMark = scored.item.isFlaggedReference ? " ★" : ""
            lines.append("- \(label): \(scored.item.content) \(confidenceTag)\(flaggedMark)")
        }

        return lines.joined(separator: "\n")
    }

    // MARK: - Scoring

    private func computeScore(item: MemoryItem, queryWords: Set<String>) -> Double {
        // Confidence component: 40%
        let confidenceScore = item.confidence * 0.40

        // Topical match component: 35%
        let topicalScore = topicalMatchScore(item: item, queryWords: queryWords) * 0.35

        // Recency component: 15%
        let recencyScore = recencyScore(for: item.createdAt) * 0.15

        // Flagged bonus: 10%
        let flaggedBonus = item.isFlaggedReference ? 0.10 : 0.0

        return confidenceScore + topicalScore + recencyScore + flaggedBonus
    }

    /// Token overlap between query and item content, normalized to [0, 1].
    private func topicalMatchScore(item: MemoryItem, queryWords: Set<String>) -> Double {
        guard !queryWords.isEmpty else { return 0.5 } // neutral score for empty query

        let contentWords = tokenize(item.content)
        guard !contentWords.isEmpty else { return 0.0 }

        let overlap = queryWords.intersection(contentWords).count
        return min(Double(overlap) / Double(queryWords.count), 1.0)
    }

    /// Recency score that decays linearly over 90 days, normalized to [0, 1].
    private func recencyScore(for date: Date) -> Double {
        let age = Date().timeIntervalSince(date)
        let ageDays = age / 86_400.0
        return max(0, 1.0 - (ageDays / 90.0))
    }

    /// Split text into lowercased word tokens.
    private func tokenize(_ text: String) -> Set<String> {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return [] }
        return Set(trimmed.lowercased().split(whereSeparator: { !$0.isLetter }).map(String.init))
    }
}

// MARK: - Memory Context Formatting

extension MemoryEngine {
    /// Format scored items as a token-efficient memory block for prompt injection.
    /// Items below the minimum threshold score are excluded.
    func formatMemoryPromptBlock(
        _ scored: [ScoredMemoryItem],
        maxTokens: Int = 500,
        minimumScore: Double = 0.3
    ) -> String {
        let filtered = scored.filter { $0.score >= minimumScore }
        return buildMemoryContextBlock(from: filtered)
    }
}