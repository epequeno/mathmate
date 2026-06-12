import Foundation
import AppKit
import os

private let log = Logger(subsystem: "com.mathmate", category: "wrapup")

// MARK: - WrapUpDraft

struct WrapUpDraft: Sendable {
    let title: String
    let markdown: String
    let generatedAt: Date
    let sessionId: String
}

// MARK: - WrapUpService

/// Generates and saves session wrap-up notes to the user's vault.
///
/// This service is stateless — all configuration is passed at each call site.
/// The owning ChatViewModel holds the published presentation state.
@MainActor
final class WrapUpService {

    // MARK: - Wrap-Up Generation

    /// Generates a structured wrap-up draft by streaming a request to the given provider.
    /// Returns nil on failure (error is reported via the thrown error).
    func generateDraft(
        messages: [Message],
        provider: ModelProvider,
        model: String
    ) async throws -> WrapUpDraft {
        let prompt = buildWrapUpPrompt(messages: messages)

        let wrapUpMessage = MessagePayload(role: .user, parts: [.text(prompt)])

        var collectedText = ""

        let stream = provider.streamMessage([wrapUpMessage], model: model, maxTokens: 2048)
        for try await token in stream {
            if let text = token.text {
                collectedText += text
            }
        }

        let sessionId: String
        // Best-effort session ID; callers set it from context
        if let first = messages.first {
            sessionId = first.id.uuidString
        } else {
            sessionId = "unknown"
        }

        return WrapUpDraft(
            title: Self.extractTitle(from: collectedText),
            markdown: collectedText.trimmingCharacters(in: .whitespacesAndNewlines),
            generatedAt: Date(),
            sessionId: sessionId
        )
    }

    /// Generates a draft and returns the raw markdown (no WrapUpDraft wrapper).
    /// Used by the auto wrap-up flow.
    func generateMarkdown(
        messages: [Message],
        provider: ModelProvider,
        model: String
    ) async throws -> String {
        let prompt = buildWrapUpPrompt(messages: messages)

        let wrapUpMessage = MessagePayload(role: .user, parts: [.text(prompt)])

        var markdown = ""
        let stream = provider.streamMessage([wrapUpMessage], model: model, maxTokens: 2048)
        for try await token in stream {
            if let text = token.text {
                markdown += text
            }
        }

        return markdown.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    // MARK: - Vault Saving

    /// Saves the wrap-up markdown to the configured Synapse study log directory.
    /// Returns the absolute file path on success.
    func saveToVault(
        title: String,
        markdown: String,
        activeProject: MathProject?
    ) throws -> String {
        // Resolve the study log directory
        let studyLogDir: URL
        if let project = activeProject, project.vaultExists {
            studyLogDir = project.resolvedVaultURL.appendingPathComponent("MathMate/Study Logs")
        } else {
            guard let config = ConfigurationManager.shared.loadAppConfig() else {
                throw WrapUpError.noConfig
            }
            if let customPath = config.synapse.studyLogPath {
                let customURL = URL(fileURLWithPath: customPath)
                let isAbsolute = customPath.hasPrefix("/")
                studyLogDir = isAbsolute ? customURL : FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(customPath)
            } else if let firstVault = config.synapse.vaults?.first {
                studyLogDir = URL(fileURLWithPath: firstVault.path).appendingPathComponent("MathMate/Study Logs")
            } else {
                throw WrapUpError.noVault
            }
        }

        // Ensure directory exists
        try FileManager.default.createDirectory(at: studyLogDir, withIntermediateDirectories: true)

        // Build filename from title + date
        let dateFormatter = DateFormatter()
        dateFormatter.dateFormat = "yyyy-MM-dd"
        let dateString = dateFormatter.string(from: Date())
        let sanitizedTitle = title
            .replacingOccurrences(of: "#", with: "")
            .replacingOccurrences(of: "/", with: "-")
            .replacingOccurrences(of: "\\", with: "-")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let filename = "\(dateString) — \(sanitizedTitle).md"
        let fileURL = studyLogDir.appendingPathComponent(filename)

        try markdown.write(to: fileURL, atomically: true, encoding: .utf8)
        return fileURL.path
    }

    // MARK: - Prompt Building

    /// Builds the prompt sent to the model for wrap-up generation.
    func buildWrapUpPrompt(messages: [Message]) -> String {
        guard !messages.isEmpty else {
            return "No messages in this session to summarize."
        }

        var lines: [String] = []
        lines.append("You are helping generate a session wrap-up for a math tutoring app. Review the following conversation and produce a structured markdown study note.")

        // Flag preservation directive
        let flaggedContent = messages.flatMap { $0.units }.filter { $0.isFlagged }
        if !flaggedContent.isEmpty {
            lines.append("")
            lines.append("⚠️ FLAG PRESERVATION RULE: The user has explicitly flagged the following segments as high priority.")
            lines.append("These MUST be represented accurately and prominently in the wrap-up — do NOT omit or paraphrase them.")
            lines.append("Include a '★ Flagged Highlights' section that directly references each flagged segment.")
            for unit in flaggedContent {
                let text = unit.parts.compactMap { part -> String? in
                    if case .text(let t) = part { return t }
                    return nil
                }.joined(separator: "\n")
                lines.append("--- [FLAGGED: \(unit.type.rawValue) | \(unit.displayLabel)] ---")
                lines.append(text)
            }
        }

        lines.append("")
        lines.append("Conversation:")
        lines.append("")

        for message in messages {
            let role = message.isUser ? "USER" : "ASSISTANT"
            let content = message.content
            if content.isEmpty { continue }
            lines.append("[\(role)] \(content)")
        }

        lines.append("")
        lines.append("Using the conversation above, generate a structured wrap-up in this exact format (fill in each section, use placeholders like \"...\" only if truly nothing applies — otherwise synthesize from the conversation):")
        lines.append("")
        let dateStr = {
            let f = DateFormatter()
            f.dateFormat = "yyyy-MM-dd"
            return f.string(from: Date())
        }()
        lines.append("""
        # Session Wrap-Up — \(dateStr) — {{topic}}

        ## Summary
        [brief 2–3 sentence overview of what was covered]

        ## Key Concepts
        - [concept 1]
        - [concept 2]
        - [concept 3]

        ## Important Formulas
        - [formula 1]
        - [formula 2]

        ## ★ Flagged Highlights
        [Include any user-flagged segments here verbatim or near-verbatim. These are high-priority topics the user wants to remember.]

        ## Common Mistakes / Pitfalls
        - [mistake 1]
        - [mistake 2]

        ## Practice Plan (Next 3 Steps)
        1. [step 1]
        2. [step 2]
        3. [step 3]

        ## Open Questions
        - [question 1]
        - [question 2]
        """)
        lines.append("")
        lines.append("Return only the markdown wrap-up, starting with the # heading.")

        return lines.joined(separator: "\n")
    }

    // MARK: - Title Extraction

    /// Extracts a title from the first markdown heading in the generated content.
    /// Format expected: "# Session Wrap-Up — YYYY-MM-DD — Topic" or "# Topic"
    static func extractTitle(from markdown: String) -> String {
        if let range = markdown.range(of: #"^# .+"#, options: .regularExpression) {
            var title = String(markdown[range])
            title.removeFirst(2)
            title = title.trimmingCharacters(in: .whitespacesAndNewlines)

            // Strip leading "Session Wrap-Up — " prefix
            if title.hasPrefix("Session Wrap-Up — ") {
                title = String(title.dropFirst("Session Wrap-Up — ".count))
            }

            // Strip date prefix: "YYYY-MM-DD — "
            if let firstDashRange = title.range(of: " — ") {
                let possibleDate = String(title[..<firstDashRange.lowerBound])
                if possibleDate.count == 10 && possibleDate.allSatisfy({ $0.isNumber || $0 == "-" }) {
                    title = String(title[firstDashRange.upperBound...])
                }
            }

            return title.trimmingCharacters(in: .whitespacesAndNewlines)
        }
        return "Session Wrap-Up"
    }
}

// MARK: - Errors

enum WrapUpError: LocalizedError {
    case noConfig
    case noVault
    case saveFailed(String)

    var errorDescription: String? {
        switch self {
        case .noConfig: return "No app config found"
        case .noVault: return "No Synapse vault configured"
        case .saveFailed(let detail): return "Could not write file: \(detail)"
        }
    }
}
