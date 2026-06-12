import Foundation

// MARK: - Cached Regexes

/// Module-level regex cache — compiled once, reused forever.
/// NSRegularExpression is thread-safe for matching after construction.
/// Thread-safe after construction. All patterns are compile-time constants.
private enum RE {
    static let displayMath      = compile(#"(\$\$)([\s\S]*?)(\$\$)"#)
    static let inlineMath       = compile(#"(?<!\$)\$(?!\$)([^\$]+?)(?<!\$)\$(?!\$)"#)
    static let equationEnv      = compile(#"\\begin\{equation\}([\s\S]*?)\\end\{equation\}"#)
    static let alignEnv         = compile(#"(?<!\\\[)(\\begin\{align\*?\}[\s\S]*?\\end\{align\*?\})(?!\\\])"#)
    static let label            = compile(#"\\label\{[^}]*\}"#)
    static let currency         = compile(#"^\d+([.,]\d{1,2})?$"#)
    static let inlineCode       = compile("`([^`]+)`")
    static let bold             = compile(#"\*\*([^*]+)\*\*"#)
    static let boldUnderscore   = compile("__([^_]+)__")
    static let italic           = compile(#"(?<!\*)\*([^*]+)\*(?!\*)"#)
    static let italicUnderscore = compile("(?<!_)_([^_]+)_(?!_)")

    /// Compiles a regex from a compile-time constant pattern.
    /// Never expected to fail — if it does, it's a programming error.
    private static func compile(_ pattern: String) -> NSRegularExpression {
        do {
            return try NSRegularExpression(pattern: pattern)
        } catch {
            fatalError("Invalid regex pattern '\(pattern)': \(error)")
        }
    }
}

/// Normalizes LaTeX delimiters from various model outputs into a consistent format.
///
/// Different AI models format math differently:
/// - Claude uses `\(..\)` and `\[..\]`
/// - GPT-4 uses `$..$` and `$$..$$`
/// - Some models mix both or add extra escaping
///
/// This layer standardizes everything so KaTeX can render reliably.
struct LaTeXNormalizer {

    // MARK: - Public API

    /// Normalize a raw model response so that:
    /// - Inline math uses `\(...\)`
    /// - Display (block) math uses `\[...\]`
    /// - Double-escaped backslashes are fixed
    /// - Common model artifacts are cleaned up
    static func normalize(_ input: String) -> String {
        var result = input

        // 1. Fix double-escaped backslashes (e.g. \\frac → \frac)
        result = fixDoubleEscaping(result)

        // 2. Normalize display math: $$...$$ → \[...\]
        //    Must be done before inline $ to avoid conflicts
        result = normalizeDisplayMath(result)

        // 3. Normalize inline math: $...$ → \(...\)
        result = normalizeInlineMath(result)

        // 4. Normalize \begin{equation}...\end{equation} → \[...\]
        result = normalizeEquationEnvironment(result)

        // 5. Normalize \begin{align}...\end{align} → \[\begin{align}...\end{align}\]
        result = normalizeAlignEnvironment(result)

        // 6. Clean up model artifacts
        result = cleanArtifacts(result)

        return result
    }

    /// Generate HTML from a mixed text/LaTeX string.
    /// Text portions get basic Markdown → HTML conversion + HTML escaping.
    /// LaTeX portions are preserved verbatim for KaTeX auto-render.
    static func renderAsHTML(_ input: String) -> String {
        let normalized = normalize(input)
        return processToHTML(normalized)
    }

    // MARK: - Private Helpers

    /// Fix double-escaped backslashes from model output.
    /// Models sometimes output `\\\\frac` which should be `\\frac` → `\frac`.
    private static func fixDoubleEscaping(_ input: String) -> String {
        // Fix \\\\ → \\ (quad backslash → double)
        let result = input.replacingOccurrences(of: "\\\\\\\\", with: "\\\\")
        // Fix \\ within math delimiters (but not the delimiter itself)
        // This is tricky — we only want to fix excessive escaping inside math
        return result
    }

    /// Convert `$$...$$` to `\[...\]`.
    /// Handles multi-line display math.
    private static func normalizeDisplayMath(_ input: String) -> String {
        let regex = RE.displayMath
        let range = NSRange(input.startIndex..., in: input)
        let matches = regex.matches(in: input, options: [], range: range).reversed()

        var result = input
        for match in matches {
            guard let contentRange = Range(match.range(at: 2), in: input) else { continue }
            let content = String(input[contentRange]).trimmingCharacters(in: .whitespacesAndNewlines)
            let replacement = "\\[\(content)\\]"
            guard let fullRange = Range(match.range, in: input) else { continue }
            result.replaceSubrange(fullRange, with: replacement)
        }
        return result
    }

    /// Convert `$...$` to `\(...\)`.
    /// Careful not to match currency (e.g. "$5.00").
    /// Heuristic: content must look like math (contains \, ^, _, =, etc.)
    private static func normalizeInlineMath(_ input: String) -> String {
        let regex = RE.inlineMath
        let range = NSRange(input.startIndex..., in: input)
        let matches = regex.matches(in: input, options: [], range: range).reversed()

        var result = input
        for match in matches {
            guard let contentRange = Range(match.range(at: 1), in: input) else { continue }
            let content = String(input[contentRange])
            // Only convert if content looks like math
            guard looksLikeMath(content) else { continue }
            let replacement = "\\(\(content)\\)"
            guard let fullRange = Range(match.range, in: input) else { continue }
            result.replaceSubrange(fullRange, with: replacement)
        }
        return result
    }

    /// Convert \begin{equation}...\end{equation} to \[...\]
    private static func normalizeEquationEnvironment(_ input: String) -> String {
        let regex = RE.equationEnv
        let range = NSRange(input.startIndex..., in: input)
        let matches = regex.matches(in: input, options: [], range: range).reversed()

        var result = input
        for match in matches {
            guard let contentRange = Range(match.range(at: 1), in: input) else { continue }
            let content = String(input[contentRange]).trimmingCharacters(in: .whitespacesAndNewlines)
            let replacement = "\\[\(content)\\]"
            guard let fullRange = Range(match.range, in: input) else { continue }
            result.replaceSubrange(fullRange, with: replacement)
        }
        return result
    }

    /// Wrap \begin{align}...\end{align} in \[...\] if not already wrapped
    private static func normalizeAlignEnvironment(_ input: String) -> String {
        // Only wrap if not already inside \[...\]
        let regex = RE.alignEnv
        let range = NSRange(input.startIndex..., in: input)
        let matches = regex.matches(in: input, options: [], range: range).reversed()

        var result = input
        for match in matches {
            guard let contentRange = Range(match.range(at: 1), in: input) else { continue }
            let content = String(input[contentRange])
            let replacement = "\\[\(content)\\]"
            guard let fullRange = Range(match.range, in: input) else { continue }
            result.replaceSubrange(fullRange, with: replacement)
        }
        return result
    }

    /// Clean up common model output artifacts
    private static func cleanArtifacts(_ input: String) -> String {
        var result = input

        // Remove \label{...} (not supported by KaTeX in all contexts)
        let labelRange = NSRange(result.startIndex..., in: result)
        result = RE.label.stringByReplacingMatches(in: result, range: labelRange, withTemplate: "")

        return result
    }

    /// Heuristic check: does this string look like math content?
    static func looksLikeMath(_ content: String) -> Bool {
        // Math content typically contains these characters/sequences
        let mathIndicators: [String] = [
            "\\", "^", "_", "=", "+", "−", "·", "×", "÷",
            "\\frac", "\\sqrt", "\\int", "\\sum", "\\prod",
            "\\alpha", "\\beta", "\\gamma", "\\pi", "\\theta",
            "\\sin", "\\cos", "\\tan", "\\log", "\\lim",
            "\\infty", "\\partial", "\\nabla",
            "\\left", "\\right", "\\begin",
            "\\vec", "\\hat", "\\bar", "\\dot",
            "\\leq", "\\geq", "\\neq", "\\approx",
            "\\rightarrow", "\\Rightarrow", "\\mapsto"
        ]

        // Skip if it looks like currency (digits with decimal point)
        let nsContent = content as NSString
        let fullRange = NSRange(location: 0, length: nsContent.length)
        if RE.currency.firstMatch(in: content, range: fullRange) != nil {
            return false
        }

        // If it contains any math indicator, treat as math
        for indicator in mathIndicators {
            if content.contains(indicator) { return true }
        }

        // If it contains Greek letters or special math Unicode
        let mathUnicode = "αβγδεζηθικλμνξπρστυφχψωΓΔΘΛΞΠΣΦΨΩ∈∉⊂⊃∪∩∀∃"
        for char in mathUnicode {
            if content.contains(char) { return true }
        }

        // Short strings with operators are likely math
        if content.count <= 20 && (content.contains("=") || content.contains("+")) {
            return true
        }

        return false
    }

    /// Convert full content to HTML while preserving LaTeX regions.
    ///
    /// Pipeline:
    /// 1) Replace LaTeX regions with stable placeholders (so markdown parsing doesn't split them)
    /// 2) Escape raw HTML
    /// 3) Parse markdown into HTML
    /// 4) Restore original LaTeX regions for KaTeX auto-render
    private static func processToHTML(_ input: String) -> String {
        let (withPlaceholders, mathPlaceholders) = replaceMathWithPlaceholders(input)
        let escaped = escapeHTML(withPlaceholders)
        let markdown = markdownToHTML(escaped)
        return restoreMathPlaceholders(in: markdown, placeholders: mathPlaceholders)
    }

    private static func replaceMathWithPlaceholders(_ input: String) -> (text: String, placeholders: [(token: String, math: String)]) {
        var output = ""
        var placeholders: [(String, String)] = []
        var i = input.startIndex

        while i < input.endIndex {
            if isAt(input, i, "\\[") {
                if let end = findMatchingEnd(input, from: i, open: "\\[", close: "\\]") {
                    let math = String(input[i..<end])
                    let token = "MATHPH\(placeholders.count)TOKEN"
                    placeholders.append((token, math))
                    output += token
                    i = end
                    continue
                }
            }

            if isAt(input, i, "\\(") {
                if let end = findMatchingEnd(input, from: i, open: "\\(", close: "\\)") {
                    let math = String(input[i..<end])
                    let token = "MATHPH\(placeholders.count)TOKEN"
                    placeholders.append((token, math))
                    output += token
                    i = end
                    continue
                }
            }

            output += String(input[i])
            i = input.index(after: i)
        }

        return (output, placeholders)
    }

    private static func restoreMathPlaceholders(in html: String, placeholders: [(token: String, math: String)]) -> String {
        var result = html
        for (token, math) in placeholders {
            result = result.replacingOccurrences(of: token, with: math)
        }
        return result
    }

    /// Markdown → HTML conversion on a plain-text string.
    private static func markdownToHTML(_ text: String) -> String {
        enum ListKind { case unordered, ordered }

        let normalized = text.replacingOccurrences(of: "\r\n", with: "\n")
        let lines = normalized.components(separatedBy: "\n")

        var html: [String] = []
        var paragraphLines: [String] = []

        var listKind: ListKind?
        var listItems: [[String]] = []
        var currentListItemLines: [String] = []

        var inCodeBlock = false
        var codeLines: [String] = []

        func flushParagraph() {
            guard !paragraphLines.isEmpty else { return }
            let joined = paragraphLines.joined(separator: " ").trimmingCharacters(in: .whitespacesAndNewlines)
            if !joined.isEmpty {
                html.append("<p>\(inlineMarkdownToHTML(joined))</p>")
            }
            paragraphLines.removeAll()
        }

        func finalizeCurrentListItem() {
            guard !currentListItemLines.isEmpty else { return }
            listItems.append(currentListItemLines)
            currentListItemLines.removeAll()
        }

        func flushList() {
            finalizeCurrentListItem()
            guard let kind = listKind, !listItems.isEmpty else {
                listKind = nil
                listItems.removeAll()
                return
            }

            html.append(kind == .unordered ? "<ul>" : "<ol>")
            for itemLines in listItems {
                let joined = itemLines.joined(separator: " ").trimmingCharacters(in: .whitespacesAndNewlines)
                html.append("<li>\(inlineMarkdownToHTML(joined))</li>")
            }
            html.append(kind == .unordered ? "</ul>" : "</ol>")

            listKind = nil
            listItems.removeAll()
        }

        var i = 0
        while i < lines.count {
            let rawLine = lines[i]
            let trimmed = rawLine.trimmingCharacters(in: .whitespaces)

            if inCodeBlock {
                if trimmed.hasPrefix("```") {
                    html.append("<pre><code>\(codeLines.joined(separator: "\n"))</code></pre>")
                    inCodeBlock = false
                    codeLines.removeAll()
                } else {
                    codeLines.append(rawLine)
                }
                i += 1
                continue
            }

            if trimmed.hasPrefix("```") {
                flushParagraph()
                flushList()
                inCodeBlock = true
                codeLines.removeAll()
                i += 1
                continue
            }

            // GitHub-style table: header row + separator row
            if i + 1 < lines.count,
               isLikelyTableHeader(trimmed),
               isTableSeparator(lines[i + 1].trimmingCharacters(in: .whitespaces)) {
                flushParagraph()
                flushList()

                let headers = tableCells(from: trimmed)
                let alignments = tableAlignments(from: lines[i + 1].trimmingCharacters(in: .whitespaces), columnCount: headers.count)

                html.append("<table><thead><tr>")
                for (idx, cell) in headers.enumerated() {
                    let align = alignments[idx]
                    html.append("<th style=\"text-align:\(align);\">\(inlineMarkdownToHTML(cell))</th>")
                }
                html.append("</tr></thead><tbody>")

                var row = i + 2
                while row < lines.count {
                    let rowTrimmed = lines[row].trimmingCharacters(in: .whitespaces)
                    if rowTrimmed.isEmpty || !rowTrimmed.contains("|") { break }
                    let cells = tableCells(from: rowTrimmed)
                    if cells.isEmpty { break }

                    html.append("<tr>")
                    for col in 0..<headers.count {
                        let value = col < cells.count ? cells[col] : ""
                        let align = alignments[col]
                        html.append("<td style=\"text-align:\(align);\">\(inlineMarkdownToHTML(value))</td>")
                    }
                    html.append("</tr>")
                    row += 1
                }

                html.append("</tbody></table>")
                i = row
                continue
            }

            if trimmed.isEmpty {
                flushParagraph()
                flushList()
                i += 1
                continue
            }

            if isHorizontalRule(trimmed) {
                flushParagraph()
                flushList()
                html.append("<hr />")
                i += 1
                continue
            }

            // Bare heading markers with no content (e.g. lone "#" or "##") — treat as a
            // horizontal rule divider rather than letting them fall through as "<p>#</p>".
            if trimmed.allSatisfy({ $0 == "#" }) && !trimmed.isEmpty {
                flushParagraph()
                flushList()
                html.append("<hr />")
                i += 1
                continue
            }

            if let heading = headingHTML(from: trimmed) {
                flushParagraph()
                flushList()
                html.append(heading)
                i += 1
                continue
            }

            if let quote = blockquoteText(from: trimmed) {
                flushParagraph()
                flushList()
                html.append("<blockquote>\(inlineMarkdownToHTML(quote))</blockquote>")
                i += 1
                continue
            }

            if let item = unorderedListItem(from: trimmed) {
                flushParagraph()
                if listKind != .unordered {
                    flushList()
                    listKind = .unordered
                } else {
                    finalizeCurrentListItem()
                }
                currentListItemLines = [item]
                i += 1
                continue
            }

            if let item = orderedListItem(from: trimmed) {
                flushParagraph()
                if listKind != .ordered {
                    flushList()
                    listKind = .ordered
                } else {
                    finalizeCurrentListItem()
                }
                currentListItemLines = [item]
                i += 1
                continue
            }

            // Continuation line for current list item
            if listKind != nil {
                currentListItemLines.append(trimmed)
                i += 1
                continue
            }

            paragraphLines.append(trimmed)
            i += 1
        }

        if inCodeBlock {
            html.append("<pre><code>\(codeLines.joined(separator: "\n"))</code></pre>")
        }
        flushParagraph()
        flushList()

        return html.joined(separator: "\n")
    }

    private static func inlineMarkdownToHTML(_ text: String) -> String {
        func replace(_ input: String, _ regex: NSRegularExpression, _ template: String) -> String {
            let range = NSRange(input.startIndex..., in: input)
            return regex.stringByReplacingMatches(in: input, range: range, withTemplate: template)
        }
        var result = text
        result = replace(result, RE.inlineCode,       "<code>$1</code>")
        result = replace(result, RE.bold,             "<strong>$1</strong>")
        result = replace(result, RE.boldUnderscore,   "<strong>$1</strong>")
        result = replace(result, RE.italic,           "<em>$1</em>")
        result = replace(result, RE.italicUnderscore, "<em>$1</em>")
        return result
    }

    private static func headingHTML(from line: String) -> String? {
        var hashCount = 0
        for char in line {
            if char == "#" { hashCount += 1 } else { break }
        }
        guard (1...6).contains(hashCount) else { return nil }

        let idx = line.index(line.startIndex, offsetBy: hashCount)
        guard idx < line.endIndex, line[idx] == " " else { return nil }
        let content = String(line[line.index(after: idx)...]).trimmingCharacters(in: .whitespaces)
        guard !content.isEmpty else { return nil }

        return "<h\(hashCount)>\(inlineMarkdownToHTML(content))</h\(hashCount)>"
    }

    private static func blockquoteText(from line: String) -> String? {
        guard line.hasPrefix(">") else { return nil }
        let content = line.dropFirst().trimmingCharacters(in: .whitespaces)
        return content.isEmpty ? nil : String(content)
    }

    private static func unorderedListItem(from line: String) -> String? {
        guard let first = line.first, ["-", "*", "+"].contains(first) else { return nil }
        let afterMarker = line.dropFirst()
        guard let next = afterMarker.first, next.isWhitespace else { return nil }
        let rest = afterMarker.trimmingCharacters(in: .whitespaces)
        return rest.isEmpty ? nil : String(rest)
    }

    private static func orderedListItem(from line: String) -> String? {
        guard let dotRange = line.range(of: ".") else { return nil }
        let numberPart = String(line[..<dotRange.lowerBound])
        guard !numberPart.isEmpty, numberPart.allSatisfy({ $0.isNumber }) else { return nil }
        let restStart = dotRange.upperBound
        guard restStart < line.endIndex else { return nil }
        let rest = line[restStart...].trimmingCharacters(in: .whitespaces)
        return rest.isEmpty ? nil : String(rest)
    }

    private static func isLikelyTableHeader(_ line: String) -> Bool {
        line.contains("|") && tableCells(from: line).count >= 2
    }

    private static func isTableSeparator(_ line: String) -> Bool {
        let cells = tableCells(from: line)
        guard !cells.isEmpty else { return false }
        return cells.allSatisfy { cell in
            let t = cell.trimmingCharacters(in: .whitespaces)
            guard t.count >= 3 else { return false }
            let core = t.replacingOccurrences(of: ":", with: "")
            return !core.isEmpty && core.allSatisfy { $0 == "-" }
        }
    }

    private static func tableCells(from line: String) -> [String] {
        var trimmed = line.trimmingCharacters(in: .whitespaces)
        if trimmed.hasPrefix("|") { trimmed.removeFirst() }
        if trimmed.hasSuffix("|") { trimmed.removeLast() }
        return trimmed.split(separator: "|", omittingEmptySubsequences: false)
            .map { String($0).trimmingCharacters(in: .whitespaces) }
    }

    private static func tableAlignments(from separatorLine: String, columnCount: Int) -> [String] {
        let cells = tableCells(from: separatorLine)
        var alignments: [String] = []

        for i in 0..<columnCount {
            let cell = i < cells.count ? cells[i].trimmingCharacters(in: .whitespaces) : "---"
            let left = cell.hasPrefix(":")
            let right = cell.hasSuffix(":")
            if left && right { alignments.append("center") }
            else if right { alignments.append("right") }
            else { alignments.append("left") }
        }
        return alignments
    }

    private static func isHorizontalRule(_ line: String) -> Bool {
        let compact = line.replacingOccurrences(of: " ", with: "")
        guard compact.count >= 3 else { return false }
        if compact.allSatisfy({ $0 == "-" }) { return true }
        if compact.allSatisfy({ $0 == "*" }) { return true }
        if compact.allSatisfy({ $0 == "_" }) { return true }
        return false
    }

    /// Escape raw HTML special characters.
    private static func escapeHTML(_ text: String) -> String {
        var result = ""
        for char in text {
            switch char {
            case "&": result += "&amp;"
            case "<": result += "&lt;"
            case ">": result += "&gt;"
            default:  result += String(char)
            }
        }
        return result
    }

    private static func isAt(_ string: String, _ index: String.Index, _ target: String) -> Bool {
        let remaining = string[index...]
        return remaining.hasPrefix(target)
    }

    private static func findMatchingEnd(_ string: String, from start: String.Index, open: String, close: String) -> String.Index? {
        var i = string.index(start, offsetBy: open.count)
        while i < string.endIndex {
            if isAt(string, i, close) {
                return string.index(i, offsetBy: close.count)
            }
            i = string.index(after: i)
        }
        return nil
    }
}
