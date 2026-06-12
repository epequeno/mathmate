# Implementation Plan: Searchable LaTeX Element Palette

## 1) Goal
Add a searchable insertion menu that helps users quickly find and insert common LaTeX constructs into the chat composer.

---

## 2) Scope

### In scope
- Command-palette style LaTeX element browser
- Fast search across names, aliases, and categories
- Insert-at-cursor behavior for selected element templates
- Optional wrap-selection behavior (e.g., `\\sqrt{selection}`)

### Out of scope (Phase 1)
- User-authored custom snippet packs
- Cloud sync of snippet favorites/history
- Full VSCode-style tabstops/placeholder navigation engine

---

## 3) UX Plan

### Trigger paths
- Toolbar/composer button (e.g. `ƒx`)
- Keyboard shortcut (e.g. `⌘\\`)
- Optional quick trigger when typing leading `\\`

### Palette layout
- Search field at top
- Result list grouped by category (Algebra, Calculus, Greek, Matrices, Logic, etc.)
- Optional right-side mini preview using `LaTeXView`

### Insert behavior
- Insert template at cursor in composer
- If selection exists and snippet supports wrapping, wrap selection
- Keep cursor at first editable placeholder region

---

## 4) Data Model

Snippet fields:
- `id` (stable)
- `title` (display)
- `aliases` (search terms)
- `category`
- `template` (inserted source)
- `example` (for preview)
- `wrapMode` (`none` | `wrapSelection`)

Example:
```json
{
  "id": "fraction",
  "title": "Fraction",
  "aliases": ["frac", "division", "ratio"],
  "category": "Algebra",
  "template": "\\\\frac{${1:numerator}}{${2:denominator}}",
  "example": "\\\\frac{a+b}{c}",
  "wrapMode": "none"
}
```

---

## 5) Architecture

## 5.1 New components
- `LaTeXSnippet` model + repository
- `LaTeXSnippetSearchService` ranking/filter engine
- `LaTeXPaletteView` SwiftUI popover/sheet UI
- `LaTeXInsertionEngine` caret/selection-aware insertion

## 5.2 Existing integration points
- `MainView.ChatView.inputBar` (or `MathComposerView`) for trigger + insertion
- `ChatViewModel.input` as editable text source
- `LaTeXView` for preview pane

---

## 6) Search & Ranking
Scoring priority:
1. Exact title match
2. Title prefix match
3. Alias prefix match
4. Alias contains / fuzzy contains
5. Category boost for recent picks/favorites (Phase 2)

Performance target:
- Search updates under 20ms for default snippet set (~100–250 entries)

---

## 7) File-by-File Tickets

### Ticket P1 — Snippet catalog + model
**New files:**
- `Sources/MathMate/Models/LaTeXSnippet.swift`
- `Sources/MathMate/Services/LaTeXSnippetRepository.swift`
- `Sources/MathMate/Resources/latex_snippets.json`

**Tasks:**
- Define codable snippet model
- Load bundled snippet catalog
- Validate unique IDs and required fields

### Ticket P2 — Search service
**New files:**
- `Sources/MathMate/Services/LaTeXSnippetSearchService.swift`

**Tasks:**
- Implement scoring/ranking
- Add category grouping API
- Add basic fuzzy contains fallback

### Ticket P3 — Palette UI
**New files:**
- `Sources/MathMate/Views/LaTeXPaletteView.swift`

**Modify:**
- `Sources/MathMate/Views/MainView.swift` (or `MathComposerView.swift` once composer refactor lands)

**Tasks:**
- Add popover + search box + grouped results
- Add keyboard navigation (up/down/enter/esc)
- Optional inline preview panel

### Ticket P4 — Insertion engine
**New files:**
- `Sources/MathMate/Services/LaTeXInsertionEngine.swift`

**Tasks:**
- Insert template at caret/selection
- Handle wrap-selection snippets
- Place cursor at first placeholder token

### Ticket P5 — Tests
**Modify/New tests:**
- `Tests/MathMateTests/MathMateTests.swift` (or dedicated snippet tests)

**Coverage:**
- search ranking determinism
- insertion at caret and with active selection
- placeholder/cursor placement rules
- malformed snippet safety

---

## 8) Acceptance Criteria
- Users can open palette, search common math structures, and insert in one flow.
- Inserted snippets are syntactically valid LaTeX templates.
- Keyboard-only usage works end-to-end.
- `swift build` and `swift test` pass.

---

## 9) Rollout
1. Ship P1-P3 as read-only insert menu with minimal template insertion.
2. Add P4 cursor/selection intelligence.
3. Add favorites/recent snippets + customizable shortcut in settings (Phase 2).
