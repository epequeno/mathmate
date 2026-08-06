# MathMate

A desktop AI math tutoring app built with Tauri v2, React, and Rust. MathMate combines streaming AI responses, visible reasoning traces, KaTeX math rendering, Obsidian-style vault workflows, and a native desktop experience.

<!-- TODO: add screenshots to docs/ or .github/ and reference here -->
<!-- ![MathMate chat view](docs/screenshots/chat.png) -->

## Features

- **Streaming AI chat** with visible reasoning traces (kept as plain text, separate from rendered math)
- **KaTeX math rendering** — inline and block LaTeX, with normalization for model-specific formatting quirks
- **Multi-provider support** — OpenRouter (default), Anthropic, OpenAI; bring your own keys
- **Project & session management** — hierarchical organization with session branching and history
- **Obsidian-style vaults** — link one or more note vaults; the agent reads your notes for context-aware tutoring
- **Tool-calling agent** — multi-round tool loops with sandboxed filesystem access and user-defined tool policies
- **Interactive visualizations** — intent compiler (natural language → widget spec), annotation/tracer system, 3D surface primitives via Plotly
- **PDF viewer & textbook library** — in-app PDF reading with region selection; a built-in catalog of free, open-access math textbooks
- **Persistent memory** — SQLite-backed memory store with injection-safe retrieval and prompt isolation
- **Native macOS integration** — native menu, window, and keyboard shortcut support via Tauri

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop shell | Tauri v2 |
| Frontend | React 19, TypeScript, Vite, Zustand |
| Backend | Rust (axum, rusqlite, reqwest) |
| Math rendering | KaTeX via marked-katex-extension |
| Markdown | marked + DOMPurify sanitizer |
| PDF | pdf.js (pdfjs-dist) |
| Visualization | Plotly |
| Tests | Vitest (frontend), `cargo test` (Rust) |

## Prerequisites

- [Node.js](https://nodejs.org/) 20+
- [Rust](https://www.rust-lang.org/tools/install) (stable)
- [Tauri v2 prerequisites](https://v2.tauri.app/start/prerequisites/) (system dependencies for your OS)

## Getting Started

```bash
cd mathmate
npm install
npm run tauri dev
```

This launches the Vite dev server and the Tauri desktop app in development mode.

### API Keys

MathMate needs at least one provider API key. Set via environment variables:

```bash
cp mathmate/.env.example mathmate/.env
# Edit .env with your keys:
# OPENROUTER_API_KEY=...
# ANTHROPIC_API_KEY=...
# OPENAI_API_KEY=...
```

Or configure providers in `~/.mathmate/models.json` (created on first run; see `mathmate/.env.example` for the key names). OpenRouter is the default provider path.

## Build & Test

All commands run from `mathmate/` unless noted.

```bash
npm run dev          # Frontend dev server only
npm run tauri dev    # Full desktop app (frontend + Rust)
npm run build        # TypeScript + Vite production build
npm run test         # Frontend unit tests (Vitest)
```

Rust checks (from `mathmate/src-tauri/`):

```bash
cargo check
cargo test
```

## Project Structure

```
mathmate/
├── mathmate/          # Active app (Tauri v2 + React + Rust)
│   ├── src/              # Frontend (React/TypeScript)
│   ├── src-tauri/        # Backend (Rust, Tauri commands)
│   └── package.json
├── docs/                 # Design docs, roadmap, changelog, dev logs
├── AGENTS.md             # Guide for AI contributors
├── CONTRIBUTING.md       # Guide for human contributors
└── LICENSE
```

See [`docs/mathmate/`](docs/mathmate/) for the roadmap, design specs, changelog, and development logs.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). AI contributors should also read [AGENTS.md](AGENTS.md).

## License

[MIT](LICENSE) — © 2026 Steven Pequeno
