import SwiftUI
import AppKit

// MARK: - SnapshotView

/// Displays a captured LaTeX snapshot as a lightweight static image view.
///
/// Used after streaming completes — replaces the live WKWebView-backed LaTeXView
/// with a static NSImage so no WebKit process remains active for that message.
struct SnapshotView: View {
    let image: NSImage
    var height: CGFloat

    var body: some View {
        Image(nsImage: image)
            .resizable()
            .aspectRatio(contentMode: .fit)
            .frame(height: height, alignment: .topLeading)
            .frame(maxWidth: 820, alignment: .leading)
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(Color(nsColor: .windowBackgroundColor).opacity(0.0))
            .cornerRadius(14)
    }
}

// MARK: - Snapshot State

/// Represents the loading state of a snapshot for a given unit ID.
enum SnapshotState: Equatable {
    case none
    case loading
    case loaded(image: NSImage, height: CGFloat)
    case failed
}

// MARK: - Snapshot Store

/// A store that manages snapshot state per unit ID, driven by the snapshot pool.
@MainActor
final class SnapshotStore: ObservableObject {
    static let shared = SnapshotStore()

    @Published private(set) var states: [UUID: SnapshotState] = [:]

    private init() {}

    /// Requests a snapshot for the given unit. Idempotent — safe to call multiple times.
    func requestSnapshot(for unitId: UUID, htmlContent: String, fontSize: Int = 14) {
        guard states[unitId] == nil else { return }
        states[unitId] = .loading

        let shellHTML = LaTeXShellHTML.build(fontSize: fontSize)

        Task {
            guard let image = await LaTeXSnapshotPool.shared.snapshot(shellHTML: shellHTML, contentHTML: htmlContent) else {
                states[unitId] = .failed
                return
            }
            let viewHeight = image.size.height
            states[unitId] = .loaded(image: image, height: viewHeight)
        }
    }

    /// Returns the snapshot image and height if available.
    func snapshot(for unitId: UUID) -> (image: NSImage, height: CGFloat)? {
        if case .loaded(let image, let height) = states[unitId] {
            return (image, height)
        }
        return nil
    }

    /// Whether a snapshot is still loading for the given unit ID.
    func isLoading(for unitId: UUID) -> Bool {
        if case .loading = states[unitId] { return true }
        return false
    }

    /// Clears all snapshot states (call when session changes).
    func clearAll() {
        states.removeAll()
    }

    /// Removes a specific unit's snapshot.
    func remove(for unitId: UUID) {
        states.removeValue(forKey: unitId)
    }
}

// MARK: - Snapshot Unit View

/// A view that shows either a loading placeholder, the live LaTeXView (while streaming),
/// or the captured snapshot (after streaming completes).
struct SnapshotUnitView: View {
    let unit: ResponseUnit
    let isStreaming: Bool
    let fontSize: Int
    @ObservedObject private var store = SnapshotStore.shared

    private var snapshotAvailable: Bool {
        if case .loaded = store.states[unit.id] { return true }
        return false
    }

    private var snapshotHeight: CGFloat? {
        if case .loaded(_, let height) = store.states[unit.id] { return height }
        return nil
    }

    var body: some View {
        Group {
            if !isStreaming && snapshotAvailable, let height = snapshotHeight {
                // Show static snapshot after streaming completes
                if let snap = store.snapshot(for: unit.id) {
                    SnapshotView(image: snap.image, height: snap.height)
                        .frame(height: snap.height)
                } else {
                    Color.clear.frame(height: height)
                }
            } else if !isStreaming && !snapshotAvailable {
                // Trigger snapshot request and show a placeholder while loading
                if case .loading = store.states[unit.id] {
                    ProgressView()
                        .frame(height: 40)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                } else {
                    // Not yet requested — the parent view triggers on streaming end
                    Color.clear.frame(height: 40)
                }
            } else {
                // Streaming — use live LaTeXView (managed elsewhere in MessageRow)
                Color.clear.frame(height: 0)
            }
        }
        .onAppear {
            if !isStreaming && !snapshotAvailable {
                requestSnapshotIfNeeded()
            }
        }
        .onChange(of: isStreaming) { _, newValue in
            if !newValue && !snapshotAvailable {
                requestSnapshotIfNeeded()
            }
        }
    }

    private func requestSnapshotIfNeeded() {
        guard store.states[unit.id] == nil else { return }

        let text = unit.parts.compactMap { part -> String? in
            if case .text(let t) = part { return t }
            return nil
        }.joined(separator: "\n")

        let htmlContent = LaTeXNormalizer.renderAsHTML(text)
        store.requestSnapshot(for: unit.id, htmlContent: htmlContent, fontSize: fontSize)
    }
}
