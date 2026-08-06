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

## 10) Adding Free Textbook Resources to the Library Catalog

The MathMate Library feature is backed by a single static JSON file that is compiled into the Rust binary at build time. Adding a new free resource requires only an edit to that file (no Rust or frontend code changes in the common case).

### File & loading mechanism
- **Catalog file:** `mathmate-v2/src-tauri/resources/textbook-catalog.json`
- **Embedded via:** `include_str!("../resources/textbook-catalog.json")` in `mathmate-v2/src-tauri/src/textbook_catalog.rs`
- **Rendered by:** `mathmate-v2/src/components/Settings/TextbookTab.tsx` (generic over catalog entries)
- **Consequence:** because the JSON is `include_str!`-ed at compile time, a content change is picked up only after recompiling the Rust side (e.g. `npm run tauri dev` restart or `cargo check`). No runtime file read occurs.

### Entry schema
Append a new object to the top-level `entries` array. All fields below are expected; use `null` for any URL/hint that does not apply.

```json
{
  "id": "kebab-case-unique-id",
  "title": "Book Title",
  "authors": ["Author One", "Author Two"],
  "edition": "2nd" | null,
  "subject": "<see taxonomy below>",
  "publisher": "Publisher" | null,
  "license": "<see license values below>",
  "description": "One- or two-sentence description of coverage, level, and notable features.",
  "thumbnail_url": "https://.../cover.jpg" | null,
  "download_urls": {
    "pdf": "https://.../book.pdf",
    "epub": null,
    "html": "https://.../landing-or-toc.htm"
  },
  "file_size_hint": 6186598 | null,
  "page_count_hint": 598 | null,
  "recommended_for": ["Abstract Algebra", "Upper-level Undergraduate"]
}
```

### Subject taxonomy (reuse existing tags; do not invent new ones without reason)
Currently in use: `calculus`, `linear-algebra`, `algebra`, `abstract-algebra`, `differential-equations`, `discrete-math`, `number-theory`, `probability`, `statistics`, `olympiad-general`, `olympiad-algebra`, `olympiad-geometry`, `olympiad-number-theory`, `olympiad-combinatorics`, `other`.

### License values currently in use
`cc-by`, `cc-by-sa`, `cc-by-nd`, `cc-by-nc-sa`, `cc-by-nc-nd`, `gpl`, `free`, `free-online`, `other`. Use `free` when the author offers the work free of charge without a stated Creative Commons license; use `free-online` for web-only / read-online-only resources with no downloadable artifact.

### Workflow when adding a resource
1. **Confirm the resource is not already listed.** Grep the catalog for the author surname, title keywords, and the host domain, e.g.:
   ```bash
   grep -in "goodman\|uiowa\|algebrabook" mathmate-v2/src-tauri/resources/textbook-catalog.json
   ```
2. **Verify the URL actually works** before adding it. User-supplied URLs are frequently truncated or stale. Use `curl -sI -L --max-time 15 <url>` and, if the provided URL 404s, walk the parent directory listing to locate the canonical file (prefer the latest edition / most recent dated PDF).
3. **Capture accurate metadata** from the author/host page: exact title, edition, author(s), publisher, license terms, file size (bytes), and page count if stated. Prefer a direct PDF link for `download_urls.pdf`; put the landing/download page under `download_urls.html`.
4. **Pick a unique `id`** in kebab-case, prefixed with a short author/series slug (e.g. `goodman-algebra-abstract-concrete`, `openstax-calculus-v1`).
5. **Append to the `entries` array** (keep a trailing comma on the prior entry; the array's closing `]` and file's closing `}` remain last).
6. **Validate the JSON parses** before finishing:
   ```bash
   python3 -c "import json; d=json.load(open('mathmate-v2/src-tauri/resources/textbook-catalog.json')); print('entries:', len(d['entries']))"
   ```
7. **No code rebuild is required for correctness**, but note in the changelog that a Rust recompile is needed for the new entry to appear at runtime because the catalog is `include_str!`-ed.
8. **Update docs** per §8: add a `docs/mathmate/03_Dev_Logs/YYYY-MM-DD.md` entry and a line under today's date in `docs/mathmate/CHANGELOG.md` (under an `### Added` block titled "Catalog Addition: <short name>").

### Edge cases / gotchas
- A 404 on the user-supplied URL does **not** mean the resource is gone — many author sites use directory indexes or `.htm`/`.php` landing pages. Always check the parent directory.
- Do not invent `file_size_hint` or `page_count_hint`; leave them `null` if not confirmed from the host (the Apache/`curl` directory listing usually shows sizes).
- Do not add paywalled or pirated resources. The catalog is for **free, open-access** material only.
- If a new subject is genuinely needed, add it to the taxonomy list above and check that `TextbookTab.tsx` filter rendering handles it gracefully (it generically iterates subjects, but confirm visually).

---

## 11) Safe Completion Checklist
Before handoff, verify:
- [ ] no secrets/API keys added to repo files
- [ ] reasoning trace still visible in UI
- [ ] markdown + KaTeX mixed rendering still works
- [ ] `npm run build` passes
- [ ] `cargo check` passes
- [ ] relevant docs updated if behavior changed
