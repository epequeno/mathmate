# Implementation Plan: Interactive Widgets (Desmos-style)

## 1. Overview

The agent can generate interactive math visualizations — function graphs,
sliders, geometric constructions — inline in the chat. Widgets are described
via a JSON spec embedded in the agent's response, rendered in a sandboxed
WKWebView using bundled JS libraries (JSXGraph as the primary engine).

Widgets are a natural extension of the `ContentPart` type from the multimodal
plan — they persist automatically with the session log.

**Dependency:** Session persistence (saving/loading `[Message]` to disk) must
be implemented alongside this feature, as it is the mechanism by which widgets
are preserved and surfaced in `LogsView`.

---

## 2. Widget Spec Format

The agent emits a fenced code block with the language tag `widget`:

````
```widget
{
  "type": "graph",
  "library": "jsxgraph",
  "title": "Slope-Intercept Form",
  "config": {
    "expressions": ["y = m * x + b"],
    "sliders": {
      "m": { "min": -5, "max": 5, "default": 1, "label": "slope" },
      "b": { "min": -10, "max": 10, "default": 0, "label": "intercept" }
    },
    "bounds": [-10, 10, -10, 10]
  }
}
```
````

### `WidgetSpec` struct (new, in `ModelProvider.swift` alongside `ContentPart`)

```swift
struct WidgetSpec: Codable {
    enum Library: String, Codable {
        case jsxgraph
        case functionPlot   // lightweight fallback for simple 2D plots
    }
    let type: String          // "graph", "geometry", "plot3d", etc.
    let library: Library
    let title: String?
    let config: WidgetConfig  // opaque JSON, passed as-is to the WebView shell
}

struct WidgetConfig: Codable {
    let raw: [String: Any]    // preserve arbitrary JSON for the shell

    init(from decoder: Decoder) throws { ... }   // custom Codable
    func encode(to encoder: Encoder) throws { ... }
}
```

---

## 3. `ContentPart` extension

Add `.widget` as a third case to the `ContentPart` enum (defined in the
multimodal plan):

```swift
enum ContentPart: Codable {
    case text(String)
    case image(ImageAttachment)
    case widget(WidgetSpec)
}
```

No other changes to `Message` or `MessagePayload` — widgets flow through the
same parts array automatically.

---

## 4. Parsing Pipeline

### 4a. Widget block extraction

Before markdown and LaTeX processing, the rendering pipeline must extract
` ```widget ``` ` fenced blocks and convert them to `.widget(WidgetSpec)` parts.

This is analogous to the existing math-placeholder strategy in
`LaTeXNormalizer`:
1. Scan the raw assistant response string for ` ```widget\n...\n``` ` blocks.
2. Parse the JSON body into a `WidgetSpec`.
3. Replace the fenced block with a placeholder token (e.g. `[[WIDGET_0]]`).
4. After markdown rendering, replace placeholder tokens with the rendered
   `WidgetView` component.

### 4b. Streaming consideration

Widget blocks arrive token-by-token during streaming. The parser should
buffer and only attempt to render a widget once the closing ` ``` ` delimiter
is received. Until then, show a subtle "preparing widget…" placeholder.

---

## 5. Bundled JS Libraries

| Library | Use case | Licence |
|---|---|---|
| **JSXGraph** | Geometry, function graphing, sliders, calculus | MIT |
| **Function Plot** | Lightweight fallback for simple 2D curves | MIT |

Both are self-hosted in `Resources/widgets/` — no network calls at runtime.

Bundle layout:
```
Resources/
  widgets/
    jsxgraph.min.js
    jsxgraph.min.css
    function-plot.min.js
    shells/
      shell-jsxgraph.html
      shell-functionplot.html
```

---

## 6. WebView Shell Architecture

Each shell is a minimal HTML file that:
1. Loads the bundled JS library from `Resources/widgets/`.
2. Exposes a `window.loadWidget(spec)` function.
3. Renders the interactive widget using the spec's `config`.
4. Posts `window.webkit.messageHandlers.widgetHeight.postMessage(height)` when
   content size changes so SwiftUI can resize the frame.

### Shell contract
```javascript
// Called by Swift after the WebView finishes loading
window.loadWidget = function(spec) {
    // spec is the full WidgetSpec.config JSON object
    // library-specific initialisation here
};
```

### `WidgetView` (new `Views/WidgetView.swift`)

A `WKWebView`-backed SwiftUI view:
- Loads the appropriate shell HTML (keyed on `WidgetSpec.library`)
- Passes the serialized `WidgetSpec.config` via `evaluateJavaScript`
  after `webView(_:didFinish:)`
- Implements `WKScriptMessageHandler` to receive height updates
- Security: `WKWebpagePreferences.allowsContentJavaScript = true`,
  `WKWebViewConfiguration` with no network access (all resources are local)

---

## 7. Session Persistence (co-feature / dependency)

### Format: JSONL, one file per session

```
~/.mathmate/sessions/
  <session-uuid>.jsonl
  <session-uuid>.jsonl
  ...
```

Each file uses a two-record-type convention:

**Line 1 — session metadata header** (always exactly one, always first):
```jsonl
{"type":"session","id":"...","name":"Solving 4y + 8 = 2y","customName":null,"createdAt":"...","lastActivity":"...","model":"gpt-4o","provider":"openrouter"}
```

**Lines 2…n — messages** (one per line, appended in order):
```jsonl
{"type":"message","id":"...","role":"user","parts":[...],"timestamp":"..."}
{"type":"message","id":"...","role":"assistant","parts":[...],"timestamp":"...","tokenUsage":{...}}
```

Widgets are serialised as `.widget(WidgetSpec)` parts — no special handling
needed, they round-trip through the existing `ContentPart` `Codable` conformance.

### `SessionHeader` struct (new, in a `SessionStore.swift`)

```swift
struct SessionHeader: Codable, Identifiable {
    let id: UUID
    var name: String          // auto-derived from first user message (truncated ~40 chars)
    var customName: String?   // non-nil when user has renamed the session
    let createdAt: Date
    var lastActivity: Date
    let model: String
    let provider: String

    /// Display name: customName takes precedence over auto-derived name
    var displayName: String { customName ?? name }
}
```

### `SessionStore` (new, `SessionStore.swift`)

Responsible for all disk I/O — keeps `ChatViewModel` clean:

```swift
final class SessionStore {
    // Create a new session file, write the header line
    func createSession(_ header: SessionHeader) throws

    // Append a single message line
    func appendMessage(_ message: Message, to sessionId: UUID) throws

    // Rewrite only line 1 (e.g. after rename or lastActivity update)
    func updateHeader(_ header: SessionHeader) throws

    // Read line 1 only — used by LogsView to build the session list
    func loadHeader(from url: URL) throws -> SessionHeader

    // Read all lines — used when opening a session
    func loadMessages(for sessionId: UUID) throws -> [Message]

    // List all session headers sorted by lastActivity
    func allHeaders() throws -> [SessionHeader]

    // Delete a session file
    func deleteSession(_ id: UUID) throws
}
```

`updateHeader` rewrites only line 1 by prepending the new header to the
remaining lines — safe via a write-to-temp-then-rename strategy.

### `ChatViewModel` changes
- `currentSession: SessionHeader?` — created lazily on first message send
- `sessionStore: SessionStore` — injected dependency
- After each completed assistant response:
  1. `appendMessage` the assistant message
  2. `updateHeader` with the new `lastActivity`
- On `clearChat()`: nil out `currentSession` (next send starts a fresh session)

### `LogsView` (upgrade from placeholder)
- Reads `SessionStore.allHeaders()` — fast, only parses line 1 of each file
- Shows: display name, model, message count, last activity date
- Tapping a session loads all messages and opens a read-only replay view
- **Rename:** inline `TextField` on double-click/tap, calls `updateHeader`
  with the new `customName`
- **Delete:** swipe-to-delete, calls `SessionStore.deleteSession`
- Widgets in past sessions are fully interactive — spec is preserved,
  re-rendered fresh on load

---

## 8. System Prompt Guidance

The global system prompt (from the Settings plan) should instruct the model
on the widget format so it knows when and how to generate one. Append to the
default math tutor prompt:

```
When a concept would benefit from visual exploration, you may generate an
interactive widget using a ```widget code block. Use JSXGraph for geometry
and function graphing. Keep configs minimal and focused on the concept at hand.
```

---

## 9. Implementation Order

1. Add `WidgetSpec` and `WidgetConfig` structs
2. Add `.widget(WidgetSpec)` case to `ContentPart`
3. Implement widget block extraction in the parsing pipeline
4. Bundle JSXGraph and Function Plot in `Resources/widgets/`
5. Create `shell-jsxgraph.html` and `shell-functionplot.html`
6. Create `WidgetView.swift` (WKWebView shell loader + height messaging)
7. Update `MessageRow` to render `.widget` parts inline
8. Implement `SessionRecord` and session persistence in `ChatViewModel`
9. Upgrade `LogsView` to browse and restore past sessions

---

## 10. Verification

- `swift build` must pass.
- `swift test` must pass.
- Agent-generated widget spec renders correctly inline in chat.
- Sliders and interactive elements respond to user input.
- Session saved to disk after assistant response completes.
- Reloading a past session from `LogsView` restores widgets as interactive.
- No network calls made by the widget WebView (verify with proxy).
