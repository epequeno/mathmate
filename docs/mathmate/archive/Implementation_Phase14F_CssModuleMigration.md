# Implementation Plan — Phase 14F: CSS Module Migration

## Objective

Move the most-repeated inline-style patterns into CSS modules / classes so the 5–10 most common UI primitives are reusable, GPU-accelerated, inspectable in DevTools, and don't re-render style objects on every React diff. This is a *no-behavior-change* refactor.

## Current Pain

The codebase uses inline styles almost exclusively. Spot counts of `style={{ ... }}` blocks:

| File | Style blocks |
|---|---:|
| `Sidebar.tsx` | ~30 |
| `ChatMessage.tsx` | ~25 |
| `ChatInput.tsx` | ~20 |
| `ProjectSettingsPanel.tsx` | ~25 (estimated; 751 lines) |
| `Layout.tsx` | ~10 |
| `ProcessBlock.tsx` | ~25 |

Several classes of UI elements are reinvented 5–10 times across files with slightly different inline values:

- **Hover/focus background change** — `onMouseEnter={(e) => { e.currentTarget.style.background = "..."; }}` + `onMouseLeave` to reset. This pattern appears in `Sidebar.tsx`, `ChatMessage.tsx`, `ProjectSettingsPanel.tsx`, and others.
- **Icon button** — `<button>` with `display: flex; align-items: center; justify-content: center; padding: 2px 3px; border: none; background: none; cursor: pointer; border-radius: 4px; color: var(--color-text-tertiary);` — appears in `Sidebar.tsx` (`iconBtnStyle`), `ChatInput.tsx` (`iconInputBtn`), and many others.
- **List row** — used in `Sidebar.tsx` for projects, sessions, archived projects.
- **Action button** — used in `ChatMessage.tsx` (Quick Save), `ChatInput.tsx` (Send/Stop), `Sidebar.tsx` (New Project), etc.
- **Toolbar button** — used in `ContextPanel.tsx`, `ProjectSettingsPanel.tsx`, `PdfViewer.tsx`.
- **Menu item** — `Sidebar.tsx`'s `ProjectMenu` and various dropdowns.
- **Bubble / chat message** — `ChatMessage.tsx` and `ProcessBlock.tsx`.
- **Lightbox / modal overlay** — `ChatMessage.tsx`'s image lightbox.

Concrete consequences:

- **Inline styles are recreated on every render.** Even when the values don't change, React diffs new object references and reapplies them. This is wasted work and breaks GPU acceleration for transitions.
- **Hover effects via JS handlers are slow** and cannot use `:hover` CSS pseudo-classes for cheap GPU compositing.
- **No way to share a class across files** without copy-paste.
- **DevTools inspection is poor** — applying a `style="..."` attribute on a single element shows a flat list, not a class hierarchy.
- **Theme variables work, but the `style` object as a whole is opaque** — there's no way to know which inline elements are using `var(--color-accent)` vs hard-coded colors.

## Proposed Design

### F.1 Use CSS Modules (Vite-native)

Vite has first-class CSS module support. A file `Sidebar.module.css` co-located with `Sidebar.tsx` is auto-scoped:

```css
/* src/components/Sidebar.module.css */
.iconBtn {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--color-text-tertiary);
  padding: 2px 3px;
  border-radius: 4px;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: color 0.1s, background 0.1s;
}

.iconBtn:hover {
  color: var(--color-text-primary);
  background: var(--color-hover);
}

.listRow {
  display: flex;
  align-items: center;
  margin: 1px 8px;
  border-radius: 6px;
  padding: 7px 12px 7px 10px;
  gap: 8px;
  cursor: pointer;
  border-left: 2px solid transparent;
  transition: background 0.1s;
}

.listRow:hover {
  background: var(--color-hover);
}

.listRow.active {
  background: var(--color-accent-selected);
  border-left-color: var(--color-accent-light);
}
```

```tsx
// src/components/Sidebar.tsx
import styles from "./Sidebar.module.css";

<button className={styles.iconBtn}><Trash2 size={11} /></button>
```

### F.2 A small shared stylesheet for the truly common patterns

For patterns used in 5+ places that should not have a class derived from any one component, add a `src/styles/components.css` with globally-scoped class names:

```css
/* src/styles/components.css */
.btn-icon { /* used everywhere */ }
.btn-icon-danger { /* hover turns red */ }
.btn-primary { /* accent-colored action button */ }
.list-row { /* used in 3+ lists */ }
.bubble-user { /* user message bubble */ }
.bubble-assistant { /* assistant message */ }
.tooltip { /* used in toolbars */ }
```

### F.3 Migrate by file, not by class

The class names are coupled to the file that defines them. Migrate file-by-file:

1. Pick a file (start with `Sidebar.tsx` — most repetitions).
2. Create a co-located `.module.css` with the classes it needs.
3. Convert all inline styles in that file to `className={styles.foo}` (or merge with `clsx` when conditional).
4. Verify the visual output is identical (manual + Playwright snapshot diff if available).
5. Ship.

This is the safest sequence because each PR is a self-contained visual regression test.

### F.4 Keep inline styles for one-off layout values

Inline styles are fine for:
- `width: 64` (a literal pixel value that varies per item)
- `flex: 1` (a per-instance layout value)
- `top: -6; right: -6` (positional offsets)

The migration targets *repeated* patterns. Per-instance layout stays inline.

## Task Checklist

- [ ] **F.4.a** Add `src/styles/components.css` with the 5 most common shared classes (icon button, list row, primary button, danger button, tooltip).
- [ ] **F.4.b** Migrate `Sidebar.tsx` to `Sidebar.module.css`. (This is the largest win — 800 lines → ~500 lines.)
- [ ] **F.4.c** Migrate `ChatInput.tsx` to `ChatInput.module.css`.
- [ ] **F.4.d** Migrate `ChatMessage.tsx` to `ChatMessage.module.css`. (Lightbox, image attachment, quick-save popover, vault chips.)
- [ ] **F.4.e** Migrate `ProcessBlock.tsx` to `ProcessBlock.module.css`.
- [ ] **F.4.f** Migrate `Layout.tsx`, `ContextPanel.tsx`, `PdfViewer.tsx`, `ProjectSettingsPanel.tsx`.
- [ ] **F.4.g** Add `clsx` (or hand-roll a tiny `cx()`) to handle conditional class composition.
- [ ] **F.4.h** Add an ESLint rule banning `style={{...}}` blocks > 5 lines or with > 4 keys (keeps small layout-value exceptions but flags "this should be a class").

## Validation

- `npm run build` ✅
- `npm test` ✅
- Visual regression: a manual smoke test of every screen (welcome, chat, vault, book, overview, settings, sessions, plus popovers: project menu, lightbox, quick save, slash command popup, capture region). For each, verify pixel-identical rendering vs. a baseline screenshot.

## Acceptance Criteria

- The 5 most common UI primitives have a single CSS class definition.
- No `onMouseEnter` / `onMouseLeave` style-mutation patterns remain in any component.
- The largest components (`Sidebar.tsx`, `ChatMessage.tsx`) shrink by 30–50%.
- Every hover state uses a CSS pseudo-class (GPU-accelerated).
- The ESLint rule prevents regressions.

## Risks

- **Visual regressions.** A pixel-level diff is hard without a snapshot test. Mitigation: take baseline screenshots before starting, compare after each file migration.
- **The CSS variable system is well-established** (`theme.css`); the migration does not touch it. No risk to theming.
- **Some pseudo-classes are not equivalent to inline handlers.** E.g. `onMouseEnter` on a parent element to show a child button can be replaced with `.parent:hover .child { opacity: 1 }`, but the API differs slightly. Mitigation: keep the JS handler for the cases that need it (e.g. showing/hiding a popover), use CSS only for pure visual hover effects.
