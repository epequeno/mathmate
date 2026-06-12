import Foundation

/// View model that extracts memory candidates from session messages
/// and stores them via the MemoryStore.
@MainActor
final class MemoryViewModel {
    private let store: MemoryStore

    init(store: MemoryStore) {
        self.store = store
    }

    /// Extract memory candidates from session messages.
    ///
    /// Phase C: extracts both top-level flagged messages AND individual flagged units,
    /// preserving unit type metadata for richer retrieval weighting.
    func extractFromSession(messages: [Message], projectId: UUID?) async {
        _ = projectId

        // 1. Top-level flagged messages (user messages or legacy compat)
        let flaggedMessages = messages.filter(\.topLevelIsFlagged)
        for msg in flaggedMessages {
            let text = msg.content.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !text.isEmpty else { continue }

            let item = MemoryItem(
                kind: .observation,
                content: String(text.prefix(500)),
                confidence: 0.8,
                sourceKind: .message,
                sessionId: nil,
                messageId: msg.id,
                isFlaggedReference: true
            )
            try? await store.addMemoryItem(item)
        }

        // 2. Per-unit flagged content — each flagged unit becomes its own memory item
        //    with the unit type preserved as a topic hint for weighted retrieval.
        for msg in messages where !msg.isUser && !msg.units.isEmpty {
            for unit in msg.units where unit.isFlagged {
                let unitText = unit.parts.compactMap { part -> String? in
                    if case .text(let t) = part { return t }
                    return nil
                }.joined(separator: "\n").trimmingCharacters(in: .whitespacesAndNewlines)
                guard !unitText.isEmpty else { continue }

                // Prefix with unit type so retrieval engine can weight by category
                let prefixedContent = "[\(unit.displayLabel)] \(unitText)"
                let truncated = String(prefixedContent.prefix(500))

                let item = MemoryItem(
                    kind: .observation,
                    content: truncated,
                    confidence: 0.85, // slightly higher than message-level since it's more granular
                    sourceKind: .message,
                    sessionId: nil,
                    messageId: msg.id,
                    isFlaggedReference: true
                )
                try? await store.addMemoryItem(item)
            }
        }
    }
}