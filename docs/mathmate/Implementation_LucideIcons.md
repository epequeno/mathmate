# Implementation Plan: Lucide Icon Migration (Emoji Replacement)

## 1) Goal
Replace UI emoji icons with Lucide SVG icons for consistent, professional cross-platform rendering.

---

## 2) Scope Guardrail (must do first)

Before coding, run a repository-wide emoji sweep and freeze the migration list.
This avoids partial migration and stale counts.

Recommended command:
- search `src/` for emoji/status glyphs used as icons (including warning/close/action symbols).

---

## 3) Re-Baselined Inventory (current review)

In-scope files include at least:
- `src/components/ChatMessage.tsx`
- `src/components/MemoryRetrievalBar.tsx`
- `src/components/Quiz/ProgressiveHint.tsx`
- `src/components/Quiz/MultipleChoice.tsx`
- `src/components/Quiz/FreeResponse.tsx`
- `src/components/ContextPanel.tsx`
- `src/components/MigrationBanner.tsx`
- `src/pages/SettingsPage.tsx`
- `src/pages/ChatPage.tsx`
- `src/components/Sidebar.tsx`
- `src/components/ErrorBoundary.tsx`
- `src/pages/VaultPage.tsx`

> Note: previous plan undercounted scope (e.g. sidebar and error surfaces).

---

## 4) Icon Mapping (proposed)

- Thinking / memory: `BrainCircuit`
- Note/document: `FileText`
- Book/textbook/study log: `BookOpen`
- Chat source: `MessageSquare`
- Hint: `Lightbulb`
- Reveal/solution: `Eye`
- Correct: `CheckCircle2`
- Incorrect: `XCircle`
- Close/dismiss: `X`
- Warning/error: `AlertTriangle`
- Package/archive/migration: `Package` / `Archive` (choose by context)
- Delete/trash: `Trash2`
- Restore/undo: `RotateCcw` (or `Undo2`)
- Settings: `Settings`
- Expand/collapse carets currently using text glyphs can remain text for now unless explicitly included

---

## 5) Implementation Notes

1. Install dependency:
```bash
npm install lucide-react
```

2. Prefer `currentColor` icons and set color via existing text color styles.

3. Keep semantics clear:
- status icon + status text together (not color alone)
- icon-only buttons keep `aria-label`
- decorative inline icons use `aria-hidden="true"`

4. Keep sizing consistent:
- inline text icon: ~14px
- icon-only controls: ~16px
- compact metadata rows: ~12px

---

## 6) File-Level Work Plan

1. Shared/critical surfaces first:
   - `ChatPage.tsx`, `SettingsPage.tsx`, `ErrorBoundary.tsx`, `VaultPage.tsx`
2. Navigation/actions:
   - `Sidebar.tsx`, `ContextPanel.tsx`, `MigrationBanner.tsx`
3. Chat/message surfaces:
   - `ChatMessage.tsx`, `MemoryRetrievalBar.tsx`
4. Quiz components:
   - `ProgressiveHint.tsx`, `MultipleChoice.tsx`, `FreeResponse.tsx`

---

## 7) Acceptance Criteria

- Emoji icon usage in frozen in-scope files is fully replaced or explicitly waived.
- Icon-only buttons preserve/introduce `aria-label`.
- Status indicators remain understandable with icon + text pairing.
- Light/dark mode spacing/alignment remains clean.
- `npm run build` passes.

---

## 8) Validation

- Re-run the same emoji sweep after changes.
- Any remaining matches must be intentional (content text/examples) and documented.
