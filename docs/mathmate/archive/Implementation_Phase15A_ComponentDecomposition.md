# Implementation Plan — Phase 15A: Component Decomposition

## Objective

Split four over-sized React components into focused, single-responsibility sub-components. Each mega-component is replaced by a small root shell that composes its children. No behavior changes — only file count and line count reduction, plus improved testability.

## Current Pain

| File | Lines | Concerns jammed together |
|------|-------|--------------------------|
| `src/components/ChatMessage.tsx` | 386 | Bubble variants (user/assistant/tool), segment renderers, inline vault chips, quick-save popover, markdown/math rendering, streaming state |
| `src/components/Sidebar.tsx` | 585 | Navigation, project list, session list, project menu (create/delete/select), archival toggle |
| `src/components/ProjectSettingsPanel.tsx` | 748 | Vault config, model config, latex config, textbook management, advanced settings — each a distinct concern |
| `src/components/PdfViewer.tsx` | 903 | PDF rendering, page navigation, region selection, textbook index integration, annotation layer |

Consequences:
- **Untestable.** No unit test isolates the QuickSavePopover or VaultChips in isolation.
- **Merge conflicts.** Any two engineers touching ChatMessage step on each other's lines.
- **Mixed concerns.** The Sidebar mixes layout logic with business logic (creating projects, deleting sessions).

## Proposed Design

### A.1 ChatMessage decomposition

```
ChatMessage.tsx          (shell: ~80 lines — just render logic + streaming switch)
├── UserBubble.tsx       (pure: renders user message bubble, emoji chip)
├── AssistantBubble.tsx  (pure: renders assistant message with streaming support)
├── ToolResultBubble.tsx (pure: renders tool-result message)
├── MessageSegments.tsx   (maps segment type → ThinkingBlock | ProcessBlock | ContentBlock)
├── VaultChips.tsx       (renders inline vault-reference chips from segments)
├── QuickSavePopover.tsx (hover-triggered: save-to-vault action)
└── StreamingMessage.tsx (during streaming: fused streamedText + streamedThinking + streamSegments)
```

### A.2 Sidebar decomposition

```
Sidebar.tsx                    (shell: ~100 lines — layout + resize)
├── ProjectSection.tsx        (project list header + "New Project" button)
├── ProjectRow.tsx             (single project row with vault indicator)
├── SessionList.tsx           (session table with search/filter)
├── SessionRow.tsx            (single session row with date + model badge)
├── ProjectMenu.tsx            (floating menu: create/delete/duplicate/select)
├── ArchivalToggle.tsx        (archived sessions expand toggle)
└── Sidebar.module.css        (moved from inline `<style>` blocks, if any)
```

### A.3 ProjectSettingsPanel decomposition

```
ProjectSettingsPanel.tsx       (shell: ~60 lines — tab router)
├── VaultSettingsTab.tsx       (vault path + health-check button)
├── ModelSettingsTab.tsx       (provider dropdown + model list)
├── LaTeXSettingsTab.tsx      (engine selector + preview)
├── TextbookTab.tsx            (indexed PDFs + search)
└── AdvancedTab.tsx            (flags, experimental options)
```

### A.4 PdfViewer decomposition

```
PdfViewer.tsx                      (shell: ~120 lines — layout + PDF load orchestration)
├── PdfPageCanvas.tsx              (single page render via pdf.js)
├── usePdfRenderer.ts              (pdf.js WASM init, page cache, render-to-canvas)
├── usePdfRegionSelect.ts          (mouse-drag region → normalized coords)
├── useTextbookIndexer.ts         (already a hook — formalize its API)
├── PdfNavigationBar.tsx          (page number input + prev/next)
└── PdfRegionHighlight.tsx        (renders highlight overlay on top of PdfPageCanvas)
```

## Task Checklist

### ChatMessage
- [ ] `src/components/chat/UserBubble.tsx` — extract from ChatMessage user-branch render
- [ ] `src/components/chat/AssistantBubble.tsx` — extract from ChatMessage assistant-branch render
- [ ] `src/components/chat/ToolResultBubble.tsx` — extract from ChatMessage tool-result render
- [ ] `src/components/chat/VaultChips.tsx` — extract vault chip rendering (context-aware: shows Synapse or legacy path)
- [ ] `src/components/chat/QuickSavePopover.tsx` — extract quick-save hover widget
- [ ] `src/components/chat/MessageSegments.tsx` — segment dispatcher
- [ ] `src/components/chat/StreamingMessage.tsx` — streaming-mode renderer (subscribes to live segment accumulation)
- [ ] `src/components/ChatMessage.tsx` → becomes shell (~80 lines)
- [ ] Move `ChatMessage.module.css` → `src/components/chat/ChatMessage.module.css`
- [ ] If `VaultChips` styles are split out, create `src/components/chat/VaultChips.module.css` (do not assume this file already exists)

### Sidebar
- [ ] `src/components/Sidebar/ProjectSection.tsx`
- [ ] `src/components/Sidebar/ProjectRow.tsx`
- [ ] `src/components/Sidebar/SessionList.tsx`
- [ ] `src/components/Sidebar/SessionRow.tsx`
- [ ] `src/components/Sidebar/ProjectMenu.tsx`
- [ ] `src/components/Sidebar/ArchivalToggle.tsx`
- [ ] `src/components/Sidebar/Sidebar.tsx` → shell (~100 lines)
- [ ] Move `Sidebar.module.css` → `src/components/Sidebar/Sidebar.module.css`

### ProjectSettingsPanel
- [ ] `src/components/Settings/VaultSettingsTab.tsx`
- [ ] `src/components/Settings/ModelSettingsTab.tsx`
- [ ] `src/components/Settings/LaTeXSettingsTab.tsx`
- [ ] `src/components/Settings/TextbookTab.tsx`
- [ ] `src/components/Settings/AdvancedTab.tsx`
- [ ] `src/components/ProjectSettingsPanel.tsx` → shell (~60 lines + tab routing)

### PdfViewer
- [ ] `src/components/PdfViewer/PdfPageCanvas.tsx` — render one page
- [ ] `src/components/PdfViewer/PdfNavigationBar.tsx` — page navigation
- [ ] `src/components/PdfViewer/PdfRegionHighlight.tsx` — highlight overlay
- [ ] `src/components/PdfViewer/usePdfRenderer.ts` — formalize: `init()`, `renderPage(n)`, `drop()`
- [ ] `src/components/PdfViewer/usePdfRegionSelect.ts` — formalize: `start()`, `update()`, `commit()` → `Region`
- [ ] `src/components/PdfViewer/PdfViewer.tsx` → shell (~120 lines + orchestration)
- [ ] Move `PdfViewer.module.css` → `src/components/PdfViewer/PdfViewer.module.css`

### Cross-cutting
- [ ] Update all `import` paths in calling code (ChatPage, OverviewPage, etc.)
- [ ] Ensure CSS modules are resolvable from new paths
- [ ] Update any inline `<style>` blocks that reference component-scoped CSS class names

## Validation

- `npm run build` ✅ (zero module-resolution errors)
- `npm test` ✅
- Manual smoke: open ChatPage, Sidebar, ProjectSettingsPanel, PdfViewer — visually verify each tab and component renders identically to before
- Verify QuickSavePopover hover trigger still works on vault chips
- Verify PdfViewer region selection + textbook index integration still works

## Acceptance Criteria

| Component | Before | After (target) |
|-----------|--------|----------------|
| ChatMessage.tsx | 386 lines | ≤ 80 lines |
| Sidebar.tsx | 585 lines | ≤ 100 lines |
| ProjectSettingsPanel.tsx | 748 lines | ≤ 60 lines |
| PdfViewer.tsx | 903 lines | ≤ 120 lines |
| Each new sub-component | — | ≤ 150 lines |

- No behavior regressions
- CSS module paths updated everywhere
- All existing tests pass without modification

## Risks

- **Import path breakage.** A thousand callers import from `../components/ChatMessage`. Mitigation: keep `ChatMessage.tsx` as the shell and re-export everything from sub-files, so callers don't need to change.
- **CSS cascade regressions.** Moving module CSS to sub-directories may break cascade order. Mitigation: verify each component's layout in isolation and inside parent context.
- **State coupling.** VaultChips currently reads from `useVaultStore` and `useProjectStore`. Extract with explicit `props: { path: string; vaultType: "synapse"|"legacy" }` — keep stores in the parent, not the chip.

## Out of Scope

- New behavior or new features
- Changes to the turn orchestrator (Phase 14B) — the streaming state is handled by `StreamingMessage.tsx` which should work with the existing orchestrator events
- Mobile-specific layout (deferred to a later UI-focused phase; not part of Phase 15B stream-state work)
