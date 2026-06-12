import WebKit
import AppKit

/// A shared pool of offscreen WKWebViews for rendering LaTeX HTML snapshots.
///
/// Design:
/// - `@MainActor` so all WKWebView operations happen on the main thread (required by WebKit).
/// - Pool size is 2 by default; each pooled WKWebView is hidden (offscreen frame).
/// - `snapshot(shellHTML:contentHTML:)` acquires a pooled web view, loads the KaTeX shell,
///   injects content HTML via JS `updateContent()`, waits for layout, captures via
///   `cacheDisplay(in:to:)`, and returns the pooled view to the pool.
/// - Height is reported from the JS shell via WKScriptMessageHandler.
/// - Both loading phases enforce a hard timeout to prevent hangs.
///
/// `@unchecked Sendable` required because `PooledWebView` wraps `WKWebView`
/// (non-Sendable). All pool access is `@MainActor`-isolated, so it is safe.
@MainActor
final class LaTeXSnapshotPool: @unchecked Sendable {
    static let shared = LaTeXSnapshotPool()

    // MARK: - Config

    private let poolSize: Int
    private let snapshotWidth: CGFloat = 820

    // MARK: - State

    private var pool: [PooledWebView] = []

    // MARK: - Init

    private init(poolSize: Int = 2) {
        self.poolSize = poolSize
        for _ in 0..<poolSize {
            pool.append(PooledWebView(width: snapshotWidth))
        }
    }

    // MARK: - Public API

    /// Renders `contentHTML` inside the KaTeX shell and captures the result as an `NSImage`.
    /// - Returns: the captured `NSImage`, or nil on failure.
    func snapshot(shellHTML: String, contentHTML: String) async -> NSImage? {
        // Acquire a pooled WKWebView
        let webView: PooledWebView
        if let reused = pool.popLast() {
            webView = reused
        } else {
            // Pool exhausted — create a temporary one (discarded after use)
            webView = PooledWebView(width: snapshotWidth)
        }

        defer {
            if pool.count < poolSize * 2 {
                webView.reset()
                pool.append(webView)
            } else {
                webView.destroy()
            }
        }

        // Phase 1: Load the KaTeX shell and wait for initial layout
        let shellLoaded = await webView.loadShellAndWait(html: shellHTML, timeout: 5.0)
        guard shellLoaded else { return nil }

        // Phase 2: Inject content via JS and wait for re-render
        let contentRendered = await webView.injectContentAndWait(contentHTML, timeout: 5.0)
        guard contentRendered else { return nil }

        // Capture via bitmapImageRepForCachingDisplay
        let height = webView.capturedHeight
        let viewBounds = NSRect(x: 0, y: 0, width: snapshotWidth, height: max(30, height))
        let contentView = webView.nsView

        guard let bitmapRep = contentView.bitmapImageRepForCachingDisplay(in: viewBounds) else { return nil }

        contentView.cacheDisplay(in: viewBounds, to: bitmapRep)

        let image = NSImage(size: viewBounds.size)
        image.addRepresentation(bitmapRep)
        return image
    }

    /// Convenience overload that accepts a single combined HTML string (Phase-1 only).
    /// Kept for backward compatibility.
    func snapshot(html: String) async -> NSImage? {
        await snapshot(shellHTML: html, contentHTML: "")
    }
}

// MARK: - Pooled WebView

/// A single reusable, hidden WKWebView wrapper. Must be used on the MainActor.
@MainActor
final class PooledWebView {
    let nsView: WKWebView
    private var isLoaded = false
    private var _capturedHeight: CGFloat = 40
    private let width: CGFloat

    // Two-phase loading state
    private var loadContinuation: CheckedContinuation<Bool, Never>?
    private var didResume = false
    private var isContentPhase = false
    private var contentContinuation: CheckedContinuation<Bool, Never>?
    private var didResumeContent = false

    init(width: CGFloat) {
        self.width = width

        let config = WKWebViewConfiguration()
        let controller = config.userContentController

        let webView = WKWebView(frame: NSRect(x: 0, y: 0, width: width, height: 1), configuration: config)
        webView.setValue(false, forKey: "drawsBackground")
        // Place offscreen — not in any window, not visible
        if let window = webView.window {
            window.setFrameOrigin(NSPoint(x: -10000, y: -10000))
        }
        self.nsView = webView

        let handler = HeightHandler { [weak self] h in
            self?.didReceiveHeight(h)
        }
        controller.add(handler, name: "heightUpdate")
    }

    /// Loads HTML in the web view and waits for the first height callback.
    /// Enforces a hard timeout — resumes with `false` if the callback doesn't arrive in time.
    func loadShellAndWait(html: String, timeout: TimeInterval) async -> Bool {
        didResume = false
        isLoaded = false
        _capturedHeight = 40
        isContentPhase = false

        return await withCheckedContinuation { continuation in
            loadContinuation = continuation
            nsView.loadHTMLString(html, baseURL: Bundle.module.bundleURL)

            DispatchQueue.main.asyncAfter(deadline: .now() + timeout) { [weak self] in
                guard let self, !didResume else { return }
                didResume = true
                loadContinuation?.resume(returning: false)
                loadContinuation = nil
            }
        }
    }

    /// Calls `updateContent()` JS to inject content HTML, then waits for the re-render height callback.
    /// Enforces a hard timeout — resumes with `false` if no callback arrives in time.
    func injectContentAndWait(_ contentHTML: String, timeout: TimeInterval) async -> Bool {
        didResumeContent = false
        isContentPhase = true

        return await withCheckedContinuation { continuation in
            contentContinuation = continuation

            let escaped = contentHTML
                .replacingOccurrences(of: "\\", with: "\\\\")
                .replacingOccurrences(of: "\"", with: "\\\"")
                .replacingOccurrences(of: "\n", with: "\\n")
                .replacingOccurrences(of: "\r", with: "")

            nsView.evaluateJavaScript("updateContent(\"\(escaped)\")")

            DispatchQueue.main.asyncAfter(deadline: .now() + timeout) { [weak self] in
                guard let self, !didResumeContent else { return }
                didResumeContent = true
                contentContinuation?.resume(returning: false)
                contentContinuation = nil
            }
        }
    }

    func reset() {
        isLoaded = false
        _capturedHeight = 40
        loadContinuation = nil
        contentContinuation = nil
        didResume = false
        didResumeContent = false
        isContentPhase = false
        nsView.loadHTMLString("<html><body></body></html>", baseURL: nil)
    }

    func destroy() {
        nsView.stopLoading()
        nsView.loadHTMLString("", baseURL: nil)
    }

    var capturedHeight: CGFloat {
        _capturedHeight
    }

    private func didReceiveHeight(_ height: CGFloat) {
        _capturedHeight = max(30, height)

        if isContentPhase {
            // Content injection phase — content has been re-rendered
            if !didResumeContent {
                didResumeContent = true
                contentContinuation?.resume(returning: true)
                contentContinuation = nil
            }
        } else {
            // Shell loading phase — initial layout is ready
            if !isLoaded {
                isLoaded = true
                if !didResume {
                    didResume = true
                    loadContinuation?.resume(returning: true)
                    loadContinuation = nil
                }
            }
        }
    }
}

// MARK: - Height Handler

/// Receives height messages from a pooled WKWebView.
/// Must be kept alive by the WKUserContentController for the lifetime of the web view.
@MainActor
private final class HeightHandler: NSObject, WKScriptMessageHandler {
    let callback: @MainActor (CGFloat) -> Void

    @MainActor
    init(callback: @escaping @MainActor (CGFloat) -> Void) {
        self.callback = callback
        super.init()
    }

    nonisolated func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        // Extract main-actor-isolated properties on the main actor before dispatching.
        Task { @MainActor in
            guard message.name == "heightUpdate",
                  let raw = message.body as? NSNumber else { return }
            let height = CGFloat(raw.doubleValue)
            callback(height)
        }
    }
}

// MARK: - Shell HTML Builder

/// Shared KaTeX shell HTML used by the snapshot pool.
enum LaTeXShellHTML {
    private static let katexAssets: KaTeXAssets = KaTeXAssets.load()

    /// Builds the base shell HTML with the given font size.
    /// The shell includes KaTeX CSS, JS, and the `updateContent` JS function that
    /// renders markdown + math and reports scroll height.
    static func build(fontSize: Int) -> String {
        """
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <style>
        \(katexAssets.css)
            </style>
            <style>
                * { box-sizing: border-box; margin: 0; padding: 0; }
                body {
                    font-family: -apple-system, "Helvetica Neue", sans-serif;
                    font-size: \(fontSize)px;
                    line-height: 1.55;
                    padding: 2px 4px;
                    background: transparent;
                    color: #1a1a1a;
                    overflow-wrap: break-word;
                    word-break: break-word;
                    overflow: hidden;
                }
                #content p { margin: 0.45em 0; }
                #content h1, #content h2, #content h3, #content h4, #content h5, #content h6 {
                    margin: 0.6em 0 0.3em;
                    line-height: 1.3;
                }
                #content ul, #content ol {
                    margin: 0.35em 0 0.35em 1.25em;
                    padding-left: 0.8em;
                }
                #content li { margin: 0.15em 0; word-break: normal; }
                #content blockquote {
                    margin: 0.4em 0;
                    padding: 0.15em 0 0.15em 0.75em;
                    border-left: 3px solid rgba(127, 127, 127, 0.35);
                    opacity: 0.95;
                }
                #content hr {
                    border: 0; border-top: 1px solid rgba(127, 127, 127, 0.35); margin: 0.65em 0;
                }
                #content table {
                    width: 100%; border-collapse: collapse; margin: 0.55em 0; font-size: 0.96em;
                }
                #content th, #content td {
                    border: 1px solid rgba(127, 127, 127, 0.35);
                    padding: 0.38em 0.5em; vertical-align: top;
                }
                #content th { background: rgba(127, 127, 127, 0.16); font-weight: 600; }
                @media (prefers-color-scheme: dark) {
                    body { color: #e0e0e0; }
                    code { background: #2d2d2d !important; color: #e0e0e0; }
                    .katex { color: #e0e0e0; }
                }
                .katex-display { margin: 0.25em 0; overflow-x: auto; overflow-y: hidden; }
                code {
                    font-family: "SF Mono", Menlo, Monaco, monospace;
                    font-size: 0.88em; background: #f0f0f0; padding: 1px 4px; border-radius: 3px;
                }
                pre {
                    margin: 0.5em 0; padding: 0.55em 0.7em;
                    border-radius: 6px; background: rgba(127, 127, 127, 0.14); overflow-x: auto;
                }
                pre code { background: transparent; padding: 0; }
                #content { min-height: 1em; }
            </style>
        </head>
        <body>
            <div id="content"></div>
            <script>\(katexAssets.katexJS)</script>
            <script>\(katexAssets.autoRenderJS)</script>
            <script>
                function updateContent(html) {
                    try {
                        var el = document.getElementById('content');
                        el.innerHTML = html;
                        if (typeof renderMathInElement === 'function') {
                            renderMathInElement(el, {
                                delimiters: [
                                    {left: "\\\\(",  right: "\\\\)",  display: false},
                                    {left: "\\\\[",  right: "\\\\]",  display: true},
                                    {left: "$$",     right: "$$",     display: true},
                                    {left: "$",      right: "$",      display: false}
                                ],
                                throwOnError: false,
                                errorColor: "#cc0000",
                                strict: false
                            });
                        }
                        window.webkit.messageHandlers.heightUpdate.postMessage(document.body.scrollHeight);
                    } catch (e) {
                        console.error("[MathMate] updateContent error: " + e.message);
                        window.webkit.messageHandlers.heightUpdate.postMessage(document.body.scrollHeight);
                    }
                }

                // Post initial height so the snapshot pool knows the shell is loaded.
                window.webkit.messageHandlers.heightUpdate.postMessage(document.body.scrollHeight);
            </script>
        </body>
        </html>
        """
    }
}
