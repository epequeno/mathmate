import Foundation

/// Ranks and filters snippets against a user's search query.
///
/// Scoring (lower is better, like golf):
///   0 — exact title match (case-insensitive)
///   1 — title prefix match
///   2 — alias prefix match
///   3 — alias / title contains match
///   4 — category contains match
///   5 — no match (excluded from results)
///
/// All matching is case-insensitive. Results are sorted by score first,
/// then by title alphabetically for stable ordering.
struct LaTeXSnippetSearchService: Sendable {
    private let repository: LaTeXSnippetRepository

    init(repository: LaTeXSnippetRepository) {
        self.repository = repository
    }

    /// Return snippets matching the query, sorted by relevance.
    /// An empty or whitespace-only query returns all snippets.
    func search(_ query: String) -> [ScoredSnippet] {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            return repository.all.map { ScoredSnippet(snippet: $0, score: 0) }
        }

        let lower = trimmed.lowercased()
        var results: [ScoredSnippet] = []

        for snippet in repository.all {
            if let score = score(snippet: snippet, query: lower) {
                results.append(ScoredSnippet(snippet: snippet, score: score))
            }
        }

        results.sort { a, b in
            if a.score != b.score { return a.score < b.score }
            return a.snippet.title.localizedCompare(b.snippet.title) == .orderedAscending
        }

        return results
    }

    // MARK: - Scoring

    private func score(snippet: LaTeXSnippet, query: String) -> Int? {
        // 0: exact title match
        if snippet.title.lowercased() == query { return 0 }

        // 1: title prefix
        if snippet.title.lowercased().hasPrefix(query) { return 1 }

        // 2: alias prefix
        for alias in snippet.aliases {
            if alias.lowercased().hasPrefix(query) { return 2 }
        }

        // 3: alias or title contains
        if snippet.title.lowercased().contains(query) { return 3 }
        for alias in snippet.aliases {
            if alias.lowercased().contains(query) { return 3 }
        }

        // 4: category contains
        if snippet.category.lowercased().contains(query) { return 4 }

        return nil
    }
}

// MARK: - Scored result

struct ScoredSnippet: Identifiable, Equatable {
    let snippet: LaTeXSnippet
    let score: Int

    var id: String { snippet.id }
}
