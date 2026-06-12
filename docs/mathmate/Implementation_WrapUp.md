# Implementation Plan: Session Wrap-Up (Two-Step) + Obsidian Notes

## 1) Goal
Add a deliberate end-of-session flow that helps users convert a chat into structured study notes and save them into Obsidian.

This is a **two-step UX**:
1. **Generate Wrap-Up** (preview in-app, editable)
2. **Save to Obsidian** (explicit confirmation write)

---

## 2) User Experience

### Entry point
- Add a toolbar button in `ChatView` (e.g. `checklist` or `flag.checkered`) labeled **Wrap Up**.

### Step A - Generate
- Clicking Wrap Up opens a modal/sheet with:
  - generated markdown draft,
  - regenerate button,
  - editable text area,
  - optional title field.

### Step B - Save
- User clicks **Save to Obsidian**.
- App writes markdown to configured destination:
  - `appConfig.obsidian.studyLogPath` if present,
  - fallback: `<vault>/MathMate/Study Logs/`.
- Show success toast/banner with file path and "Open in Obsidian" action.

---

## 3) Output Format (Markdown)
Use a stable template:

```md
# Session Wrap-Up - {{date}} - {{topic/title}}

## Summary
...

## Key Concepts
- ...

## Important Formulas
- ...

## Common Mistakes / Pitfalls
- ...

## Practice Plan (Next 3 Steps)
1. ...
2. ...
3. ...

## Open Questions
- ...
```

Optional footer:
- model/provider used,
- session ID,
- timestamps.

---

## 4) Architecture Changes

### `ChatViewModel`
- Add `wrapUpState` + `isGeneratingWrapUp`.
- Add `generateWrapUpDraft()`:
  - builds a condensed prompt from session messages,
  - requests markdown output from current provider,
  - stores result in `wrapUpDraft`.
- Add `saveWrapUpToVault()`:
  - resolves vault + study log directory,
  - sanitizes filename,
  - writes UTF-8 markdown.

### New helper type
- `WrapUpDraft` struct:
  - `title`, `markdown`, `generatedAt`, `sessionId`.

### UI
- New `WrapUpSheetView`:
  - title field,
  - markdown editor,
  - regenerate + save actions.

---

## 5) Safety & Policy
- Saving is a mutating action and should follow existing mutation policy patterns.
- Do not write outside selected vault root.
- If no vault configured, disable save and show actionable guidance.

---

## 6) Task Checklist
- [x] Add Wrap Up toolbar button in `MainView.swift`
- [x] Add wrap-up state/methods in `ChatViewModel.swift`
- [x] Create `WrapUpSheetView.swift`
- [x] Implement markdown template + generation prompt
- [x] Implement save path resolution via `ConfigurationManager`
- [x] Implement write + success/error UI feedback
- [x] Add "Open in Obsidian" action on success
- [x] Add tests for filename sanitization and path guardrails

---

## 7) Acceptance Criteria
- User can generate and edit a wrap-up draft without writing to disk.
- User can explicitly save to Obsidian in a second step.
- Saved files are valid markdown and appear in configured vault path.
- Failures (no vault/path issues/write errors) are clearly surfaced.
