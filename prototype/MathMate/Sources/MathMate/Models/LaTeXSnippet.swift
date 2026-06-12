import Foundation

/// A reusable LaTeX template that can be inserted into the chat composer.
struct LaTeXSnippet: Codable, Identifiable, Equatable, Hashable {
    /// Stable unique identifier (e.g. `"fraction"`).
    let id: String
    /// Display name shown in the palette (e.g. `"Fraction"`).
    let title: String
    /// Additional search terms beyond the title.
    let aliases: [String]
    /// Category for grouping in the palette (e.g. `"Algebra"`, `"Calculus"`).
    let category: String
    /// LaTeX source template. May contain `${1:placeholder}` style tokens
    /// for cursor placement by the insertion engine.
    let template: String
    /// A short example expression used for the preview pane.
    let example: String
    /// Whether this snippet can wrap a selected text region.
    let wrapMode: WrapMode

    enum WrapMode: String, Codable, Equatable {
        /// Insert the template as-is at the cursor.
        case none
        /// If text is selected, replace the selection with the template
        /// and place the selected text inside the first `{}` group.
        case wrapSelection
    }

    // MARK: - Search helpers

    /// All strings that should be matched against the user's search query,
    /// in priority order: title first, then aliases.
    var searchTerms: [String] {
        [title] + aliases
    }
}
