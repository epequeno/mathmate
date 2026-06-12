# Tauri v2 Migration — Phase 3: UI Parity

**Goal**: Build all remaining UI pages to match the current SwiftUI app — settings, vault browser, overview tab, context panel, model selector, LaTeX palette, etc. By the end of Phase 3, every screen in the Swift app has a web equivalent.

**Estimated effort**: 3–4 days

**Depends on**: Phase 1 (chat), Phase 2 (Rust backend)

---

## Deliverables

### D3.1 — Settings pages
- [ ] `src/pages/Settings.tsx` — tabbed settings window matching `SettingsView.swift`:
  - **General**: font size, auto-scroll toggle, LaTeX preview toggle
  - **Chat**: system prompt editor, max tokens, temperature
  - **Models**: provider list with enable/disable toggle, model selector, API key status indicator
  - **About**: version, links, acknowledgments
- [ ] `src/stores/settingsStore.ts` — Zustand store backed by Rust config commands
- [ ] Settings persisted to `~/.mathmate/config.json` via Tauri `save_config`

### D3.2 — Vault browser page
- [ ] `src/pages/Vault.tsx` wrapping `src/components/VaultBrowser.tsx`:
  - Path selector / vault picker
  - Note list with search/filter
  - Note preview (rendered markdown + KaTeX)
  - "Open in Obsidian" button → `obsidian://` URL
  - Sync/re-scan button
- [ ] Tree view or flat list matching current `VaultView.swift` UX

### D3.3 — Overview tab
- [ ] `src/pages/Overview.tsx` matching `OverviewView.swift`:
  - Project name + description
  - Session list (recent sessions, searchable)
  - Token usage summary across sessions
  - Key topics / flagged content summary
  - AI-generated project summary (if available)
- [ ] Click a session → navigate to chat tab with that session loaded

### D3.4 — Model selector popover
- [ ] `src/components/ModelSelector.tsx` matching `ModelSelectorView.swift`:
  - Searchable list of models grouped by provider
  - Provider enable/disable toggle
  - Current model highlighted
  - Selection updates the chat store immediately
  - Shows pricing info if available

### D3.5 — Context panel
- [ ] `src/components/ContextPanel.tsx` matching `ContextPanelView.swift`:
  - Token usage bar + percentage
  - Estimated cost display
  - Memory panel (view, search, edit memories)
  - Session stats (message count, duration)
- [ ] Slide-in from right edge, toggleable via toolbar button or `⌘⌥P`

### D3.6 — LaTeX palette
- [ ] `src/components/LaTeXPalette.tsx` matching `LaTeXPaletteView.swift`:
  - Searchable popover with 70+ snippets across 10 categories
  - Keyboard navigation (up/down arrows, enter to insert)
  - Insert at cursor / wrap selection behavior
- [ ] Snippet data from `Resources/latex_snippets.json` → bundled as static JSON import

### D3.7 — Math composer (inline preview)
- [ ] `src/components/MathComposer.tsx` matching `MathComposerView.swift`:
  - Live KaTeX preview panel above the input area
  - Debounced rendering (80ms similar to current Swift version)
  - Raw LaTeX source preserved in the textarea
- [ ] Works alongside the LaTeX palette (insert from palette → preview updates)

### D3.8 — Session sidebar
- [ ] `src/components/Sidebar.tsx` matching `SidebarView.swift`:
  - Project list with disclosure groups
  - Session list per project (ordered by lastActivity)
  - Create new session button
  - Create new project button
  - Session rename (click to edit)
  - Project context menu (edit settings, delete)
  - PDF textbook link (if project has one)

### D3.9 — Keyboard shortcuts
- [ ] Global shortcuts (same as current app):
  - `⌘N` — new session
  - `⌘⇧N` — new project
  - `⌘[` / `⌘]` — previous/next session
  - `⌘1` / `⌘2` / `⌘3` — chat/vault/overview tabs
  - `⌘\` — open LaTeX palette
  - `⌘⌫` — clear chat
  - `⌘R` or `⌘⌥R` — regenerate last response (TBD exact binding)
  - `⌘⌥P` — toggle context panel
  - `Esc` — stop generation

### D3.10 — Error / empty states
- [ ] Empty state: "Create your first project" screen (matching `NewProjectSetupView.swift`)
- [ ] Error banner: retryable error banner above input bar (matching SwiftUI error banner)
- [ ] Wrap-up confirmation alert + progress HUD
- [ ] Toast notifications for save success/failure

### D3.11 — Build & verify
- [ ] Every route renders without errors
- [ ] Settings persist across restarts
- [ ] Model selector changes the active model used for chat
- [ ] Vault browser shows notes, opens in Obsidian
- [ ] Overview shows project stats
- [ ] Context panel shows correct token counts
- [ ] LaTeX palette inserts snippets into input
- [ ] Keyboard shortcuts work in the browser context
- [ ] Error states display correctly

---

## What Goes Away

| File | Lines | Replaced by |
|---|---|---|
| `SettingsView.swift` + 5 setting files | ~530 | `src/pages/Settings.tsx` |
| `VaultView.swift` | ~200 | `src/pages/Vault.tsx` |
| `OverviewView.swift` | ~200 | `src/pages/Overview.tsx` |
| `ContextPanelView.swift` | ~100 | `src/components/ContextPanel.tsx` |
| `ModelSelectorView.swift` | ~150 | `src/components/ModelSelector.tsx` |
| `LaTeXPaletteView.swift` | ~80 | `src/components/LaTeXPalette.tsx` |
| `MathComposerView.swift` | ~80 | `src/components/MathComposer.tsx` |
| `SidebarView.swift` | ~150 | `src/components/Sidebar.tsx` |
| `SetupViews.swift` | ~100 | `src/components/SetupViews.tsx` |
| `ProjectConfigurationSheet.swift` | ~120 | `src/components/ProjectConfig.tsx` |
| `LogsView.swift` | ~80 | Part of `src/pages/Overview.tsx` |
| **~1,790 lines** | 🗑️ | |

## Styling Guide
- Use Tailwind utility classes for layout
- CSS variables from `theme.css` for colors
- Follow the current Design Style Guide (`01_Design_Specs/Design_Style_Guide.md`)
- Match current rounded-corner conventions (14px bubbles, 6px buttons, 10px cards)
- Match current font sizes (14px body, 18px bold titles, 11px secondary)

## Acceptance Criteria
- [ ] All pages from the Swift app have a matching web implementation
- [ ] Settings are functional and persist
- [ ] Vault browser is functional
- [ ] Overview tab shows accurate session data
- [ ] All keyboard shortcuts work
- [ ] Error states are handled gracefully
- [ ] Visual design matches the Swift app (colors, spacing, typography)