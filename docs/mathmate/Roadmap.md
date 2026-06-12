# MathMate Feature Roadmap

This document is written for an implementing agent. It contains all decisions,
rationale, architectural context, and ordered task lists needed to implement
each feature without additional input.

---

## Active Implementation Queue (2026-05-19)

The following feature set is approved and tracked as the current execution queue:

- [x] ~~Session Wrap-Up (two-step: generate draft, then explicit save to Obsidian)~~ ✅
  - Plan: `Implementation_WrapUp.md`
- [x] ~~Multimodal Input Phase 2 (attach/drag/drop/paste images)~~ ✅
  - Plan: `Implementation_Multimodal_Phase2.md`
- [x] ~~Interactive Widgets Phase 2~~ ✅ complete
  - Plan: `Implementation_Widgets_Phase2.md`
  - Status: build passes · tests pass (`swift test`) · functionPlot shell + parser drain/order fixes merged
- [ ] Per-Chat Tutor Modes (session-level presets)
  - Plan: `Implementation_ChatModes.md`
- [ ] Learner Levels (elementary → postgrad adaptation)
  - Plan: `Implementation_LearnerLevels.md`
- [ ] Reliability & Retry UX (retry/regenerate/cancel + actionable errors)
  - Plan: `Implementation_Reliability.md`
- [ ] Agent Memory (SQLite-first persistent learner memory)
  - Plan: `Implementation_AgentMemory.md`
  - Foundation slice: `Implementation_AgentMemory_PhaseA.md`
  - Runtime integration slice: `Implementation_AgentMemory_PhaseB.md`
- [ ] Vault Search + Contextual Retrieval
  - Plan: `Implementation_VaultSearchRetrieval.md`
- [ ] Math Answer Quality Tools (step checker + verification gate + mistake detector)
  - Plan: `Implementation_MathQualityTools.md`
- [ ] Session Branching
  - Plan: `Implementation_SessionBranching.md`
  - Execution breakdown: `Implementation_SessionBranching_Execution.md`
- [ ] `/quiz` slash command (current/recent session quiz generation)
  - Plan: `Implementation_QuizSlashCommand.md`

---

## Project Context

MathMate is a native macOS SwiftUI tutoring app. Primary source path:
`prototype/MathMate/Sources/MathMate/`

Key files an implementing agent must be familiar with before starting:
- `MathMate.swift` — app entry point, config loading
- `Configuration/ConfigurationManager.swift` — reads `~/.mathmate/config.json`
  and `~/.mathmate/models.json`; currently read-only (no write path yet)
- `Models/ModelProvider.swift` — `StreamToken`, `ModelProvider` protocol,
  `OpenAIProvider`, `AnthropicProvider`, `ProviderFactory`, `ProviderError`
- `ViewModels/ChatViewModel.swift` — `Message` struct, `ChatViewModel` (@Observable)
- `ViewModels/VaultViewModel.swift` — Obsidian vault browser
- `Rendering/LaTeXView.swift` + `LaTeXNormalizer.swift` — placeholder-based
  KaTeX rendering pipeline (math regions protected → markdown parsed →
  math restored → KaTeX auto-render)
- `Views/MainView.swift` — all SwiftUI views: `ContentView`, `ChatView`,
  `MessageRow`, `VaultView`, `LogsView` (placeholder), `SidebarView`
- `Resources/katex/` — bundled KaTeX JS/CSS/fonts (offline, no network)

Build/test commands (run from `prototype/MathMate/`):
```bash
swift build
swift test
swift run
```

**Hard constraints (never violate):**
- No API keys written to disk — env vars only (`OPENROUTER_API_KEY`, etc.)
- OpenRouter is the default provider (`moonshotai/kimi-k2.6`)
- Reasoning traces must remain visible as plain text (never LaTeX-rendered)
- Swift 6 strict concurrency required
- SPM-only (no Xcode project)

---

## Known Bug (fix in Feature 2)

`ChatViewModel.sendMessage` currently sends only the latest user message to
the provider — prior conversation turns are discarded. This means the model
has no memory of previous exchanges. Fix this as part of Feature 2 by
building a full `[MessagePayload]` array from `messages` before each API call.

---

## Dependency Chain

```
Feature 1 (Settings)
    └─► informs system prompt text used in Features 2, 3, 4

Feature 2 (Context Panel) ──┐
Feature 3 (Multimodal)    ──┼─► both require the ATOMIC MESSAGE MIGRATION (see below)
Feature 4 (Widgets)       ──┘       │
    └─► Session Persistence ─────────┘  (requires Message to be fully Codable
                                         with all new fields + ContentPart)
```

### ⚠️ Atomic Message Migration (do in one commit, before Features 2–4)

`Message` must be migrated once — combining all new fields from Features 2, 3,
and 4 — to avoid touching the struct multiple times. The final `Message` struct:

```swift
struct Message: Identifiable, Codable {
    let id: UUID
    var parts: [ContentPart]      // replaces content: String (Feature 3)
    var thinkingText: String      // always plain text, always assistant-only
    let isUser: Bool
    var isStreaming: Bool
    var tokenUsage: TokenUsage?   // Feature 2 — populated when streaming finishes
    var timestamp: Date           // Feature 2 — for session/context display

    /// Backward-compat: joined text parts — used by LaTeXView and all existing callsites
    var content: String {
        parts.compactMap { if case .text(let s) = $0 { return s }; return nil }.joined()
    }

    /// Backward-compat: image attachments in this message
    var images: [ImageAttachment] {
        parts.compactMap { if case .image(let img) = $0 { return img }; return nil }
    }
}
```

The `content` and `images` computed properties preserve existing behaviour —
`LaTeXView` and all `MessageRow` callsites continue to work unchanged after
the migration. `thinkingText` stays a plain `String`.

---

## Feature 1 — Settings Pane & Global System Prompt

**Detailed plan:** `Implementation_Settings.md`

### Context
Currently the system prompt is read-only from `~/.mathmate/config.json`
(`appConfig.chat.systemPrompt`). There is no UI to change it at runtime.
`ConfigurationManager` has no write path.

### Decisions made
- System prompt is **global** for now (per-project customisation is a future
  "Project Workflow" feature — see bottom of this doc)
- A **preset picker** is included with three built-in presets
- Settings triggered via `Cmd+,` (macOS convention) — a standard secondary
  window, not a sheet
- Prompt changes take effect on the **next message sent** (no mid-session
  injection needed)

### Default system prompt (Math Tutor preset — this is the initialised default)
```
You are a patient and knowledgeable math tutor. Use KaTeX notation for all
mathematical expressions (inline with \( \) and display with \[ \]). Always
reason through problems step-by-step before stating the final answer. Adapt
your explanation depth to the user's apparent level.
```

### Built-in presets
| Name | Behaviour |
|---|---|
| **Math Tutor** *(default)* | Patient, step-by-step, KaTeX formatting |
| **Socratic** | Guide via questions rather than direct answers |
| **Formalist** | Rigorous, definition-first, formal logic |

Selecting a preset fills the text editor with the preset text and sets
`selectedPreset`. If the user edits the text after selecting a preset, the
picker switches to a "Custom" option.

### Tasks
- [ ] Add `saveAppConfig(_ config: AppConfig)` to `ConfigurationManager`
      (write to `~/.mathmate/config.json` via `JSONEncoder` + atomic write)
- [ ] Add `@Published var systemPrompt: String` and `@Published var selectedPreset`
      to `ConfigurationManager` (or a new `SettingsStore` observable)
- [ ] Create `Views/SettingsView.swift`:
      - `Picker` for preset selection
      - `TextEditor` for the prompt (editable; switches picker to "Custom" on edit)
      - Save button (or auto-save on change)
- [ ] Register `SettingsView` as a `Settings` scene in `MathMate.swift`
      (this gives `Cmd+,` for free on macOS)
- [ ] Update `ChatViewModel.loadConfig()` to observe `ConfigurationManager`
      live — system prompt is re-read from the manager on each `sendMessage`,
      not cached at init time

### Verification
- `swift build` passes
- `swift test` passes
- Changing preset updates the text editor immediately
- Edited prompt persists across app restarts (check `~/.mathmate/config.json`)
- New prompt takes effect on the next message without restarting the app

---

## Feature 2 — Context Management & Visualization

**Detailed plan:** `Implementation_ContextPanel.md`

### Context
No token tracking exists. `StreamToken` has no `usage` field. Providers
discard the final SSE `usage` chunk. `ChatViewModel` sends only one message
per call (conversation history bug — fix here).

### Decisions made
- **Slide-in drawer** from the trailing edge, toggled by a toolbar button
  (`chart.bar.doc.horizontal` SF Symbol) — not a sheet, not a tab
- Drawer width ~320pt; chat and drawer coexist side-by-side
- Token tracking is **per-message** (not just session aggregate)
- **Cost estimation** via a hardcoded pricing table (`ModelPricing.swift`) —
  no live API calls; falls back to `$0.00` for unknown models
- Layout reference: OpenCode's Context panel (see `screenshot.png` in repo root)

### New types (add to `ModelProvider.swift`)

```swift
struct TokenUsage: Codable {
    var promptTokens: Int        // input tokens for this turn
    var completionTokens: Int    // output (non-reasoning) tokens
    var reasoningTokens: Int     // thinking tokens (subset of completion)
    var cacheReadTokens: Int     // OpenRouter prompt-cache read hits
    var cacheWriteTokens: Int    // OpenRouter prompt-cache writes
}
```

Add `usage: TokenUsage?` to `StreamToken` (non-nil only in the final chunk).

### Provider changes — capturing the final usage chunk

**OpenAI/OpenRouter** — the final SSE chunk (before or alongside `[DONE]`)
contains a top-level `"usage"` key:
```json
{ "usage": { "prompt_tokens": 102, "completion_tokens": 2,
             "prompt_tokens_details": { "cached_tokens": 27392 },
             "completion_tokens_details": { "reasoning_tokens": 104 } } }
```
Parse this and yield `StreamToken(thinking: nil, text: nil, usage: tokenUsage)`.

**Anthropic** — emitted as a `message_delta` event:
```json
{ "type": "message_delta",
  "usage": { "input_tokens": 102, "output_tokens": 2 } }
```

### `ChatViewModel` changes
- Fix conversation history bug: build full message history before each call
- After stream completes, attach `TokenUsage` to the assistant `Message`
- Add session-level computed properties:
  - `sessionName: String` — first user message truncated to ~40 chars
  - `sessionStart: Date?` — timestamp of first message
  - `lastActivity: Date?` — timestamp of most recent message
  - `totalTokens`, `totalInputTokens`, `totalOutputTokens`,
    `totalReasoningTokens`, `totalCacheReadTokens`, `totalCacheWriteTokens`
  - `contextLimit: Int` — hardcoded per known model ID; default 128k
  - `estimatedCost: Double` — from `ModelPricing.lookup(model:)`

### `ContextDrawerView` layout (new `Views/ContextDrawerView.swift`)

**Section 1 — 2-column metadata grid:**
Session · Messages / Provider · Model / Context Limit · Total Tokens /
Usage % · Input Tokens / Output Tokens · Reasoning Tokens /
Cache (read/write) · User Messages / Assistant Messages · Total Cost /
Session Created · Last Activity

**Section 2 — Context breakdown bar:**
`GeometryReader`-based segmented bar.
Segments (left to right): System Prompt (grey) · User (green) ·
Assistant (orange) · Reasoning (purple).
Legend with token counts and percentages below.

**Section 3 — Per-message list:**
`List` of all messages. Each row: role · timestamp · token count for that turn.
Each row is a `DisclosureGroup` — expands to show raw text content.

### Layout integration
```swift
// Inside ChatView body
HStack(spacing: 0) {
    chatContent
    if showContextDrawer {
        Divider()
        ContextDrawerView(viewModel: viewModel)
            .frame(width: 320)
            .transition(.move(edge: .trailing))
    }
}
.animation(.spring(duration: 0.25), value: showContextDrawer)
```

### `ModelPricing.swift` (new file, initial entries)
Hardcoded per-million-token pricing for:
`moonshotai/kimi-k2.6`, `openai/gpt-4o`, `anthropic/claude-3-5-sonnet`,
`deepseek/deepseek-r1`. Falls back to `(input: 0, output: 0)` for unknowns.

### Tasks
- [ ] **Atomic Message Migration** (see above) — do this first
- [ ] Add `TokenUsage` struct; add `usage` field to `StreamToken`
- [ ] Update `OpenAIProvider` stream parser to capture final `usage` chunk
- [ ] Update `AnthropicProvider` stream parser to capture final `usage` chunk
- [ ] Fix `ChatViewModel.sendMessage` to pass full conversation history
- [ ] Attach `TokenUsage` to assistant `Message` after stream completes
- [ ] Add session-level computed properties to `ChatViewModel`
- [ ] Create `ContextDrawerView.swift` (3-section layout above)
- [ ] Wire toolbar button + `showContextDrawer` toggle in `MainView.swift`
- [ ] Create `ModelPricing.swift`

### Verification
- `swift build` + `swift test` pass
- Token counts match OpenRouter dashboard for the same session
- Drawer slides in/out without layout jank
- Cost shows `$0.00` gracefully for unknown models
- Conversation history is now sent correctly (model has memory of prior turns)

---

## Feature 3 — Multimodal Support (Text + Image Inputs)

**Detailed plan:** `Implementation_Multimodal.md`

### Context
Primary use case: user drags a textbook screenshot onto the input bar and asks
the agent about it. No URL-based images needed — base64 only.

### Decisions made
- **Symmetric design:** all messages (user and assistant) use `parts: [ContentPart]`
  rather than an asymmetric approach — cleaner long-term, especially for
  Feature 4 (widgets are also a `ContentPart` case)
- **Base64 only** (no URL image sources) — local file / paste / drag-and-drop
- **`MessagePayload`** is a separate provider-layer struct — decouples API
  serialization from UI state (`id`, `isStreaming`, etc. are not sent to provider)
- System prompt moves into `MessagePayload` as a `.system` role entry;
  `systemPrompt` is removed as a separate protocol parameter

### New types (add to `ModelProvider.swift`)

```swift
struct ImageAttachment: Codable {
    enum Source: Codable {
        case base64(data: Data, mimeType: String)
    }
    let source: Source
    let altText: String?
}

enum ContentPart: Codable {
    case text(String)
    case image(ImageAttachment)
    case widget(WidgetSpec)   // added in Feature 4 — declare case now, implement later
}

struct MessagePayload {
    enum Role { case system, user, assistant }
    let role: Role
    let parts: [ContentPart]

    static func text(_ role: Role, _ content: String) -> MessagePayload {
        MessagePayload(role: role, parts: [.text(content)])
    }
}
```

### Updated `ModelProvider` protocol
```swift
protocol ModelProvider: Sendable {
    func streamMessage(
        _ messages: [MessagePayload],
        model: String,
        maxTokens: Int?
    ) -> AsyncThrowingStream<StreamToken, Error>
}
```
`systemPrompt` parameter is removed — the caller (`ChatViewModel`) prepends it
as `MessagePayload.text(.system, prompt)`.

### Provider serialization

**OpenAI/OpenRouter** — if all parts are a single `.text`, use string shorthand.
If any `.image` is present, use the array format:
```json
{ "role": "user", "content": [
    { "type": "text", "text": "What is shown here?" },
    { "type": "image_url", "image_url": { "url": "data:image/jpeg;base64,..." } }
]}
```

**Anthropic** — always use array format when images present:
```json
{ "role": "user", "content": [
    { "type": "image", "source": { "type": "base64",
      "media_type": "image/jpeg", "data": "..." } },
    { "type": "text", "text": "What is shown here?" }
]}
```

### `ChatViewModel` changes
- Build `[MessagePayload]` from full `messages` history on each send
- Prepend system prompt as `.system` role payload
- `pendingImages: [ImageAttachment]` — transient, cleared after send
- Include pending images as `.image` parts in the outgoing user `MessagePayload`

### UI changes

**`MessageRow`** — for user messages with `.image` parts: render a horizontal
strip of rounded thumbnails (max height ~120pt) above the text bubble.
Tapping a thumbnail opens a Quick Look preview.

**Input bar** — add a paperclip button (left of text field):
- `NSOpenPanel` filtered to `jpg`, `png`, `gif`, `webp`, `tiff`
- File read as `Data` → `ImageAttachment(source: .base64(data:mimeType:))`
- Appended to `viewModel.pendingImages`

**Drag and drop** — `.onDrop(of: [.image])` on the input bar area;
`NSItemProvider` → same `ImageAttachment` path.

**Pending images strip** — shown above text field when `pendingImages` non-empty;
each thumbnail has an `×` dismiss button.

### Tasks
- [ ] **Atomic Message Migration** must already be done (Feature 2 prerequisite)
- [ ] Add `ImageAttachment`, `ContentPart`, `MessagePayload` to `ModelProvider.swift`
      (declare `.widget` case now as a stub; full implementation in Feature 4)
- [ ] Update `ModelProvider` protocol signature; remove `systemPrompt` parameter
- [ ] Update `OpenAIProvider` for multimodal `MessagePayload` serialization
- [ ] Update `AnthropicProvider` for multimodal `MessagePayload` serialization
- [ ] Update `ChatViewModel` to build `[MessagePayload]` + manage `pendingImages`
- [ ] Update `MessageRow` to render image thumbnails for user messages
- [ ] Add paperclip button + `NSOpenPanel` to input bar
- [ ] Add drag-and-drop to input bar
- [ ] Add pending images strip with per-image dismiss

### Verification
- `swift build` + `swift test` pass
- Plain-text messages render identically to before (via `content` computed property)
- Image round-trips correctly through base64 encoding
- Thumbnails display in message history after send
- Drag-and-drop accepts PNG and JPEG from Finder
- Test against a vision-capable model: `openai/gpt-4o` or
  `anthropic/claude-3-5-sonnet` via OpenRouter

---

## Feature 4 — Interactive Widgets (Desmos-style)

**Detailed plan:** `Implementation_Widgets.md`

### Context
The agent generates interactive math visualizations (graphs, sliders, geometric
constructions) inline in the chat response. The user's primary reference is
Desmos — the goal is agent-generated, concept-illustrating widgets, not a
general-purpose code execution environment.

### Decisions made
- **Hybrid approach (Option C):** agent outputs a JSON spec; MathMate renders
  it using a pre-built WebView shell loaded with a bundled JS library. The agent
  gets the expressiveness of JSXGraph/Function Plot without MathMate needing to
  anticipate every possible widget type.
- **No code execution** — widgets are declarative specs, not executed code.
  A terminal panel is a separate future feature (see bottom of this doc).
- **JSXGraph** is the primary library (MIT, self-hostable, covers geometry +
  function graphing + sliders + calculus). Function Plot is the lightweight
  fallback for simple 2D curves.
- **Session persistence is a co-feature / hard dependency** of this feature
  (widgets must persist with their session log)
- **JSONL session format**, one file per session (see Session Persistence section)
- Widgets persist automatically — they are `.widget(WidgetSpec)` `ContentPart`
  entries inside `Message.parts`, which is already `Codable`

### Agent output format

The agent emits a fenced code block with language tag `widget`:

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

### New types (add to `ModelProvider.swift`)

```swift
struct WidgetSpec: Codable {
    enum Library: String, Codable {
        case jsxgraph
        case functionPlot
    }
    let type: String       // "graph", "geometry", "plot3d", …
    let library: Library
    let title: String?
    let config: WidgetConfig
}

struct WidgetConfig: Codable {
    // Opaque JSON — passed as-is to the WebView shell
    // Requires custom Codable using JSONSerialization internally
    let raw: [String: Any]
}
```

`ContentPart.widget(WidgetSpec)` — declared as a stub in Feature 3, fully
implemented here.

### Parsing pipeline

Before markdown/LaTeX processing, scan the raw assistant response string for
` ```widget\n…\n``` ` blocks. Analogous to the existing math-placeholder
strategy in `LaTeXNormalizer`:
1. Extract fenced block JSON → parse into `WidgetSpec`
2. Replace block with placeholder token e.g. `[[WIDGET_0]]`
3. After markdown rendering, replace placeholder with a rendered `WidgetView`
4. **During streaming:** buffer until the closing ` ``` ` delimiter is received;
   show a "preparing widget…" placeholder in the meantime

### Bundled JS libraries

Store in `Resources/widgets/` (no network calls at runtime):
```
Resources/widgets/
  jsxgraph.min.js
  jsxgraph.min.css
  function-plot.min.js
  shells/
    shell-jsxgraph.html
    shell-functionplot.html
```

### WebView shell contract

Each shell HTML file:
1. Loads the bundled JS library via relative path
2. Exposes `window.loadWidget(spec)` — called by Swift after page load
3. Posts height updates: `window.webkit.messageHandlers.widgetHeight.postMessage(h)`

### `WidgetView.swift` (new, `Views/WidgetView.swift`)

`WKWebView`-backed SwiftUI view:
- Loads shell HTML keyed on `WidgetSpec.library`
- Calls `window.loadWidget(configJSON)` via `evaluateJavaScript` in
  `webView(_:didFinish:)`
- Implements `WKScriptMessageHandler` for `widgetHeight` → updates SwiftUI frame
- No network access: `WKWebViewConfiguration` with local-only resource policy

### Session Persistence (JSONL)

**Format:** one `.jsonl` file per session in `~/.mathmate/sessions/`.

**Line 1 — session metadata header:**
```jsonl
{"type":"session","id":"uuid","name":"Solving 4y+8=2y","customName":null,"createdAt":"iso8601","lastActivity":"iso8601","model":"gpt-4o","provider":"openrouter"}
```

**Lines 2…n — messages (one per line, append-only):**
```jsonl
{"type":"message","id":"uuid","role":"user","parts":[...],"timestamp":"iso8601"}
{"type":"message","id":"uuid","role":"assistant","parts":[...],"timestamp":"iso8601","tokenUsage":{...}}
```

Widgets serialise as `{"type":"widget","spec":{...}}` inside the `parts` array
via `ContentPart`'s `Codable` conformance — no special handling needed.

**`SessionHeader` struct** (new, in `SessionStore.swift`):
```swift
struct SessionHeader: Codable, Identifiable {
    let id: UUID
    var name: String          // auto-derived: first user message, truncated ~40 chars
    var customName: String?   // non-nil when user has set a custom name
    let createdAt: Date
    var lastActivity: Date
    let model: String
    let provider: String
    var displayName: String { customName ?? name }
}
```

**`SessionStore`** (new, `SessionStore.swift`) — owns all disk I/O:
- `createSession(_ header:)` — writes header line (line 1)
- `appendMessage(_ message:, to sessionId:)` — appends one line
- `updateHeader(_ header:)` — rewrites line 1 via write-to-temp-then-rename
  (atomic, crash-safe)
- `loadHeader(from url:) -> SessionHeader` — reads line 1 only (fast list)
- `loadMessages(for sessionId:) -> [Message]` — reads all lines
- `allHeaders() -> [SessionHeader]` — used by `LogsView` to populate list
- `deleteSession(_ id:)` — deletes the `.jsonl` file

**`ChatViewModel` changes:**
- `currentSession: SessionHeader?` — created lazily on first `sendMessage`
- `sessionStore: SessionStore` — injected
- After each completed assistant response:
  1. `appendMessage` the user message (on send) and assistant message (on complete)
  2. `updateHeader` with new `lastActivity`
- `clearChat()` nils `currentSession`; next send creates a fresh session

**`LogsView`** (upgrade from placeholder):
- Populated via `SessionStore.allHeaders()` — header-only reads, fast
- Displays: display name, model, message count, last activity
- Tapping → loads all messages → read-only session replay view (widgets interactive)
- **Rename:** inline `TextField` on double-click; saves `customName` via `updateHeader`
- **Delete:** swipe-to-delete → `SessionStore.deleteSession`

### System prompt addition (Feature 1 must be done first)

Append to the default Math Tutor prompt:
```
When a concept would benefit from visual exploration, you may generate an
interactive widget using a ```widget code block. Supported libraries:
jsxgraph (geometry, function graphing, sliders, calculus) and functionPlot
(simple 2D curves). Keep configs minimal and focused on the concept at hand.
```

### Tasks
- [x] **Feature 3 must be complete** (ContentPart stub must exist)
- [x] Add `WidgetSpec`, `WidgetConfig` structs to `ModelProvider.swift`
- [x] Implement `.widget(WidgetSpec)` case in `ContentPart` (upgrade from stub)
- [x] Widget block extraction in parsing pipeline (with streaming buffer)
- [x] Download and bundle JSXGraph + Function Plot in `Resources/widgets/`
- [x] Create `shell-jsxgraph.html` and `shell-functionplot.html`
- [x] Create `WidgetView.swift`
- [x] Update `MessageRow` to render `.widget` parts inline
- [x] Create `SessionStore.swift`
- [x] Add `SessionHeader` struct to `SessionStore.swift`
- [x] Update `ChatViewModel` with session lifecycle + `SessionStore` integration
- [x] Upgrade `LogsView` (list, rename, delete, replay view)
- [x] Append widget instructions to default system prompt

### Verification
- `swift build` + `swift test` pass
- Agent-generated widget renders inline with interactive sliders
- Session file written to `~/.mathmate/sessions/` after first response
- Reloading a past session from `LogsView` restores widgets as fully interactive
- No network calls made by widget WebView (verify with a proxy or Charles)

---

## Feature 5 — Terminal Panel *(Future / Nice-to-have)*

A convenience panel (VS Code-style) surfacing the user's shell inside MathMate.
Not a current priority. Relevant once code execution workflows mature alongside
the widget system.

---

## Future: Project Workflow

Bundle a named "Project" containing:
- Obsidian vault
- Custom system prompt
- Link to a PDF textbook
- Preferred model

Enables per-project model, context, and persona configuration. Builds naturally
on top of the global Settings infrastructure (Feature 1) and the session
persistence layer (Feature 4).
