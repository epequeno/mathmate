# Implementation Plan: Timeline Rendering UI

## 1) Goal

Render assistant messages as a chronological timeline of segments (thinking, tool call, tool result, content) and show live streaming directly inside the message list.

---

## 2) UX Constraints

- Reasoning traces must remain visible as plain text (project constraint).
- Streaming content must appear inline in timeline (no detached footer overlay).
- Legacy messages without segments must continue to render.

---

## 3) Scope

### In scope
- Segment renderer in `ChatMessage.tsx` for:
  - `thinking`,
  - `tool_call`,
  - `tool_result`,
  - `content`.
- Live message rendering from `streamSegments`.
- Removal of old footer streaming overlay in `ChatPage.tsx`.
- Auto-scroll tied to `streamSegments` updates.
- Backward-compatible fallback path when `segments.length === 0`.

### Out of scope
- Tool execution backend logic.
- Data model schema design.

---

## 4) Rendering Design

## 4.1 Thinking segments

- Render plain text in monospace block.
- Default **expanded/visible** to satisfy reasoning visibility constraint.
- User may collapse manually via `<details>`.
- During streaming, keep latest thinking segment auto-open.

## 4.2 Tool call segments

- Card with tool name, call id (short), status badge.
- Show arguments as formatted JSON (expandable if long).
- Status colors: pending/running/completed/error.

## 4.3 Tool result segments

- Render short primitive results inline.
- For object/large payloads, show preview + expandable JSON.
- Visual link to matching `tool_call` via `call_id`.

## 4.4 Content segments

- Reuse existing markdown + KaTeX + interactive rendering path.
- Keep as the primary readable response body.

---

## 5) Streaming Behavior

`ChatPage.tsx` should pass live state to the in-progress assistant message:

```tsx
<ChatMessage
  message={liveAssistantMessage}
  isStreaming={true}
  streamSegments={streamSegments}
/>
```

`liveAssistantMessage` is synthetic and uses current stream segment state. Footer overlay for `streamingThinking`/`streamingContent` is removed.

Auto-scroll dependencies become:
- `streamSegments`
- `streaming`

---

## 6) Backward Compatibility

- If a message has no segments, render existing legacy `content` path.
- No visual regression for historical sessions.
- Adapter behavior tested in `ChatMessage` tests.

---

## 7) Feature Flag + Rollout Safety

Ship behind a temporary flag (example: `timeline_ui_v1`) to reduce risk.

- Flag OFF: existing message renderer.
- Flag ON: segment timeline renderer.

Remove flag after:
- parser/tool integration stable,
- no regressions in history rendering,
- streaming behavior validated.

---

## 8) Component Changes

### `ChatMessage.tsx`
- Introduce subcomponents:
  - `ThinkingSegment`
  - `ToolCallSegment`
  - `ToolResultSegment`
  - `ContentSegment`
- Render ordered segment list when present.
- Keep legacy fallback renderer.

### `ChatPage.tsx`
- Use `streamSegments` for live assistant message.
- Remove footer streaming overlay.
- Update auto-scroll dependencies.

### `chatStore.ts`
- Maintain `streamSegments: MessageSegment[]`.
- Reset on stream start.
- Append/update by segment type and tool status.
- Clear when stream finalizes.

---

## 9) Test Plan

- `renders_all_segment_types`
- `thinking_visible_by_default`
- `thinking_plain_text_not_math_rendered`
- `tool_call_status_badges_render`
- `tool_result_expandable_json`
- `content_segment_markdown_katex_still_works`
- `legacy_message_fallback_path`
- `stream_segments_render_inline_no_footer`
- `autoscroll_on_stream_segment_updates`

---

## 10) Files Changed

- `mathmate/src/components/ChatMessage.tsx`
- `mathmate/src/pages/ChatPage.tsx`
- `mathmate/src/stores/chatStore.ts`

---

## 11) Rollout Order

1. Add segment subcomponents (no behavior switch yet).
2. Add fallback-safe segment rendering path.
3. Add `streamSegments` live rendering wiring.
4. Remove footer overlay under feature flag.
5. Validate with mocked segment data.
6. Validate with real tool-call sessions.
7. Remove feature flag and update changelog/dev log.
