import Foundation
import os

private let log = Logger(subsystem: "com.mathmate", category: "persistence")

/// Loads and caches the bundled LaTeX snippet catalog.
///
/// The JSON is decoded once at init time and kept in memory.
/// All access is read-only after construction, so this type is `Sendable`.
struct LaTeXSnippetRepository: Sendable {
    /// All snippets in the catalog, in the order they appear in the JSON.
    let all: [LaTeXSnippet]

    /// All unique categories, in the order they first appear in the catalog.
    let categories: [String]

    // MARK: - Loading

    /// Load the bundled snippet catalog from the app's resource bundle.
    /// Returns an empty catalog if the file is missing or malformed.
    static func load(bundle: Bundle = .module) -> LaTeXSnippetRepository {
        guard let url = bundle.url(forResource: "latex_snippets", withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let snippets = try? JSONDecoder().decode([LaTeXSnippet].self, from: data) else {
            log.warning("Could not load latex_snippets.json — palette will be empty")
            return LaTeXSnippetRepository(all: [], categories: [])
        }

        // Collect categories in order of first appearance
        var seen = Set<String>()
        var cats: [String] = []
        for s in snippets {
            if seen.insert(s.category).inserted {
                cats.append(s.category)
            }
        }

        return LaTeXSnippetRepository(all: snippets, categories: cats)
    }

    // MARK: - Access

    /// Return snippets belonging to a given category, preserving catalog order.
    func snippets(in category: String) -> [LaTeXSnippet] {
        all.filter { $0.category == category }
    }
}
