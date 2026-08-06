# Implementation Plan: Chat Performance + Native Primitives + Response Containerization

## 1) Goal
Deliver a chat experience that stays smooth and memory-efficient as sessions grow to hundreds of messages, while introducing structured, flaggable, natively rendered teaching interactions.

This plan merges three previously separate efforts:

| Effort | Origin | Status |
|--------|--------|--------|
| **Scroll performance** | Performance audit (2026-05-21) | New — Phase 8 |
| **Native teaching primitives** | [`Implementation_NativeTeachingPrimitives.md`](Implementation_NativeTeachingPrimitives.md) | Planned — was Phase 9 "Needs further review" |
| **ResponseUnit containerization** | Architecture discussion (2026-05-21) | New — proposed |

---

## 2) Current State (Baseline)

### What already works well
- `LazyVStack` for the message list.
- 80ms debounce on `LaTeXView` streaming updates.
- `LaTeXNormalizer.renderAsHTML()` runs on a background thread.
- Single-page WKWebView with JS content updates.
- Auto-compaction at 85% context usage.
- Widget block parser extracts `widget` blocks into `ContentPart` items.
- Tool events displayed in expandable timeline UI.
- Per-message flagging (single bit).

### Problems

| # | Problem | Affects |
|---|---------|---------|
| P0 | `ContentPart` has no stable identity — `ForEach(…, id: \.offset)` causes view churn when parts are inserted | Scroll perf + native primitives |
| P0 | Shared `webViewHeight` across multiple `LaTeXView`s in one message — only last one sizes correctly | Scroll perf |
| P0 | No `Equatable` on `MessageRow` — every row re-evaluates on every frame during streaming | Scroll perf |
| P1 | One WKWebView per message + one per widget = unbounded WebKit process allocation | Scroll perf |
| P1 | `contextTokensUsed` iterates all messages on every toolbar render pass | Scroll perf |
| P1 | Assistant output is a flat bucket — no way to distinguish thinking from explanation from quiz from tools | Response containerization |
| P1 | Memory extraction, wrap-up, and compaction have no signal about which parts of a response matter | All downstream features |
| P2 | Teaching interactions are generic WKWebView widgets — no structured quiz/hint/reveal UX, no attempt tracking | Native primitives |
| P2 | Image base64 data held in memory for the session lifetime | Scroll perf |

---

## 3) Architecture: ResponseUnit Containerization

The central architectural change is introducing **top-level units within a Message**, each independently typed, named, and flaggable.

### 3.1 Data Model

```swift
/// A named, typed segment within an assistant message.
enum ResponseUnit: Identifiable, Codable, Sendable {
    /// Unique and stable — assigned once during streaming, never changes.
    var id: UUID { ... }

    /// The role this unit plays in the response.
    let type: ResponseUnitType

    /// Ordered content parts within this unit.
    var parts: [ContentPart]

    /// Tool events scoped to this unit (only meaningful for `.toolBlock`).
    var toolEvents: [ToolEvent]

    /// Per-unit flag for importance signaling.
    var isFlagged: Bool

    /// User-visible title (e.g. "Thinking", "Explanation", "Quiz Card", "Tools").
    let displayLabel: String
}

enum ResponseUnitType: String, Codable, Sendable, CaseIterable {
    case thinking       // Raw reasoning trace — can collapse by default
    case explanation    // Teaching text + LaTeX — primary flag target
    case toolBlock      // Tool invocations + results
    case quizCard       // Native quiz primitive (free_response, multiple_choice)
    case hint           // Progressive hint stage
    case solutionReveal // Hidden solution, explicit user reveal
    case summary        // Compacted context — not flaggable
    case image          // Response-attached image
}
```

### 3.2 Message model migration

```swift
// Current
struct Message: Identifiable, Codable {
    var parts: [ContentPart]       // flat
    var thinkingText: String       // parallel field, rendered separately
    var toolEvents: [ToolEvent]    // parallel field, rendered separately
    var isFlagged: Bool            // one bit for everything
}

// Proposed
struct Message: Identifiable, Codable {
    var units: [ResponseUnit]      // ordered, typed segments
    // Backward compat computed properties:
    var parts: [ContentPart]       // flat map over all units
    var thinkingText: String       // .thinking units joined
    var toolEvents: [ToolEvent]    // .toolBlock events
    var isFlagged: Bool            // true if ANY unit.isFlagged
}
```

### 3.3 Streaming pipeline changes

When the stream parser assembles assistant output, it detects unit boundaries and creates `ResponseUnit` items. Boundary detection uses a two-tier strategy:

**Tier 1 — Explicit model markers (preferred):**
The tool contract tells the model to emit markers. The `create_widget_spec` tool's output includes a `responseUnit` field:

```json
{
  "library": "mathmate-native",
  "type": "mm.quiz.free_response",
  "responseUnit": "quizCard",
  "config": { ... }
}
```

**Tier 2 — Heuristic boundaries (fallback):**
- Thinking → Explanation transition: detected when the model switches from internal monologue markers (no special characters needed) to didactic language.
- Tool call boundaries: natural unit boundary when the model invokes a tool.
- Widget block boundaries: natural unit boundary when a ````widget` fence is found.
- Newline-paragraph separators between semantically distinct blocks.

**Open unit pattern during streaming:**
At any point during streaming, the assistant message has exactly one **open unit** receiving content. When a boundary is detected, the open unit is sealed and a new one is opened.

```swift
// During streaming:
message.units = [
    .thinking(id: u1, parts: [.text("Let me think...")]),     // sealed
    .explanation(id: u2, parts: [.text("So we can factor...")]), // sealed
    // open unit receiving content:
    .toolBlock(id: u3, parts: [], toolEvents: [ToolEvent{write_file}]) // ← open
]
```

---

## 4) Phased Execution Plan

### Phase A — Foundation (prerequisites for everything)

**Goal**: Fix the correctness issues that would cause flicker and wasted work for all downstream changes.

#### A1 — Stable `ContentPart` identity
- Add `id: UUID = UUID()` to `ContentPart`.
- Assign at creation time in the streaming assembly pipeline.
- Never changes for an existing `.text` part when content is appended (only the string changes).
- Update `ForEach` in `MessageRow` to use stable ID instead of `\.offset`.

**Files**: `Models/ModelProvider.swift`, `Views/MainView.swift`

#### A2 — Per-part height tracking
- Replace single `@State var webViewHeight: CGFloat` with `@State var partHeights: [UUID: CGFloat]` keyed by `ContentPart.id`.
- Pass derived `Binding<CGFloat>` to each `LaTeXView`.

**Files**: `Views/MainView.swift`

#### A3 — `Equatable` conformance on `Message` / `MessageRow`
- Fast equality check: `id == id && isStreaming == isStreaming && isFlagged == isFlagged && parts.count == parts.count && content.count == content.count && thinkingText.count == thinkingText.count && toolEvents.count == toolEvents.count`.
- Wrap `MessageRow` in `EquatableView`.

**Files**: `ViewModels/ChatViewModel.swift`, `Views/MainView.swift`

#### A4 — Cached incremental token count
- Add `cachedTotalTokens: Int` property, updated on message append/token-usage-set.
- Toolbar reads cached value instead of O(n) iteration.

**Files**: `ViewModels/ChatViewModel.swift`, `Views/MainView.swift`

#### A5 — `ResponseUnit` data model + streaming assembly
- Define `ResponseUnit`, `ResponseUnitType` in model layer.
- Refactor `Message.units` from `[ContentPart]` to `[ResponseUnit]`.
- Backward-compat computed properties (`parts`, `thinkingText`, `toolEvents`, `isFlagged`).
- Update streaming assembly to detect boundaries and create units.
- `MessageRow` renders `ForEach(message.units)` with per-unit `VStack`.

**Files**: 
- `Models/ModelProvider.swift` — add types
- `ViewModels/ChatViewModel.swift` — streaming pipeline refactor
- `Views/MainView.swift` — `MessageRow` renders units

**Risk**: This is the most invasive change. The streaming pipeline is subtle. Mitigation: keep computed properties matching the old flat interface so all existing code paths (persistence, history replay, compaction serialization) work without changes.

---

### Phase B — Native Primitives

**Goal**: Replace WKWebView-based widgets for teaching interactions with native SwiftUI views that support structured quiz/hint/reveal UX.

The detailed plan is in [`Implementation_NativeTeachingPrimitives.md`](Implementation_NativeTeachingPrimitives.md). Below is the condensed ticket list:

#### B1 — Schema + validator
- `Sources/MathMate/NativeWidgets/Schema/MathMatePrimitiveSchema.swift`
- `Sources/MathMate/NativeWidgets/Schema/MathMatePrimitiveValidator.swift`
- Codable primitive models + strict validation with structured errors.

#### B2 — Native renderer registry
- `Sources/MathMate/NativeWidgets/MathMateNativeWidgetView.swift`
- `Sources/MathMate/NativeWidgets/MathMatePrimitiveRegistry.swift`
- Branch on `library == "mathmate-native"` in `WidgetView` or new `ResponseUnit` routing.
- Type-to-view mapping.

#### B3 — Quiz primitives
- `Sources/MathMate/NativeWidgets/Primitives/MMQuizFreeResponseView.swift`
- `Sources/MathMate/NativeWidgets/Primitives/MMQuizMultipleChoiceView.swift`

#### B4 — Hint + reveal primitives
- `Sources/MathMate/NativeWidgets/Primitives/MMProgressiveHintView.swift`
- `Sources/MathMate/NativeWidgets/Primitives/MMRevealSolutionView.swift`

#### B5 — Function graph primitive
- `Sources/MathMate/NativeWidgets/Primitives/MMFunctionGraphView.swift`
- Rendered as native SwiftUI + Core Graphics (not WKWebView).

#### B6 — Interaction state persistence
- `Sources/MathMate/NativeWidgets/State/PrimitiveInteractionStore.swift`
- Session-local persistence for hint/reveal/answer state per primitive instance.

#### B7 — Tool contract + prompts
- Update `create_widget_spec` tool prompt to encourage `library: "mathmate-native"` for quiz/tutor interactions.
- Add `responseUnit` field to tool spec output for unit boundary detection (feeds A5).

#### B8 — Tests
- `Tests/MathMateTests/NativePrimitiveSchemaTests.swift`
- `Tests/MathMateTests/NativePrimitiveRenderTests.swift`
- `Tests/MathMateTests/QuizRevealStateTests.swift`
- `Tests/MathMateTests/ResponseUnitMigrationTests.swift`

---

### Phase C — Flag-Based Intelligence

**Goal**: Use per-unit flags to drive smarter memory extraction, wrap-up generation, and compaction.

#### C1 — Unit-based flagging UI
- `MessageRow` shows per-unit flag button (hover + orange fill when flagged).
- For multi-unit messages, the flag icon appears on each unit instead of one per message.
- Flag toggle persists `unit.isFlagged` → `message.units[index].isFlagged.toggle()`.

**Design constraints**:
- Flag icon should be unobtrusive (small, hover-only, same size as today).
- Visual: a subtle vertical bar or dot alongside each unit, not a floating button.
- Keep the current per-message aggregate flag for backward compat.

#### C2 — Flag-weighted memory extraction
- `MemoryEngine.retrieveRelevantMemory` gains an additional signal source: flagged units from recent messages.
- Compose a "priority context" string from flagged unit content, appended to the topic hints query.
- Flagged unit content has a higher weight in TF-IDF / scoring.

**Change in `ChatViewModel._topicHints`**:
```swift
// Current: only latest user message
let topicHints = _topicHints(from: latestUserMessage)

// Proposed: latest user message + recent flagged assistant units
let priorityContent = recentAssistantMessages
    .flatMap { $0.units }
    .filter { $0.isFlagged }
    .map { $0.content }
    .joined(separator: "\n")
```

#### C3 — Flag-preserving compaction
- When `_findCompactionCutIndex` decides which messages to summarize, flagged units are preserved even if they're in the older region.
- The compaction summary includes flagged unit content verbatim as an "Important: keep" block.
- `SessionCompactionEntry` gains a `flaggedUnitIds: [UUID]` field.

**Change in `_serializeForCompaction`**:
```swift
// Current: all messages equally collapsed
// Proposed: flagged units serialized verbatim; unflagged units summarized
```

#### C4 — Wrap-up integration
- `_buildWrapUpPrompt` identifies flagged units and adds a directive:
  ```
  The user specifically marked the following segments as important — preserve more detail for these:
  [flagged unit content verbatim]
  ```
- This gives the wrap-up model concrete "keep this" signals instead of relying on full-context summarization.

#### C5 — `/flags` command upgrade
- Show per-unit flags with unit type in the output.
- Allow filtering by unit type: `/flags type:explanation`.

---

### Phase D — Eliminate Remaining WKWebViews

**Goal**: After Phases A–C, the only remaining WKWebViews are `LaTeXView` instances for text rendering and any legacy JSXGraph/functionPlot widgets. Eliminate both.

#### D1 — Snapshot completed LaTeXViews
- When `Message.isStreaming` transitions `true` → `false`, capture the `WKWebView` content as a static `NSImage` via `takeSnapshot`.
- Replace the live `LaTeXView` with `Image(nsImage: snapshot)` at the captured height.
- The WKWebView is released after snapshot.

**Rationale for deferring to Phase D**: Phase B already eliminates widget WKWebViews. Phase A makes per-part height tracking correct. The snapshot machinery only needs to cover the remaining LaTeX rendering case. This is simpler and less risky to implement last.

#### D2 — Offscreen `LaTeXSnapshotPool`
- For messages loaded from persistence (session restore), queue rendering through a pool of 2–3 reusable offscreen WKWebViews.
- Process requests serially, return `NSImage` via async/await.
- Dark mode changes → invalidate cache, re-render visible messages.

#### D3 — Legacy widget caps
- For existing JSXGraph/functionPlot widgets (created before model adopts `mathmate-native`):
  - Cap at 1 live WKWebView widget at a time.
  - Snapshot immediately after load completes (no interaction needed for static graphs).
  - Show a "Tap to interact" overlay on static snapshots that re-inflates the WKWebView on click.

#### D4 — Lazy image loading
- Move image data from in-memory `ImageAttachment.source` to file-based storage (keyed by attachment UUID).
- Load on-demand in `ImageThumbnail` / `ImageMessageView` `onAppear`.
- `NSCache` for recently-viewed images.

---

## 5) Execution Order & Dependencies

```
Phase A — Foundation (A1–A5)
  │
  ├──→ Phase B — Native Primitives (B1–B8)
  │         │
  │         └──→ Phase C — Flag-Based Intelligence (C1–C5)
  │
  └──→ Phase D — Eliminate WKWebViews (D1–D4)
```

| Dependency | Why |
|------------|-----|
| A1–A3 must precede B1–B8 | Native primitives need stable identity and correct height tracking to avoid flicker |
| A5 must precede B1–B8 | `ResponseUnit` containerization is the rendering foundation for native primitives |
| B1–B8 must precede C1–C5 | Flag-based intelligence needs native primitive types as unit types to flag |
| A1–A4 must precede D1 | Snapshotting needs per-part height tracking and Equatable to avoid redundant snaps |
| B1–B8 may precede or follow D1 | Independent — snapshotting LaTeXViews is orthogonal to native primitives |

---

## 6) Testing Strategy

### Phase A tests
- `ContentPart` identity stability test: parts should not change ID when text is appended.
- `Message` `Equatable` correctness: equality check passes when only unrelated messages change.
- `ResponseUnit` round-trip: encode/decode preserves unit structure, flag state, and ordering.
- `ResponseUnit` backward compat: messages encoded with old `parts`–`thinkingText`–`toolEvents` flat schema still load correctly.
- Streaming boundary detection: verify that thinking, explanation, tool, and widget boundaries produce correct unit sequences.

### Phase B tests
- Schema validation success/failure for each primitive type.
- Reveal/hint state transitions.
- Persistence restore correctness.
- Malformed spec safe fallback.

### Phase C tests
- Flagged units survive compaction cut boundaries.
- Memory extraction query includes flagged unit content.
- Wrap-up prompt includes flag-based directives.

### Phase D tests
- Snapshot fidelity: visual comparison of live render vs snapshot for 20 representative message types.
- Memory profiling: Instruments Allocations to confirm ≤5 live WKWebViews regardless of conversation length.
- Scroll profiling: Instruments SwiftUI profiler — ≤2 dropped frames per full scroll through 100+ messages.

---

## 7) Performance Targets

| Metric | Current (estimate) | Target |
|--------|-------------------|--------|
| Live WKWebViews in a 100-message session | ~50–150 (LaTeXViews + widgets) | ≤3 (1 streaming + 2 snapshot pool) |
| Memory per session message (avg) | ~3–20 MB (WebKit process) | ~50–500 KB (native views + optional snapshots) |
| Frame drops during fast scrollback (100 msgs) | Unknown (untested) | ≤2 |
| Streaming CPU overhead from unnecessary view re-evals | Per-frame O(n) over all rows | Near-zero for unchanged rows (Equatable) |
| Toolbar token count computation | O(n) per render pass | O(1) (cached) |

---

## 8) Risk & Mitigation

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| `ResponseUnit` migration breaks session persistence | Medium | Backward-compat computed properties + migration test for old-format messages |
| Streaming assembly complexity from unit boundary detection | Medium | Start with explicit model markers (Tier 1); add heuristic fallback (Tier 2) only if needed |
| `WKWebView.takeSnapshot` fails for very tall messages | Low | Tile snapshots at viewport height; composite into single `NSImage` |
| Dark mode invalidates cached snapshots | Low | Listen for `effectiveAppearanceDidChangeNotification`; clear cache; re-render visible messages |
| Native primitives don't cover enough teaching use cases | Medium | Start with 5 primitives (quiz free response, multiple choice, progressive hint, solution reveal, function graph). Add more based on usage data. |
| Model doesn't reliably emit `mathmate-native` specs | Medium | Keep WKWebView fallback path for legacy widget specs; add prompt-tuning iteration in B7 |
| Flag-based intelligence doesn't improve wrap-up quality | Low | A/B test flagged vs unflagged wrap-ups; roll back C4 if no improvement |