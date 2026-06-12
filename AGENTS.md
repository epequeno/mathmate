# AGENTS.md — MathMate AI Contributor Guide

This file defines how AI agents should work in this repository.

## 1) Project Status & Scope
MathMate has two codebases in this repo:

- **Active app (current):** `mathmate-v2/` (Tauri v2 + React + TypeScript + Rust)
- **Legacy app (maintenance-only):** `prototype/MathMate/` (SwiftUI)

Unless the user explicitly asks otherwise, **treat `mathmate-v2/` as the source of truth** and make changes there.

---

## 2) Project Goal (v2)
MathMate v2 is a desktop AI math tutoring app with:
- streaming AI responses,
- visible reasoning traces,
- KaTeX math rendering,
- project/session management,
- Obsidian-style vault workflows.

Primary working path: `mathmate-v2/`

---

## 3) Hard Constraints (Do Not Violate)
1. **Never commit API keys or secrets to the repository.**
   - Keys may come from environment variables (`OPENROUTER_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`).
   - v2 also supports provider keys in user-local config (`~/.mathmate/models.json` via `stored_api_key`).
2. **OpenRouter is the default provider path** unless the user requests otherwise.
3. **Reasoning traces must remain visible as plain text** (not LaTeX-rendered).
4. **Do not break streaming/error handling paths** in provider code.
5. **Preserve Tauri command compatibility** between frontend invokes and Rust command handlers.

---

## 4) Current Architecture (Key Files, v2)

### Frontend (React/TS)
- App shell / routes:
  - `mathmate-v2/src/main.tsx`
  - `mathmate-v2/src/App.tsx`
- Chat state and orchestration:
  - `mathmate-v2/src/stores/chatStore.ts`
- Config/provider state:
  - `mathmate-v2/src/stores/configStore.ts`
- Streaming provider client/parsing:
  - `mathmate-v2/src/lib/providers.ts`
- Markdown/KaTeX rendering:
  - `mathmate-v2/src/lib/renderMarkdown.ts`
  - `mathmate-v2/src/lib/renderMath.ts`
- Core UI:
  - `mathmate-v2/src/components/`

### Backend (Tauri/Rust)
- Tauri command registration / app state:
  - `mathmate-v2/src-tauri/src/lib.rs`
- Config loading + provider key persistence:
  - `mathmate-v2/src-tauri/src/config.rs`
- Sessions:
  - `mathmate-v2/src-tauri/src/session.rs`
- Projects:
  - `mathmate-v2/src-tauri/src/project.rs`
- Memory DB:
  - `mathmate-v2/src-tauri/src/memory.rs`
- Vault/textbook/wrap-up helpers:
  - `mathmate-v2/src-tauri/src/vault.rs`
  - `mathmate-v2/src-tauri/src/textbook.rs`
  - `mathmate-v2/src-tauri/src/wrapup.rs`

---

## 5) Rendering & Parsing Rules
When editing markdown/math handling:
1. Preserve mixed markdown + KaTeX rendering behavior.
2. Do not regress symbol-heavy list items, tables, or inline math formatting.
3. Keep reasoning/thinking text separate from rendered math content.

---

## 6) Streaming Rules
- Treat OpenAI-compatible streaming deltas as non-uniform payloads.
- `delta.content`/reasoning fields may be string/object/array.
- Keep graceful timeout/retry/error mapping behavior intact.
- Do not remove end-of-stream completion handling.

---

## 7) Build/Test Commands (v2)
Run from `mathmate-v2/` unless noted.

```bash
npm run dev          # Frontend dev server
npm run tauri dev    # Full desktop app dev mode
npm run build        # TS + Vite production build
```

Rust checks (from `mathmate-v2/src-tauri/`):

```bash
cargo check
cargo test
```

Before finishing non-trivial changes:
1. `npm run build` passes.
2. `cargo check` passes.
3. Run `cargo test` when Rust logic changed.
4. Update docs if behavior changed.

---

## 8) Documentation Discipline
If functionality/behavior changes, update:
- `docs/mathmate/00_Project_Management/Roadmap.md`
- `docs/mathmate/03_Dev_Logs/YYYY-MM-DD.md`
- `docs/mathmate/CHANGELOG.md`

Use template:
- `docs/mathmate/CHANGELOG_TEMPLATE.md`

---

## 9) Coding Style Expectations
- Prefer small, targeted edits over large rewrites.
- Avoid noisy debug logs in final state.
- Keep UI behavior deterministic.
- Preserve existing architecture and naming conventions.
- Add comments only where they clarify non-obvious behavior.

---

## 10) Safe Completion Checklist
Before handoff, verify:
- [ ] no secrets/API keys added to repo files
- [ ] reasoning trace still visible in UI
- [ ] markdown + KaTeX mixed rendering still works
- [ ] `npm run build` passes
- [ ] `cargo check` passes
- [ ] relevant docs updated if behavior changed
