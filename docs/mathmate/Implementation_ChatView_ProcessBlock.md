# Implementation Plan: Chat View — Process Block Redesign

## 1) Goal

Replace the current per-segment rendering (separate `ThinkingSegment` / `ToolCallSegment` / `ToolResultSegment` rows) with a unified **Process Block** that wraps all pre-answer activity — reasoning traces and tool calls — into a single collapsible container. The final `ContentSegment` (the answer) always remains fully visible below it.

This redesign handles two structural cases correctly:
- **Case A — Pure tool calling**: no reasoning, just tool calls and results.
- **Case B — Reasoning with embedded tool calls**: thinking and tool calls interleave in chronological order (as produced by newer reasoning models like o3, Claude 3.7, etc.).

Designs are documented in the Paper file `mathmate` → page `mockups` → artboard **"Chat Message — Process Block Exploration"**.

---

## 2) UX Spec

### 2.1 Process Block anatomy

```
┌─────────────────────────────────────────────────┐
│ ▶  Reasoning · 2 tool calls          ← header  │
│ ─────────────────────────────────────────────── │  (expanded)
│   "I should check the user's notes…"            │  ← thinking chunk (italic)
│   ✓  Searched notes for "integration"  4 results│  ← tool row
│   "Found it. Now check partial fractions…"      │  ← thinking chunk
│   ✓  Searched notes for "partial fractions"     │  ← tool row
└─────────────────────────────────────────────────┘
Answer text lives here, always visible…
```

### 2.2 Header label rules

| Segments present           | Header text                     |
|----------------------------|---------------------------------|
| Only tool calls            | `Used N tool(s)`                |
| Only thinking              | `Reasoning`                     |
| Both thinking + tool calls | `Reasoning · N tool call(s)`    |

### 2.3 Collapsed / expanded states

- **Default (finished message)**: collapsed — only header visible, chevron pointing right.
- **Streaming (in-progress)**: auto-expanded, header shows spinner + `"Thinking…"` or `"Working…"`.
- **On stream completion**: animates to collapsed.
- User can toggle manually at any time after completion.

### 2.4 Interior rendering (expanded)

Segments are rendered in strict chronological order (as stored in `message.segments`):

- **`thinking` segment** → italic 12px text with a subtle left-border (`border-left: 2px solid var(--color-border)`), indented 12px from left edge.
- **`tool_call` + `tool_result` pair** → single tool row (see §2.5). The result is merged into the call row — no separate `tool_result` row in the process block.
- **`content` segment** → NOT rendered inside the process block. Rendered below it as the answer.

### 2.5 Tool row (collapsed)

```
[status icon]  Humanized label              result summary  [›]
```

- **Status icon**: green ✓ circle (completed), blue spinner (running), red ⚠ circle (error).
- **Humanized label**: produced by `formatToolCall(name, args)` — see `Implementation_ChatView_ToolFormat.md`.
- **Result summary**: produced by `formatToolResult(name, result, isError)` — e.g. `4 results`, `created`, `error`.
- **Chevron**: clicking the row expands its detail panel inline.

### 2.6 Tool row (expanded detail)

```
[status icon]  Humanized label              result summary  [˅]
─────────────────────────────────────────────────────────────
INPUT
  calculate({ expression: "sin(pi/6)^2 + cos(pi/6)^2" })

OUTPUT
  [tool-specific rendered output]
```

- **INPUT section**: function-call style in Fira Code 11px on `--color-surface` background.
- **OUTPUT section**: tool-specific renderer (see `Implementation_ChatView_ToolFormat.md` §3). Falls back to scrollable raw JSON block for unknown tools.
- Expanded state is local to the row — other rows stay collapsed.

---

## 3) Component Architecture

### New component: `ProcessBlock`

```tsx
// src/components/chat/ProcessBlock.tsx
interface ProcessBlockProps {
  segments: MessageSegment[];   // all non-content segments, in order
  isStreaming?: boolean;
}
```

Internal subcomponents (all in same file or colocated):
- `ProcessBlockHeader` — label + chevron + spinner
- `ThinkingRow` — italic text with left-border
- `ToolRow` — collapsed and expanded states

### Updated: `ChatMessage.tsx`

Split segment list into two groups before rendering:

```ts
const processSegments = effectiveSegments.filter(s => s.type !== "content");
const contentSegments = effectiveSegments.filter(s => s.type === "content");
```

Replace the existing `TimelineSegment` map with:

```tsx
{processSegments.length > 0 && (
  <ProcessBlock segments={processSegments} isStreaming={isStreaming} />
)}
{contentSegments.map(seg => (
  <ContentSegment key={seg.id} text={seg.text} isStreaming={isStreaming} />
))}
```

### Pairing tool_call with tool_result

`tool_call` and `tool_result` segments are stored as separate entries in `message.segments` (linked by `call_id`). `ProcessBlock` must pair them before rendering:

```ts
function pairToolSegments(segments: MessageSegment[]): ProcessEntry[] {
  // Walk segments in order. When a tool_call is encountered, hold it.
  // When a matching tool_result arrives (by call_id), merge into one entry.
  // Thinking segments pass through as-is.
  // Unpaired tool_calls (still running) render with status from segment.status.
}

type ProcessEntry =
  | { type: "thinking"; segment: ThinkingSegment }
  | { type: "tool"; call: ToolCallSegment; result?: ToolResultSegment };
```

---

## 4) Streaming Behavior

During streaming, `isStreaming=true` is passed to `ProcessBlock`. Behavior:

1. Block is **auto-expanded**.
2. Header shows spinner icon + label updating dynamically (`"Thinking…"` when last segment is thinking, `"Working…"` when last is a tool_call with `status: "running"`).
3. Each new segment appends to the interior in real-time as `streamSegments` updates.
4. Tool rows show spinner icon until their matching `tool_result` arrives, then switch to ✓.
5. On stream end (`isStreaming` becomes `false`): block animates collapsed (CSS transition on `max-height`).

---

## 5) Collapse Animation

Use a `max-height` CSS transition for smooth open/close:

```css
.process-block-body {
  overflow: hidden;
  transition: max-height 0.25s ease;
}
/* collapsed */  max-height: 0;
/* expanded */   max-height: 600px;  /* safe upper bound */
```

Avoid `height: auto` transitions (not animatable). The `600px` cap is fine — process blocks exceeding this get an internal scroll.

---

## 6) State Management

All collapse state is **local to the component** (`useState`). No store changes needed.

```ts
const [isExpanded, setIsExpanded] = useState(false);  // default collapsed

// Auto-expand when streaming starts
useEffect(() => {
  if (isStreaming) setIsExpanded(true);
}, [isStreaming]);

// Collapse when streaming ends
useEffect(() => {
  if (!isStreaming) {
    const t = setTimeout(() => setIsExpanded(false), 300); // small delay
    return () => clearTimeout(t);
  }
}, [isStreaming]);
```

---

## 7) Files Changed

| File | Change |
|------|--------|
| `src/components/chat/ProcessBlock.tsx` | **New** — process block + all sub-renderers |
| `src/components/ChatMessage.tsx` | Replace `TimelineSegment` map with `ProcessBlock` + `ContentSegment` |
| `src/components/chat/` | New directory for chat sub-components |

No changes to stores, Rust backend, or session format.

---

## 8) Backward Compatibility

- Legacy messages (no segments) continue to use the existing fallback rendering path in `ChatMessage.tsx` — unchanged.
- The `timelineEnabled` feature flag continues to gate the new path.
- After validating in production, remove the flag and the legacy path.

---

## 9) Test Plan

- `process_block_hidden_when_no_process_segments`
- `process_block_shows_only_tool_calls_case_a`
- `process_block_interleaves_thinking_and_tools_case_b`
- `process_block_collapsed_by_default_after_stream`
- `process_block_auto_expands_during_streaming`
- `process_block_collapses_on_stream_end`
- `tool_row_expands_on_click`
- `tool_row_shows_error_state`
- `tool_call_paired_with_result_by_call_id`
- `content_segment_always_outside_process_block`
- `legacy_message_fallback_unaffected`

---

## 10) Rollout Order

1. Create `src/components/chat/` directory.
2. Implement `ProcessBlock` with static data (no streaming wiring yet). Verify against Paper mockup.
3. Wire `ChatMessage.tsx` to use `ProcessBlock` behind existing `timelineEnabled` flag.
4. Add streaming auto-expand/collapse behavior.
5. Validate with real sessions (Case A and Case B).
6. Remove `timelineEnabled` flag if stable.
7. Update changelog and dev log.
