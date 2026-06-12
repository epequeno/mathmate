# Implementation Plan: Chat Layout Redesign + LaTeX Font Size

## 1) Goal
Ship two UX improvements safely:

1. **UX-3**: assistant responses render as full-width app content (not bubble cards)
2. **UX-4**: better default readability for text + display math

---

## 2) Guardrails

1. **User bubbles stay unchanged** (right-aligned, compact).
2. **Assistant full-width must be real**, not only inside `ChatMessage.tsx`:
   - audit message wrappers in `ChatPage.tsx` too.
3. **Streaming layout must match assistant layout**.
4. **Font-size setting must actually apply at runtime** after async config load.
5. **KaTeX bump must not regress overflow/line breaks**.

---

## 3) Part A — Assistant Layout

### Current
- Assistant has bubble styling + `maxWidth` constraint.
- Streaming block has its own bubble-style width/rounding.

### Target
- Assistant: no bubble border/radius/elevated fill.
- Assistant: no component-level width cap.
- Keep `MathMate` role label as a delimiter.
- Streaming response follows same visual language.

### Files

#### `src/components/ChatMessage.tsx`
- Remove assistant bubble chrome (`border`, `borderRadius`, elevated background).
- Remove assistant `maxWidth` cap.
- Keep role label and thinking/image sections.
- Keep user message branch unchanged.

#### `src/pages/ChatPage.tsx`
- Update streaming footer block to remove bubble-style `maxWidth`/rounded constraints.
- Audit outer row wrappers (`padding: "0 8px"`) and decide final full-width behavior deliberately.

---

## 4) Part B — Typography + KaTeX Defaults

### Target values
- `--font-size-body`: `14px` → `15px`
- `.markdown-body .katex-display > .katex`: `1em` → `1.15em`
- Settings slider: default `15`, range `13..21`

### Files

#### `src/styles/theme.css`
- Update body font-size variable.
- Update display KaTeX multiplier.

#### `src/pages/SettingsPage.tsx`
- Update slider range/default.
- Ensure local state syncs when `appConfig` loads asynchronously.

#### Runtime font-size application (required)
- Add/confirm effect that applies persisted `appConfig.ui.font_size` to CSS variable.
- Suggested location: `App.tsx` (global) or shared UI-config hook.

Example behavior:
- On config load/change, set `document.documentElement.style.setProperty("--font-size-body", `${fontSize}px`)`.
- On missing config, keep theme default.

---

## 5) Edge Cases

- Long unbroken lines still wrap (`wordBreak`/`overflowWrap`).
- Code blocks/tables remain readable at full-width assistant layout.
- Large display equations do not clip in light/dark mode.
- Existing users with saved `font_size` keep their value (no destructive migration).

---

## 6) Acceptance Criteria

- Assistant messages render without bubble chrome and without component-level width cap.
- Streaming assistant output visually matches assistant message style.
- User bubbles remain unchanged.
- Persisted font size applies at runtime after config load.
- New default is 15px; slider supports 13–21.
- Display math is visibly larger and remains stable for long equations.
- `npm run build` passes.

---

## 7) Execution Order

1. `theme.css` typography updates.
2. `ChatMessage.tsx` assistant layout changes.
3. `ChatPage.tsx` streaming + wrapper audit.
4. `SettingsPage.tsx` slider + async sync fixes.
5. Global runtime font-size apply path.
6. Build + visual QA (text, code, table, LaTeX, streaming).
