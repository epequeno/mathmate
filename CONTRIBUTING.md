# Contributing to MathMate

Thanks for your interest in contributing! MathMate is a desktop AI math tutoring app built with Tauri v2, React, and Rust.

## Prerequisites

- [Node.js](https://nodejs.org/) 20+
- [Rust](https://www.rust-lang.org/tools/install) stable
- [Tauri v2 system prerequisites](https://v2.tauri.app/start/prerequisites/)

## Setup

```bash
git clone <repo-url>
cd mathmate
cd mathmate-v2
npm install
npm run tauri dev
```

The app window launches with hot-reload on both frontend and Rust changes.

## Development

| Command | Description |
|---------|-------------|
| `npm run dev` | Frontend dev server only (Vite) |
| `npm run tauri dev` | Full desktop app with hot reload |
| `npm run build` | TypeScript check + Vite production build |
| `npm run test` | Frontend unit tests (Vitest) |
| `cargo check` | Rust type check (run from `src-tauri/`) |
| `cargo test` | Rust unit tests (run from `src-tauri/`) |

### Pre-build checks

`npm run build` runs several lint checks automatically (defined in `prebuild`):

- `check-no-eval` — no `eval`/`new Function` on model or user output
- `check-api-commands` — Tauri command names match between frontend and Rust
- `check-no-raw-invoke` — frontend uses typed API wrappers, not raw `invoke()`
- `check-ts-types` — generated TS types are in sync with Rust (`ts-rs`)

Run any check individually with `npm run lint:<name>`.

## Architecture

The active codebase lives in `mathmate-v2/`:

- **Frontend** (`src/`): React 19 + TypeScript + Zustand stores. Entry point `src/App.tsx`. Key areas: `src/components/`, `src/stores/`, `src/lib/` (providers, rendering, API client).
- **Backend** (`src-tauri/src/`): Rust Tauri commands. Command handlers in `lib.rs`; business logic in `services/` modules. SQLite memory store, vault/project/session management.
- **Type bridge**: Rust types export to TypeScript via `ts-rs` (`npm run generate:ts-types`). The frontend consumes these from `src/lib/types-generated/`.

Read [AGENTS.md](AGENTS.md) for the full architecture map and conventions.

## Coding Conventions

- Prefer small, targeted edits over large rewrites.
- Preserve existing patterns and naming conventions.
- Keep reasoning traces visible as plain text (not LaTeX-rendered).
- Do not break streaming or error-handling paths in provider code.
- Preserve Tauri command compatibility: when adding/renaming a command, update both the Rust handler and the typed frontend API wrapper.
- Never commit API keys or secrets. Keys come from env vars (`OPENROUTER_API_KEY`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`) or user-local `~/.mathmate/models.json`.
- Add comments only where they clarify non-obvious behavior.

## Before Submitting a PR

1. `npm run build` passes (includes lint checks).
2. `cargo check` passes (run from `src-tauri/`).
3. `cargo test` passes if you changed Rust logic.
4. `npm run test` passes if you changed frontend logic.
5. No secrets, API keys, or local config committed.
6. Update `docs/mathmate/CHANGELOG.md` and dev logs if behavior changed (see `docs/mathmate/CHANGELOG_TEMPLATE.md`).

## Docs

- [Roadmap](docs/mathmate/00_Project_Management/Roadmap.md) — current status and planned work
- [Design specs](docs/mathmate/01_Design_Specs/) — architecture and UI design
- [Changelog](docs/mathmate/CHANGELOG.md) — release history
- [Security policy](docs/mathmate/SECURITY.md)

## License

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
