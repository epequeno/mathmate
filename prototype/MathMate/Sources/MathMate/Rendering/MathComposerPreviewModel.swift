import Foundation
import SwiftUI

/// Owns the debounced preview pipeline for the inline LaTeX composer.
///
/// Lifecycle:
/// - Created by `MathComposerView` and kept alive across SwiftUI updates.
/// - Every keystroke writes to `rawSource` (the canonical text for sending).
/// - After a debounce window the preview model renders `rawSource` to HTML
///   and publishes it for the `LaTeXView` preview panel.
///
/// Thread safety:
/// - `rawSource` is only mutated on the main actor (SwiftUI binding).
/// - HTML rendering is offloaded to a background task, then published back
///   on `MainActor` — same pattern as the `LaTeXView.Coordinator` debounce.
@MainActor
@Observable
final class MathComposerPreviewModel {

    // MARK: - Public state

    /// The canonical source text. Binding target for the `TextField`.
    var rawSource: String = "" {
        didSet { schedulePreview() }
    }

    /// Rendered HTML ready for the preview `LaTeXView`.
    /// `nil` means "no preview to show" (empty or whitespace-only input).
    private(set) var previewHTML: String? = nil

    // MARK: - Private

    private var debounceTask: Task<Void, Never>?
    private static let debounceInterval: Duration = .milliseconds(100)

    // MARK: - Debounce pipeline

    private func schedulePreview() {
        debounceTask?.cancel()

        let snapshot = rawSource
        // Fast path: empty input → clear preview immediately, no debounce needed
        if snapshot.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            previewHTML = nil
            return
        }

        debounceTask = Task { [weak self] in
            try? await Task.sleep(for: Self.debounceInterval)
            guard !Task.isCancelled else { return }

            let html = await Task.detached(priority: .userInitiated) {
                LaTeXNormalizer.renderAsHTML(snapshot)
            }.value

            await MainActor.run { [weak self] in
                guard let self else { return }
                // Only apply if rawSource hasn't advanced past the snapshot
                guard self.rawSource == snapshot else { return }
                self.previewHTML = html
            }
        }
    }
}
