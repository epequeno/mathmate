import Foundation

// MARK: - PromptAssemblyService

/// Pure functions for assembling system prompts and
/// building topic hints for memory retrieval.
enum PromptAssemblyService {

    /// Builds the effective system prompt by combining the base prompt with
    /// chat mode instructions, project context, and formatting rules.
    static func effectiveSystemPrompt(
        base: String?,
        chatMode: ChatMode,
        activeProjectName: String?
    ) -> String {
        let trimmedBase = base?.trimmingCharacters(in: .whitespacesAndNewlines)

        let modeBlock = "\n\n" + chatMode.instructionBlock

        let formattingRules = """


        ## Formatting Rules
        - Use only standard CommonMark markdown: `**bold**`, `*italic*`, `# headings`, `-` lists, `code`, tables.
        - Do NOT use `!text!` or any non-standard emphasis syntax.
        - Do NOT open with sycophantic phrases like "Great question!", "Absolutely!", "Sure!", or "Of course!".
        - When using file tools, do not narrate each step ("Let me check...", "Now I'll look at...") — just respond with the result.
        - Bold only key terms or titles, not entire descriptive phrases.
        """

        var projectContext = ""
        if let projectName = activeProjectName {
            projectContext = "\n\nYou are currently working in a project named \"\(projectName)\". "
            projectContext += "This is a MathMate math tutoring session. "
            projectContext += "User references to 'this project' refer to their math study project, not the MathMate application."
        }

        let basePrompt = (trimmedBase?.isEmpty == false ? trimmedBase! : "You are a math tutor.")
        let suffix = modeBlock + projectContext + formattingRules

        return basePrompt + suffix
    }

    /// Builds topic hints from the user's latest message and recent flagged assistant units.
    static func topicHints(from message: Message, recentMessages: ArraySlice<Message>) -> String {
        var hintParts: [String] = []

        // 1. Primary hint: the user's latest message content
        let userText = message.content.trimmingCharacters(in: .whitespacesAndNewlines)
        if !userText.isEmpty {
            hintParts.append(userText)
        }

        // 2. Priority context: content of recent flagged assistant units
        let recentFlaggedUnits = recentMessages
            .flatMap { $0.units }
            .filter { $0.isFlagged }
            .flatMap { $0.parts }
            .compactMap { part -> String? in
                if case .text(let t) = part { return t }
                return nil
            }

        if !recentFlaggedUnits.isEmpty {
            hintParts.append(recentFlaggedUnits.joined(separator: "\n"))
        }

        let combined = hintParts.joined(separator: "\n").trimmingCharacters(in: .whitespacesAndNewlines)
        guard !combined.isEmpty else { return "" }

        if combined.count > 500 {
            return String(combined.prefix(500))
        }
        return combined
    }
}