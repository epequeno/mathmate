import SwiftUI

// MARK: - Composer Key Event

/// Simplified key event used by the slash-command popup handler.
/// Avoids depending on SwiftUI's `KeyPress` (which can't be constructed manually).
enum ComposerKey: Equatable {
    case returnKey
    case upArrow
    case downArrow
    case escape
}

// MARK: - Scrolling Text Editor

/// An NSTextView-backed multiline input that grows with content up to a max height
/// (set via `.frame(maxHeight:)`) and then scrolls — fixing the SwiftUI
/// `TextField(axis:)` cursor-escape bug on macOS.
struct ScrollingTextEditor: NSViewRepresentable {
    @Binding var text: String
    /// Receives the measured content height so the parent can drive `.frame(height:)`.
    @Binding var contentHeight: CGFloat
    var placeholder: String
    @FocusState.Binding var isFocused: Bool
    var disabled: Bool
    var onSend: () -> Void
    /// Called for navigation keys when the slash popup is active.
    /// Return `true` to consume the key, `false` to pass through.
    var slashKeyHandler: ((ComposerKey) -> Bool)?

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    func makeNSView(context: Context) -> NSScrollView {
        let scrollView = NSTextView.scrollableTextView()
        scrollView.hasVerticalScroller = true
        scrollView.hasHorizontalScroller = false
        scrollView.autohidesScrollers = true
        scrollView.drawsBackground = false
        scrollView.borderType = .noBorder

        let tv = scrollView.documentView as! NSTextView
        tv.delegate = context.coordinator
        tv.isRichText = false
        tv.allowsUndo = true
        tv.isEditable = !disabled
        tv.isSelectable = true
        tv.font = .systemFont(ofSize: 13)
        tv.textColor = NSColor.labelColor
        tv.backgroundColor = .clear
        tv.drawsBackground = false
        tv.textContainerInset = NSSize(width: 0, height: 2)
        tv.textContainer?.lineFragmentPadding = 0
        tv.textContainer?.widthTracksTextView = true
        context.coordinator.textView = tv
        context.coordinator.updatePlaceholder(text: text, placeholder: placeholder, in: tv)
        // Measure initial (empty) height
        context.coordinator.remeasureHeight(in: tv)
        return scrollView
    }

    func updateNSView(_ scrollView: NSScrollView, context: Context) {
        let tv = scrollView.documentView as! NSTextView
        // Only update if the binding changed externally (avoid cursor jump on every keystroke)
        if tv.string != text {
            tv.string = text
            context.coordinator.updatePlaceholder(text: text, placeholder: placeholder, in: tv)
        }
        tv.isEditable = !disabled
        context.coordinator.parent = self

        // Manage first-responder for the isFocused binding
        DispatchQueue.main.async {
            if self.isFocused, tv.window?.firstResponder !== tv {
                tv.window?.makeFirstResponder(tv)
            }
        }
    }

    // MARK: Coordinator

    class Coordinator: NSObject, NSTextViewDelegate {
        var parent: ScrollingTextEditor
        weak var textView: NSTextView?
        private var placeholderShowing = false

        init(_ parent: ScrollingTextEditor) {
            self.parent = parent
        }

        /// Shows grey placeholder text when the field is empty, using the real text colour otherwise.
        @MainActor
        func updatePlaceholder(text: String, placeholder: String, in tv: NSTextView) {
            if text.isEmpty {
                if !placeholderShowing {
                    tv.string = placeholder
                    tv.textColor = NSColor.placeholderTextColor
                    placeholderShowing = true
                }
            } else {
                if placeholderShowing {
                    tv.string = text
                    tv.textColor = NSColor.labelColor
                    placeholderShowing = false
                }
            }
        }

        // Forward text changes back to the binding
        func textDidChange(_ notification: Notification) {
            guard let tv = notification.object as? NSTextView else { return }
            if placeholderShowing {
                tv.textColor = NSColor.labelColor
                placeholderShowing = false
            }
            parent.text = tv.string
            remeasureHeight(in: tv)
            // Show placeholder again if field was cleared
            if tv.string.isEmpty {
                tv.string = parent.placeholder
                tv.textColor = NSColor.placeholderTextColor
                placeholderShowing = true
                parent.text = ""
                tv.setSelectedRange(NSRange(location: 0, length: 0))
                remeasureHeight(in: tv, forPlaceholder: true)
            }
        }

        /// Measure the text view's content height and push it to the binding.
        @MainActor
        func remeasureHeight(in tv: NSTextView, forPlaceholder: Bool = false) {
            guard let lm = tv.layoutManager, let tc = tv.textContainer else { return }
            lm.ensureLayout(for: tc)
            let used = lm.usedRect(for: tc).height
            let inset = tv.textContainerInset.height * 2
            // When showing placeholder, report single-line height so the box starts compact.
            let newHeight = forPlaceholder ? 20 : max(20, ceil(used + inset))
            if abs(parent.contentHeight - newHeight) > 0.5 {
                parent.contentHeight = newHeight
            }
        }

        func textDidBeginEditing(_ notification: Notification) {
            guard let tv = notification.object as? NSTextView else { return }
            if placeholderShowing {
                tv.string = ""
                tv.textColor = NSColor.labelColor
                placeholderShowing = false
                parent.text = ""
                remeasureHeight(in: tv)
            }
        }

        // Intercept Return / arrow / Escape for send + slash popup
        func textView(_ textView: NSTextView, doCommandBy commandSelector: Selector) -> Bool {
            let shiftHeld = NSApp.currentEvent?.modifierFlags.contains(.shift) ?? false

            if commandSelector == #selector(NSTextView.insertNewline(_:)) {
                // Shift+Return → regular newline (let NSTextView handle it)
                if shiftHeld { return false }
                // Plain Return: give slash popup first crack
                if let handler = parent.slashKeyHandler, handler(.returnKey) { return true }
                // Otherwise → send
                parent.onSend()
                return true
            }

            if let handler = parent.slashKeyHandler {
                if commandSelector == #selector(NSTextView.moveUp(_:)) {
                    if handler(.upArrow) { return true }
                } else if commandSelector == #selector(NSTextView.moveDown(_:)) {
                    if handler(.downArrow) { return true }
                } else if commandSelector == #selector(NSTextView.cancelOperation(_:)) {
                    if handler(.escape) { return true }
                }
            }
            return false
        }
    }
}

// MARK: - MathComposerView

/// Inline LaTeX composer: a text field with a live-rendered math preview above it.
///
/// The preview panel appears only when the user taps the Σ button and the
/// input contains LaTeX delimiters. It reuses the same `LaTeXView` + `LaTeXNormalizer`
/// pipeline as assistant message rendering, so the user sees exactly what the
/// model will see (modulo the model's own delimiter normalisation on send).
///
/// The raw `source` binding is the canonical text — it is never altered by the
/// preview layer, so send/retry/session persistence all work identically.
struct MathComposerView: View {
    /// Canonical source text. Bound to `ChatViewModel.input`.
    @Binding var source: String

    /// Whether the composer is disabled (e.g. while streaming).
    var disabled: Bool = false

    /// Placeholder shown when the text field is empty.
    var placeholder: String = "Ask a math question... (/help for commands)"

    /// Callback invoked when the user presses Enter (without Shift).
    var onSend: () -> Void

    /// Optional interceptor called before the built-in key handling.
    /// Return `true` to consume the key. Used by the slash-command popup to
    /// capture ↑ / ↓ / ↩ / Esc.
    var slashKeyHandler: ((ComposerKey) -> Bool)? = nil

    /// Whether the text field is focused. Bubbled up so the parent can manage focus.
    @FocusState.Binding var isFocused: Bool

    /// The preview model is owned here so it survives across SwiftUI re-evaluations.
    @State private var previewModel = MathComposerPreviewModel()

    /// Whether the preview panel is visible (toggled by the Σ button).
    @State private var showPreview: Bool = false

    /// Measured content height reported by ScrollingTextEditor. Starts at one line.
    @State private var editorHeight: CGFloat = 20

    private static let minEditorHeight: CGFloat = 20
    private static let maxEditorHeight: CGFloat = 160

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Live preview panel (on-demand only)
            if showPreview, let html = previewModel.previewHTML, !html.isEmpty, containsLaTeX(source) {
                previewPanel(html: html)
            }

            // Source text editor with Σ toggle button
            HStack(alignment: .bottom, spacing: 6) {
                ScrollingTextEditor(
                    text: $source,
                    contentHeight: $editorHeight,
                    placeholder: placeholder,
                    isFocused: $isFocused,
                    disabled: disabled,
                    onSend: onSend,
                    slashKeyHandler: slashKeyHandler
                )
                // Height driven by measured content; scrolls once it hits the cap.
                .frame(height: min(editorHeight, Self.maxEditorHeight))

                // Σ toggle button for LaTeX preview
                Button {
                    withAnimation(.easeInOut(duration: 0.15)) {
                        showPreview.toggle()
                    }
                    if showPreview {
                        previewModel.rawSource = source
                    }
                } label: {
                    Image(systemName: "x.squareroot")
                        .font(.system(size: 13))
                        .foregroundColor(showPreview ? AppTheme.accent : AppTheme.textTertiary)
                }
                .buttonStyle(.plain)
                .help(showPreview ? "Hide LaTeX preview" : "Show LaTeX preview")
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(AppTheme.surface)
            .cornerRadius(8)
            .overlay(
                RoundedRectangle(cornerRadius: 8)
                    .stroke(AppTheme.border, lineWidth: 1)
            )
        }
        .onChange(of: source) { _, newValue in
            previewModel.rawSource = newValue
            // Collapse back to one line when cleared programmatically (e.g. after send)
            if newValue.isEmpty {
                editorHeight = Self.minEditorHeight
            }
        }
        .onAppear {
            previewModel.rawSource = source
        }
    }

    private func containsLaTeX(_ text: String) -> Bool {
        guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return false }
        let indicators = ["$$", "$", "\\[", "\\]", "\\(", "\\)", "\\begin{",
                          "\\frac", "\\sqrt", "\\int", "\\sum", "\\prod",
                          "\\alpha", "\\beta", "\\gamma", "\\pi", "\\theta",
                          "\\sin", "\\cos", "\\tan", "\\log", "\\infty",
                          "\\partial", "\\nabla", "\\vec", "\\hat",
                          "\\rightarrow", "\\Rightarrow", "\\left", "\\right",
                          "\\geq", "\\leq", "\\neq", "\\approx",
                          "\\cdot", "\\times", "\\div", "\\pm"]
        return indicators.contains { text.contains($0) }
    }

    private func previewPanel(html: String) -> some View {
        LaTeXView(
            content: source,
            fontSize: 14,
            contentHeight: .constant(80)
        )
        .frame(maxHeight: 120)
        .padding(.horizontal, 8)
        .padding(.vertical, 6)
        .background(AppTheme.surface.opacity(0.6))
        .cornerRadius(8)
        .overlay(
            RoundedRectangle(cornerRadius: 8)
                .stroke(AppTheme.border.opacity(0.4), lineWidth: 0.5)
        )
        .padding(.bottom, 6)
    }
}
