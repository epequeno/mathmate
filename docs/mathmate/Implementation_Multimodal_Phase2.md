# Implementation Plan: Multimodal Input (Images) — Phase 2

## 1) Goal
Finish production-ready image input for tutoring workflows (homework screenshots, textbook snippets, whiteboard photos).

---

## 2) Scope
- File picker attachment (paperclip)
- Drag-and-drop image attachment
- Clipboard paste image attachment
- Pending image strip before send
- User message thumbnail rendering
- Provider payload correctness for OpenAI-compatible and Anthropic APIs

---

## 3) Data/Provider Requirements
- Reuse existing `ContentPart.image(ImageAttachment)`.
- Ensure `MessagePayload` serialization supports mixed text + image arrays.

### OpenAI-compatible format
```json
{"role":"user","content":[
  {"type":"text","text":"..."},
  {"type":"image_url","image_url":{"url":"data:image/png;base64,..."}}
]}
```

### Anthropic format
```json
{"role":"user","content":[
  {"type":"image","source":{"type":"base64","media_type":"image/png","data":"..."}},
  {"type":"text","text":"..."}
]}
```

---

## 4) UI/UX Requirements
- Input bar:
  - paperclip button,
  - supports drop target highlight,
  - supports paste (`Cmd+V`) when image exists in clipboard.
- Pending strip:
  - thumbnail cards,
  - remove (`x`) per item.
- Message history:
  - user-side thumbnails above bubble,
  - click to preview (Quick Look or lightweight image sheet).

---

## 5) Task Checklist
- [x] Add `attachImage` action (file picker) in `ChatView`
- [x] Add drag/drop handlers for image UTTypes
- [x] Add clipboard image paste handler
- [x] Add pending thumbnail strip + remove action
- [x] Ensure `ChatViewModel.sendMessage` includes pending images in outgoing parts (already in place)
- [x] Ensure providers serialize image blocks correctly
- [x] Render image thumbnails in `MessageRow`
- [x] Add tests for payload shape + MIME mapping

---

## 6) Acceptance Criteria
- User can attach one or many images before send.
- Images are visible in pending strip and message history.
- Vision-capable models receive valid payloads and respond correctly.
- Text-only flows are unchanged.
