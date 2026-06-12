import Foundation

/// Inserts a LaTeX snippet template into a text string at a given caret position,
/// with optional selection wrapping.
struct LaTeXInsertionEngine {

    /// The result of an insertion operation.
    struct Result {
        /// The full text after insertion.
        let text: String
        /// The new caret offset (character index) after insertion.
        let caretOffset: Int
    }

    /// Insert `snippet` into `source` at `caretOffset`.
    ///
    /// - Parameters:
    ///   - snippet: The snippet to insert.
    ///   - source: The current text.
    ///   - caretOffset: The character index where the caret is positioned.
    ///   - selectionLength: Number of characters selected (0 = no selection).
    static func insert(
        _ snippet: LaTeXSnippet,
        into source: String,
        at caretOffset: Int,
        selectionLength: Int = 0
    ) -> Result {
        let safeOffset = max(0, min(caretOffset, source.count))
        let safeLength = max(0, min(selectionLength, source.count - safeOffset))

        // Strip placeholder tokens (${1:default} → default) for clean insertion
        let cleanTemplate = stripPlaceholderTokens(snippet.template)

        // Determine the replacement text
        let replacement: String
        if snippet.wrapMode == .wrapSelection && safeLength > 0 {
            let start = source.index(source.startIndex, offsetBy: safeOffset)
            let end = source.index(start, offsetBy: safeLength)
            let selectedText = String(source[start..<end])
            replacement = wrapSelection(template: cleanTemplate, selectedText: selectedText)
        } else {
            replacement = cleanTemplate
        }

        // Build the new string
        let beforeStart = source.index(source.startIndex, offsetBy: safeOffset)
        let afterStart = source.index(beforeStart, offsetBy: safeLength)
        let newText = String(source[..<beforeStart]) + replacement + String(source[afterStart...])

        // Caret goes to end of inserted replacement
        let newCaret = safeOffset + replacement.count

        return Result(text: newText, caretOffset: newCaret)
    }

    // MARK: - Private helpers

    /// Strip `${N:default}` tokens → `default`.
    /// After stripping, `{` and `}` braces that wrapped the placeholder are kept
    /// so the structure remains valid LaTeX.
    static func stripPlaceholderTokens(_ template: String) -> String {
        template.replacingOccurrences(
            of: #"\$\{\d+:([^}]+)\}"#,
            with: "$1",
            options: .regularExpression
        )
    }

    /// Replace the first `{...}` group in the template with the selected text.
    private static func wrapSelection(template: String, selectedText: String) -> String {
        // Find the first `{...}` group (after placeholder stripping, these are plain braces)
        guard let braceRange = template.range(of: #"\{[^}]+\}"#, options: .regularExpression) else {
            return selectedText + template
        }
        let before = String(template[..<braceRange.lowerBound])
        let after = String(template[braceRange.upperBound...])
        return before + "{" + selectedText + "}" + after
    }
}
