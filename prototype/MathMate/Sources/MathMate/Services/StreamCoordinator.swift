import Foundation
import os

private let log = Logger(subsystem: "com.mathmate", category: "stream")

// MARK: - StreamCoordinator

/// Pure helper functions for text buffer management during streaming.
///
/// These were extracted from ChatViewModel to reduce its line count and isolate
/// streaming logic from view model orchestration. The mutable state (`assistantTextBuffer`)
/// remains in ChatViewModel since it's tightly coupled to the `sendMessage()` loop.
enum StreamCoordinator {

    /// Appends text to a message at a given index.
    @MainActor
    static func appendAssistantText(_ text: String, to messages: inout [Message], at index: Int) {
        messages[index].appendTextToLastPart(text)
    }

    /// Flushes buffered text into the assistant message at the given index.
    @MainActor
    static func flushTextBuffer(_ buffer: inout String, to messages: inout [Message], at assistantIndex: Int) {
        guard !buffer.isEmpty else { return }
        appendAssistantText(buffer, to: &messages, at: assistantIndex)
        buffer = ""
    }

    /// Appends a text chunk to the buffer, flushing to the message when buffer >= 20 chars.
    @MainActor
    static func consumeChunk(
        _ chunk: String,
        textBuffer: inout String,
        messages: inout [Message],
        assistantIndex: Int
    ) {
        guard !chunk.isEmpty else { return }
        textBuffer += chunk
        if textBuffer.count >= 20 {
            flushTextBuffer(&textBuffer, to: &messages, at: assistantIndex)
        }
    }
}