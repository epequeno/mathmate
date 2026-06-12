# Implementation Plan: Inline LaTeX Composer

## 1) Goal
Allow users to write math directly in the chat composer and see it rendered inline while composing, without changing what is sent to the model (raw source text remains canonical).

---

## 2) Scope

### In scope
- Live math rendering in the composer experience
- Support for `$...$`, `$$...$$`, `\\(...\\)`, `\\[...\\]`
- Raw-source preservation for send/retry/session persistence
- Keyboard-safe editing behavior for mixed text + math input

### Out of scope (Phase 1)
- Full WYSIWYG rich-text math attachments in saved transcript
- Equation numbering/cross-reference tooling
- Collaborative multi-cursor editing

---

## 3) Delivery Strategy

### Phase A (MVP, low risk)
- Keep existing text input as source of truth
- Add **live rendered preview** directly above input
- Reuse `LaTeXView` + `LaTeXNormalizer` pipeline for parity with assistant rendering
- Debounce updates (~80–120ms) to avoid render churn

### Phase B (true inline rendering)
- Introduce AppKit-backed composer (`NSTextView`) via `NSViewRepresentable`
- Tokenize text into plain spans + math spans
- Render math spans inline while maintaining hidden/raw backing text
- Enter “edit math source” mode when cursor enters math span

---

## 4) Architecture

## 4.1 New components
- `MathComposerView` (new): composer wrapper + preview orchestration
- `MathComposerParser` (new): span tokenization for inline vs display math
- `MathComposerState` (new): source text, cursor/range, render cache

## 4.2 Existing integration points
- `MainView.ChatView.inputBar` → replace direct `TextField` usage with `MathComposerView`
- `ChatViewModel.input` remains canonical payload for send/retry/persistence
- `LaTeXView` reused for preview rendering (Phase A) and optional span snapshots (Phase B)

---

## 5) UX Requirements
- Users can type plain text + LaTeX in one composer.
- Preview updates while typing and visually differentiates display blocks.
- Sending transmits raw text exactly as authored.
- Shift+Enter/newline and Enter/send behavior remains unchanged.
- Pasting mixed content should not break delimiters.

---

## 6) File-by-File Tickets

### Ticket C1 — Composer MVP shell
**New files:**
- `Sources/MathMate/Views/MathComposerView.swift`

**Modify:**
- `Sources/MathMate/Views/MainView.swift`

**Tasks:**
- Add composer container with source editor + preview panel
- Bind to `ChatViewModel.input`
- Preserve existing send keyboard semantics

### Ticket C2 — Live preview pipeline
**New files:**
- `Sources/MathMate/Rendering/MathComposerPreviewModel.swift`

**Tasks:**
- Debounced preview update logic
- Render via `LaTeXView(content:)`
- Fallback behavior for malformed delimiters (show source as text)

### Ticket C3 — Parser foundation for true inline mode
**New files:**
- `Sources/MathMate/Rendering/MathComposerParser.swift`

**Tasks:**
- Deterministic tokenization of math delimiters
- Span model for plain/math/display segments
- Cursor-safe boundary mapping helpers

### Ticket C4 — Inline AppKit editor (Phase B)
**New files:**
- `Sources/MathMate/Views/MathComposerTextView.swift`

**Tasks:**
- Wrap `NSTextView` in `NSViewRepresentable`
- Inline span styling + math chips
- Source-edit mode for selected math span

### Ticket C5 — Tests
**Modify/New tests:**
- `Tests/MathMateTests/MathMateTests.swift` (or split into dedicated composer test file)

**Coverage:**
- delimiter parsing stability
- malformed delimiter recovery
- source preservation on send/regenerate/retry
- newline/send keyboard behavior

---

## 7) Acceptance Criteria
- Composer supports mixed prose/math authoring with live render feedback.
- Sent message content equals authored raw source text.
- No regression to existing chat send/retry flow.
- `swift build` and `swift test` pass.

---

## 8) Rollout
1. Ship Phase A behind a settings flag (`Inline math composer preview`).
2. Collect usability feedback for cursor/editing pain points.
3. Implement Phase B true-inline editor behind experimental toggle.
4. Promote Phase B to default once parser/edit behavior is stable.
