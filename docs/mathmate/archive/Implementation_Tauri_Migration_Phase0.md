# Tauri v2 Migration — Phase 0: Scaffold & Foundation

**Goal**: Set up the Tauri v2 + React/TypeScript project, the Rust backend skeleton, and the frontend shell with KaTeX rendering. By the end of Phase 0, you can open the app, see a styled shell, and render a KaTeX formula in-browser with no WKWebView involvement.

**Estimated effort**: 2–3 days

---

## Tech Stack

| Layer | Choice | Rationale |
|---|---|---|
| Desktop shell | Tauri v2 | Single Rust binary, native windowing, no Electron memory overhead |
| Frontend | React 19 + TypeScript + Vite | Mature KaTeX/marked ecosystem, largest component library pool |
| Styling | Tailwind CSS + CSS variables | System colors for dark/light mode, rapid prototyping |
| Markdown → HTML | `marked` + `marked-katex-extension` | Industry standard, replaces 610-line `LaTeXNormalizer.swift` |
| Routing | React Router | Tab-based navigation (chat/vault/overview/settings) |
| Rust backend | `tauri` + `serde` + `serde_json` | Config loading, file I/O, session persistence |

---

## Deliverables

### D0.1 — Tauri project scaffold
- [ ] `npm create tauri-app@latest mathmate-tauri -- --template react-ts`
- [ ] Verify `cargo tauri dev` launches a window with the React dev server
- [ ] Set up project structure:
  ```
  mathmate-v2/
  ├── src/               # React frontend
  │   ├── components/    # Reusable UI components
  │   ├── pages/         # Route pages (Chat, Vault, Overview, Settings)
  │   ├── hooks/         # Custom React hooks
  │   ├── lib/           # Utilities (API client, KaTeX helpers)
  │   ├── stores/        # State management
  │   └── styles/        # CSS / Tailwind config
  ├── src-tauri/         # Rust backend
  │   ├── src/
  │   │   ├── main.rs          # Tauri entry + commands
  │   │   ├── config.rs        # Config loading
  │   │   ├── session.rs       # Session CRUD
  │   │   ├── project.rs       # Project CRUD
  │   │   ├── memory.rs        # Memory engine (SQLite)
  │   │   ├── vault.rs         # Vault scanning
  │   │   └── providers.rs     # API provider routing
  │   ├── Cargo.toml
  │   └── tauri.conf.json
  └── package.json
  ```

### D0.2 — KaTeX integration
- [ ] Install `katex`, `marked`, `marked-katex-extension`, `@types/katex`
- [ ] Create `src/lib/renderMath.ts`:
  ```typescript
  import katex from 'katex';
  import 'katex/dist/katex.min.css';

  // Inline render
  export function renderInlineMath(tex: string): string {
    return katex.renderToString(tex, { displayMode: false, throwOnError: false });
  }

  // Display render
  export function renderDisplayMath(tex: string): string {
    return katex.renderToString(tex, { displayMode: true, throwOnError: false });
  }
  ```
- [ ] Create `src/lib/renderMarkdown.ts` using `marked` with `markedKatex` extension
- [ ] Write a test component that renders `$$\int_{-\infty}^{\infty} e^{-x^2} dx = \sqrt{\pi}$$`
- [ ] Verify no WKWebView is involved — it's pure DOM rendering

### D0.3 — App shell with routing
- [ ] Set up React Router with routes:
  - `/chat` (default)
  - `/vault`
  - `/overview` (or `/project/:id`)
  - `/settings`
- [ ] Create `src/components/Sidebar.tsx` with project/session tree
- [ ] Create `src/components/TabBar.tsx` matching current `TabBarView.swift`
- [ ] Create `src/components/Toolbar.tsx` matching current `MainToolbarView.swift`
- [ ] Wire keyboard shortcut hooks (`⌘1` = chat, `⌘2` = vault, `⌘3` = overview)

### D0.4 — Dark / light mode
- [ ] CSS variables in `src/styles/theme.css` mirroring `AppTheme.swift`:
  ```css
  :root {
    --color-bg: #ffffff;
    --color-bg-elevated: #f5f5f7;
    --color-surface: #f0f0f2;
    --color-accent: #0071e3;
    --color-text-primary: #1d1d1f;
    --color-text-secondary: #6e6e73;
    --color-border: rgba(0, 0, 0, 0.12);
    --color-user-bubble: #0071e3;
    --color-user-text: #ffffff;
    /* ... */
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --color-bg: #1c1c1e;
      --color-bg-elevated: #2c2c2e;
      /* ... */
    }
  }
  ```
- [ ] macOS native title bar integration (transparent, custom traffic light offset)

### D0.5 — Rust backend skeleton
- [ ] Tauri commands registered for:
  - `get_config` — load `~/.mathmate/models.json` and `config.json`
  - `save_config` — write config back
- [ ] `src-tauri/src/config.rs`: serialization types matching `ProviderConfig`, `AppConfig`
- [ ] Verify Tauri command invocation from React frontend via `@tauri-apps/api`

### D0.6 — Build & verify
- [ ] `cargo tauri dev` launches with no errors
- [ ] KaTeX formula renders correctly in the browser
- [ ] Dark/light mode toggles with system preference
- [ ] Routing works between tabs
- [ ] Tauri command returns config JSON

---

## What Goes Away

| File | Lines | Replaced by |
|---|---|---|
| `LaTeXView.swift` | ~320 | `katex.renderToString()` + `marked` |
| `LaTeXNormalizer.swift` | ~610 | `marked-katex-extension` |
| `LaTeXShellHTML` + `KaTeXAssets` | ~100 | Static `katex.min.css` import |
| `AppTheme.swift` | ~100 | CSS variables in `theme.css` |

## What Stays (for now)

Everything else. Phase 0 is just the shell + KaTeX rendering — no chat logic, no persistence, no streaming.

## Dependencies
- Rust toolchain (rustup, cargo)
- Node.js 20+
- macOS (for development; Tauri builds cross-platform)

## Acceptance Criteria
- [ ] `cargo tauri dev` launches a window with a styled app shell
- [ ] A hardcoded KaTeX formula renders in the browser DOM
- [ ] Dark mode responds to macOS system preference
- [ ] Tab bar navigates between empty page shells
- [ ] Tauri `get_config` command returns `~/.mathmate/models.json` content
