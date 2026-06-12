# Tauri v2 Migration — Phase 4: Polish & Parity

**Goal**: Close remaining gaps, harden error handling, optimize performance, and ensure the Tauri app is a *better* experience than the Swift original — not just a port. By the end of Phase 4, the app is ready for daily use.

**Estimated effort**: 2–3 days

**Depends on**: Phase 3 (UI parity)

---

## Deliverables

### D4.1 — Error handling & retry UX
- [ ] Network error handling:
  - Detect connection failures, HTTP 4xx/5xx, timeouts
  - Show actionable error banner above input bar
  - "Retry" button re-sends the last user message
- [ ] Streaming errors:
  - Detect truncated / partial streams
  - Show "Response incomplete" indicator on affected messages
  - Retry resumes from the failing turn
- [ ] Provider errors:
  - API key missing → show which env var needs setting
  - Rate limit → show "Rate limited, waiting..." with auto-retry
  - Model unavailable → show fallback suggestion
- [ ] File I/O errors:
  - Session save failure → retry with exponential backoff
  - Config parse error → show error toast with file path

### D4.2 — Streaming robustness
- [ ] Timeout handling:
  - Connection timeout: 30s
  - Idle stream timeout: 60s (no tokens received)
  - Total timeout: 120s (entire response)
- [ ] Auto-retry on transient failures (once, with exponential backoff 2s)
- [ ] Graceful cancellation: abort stream, keep partial response visible
- [ ] Stream backpressure: don't overwhelm the renderer with fast token streams

### D4.3 — Performance optimization
- [ ] Virtualized message list:
  - Use `react-virtuoso` or `@tanstack/virtual` for large conversations (100+ messages)
  - Only render visible messages + a few offscreen
  - Constant DOM nodes regardless of conversation length
- [ ] KaTeX render cache:
  - Memoize `renderToString` for identical LaTeX expressions
  - LRU cache with 200 entries (most common math expressions repeat)
- [ ] Message list memoization:
  - `React.memo` on `ChatMessage` components
  - Only re-render when content actually changes (not on every stream chunk)
- [ ] Image lazy loading:
  - Load images from disk cache on-demand (not at session restore time)
  - Thumbnail generation for large images

### D4.4 — Keyboard shortcut audit
- [ ] Audit all Swift keyboard shortcuts and verify they work in web:
  - `⌘N`, `⌘⇧N` — new session/project ✅
  - `⌘[`, `⌘]` — navigate sessions
  - `⌘1/2/3` — tabs
  - `⌘\` — LaTeX palette
  - `⌘⌫` — clear chat
  - `⌘⌥P` — context panel
  - `⌘R` / `⌘⌥R` — regenerate
  - `Esc` — cancel generation
  - `↩` — send message (Cmd+Enter alternative)
- [ ] Fix any that Tauri doesn't natively support (register via `useEffect` keyboard handler)

### D4.5 — Dark mode completeness
- [ ] Verify all UI surfaces have proper dark mode styles:
  - Chat messages (user bubble + assistant background)
  - Settings pages
  - Vault browser
  - Overview
  - Context panel
  - LaTeX palette
  - Sidebar
  - Dropdowns, popovers, modals
  - Scrollbar styling
- [ ] KaTeX dark mode: override `.katex` text color in dark mode CSS
- [ ] Markdown dark mode: code block backgrounds, table borders, blockquote borders

### D4.6 — Accessibility basics
- [ ] Focus management: input field auto-focuses on send and cancel
- [ ] Keyboard navigation: tab through all interactive elements
- [ ] aria-labels on icon buttons
- [ ] Screen reader support for streaming content (aria-live region)

### D4.7 — Native window chrome
- [ ] Tauri window configuration:
  - Window title: "MathMate"
  - Minimum window size: 900x600
  - Default window size: 1200x800
  - macOS transparent title bar (traffic light integration)
- [ ] App icon: use existing `MathMate` icon asset
- [ ] macOS menu bar:
  - Standard macOS menu items (File, Edit, View, Window, Help)
  - MathMate-specific menu items matching current `@main` commands
  - Settings → standard Preferences menu item

### D4.8 — Migration helper
- [ ] On first launch of the Tauri app:
  - Detect existing Swift sessions in `~/.mathmate/sessions/`
  - Show migration banner: "Found N existing sessions from MathMate v1"
  - Verify compatibility: read a sample session to confirm JSON format matches
  - One-click "Import all" button (or just use in-place — sessions already in correct location)
- [ ] Config migration: read existing `~/.mathmate/models.json` and `config.json`

### D4.9 — Build & verification
- [ ] `cargo tauri build` produces a working `.app` bundle
- [ ] App runs on macOS without any WKWebView-backed processes
- [ ] Chat with 100+ messages maintains 60fps scrolling
- [ ] All keyboard shortcuts functional
- [ ] Dark/light mode matches system preference with no glitches
- [ ] Import existing sessions works correctly
- [ ] Error handling covers all common failure modes

---

## What Goes Away

| File | Lines | Replaced by |
|---|---|---|
| `SnapshotStore.swift` | ~100 | Not needed — no snapshot pipeline |
| `SnapshotView.swift` | ~30 | Not needed |
| `LaTeXSnapshotPool.swift` | ~250 | Not needed |
| `NonFocusableWebView` + `Coordinator` | ~60 | Not needed |
| `SnapshotUnitView.swift` | ~80 | Not needed |
| **~520 lines** | 🗑️ | |

## Key Metrics

| Metric | Swift v1 | Tauri v2 (target) |
|---|---|---|
| Render processes (100 messages) | 50–150 WKWebViews | 1 browser renderer |
| Snapshot pipeline overhead | ~5s timeout + 2 web view pool | Zero |
| Height-bridging latency | 80ms debounce + JS bridge | Zero (DOM native) |
| Scrolling 100 messages | Snapshot fallback → static images | Virtualized → 10-15 DOM nodes |
| Full message history load | Per-unit snapshot pipeline (seconds) | Zero cost (DOM renders instantly) |
| Streaming render cost | JS evaluateString per chunk | setState → React diff (sub-ms) |

## Acceptance Criteria
- [ ] No WKWebView processes running during normal use
- [ ] 100+ message conversations scroll at 60fps
- [ ] All keyboard shortcuts from Swift app are functional
- [ ] Dark mode is pixel-complete
- [ ] Error states are handled gracefully with retry
- [ ] Existing Swift session data loads correctly
- [ ] `cargo tauri build` produces a release bundle
- [ ] CPU usage is visibly lower than Swift version during streaming