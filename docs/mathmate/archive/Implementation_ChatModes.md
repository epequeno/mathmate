# Implementation Plan: Per-Chat Tutor Modes (Session-Level Presets)

## 1) Goal
Allow users to pick tutoring behavior per chat session without changing global settings.

---

## 2) Modes
Initial set:
- Math Tutor (default)
- Socratic
- Formalist
- Exam Prep
- Hint-Only

---

## 3) UX
- Add a compact mode picker in chat toolbar.
- Mode applies to subsequent turns in current session.
- Starting a new session resets to global default unless user explicitly changes it.

---

## 4) Prompt Composition
Final system prompt for each request:

`[global system prompt base] + [mode instruction block] + [feature-specific guidance (e.g., widgets)]`

Keep mode blocks short and deterministic.

---

## 5) Data Model
- Add `chatMode` to in-memory `ChatViewModel` session state.
- Optionally persist selected mode into session header metadata for replay/debug.

---

## 6) Task Checklist
- [ ] Add `ChatMode` enum + display metadata
- [ ] Add mode picker to `MainView` toolbar
- [ ] Add mode-aware prompt composer in `ChatViewModel`
- [ ] Persist mode into session metadata (optional but recommended)
- [ ] Add tests for prompt composition and default fallback logic

---

## 7) Acceptance Criteria
- User can switch mode per session quickly.
- Model behavior changes on next message according to chosen mode.
- Global settings remain intact and act as baseline defaults.
