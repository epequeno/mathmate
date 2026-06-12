import WebKit
import SwiftUI
import os

private let log = Logger(subsystem: "com.mathmate", category: "rendering")

// MARK: - Non-focusable WKWebView

/// WKWebView that refuses first-responder so it can't steal keyboard focus from SwiftUI controls.
final class NonFocusableWebView: WKWebView {
    override var canBecomeKeyView: Bool { false }
    override var acceptsFirstResponder: Bool { false }
    override func becomeFirstResponder() -> Bool { false }

    /// Pass scroll wheel events up to the parent ScrollView instead of consuming them.
    override func scrollWheel(with event: NSEvent) {
        nextResponder?.scrollWheel(with: event)
    }
}

// MARK: - LaTeXView

/// Renders mixed text/LaTeX content using KaTeX.
///
/// Design:
/// - The KaTeX infrastructure (CSS + JS) is loaded **once** into the WKWebView at creation.
///   CSS and JS are inlined so no file-loading failures are possible.
/// - Content updates happen via `evaluateJavaScript("updateContent(...)")` — no page reloads.
///   This means streaming token-by-token works without interrupting KaTeX mid-render.
/// - Height is reported back to SwiftUI via WKScriptMessageHandler so the frame grows with content.
/// - Dark mode is handled entirely by CSS `@media (prefers-color-scheme: dark)`.
struct LaTeXView: NSViewRepresentable {
    let content: String
    var fontSize: Int = 14
    @Binding var contentHeight: CGFloat
    /// Optional binding updated with the rendered content width.
    /// When provided, callers can use it to size the view to its content.
    var contentWidth: Binding<CGFloat>? = nil

    // Inline KaTeX assets once at app start (static so we only read the files once)
    private static let katexAssets: KaTeXAssets = KaTeXAssets.load()

    func makeCoordinator() -> Coordinator {
        Coordinator(contentHeight: $contentHeight, contentWidth: contentWidth)
    }

    func makeNSView(context: Context) -> NonFocusableWebView {
        let userContentController = WKUserContentController()
        // Weak proxy breaks the WKUserContentController → Coordinator retain cycle
        userContentController.add(WeakScriptMessageHandler(context.coordinator), name: "sizeUpdate")

        let config = WKWebViewConfiguration()
        config.userContentController = userContentController
        config.preferences.isElementFullscreenEnabled = false

        let webView = NonFocusableWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = context.coordinator
        // Transparent so the SwiftUI bubble background shows through
        webView.setValue(false, forKey: "drawsBackground")

        // Load once — subsequent content changes go through evaluateJavaScript
        let html = buildBaseHTML(fontSize: fontSize, assets: Self.katexAssets)
        // baseURL lets font url() refs in the inlined CSS resolve against the bundle
        webView.loadHTMLString(html, baseURL: Bundle.module.bundleURL)
        return webView
    }

    func updateNSView(_ nsView: NonFocusableWebView, context: Context) {
        context.coordinator.webView = nsView
        context.coordinator.pendingContent = content
        if context.coordinator.pageLoaded {
            context.coordinator.schedulePush(content)
        }
    }

    // MARK: - Coordinator

    final class Coordinator: NSObject, WKNavigationDelegate, WKScriptMessageHandler {
        var contentHeight: Binding<CGFloat>
        var contentWidth: Binding<CGFloat>?
        weak var webView: NonFocusableWebView?
        var pageLoaded = false
        var pendingContent = ""

        /// Debounce: tracks the last text we kicked off a render for.
        /// During streaming SwiftUI may call updateNSView dozens of times per second;
        /// we coalesce those into at most one render per debounce window.
        private var lastScheduledText = ""
        private var debounceTask: Task<Void, Never>?
        /// 80 ms feels instantaneous to users but skips ~10–15 intermediate frames
        /// during fast streaming, which keeps the WKWebView from queuing stale JS.
        private static let debounceInterval: Duration = .milliseconds(80)

        init(contentHeight: Binding<CGFloat>, contentWidth: Binding<CGFloat>? = nil) {
            self.contentHeight = contentHeight
            self.contentWidth = contentWidth
        }

        // MARK: WKNavigationDelegate

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            pageLoaded = true
            schedulePush(pendingContent)
        }

        // MARK: Content updates (debounced + off-main-thread rendering)

        /// Called from updateNSView on the main actor. Debounces rapid streaming updates
        /// and offloads the CPU-heavy renderAsHTML work to a background thread.
        func schedulePush(_ text: String) {
            // Fast path: content hasn't changed
            guard text != lastScheduledText else { return }
            lastScheduledText = text

            // Cancel any pending debounce window
            debounceTask?.cancel()
            debounceTask = Task { [weak self] in
                // Wait out the debounce window; exit early if cancelled
                try? await Task.sleep(for: Self.debounceInterval)
                guard !Task.isCancelled, let self else { return }

                // Capture what we want to render (may have advanced during the sleep)
                let snapshot = self.lastScheduledText

                // Render HTML on a background thread — this is the expensive work
                let html = await Task.detached(priority: .userInitiated) {
                    LaTeXNormalizer.renderAsHTML(snapshot)
                }.value

                // Back on main for the WKWebView JS call
                await MainActor.run { [weak self] in
                    self?.commitHTML(html)
                }
            }
        }

        /// Pushes pre-rendered HTML into the WKWebView via JS. Must be called on the main thread.
        private func commitHTML(_ html: String) {
            guard let webView else { return }
            // JSON-encode so backslashes, quotes, etc. are safely embedded in JS.
            // Must wrap in array — JSONSerialization requires Array/Dictionary at top level.
            guard let jsonData = try? JSONSerialization.data(withJSONObject: [html]),
                  let jsonString = String(data: jsonData, encoding: .utf8) else { return }
            webView.evaluateJavaScript("updateContent(\(jsonString)[0]);") { _, error in
                if let error {
                    log.warning("JS error: \(error.localizedDescription)")
                }
            }
        }

        // MARK: WKScriptMessageHandler — receives height from JS

        func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
            guard message.name == "sizeUpdate",
                  let dict = message.body as? [String: Any],
                  let h = dict["h"] as? NSNumber,
                  let w = dict["w"] as? NSNumber else { return }
            let height = CGFloat(h.doubleValue)
            let width  = CGFloat(w.doubleValue)
            DispatchQueue.main.async { [weak self] in
                self?.contentHeight.wrappedValue = max(30, height + 8)
                self?.contentWidth?.wrappedValue = max(40, width)
            }
        }
    }

    // MARK: - HTML construction

    private func buildBaseHTML(fontSize: Int, assets: KaTeXAssets) -> String {
        """
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <style>
        \(assets.css)
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
                #content li {
                    margin: 0.15em 0;
                    word-break: normal;
                }
                #content blockquote {
                    margin: 0.4em 0;
                    padding: 0.15em 0 0.15em 0.75em;
                    border-left: 3px solid rgba(127, 127, 127, 0.35);
                    opacity: 0.95;
                }
                #content hr {
                    border: 0;
                    border-top: 1px solid rgba(127, 127, 127, 0.35);
                    margin: 0.65em 0;
                }
                #content table {
                    width: 100%;
                    border-collapse: collapse;
                    margin: 0.55em 0;
                    font-size: 0.96em;
                }
                #content th, #content td {
                    border: 1px solid rgba(127, 127, 127, 0.35);
                    padding: 0.38em 0.5em;
                    vertical-align: top;
                }
                #content th {
                    background: rgba(127, 127, 127, 0.16);
                    font-weight: 600;
                }
                @media (prefers-color-scheme: dark) {
                    body { color: #e0e0e0; }
                    code { background: #2d2d2d !important; color: #e0e0e0; }
                    .katex { color: #e0e0e0; }
                }
                .katex-display {
                    margin: 0.25em 0;
                    overflow-x: auto;
                    overflow-y: hidden;
                }
                code {
                    font-family: "SF Mono", Menlo, Monaco, monospace;
                    font-size: 0.88em;
                    background: #f0f0f0;
                    padding: 1px 4px;
                    border-radius: 3px;
                }
                pre {
                    margin: 0.5em 0;
                    padding: 0.55em 0.7em;
                    border-radius: 6px;
                    background: rgba(127, 127, 127, 0.14);
                    overflow-x: auto;
                }
                pre code {
                    background: transparent;
                    padding: 0;
                }
                #content { min-height: 1em; }
            </style>
        </head>
        <body>
            <div id="content"></div>
            <script>\(assets.katexJS)</script>
            <script>\(assets.autoRenderJS)</script>
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
                        var rect = document.getElementById('content').getBoundingClientRect();
                        window.webkit.messageHandlers.sizeUpdate.postMessage({
                            h: Math.ceil(document.body.getBoundingClientRect().height),
                            w: Math.ceil(rect.width)
                        });
                    } catch (e) {
                        console.error("[MathMate] updateContent error: " + e.message);
                    }
                }
            </script>
        </body>
        </html>
        """
    }
}

// MARK: - KaTeX Assets

/// Holds the inlined KaTeX CSS and JS, loaded once from the bundle.
struct KaTeXAssets {
    let css: String
    let katexJS: String
    let autoRenderJS: String

    static func load() -> KaTeXAssets {
        func read(_ name: String, _ ext: String) -> String {
            guard let url = Bundle.module.url(forResource: name, withExtension: ext),
                  let content = try? String(contentsOf: url, encoding: .utf8) else {
                log.warning("Could not load \(name).\(ext) from bundle")
                return ""
            }
            return content
        }

        // Patch font paths: CSS expects `url(fonts/KaTeX_*.woff2)` but SPM flattens
        // the directory, so fonts end up at the bundle root as `url(KaTeX_*.woff2)`.
        let rawCSS = read("katex.min", "css")
        let patchedCSS = rawCSS.replacingOccurrences(of: "url(fonts/", with: "url(")

        return KaTeXAssets(
            css: patchedCSS,
            katexJS: read("katex.min", "js"),
            autoRenderJS: read("auto-render.min", "js")
        )
    }
}

// MARK: - Weak Script Message Handler (breaks retain cycle)

private final class WeakScriptMessageHandler: NSObject, WKScriptMessageHandler {
    weak var target: WKScriptMessageHandler?
    init(_ target: WKScriptMessageHandler) { self.target = target }
    func userContentController(_ c: WKUserContentController, didReceive m: WKScriptMessage) {
        target?.userContentController(c, didReceive: m)
    }
}
