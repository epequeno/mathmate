# MathMate Changelog

All notable changes to MathMate are tracked here.

---

## 2026-10-08

### Added
- `docs/ARCHITECTURE.md`: component diagram, a turn walkthrough, the trust boundaries and known rough edges. README links it and `SECURITY.md`, and now has screenshots.
- `docs/mathmate/Implementation_ServiceLayerCompletion.md`: plan to finish the Rust service-layer migration (proposed, not started).

### Fixed
- `search_textbook` is now offered to the model. The system prompt already told it to use the tool, but the tool list built by `SynapseService` omitted it.
- README no longer claims "user-defined tool policies" (no such code) or lists tools that are not offered.

### Changed
- `lib/turn/prompt.ts` is now the single source of the system prompt; `chatStore` calls `buildSystemPrompt` instead of keeping a second copy. Output is identical to the previous inline assembly.
- The PDF-import integration test reads its fixture from `MATHMATE_TEST_PDF` instead of a hard-coded home path.

### Cleanup
- Study citations in the README were reworded to match their sources.

---

## 2026-09-01 — Pedagogical Research Review & Roadmap

### Added
- **Pedagogical Foundation section** in `README.md` — summarizes the 2024–2026 research consensus on AI in education and how MathMate's design (hint ladder, visible reasoning, local memory) aligns with what the evidence says mitigates harm. References Bastani et al. (2025), Lehmann et al. (2024), Stanford SCALE (2026), Kestin et al. (2025), and Yu et al. (2026).
- **Phase 17 — Pedagogical Guardrails** in `docs/mathmate/00_Project_Management/Roadmap.md` — five evidence-driven roadmap items:
  - 17A: Default system prompt guardrails (scaffold vs. substitute)
  - 17B: Hint ladder as default for problem-solving interactions
  - 17C: Mastery tracking & adaptive scaffolding in the memory DB
  - 17D: Unassisted check-ins to surface the perception gap
  - 17E: AI error awareness (step verification, uncertainty flagging)
- **Dev log** at `docs/mathmate/03_Dev_Logs/2026-09-01.md` documenting the research review and roadmap rationale.

### Changed
- **System prompt pedagogical guardrails (Phase 17A)**: Added a `## Pedagogical approach` section to `SYSTEM_INSTRUCTIONS` in both `mathmate/src/lib/turn/prompt.ts` and `mathmate/src/stores/chatStore.ts`. The default system prompt now directs the AI to scaffold rather than substitute: ask what the student has tried before helping, prefer guiding questions and next-step hints over complete solutions, explain *why* steps work, show each step explicitly, and flag computational uncertainty. Conceptual questions ("what is...", "why does...") are explicitly exempted — these are complement use (learning), not substitution. Research basis: Bastani et al. (2025) — guardrails that avoid giving answers "essentially eradicated" the crutch effect; Kakarla et al. (2024) — tutors should guide, not correct.

### Research basis
Full review at `~/Dropbox/eapsoftware-research/MathMate/pedagogical-research/AI-LLMs-Education-Research-Review.md`.

## 2026-07-02 — Catalog Addition: Evans & Rosenthal + Calculus in Context

### Added
- **2 free textbook catalog entries** added to `mathmate/src-tauri/resources/textbook-catalog.json`:
  - *Probability and Statistics - The Science of Uncertainty (2nd ed.)* — Michael J. Evans & Jeffrey S. Rosenthal (University of Toronto). Upper-level mathematical statistics covering probability, inference (likelihood/Bayesian/optimal), model checking, regression, and stochastic processes. Subject: `statistics`. ~18.4 MB PDF + solutions manual.
  - *Calculus in Context* — Callahan, Cox, Hoffman, O'Shea, Pollatsek, Senechal (Five College Calculus Project, Smith College). Reform-calculus text from single-variable through multivariable, dynamical systems, and series. Subject: `calculus`. ~8.4 MB PDF, ~845 pp.
- Cargo rebuild required (catalog is `include_str!`-ed at compile time). No code changes needed.

---

## 2026-06-26 — Service-Layer Migration (Phase 14C completion)

### Fixed
- **Failing test `test_catalog_validates`**: Added `free` and `cc-by-nc-nd` license types to `get_license_info()` match in `textbook_catalog.rs`.

### Changed
- **Service-layer type migration**: Moved all data-type definitions (struct/enum) from 8 legacy Rust modules into their `services/` counterparts. Legacy modules now import types from `services/`. External callers (`lib.rs`, `tools/vault_search.rs`, test code) updated to reference `crate::services::*` paths. Unused imports cleaned up across legacy modules. `images.rs` had no types — already clean. Cargo rebuild required (catalog is `include_str!`-ed).
- Deleted stale `chatStore.phase.test.ts.bak`

## 2026-06-25 — Catalog Addition: Discovering the Art of Mathematics (11 volumes)

### Added
- **11 free textbook catalog entries** — the *Discovering the Art of Mathematics* (DAoM) inquiry-based-learning liberal-arts mathematics series by Julian F. Fleron, Philip K. Hotchkiss, Volker Ecke, and Christine von Renesse (Westfield State University) added to `mathmate/src-tauri/resources/textbook-catalog.json` as individual per-volume entries, each with a direct PDF, page count, file size, and cover thumbnail:
  - *Art & Sculpture* — geometry, 117pp
  - *Ideas of Calculus* — calculus, 130pp
  - *Dance* — other, 76pp
  - *Games & Puzzles* — discrete-math, 130pp
  - *Geometry* — geometry, 172pp
  - *Knot Theory* — other, 116pp
  - *Music* — other, 75pp
  - *Number Theory* — number-theory, 143pp
  - *Patterns* — other, 204pp
  - *The Infinite* — other, 113pp
  - *Truth, Reasoning, Certainty, & Proof* — discrete-math, 136pp
- Each volume's `download_urls.pdf` is the latest non-excerpt, non-teacher-edition PDF linked as "Download Book" on the book's page; `download_urls.html` is the book's landing page. License `free` (no stated Creative Commons license). The `geometry` subject was already defined in the UI's subject label/color map, so no frontend code change was needed. Catalog now contains 59 entries.

## 2026-06-23 — Catalog Addition: Huber Probability Texts & Online Statistics

### Added
- **3 free textbook catalog entries**:
  - *Probability Adventures* by Mark Huber (Claremont McKenna College) — a one-semester probability text written in tabletop-RPG style, building probability on logic rather than set theory. 171pp, subject `probability`.
  - *Probability: Lectures and Labs* by Mark Huber — a one-semester probability text with a partially-flipped, lecture-plus-R-lab design. 379pp, subject `probability`.
  - *Online Statistics: An Interactive Multimedia Course of Study* by David M. Lane (Rice University et al.) — public-domain introductory statistics with interactive simulations, case studies, and an analysis lab; PDF and ePub downloads plus a web version. 692pp, subject `statistics`.
- All entries linked to verified direct PDF/EPub downloads and landing pages. Catalog now contains 48 entries.

---

## 2026-06-18 — Catalog Addition: ClassicalRealAnalysis.com Textbooks

### Added
- **5 free textbook catalog entries** from ClassicalRealAnalysis.com:
  - *Real Analysis* (2nd Ed.) by Bruckner, Bruckner & Thomson — graduate-level real analysis, 660pp, subject `real-analysis`
  - *Elementary Real Analysis* (2nd Ed.) by Thomson, Bruckner & Bruckner — undergraduate real analysis, 740pp, subject `real-analysis`
  - *Mathematical Discovery* by Bruckner, Thomson & Bruckner — mathematics appreciation via discovery, 266pp, subject `other`
  - *The Calculus Integral* by B. S. Thomson — elementary integration theory, 304pp, subject `calculus`
  - *Theory of the Integral* by B. S. Thomson — rigorous integration (Riemann/Lebesgue/Henstock-Kurzweil), 422pp, subject `real-analysis`
- All entries linked to verified direct PDF downloads and landing pages. Catalog now contains 45 entries.

---

## 2026-06-16 — Book Tab PDF Streaming + Catalog Addition: Goodman Abstract Algebra

### Added
- **Free textbook catalog entry** — *Algebra: Abstract and Concrete* (Edition 2.6) by Frederick M. Goodman (University of Iowa) added to `mathmate/src-tauri/resources/textbook-catalog.json` under subject `abstract-algebra`. PDF (~5.9 MB) and HTML download page linked from the author's site. Catalog now contains 40 entries.
- **Book Tab PDF Streaming** — replaced the base64/Blob first-load path with a local loopback HTTP range server (`axum` on `tokio`). First Book-tab visit now loads page 1 via byte-range requests from `http://127.0.0.1:<port>/book/<project-id>`, eliminating whole-file read, base64 encode/decode, and Blob URL creation for large textbooks.

### Changed
- **BookPage.tsx** — removed `pdfUrlCache`, `CachedPdf`, base64 decode (`atob` + byte loop), and Blob URL creation. PDF URL now derived from `getBookStreamInfo()` + `projectTextbookStreamUrl()` with a revision hash for cache-busting.
- **useTextbookIndexer.ts** — auto-indexing delay increased from 500ms → 2000ms to let pdf.js render the first page before indexing begins.
- **tauri.conf.json CSP** — added `http://127.0.0.1:*` to `connect-src`.
- **lib/api/textbook.ts** — added `BookStreamInfo`, `getBookStreamInfo()`, `projectTextbookStreamUrl()`, `textbookPathRevision()`. Marked `Textbook.readProjectTextbook` as `@deprecated`.

### Cleanup
- Removed lifetime of `pdfUrlCache` LRU map and associated helper functions.

---

## 2026-06-13 — Phase 16A: Hint Ladder & Olympiad Coach Mode

### Added
- **Hint Ladder widget** — sequenced, pull-on-demand hint system for olympiad problems. Problem statement, attempt textarea, H1–H4 hint chips (revealed one at a time), and solved/stuck outcome buttons.
- **Olympiad Coach tutor style** — new system prompt profile for productive struggle coaching. Available in project settings and welcome page tutor style selector.
- **`/problem` slash command** — accepts a problem statement and opens the hint ladder widget in the chat timeline.
- **Real-time hint generation** — `generateHintLadder()` calls the configured LLM provider with a structured prompt to produce 4 hints (meta-strategy, structural, key insight, solution sketch) in a single request.
- **Segment-based command infrastructure** — slash commands can now produce structured `MessageSegment`s (not just text responses).
- **Session hint outcome persistence** — `hints_used` and `solved` fields stored in session header via `update_session_hint_outcome` Tauri command.
- **Phase 16B — Problem Bank & Practice Sessions**: Rust `ProblemBankService` with 60 bundled competition problems, `/practice` page with filters/timer/hint ladder/outcome recording, Competition Prep stats card on Overview page, "Practice" sidebar nav button, `/practice` slash command, and vault note generation for completed attempts (writes structured markdown to `<vault>/MathMate/Competition/Attempts/`).

### Changed
- **`SessionHeader`** extended with `hints_used` and `solved` optional fields (backward-compatible).
- **AssistantBubble** renders hint-ladder segments between ProcessBlock and content segments.
- **Sidebar Practice nav** — clock icon button in sidebar footer, active state highlighting on `/practice` route.
- **Phase 16C — Competition Resource Catalog**: 10 Evan Chen resources (Napkin, OTIS Excerpts, Barycentric Coordinates, Complex Numbers, Inequalities, Functional Equations, Orders Modulo a Prime, Probabilistic Method, Monsters, Syllabus) added to free textbook catalog with new olympiad subject tags and distinct colors in the catalog filter bar.
- **Phase 16D — Proof Critique**: `/critique` slash command opens structured proof submission panel; CritiqueCard renders traffic-light feedback (logic gaps 🔴 / double-check 🟡 / style 🟢) with reliability disclaimer; model recommendation nudge for Gemini 2.5 Pro; "Critique my proof" button in practice session done/outcome phases; `proof-critique` segment persists in session timeline.
- **TUTOR_STYLES** arrays in WelcomePage and ChatPage include the new "olympiad" entry.
- **API inventory** and generator scripts updated for the new `update_session_hint_outcome` command.

### Cleanup
- Fixed pre-existing unused-variable warning (`archived_jsonl`) in `session.rs`.

---

## 2026-06-12 — Bug Fixes & Roadmap: Phase 16 Competitive Math

### Fixed
- **Blank screen on startup**: `useRef` was called inside a `useEffect` in `App.tsx`, violating React’s Rules of Hooks. Moved ref declaration to component top level.
- **Rust dead-code warnings**: removed unused `uuid_v4` / `rand_u16` local functions from `src/services/project.rs` (file already uses `crate::project::uuid_v4()`).
- **File picker buttons in project wizard**: added native folder/file picker buttons (via `@tauri-apps/plugin-dialog`) next to vault path and textbook path fields in `WelcomePage`.
- **Textbook catalog blank screen**: wrapped `TextbookCatalog` in `createPortal(…, document.body)` so the `position: fixed` overlay correctly escapes any `overflow: auto` ancestor in WebKit/Tauri.
- **Error boundary in Welcome page**: added `ErrorBoundary` class component wrapping the catalog overlay; render crashes now surface a dismissable message instead of blanking the app.

### Added
- **Phase 16 roadmap — Competitive Math Support**: four implementation plan docs for olympiad/competition prep features:
  - `Implementation_CompetitiveMath_Phase1_HintLadder.md` — Hint Ladder widget + Olympiad Coach tutor style
  - `Implementation_CompetitiveMath_Phase2_ProblemBank.md` — Problem bank, timed practice sessions, vault integration, stats
  - `Implementation_CompetitiveMath_Phase3_Catalog.md` — Evan Chen catalog entries (10 CC-BY-SA resources) + olympiad subject tags
  - `Implementation_CompetitiveMath_Phase4_ProofCritique.md` — Structured proof critique with LLM reliability research, model recommendations, and Lean future path

---

---

## 2026-06-12 — Phase 15E: Multi-Vault Support

### Added
- **Rust data model**: `VaultKind` (Synapse | Legacy | Classroom), `VaultRef` (id, name, path, kind, read_only, position), `vaults: Vec<VaultRef>`, `active_vault_id`, `schema_version` on `MathProject`.
- **Load-time migration** (`migrate_project`): promotes `vault_path` → `vaults[0]` (VaultKind::Synapse), normalises positions, repairs missing/invalid `active_vault_id`. Idempotent.
- **5 Rust commands**: `set_active_vault`, `add_vault`, `remove_vault`, `rename_vault`, `update_project_vaults` — all registered in Tauri handler.
- **TS API wrappers** (`lib/api/projects.ts`): typed `invoke` calls for all 5 vault commands.
- **`VaultSwitcher` UI** (`Settings/VaultSwitcher.tsx`): shows all vaults, highlights active, supports add/remove/switch. Kind badges (Synapse/Legacy/Classroom).

### Changed
- **`projectStore`**: `setCurrentProject` uses `active_vault_id` → vault path resolution. New actions: `setActiveVault`, `addVault`, `removeVault` (each triggers Synapse restart).
- **`startSynapse`**: resolves vault path from active vault (fallback to legacy `vault_path`).
- **`MathProject` TS type**: added `vaults`, `active_vault_id`, `schema_version`, `VaultKind`, `VaultRef`.
- **`VaultSettingsTab`**: now includes `<VaultSwitcher />` below the vault path field.

### Verification
- `npm run build` ✅, `npx vitest run` ✅ (260/260), `cargo check` ✅, `cargo test` ✅

---

## 2026-06-12 — Phase 15D: Turn Orchestrator E2E Tests

### Added
- **`src/lib/turn/orchestrator.e2e.test.ts`** — 8 deterministic contract fixtures for `runTurn()` using mocked `streamChat` generators (no live network).
- **Helper utilities**: `chunks()`, `toolCallChunk()`, `textChunks()`, `collect()`, `collectOrThrow()`, `makeDeps()`, `makeInput()`.

### Fixtures
| # | Name | Assertions |
|---|------|------------|
| 1 | Text-only success | Event sequence (`status → tool-round-started → status → segments-changed → tool-round-finished → status → turn-finished`), `appendMessage` called with correct text |
| 2 | Single-tool round trip | `executeTool` called once with correct name, `loadSession` called after, `assembleToolCalls` processes deltas |
| 3 | Multi-tool sequence | 3 `streamChat` calls, 2 `executeTool` calls across rounds |
| 4 | Abort pre-stream | Signal already aborted → throws before `streamChat` is called |
| 5 | Abort mid-stream | `streamChat` throws mid-yield → error propagates |
| 6 | Error pre-stream | `streamChat` throws immediately → no `appendMessage` calls |
| 7 | Error mid-stream | Partial text yielded before throw → no `appendMessage` |
| 8 | Max-tool-round cap | 4 tool rounds, `"Stopped after 3 tool rounds"` appended |

### Verification
- `npm run build` ✅, `npx vitest run` ✅ (260/260, 11 test files), `cargo check` ✅

---

## 2026-06-12 — Phase 15C: Anthropic Wire-Protocol Support

### Added
- **Wire-variant detection** (`detectWireVariant`): routes OpenRouter → `openai_compatible`, native Anthropic → `anthropic_native`. Never infers from model ID.
- **Anthropic request builder** (`convertMessagesToAnthropicBlocks`): converts `MessagePayload[]` to Anthropic content blocks (text, image, tool_use, tool_result). Extracts system messages to `system[]` top-level parameter.
- **Anthropic tool schema conversion** (`convertToolsToAnthropicSchema`): OpenAI `function.parameters` → Anthropic `input_schema`.
- **Anthropic SSE parser** (`parseAnthropicFrame`): handles `message_start`, `content_block_start/delta/stop`, `message_delta/stop`, `ping`, and `error` events. Maintains per-index tool-call state for stable IDs across partial JSON deltas. Emits existing `StreamChunk` shape (including `tool_call_delta(s)` for `assembleToolCalls()` compatibility).
- **Robust SSE frame reader** (`readSSEFrames`): handles multi-line `data:`, `event:`, split-across-chunks, and comment lines per W3C spec.

### Changed
- **`streamChat()` routes by wire variant**: Anthropic-native path uses `/v1/messages` + `x-api-key` header + `readSSEFrames` + `parseAnthropicFrame`. OpenAI-compatible path uses `parseOpenAIFrame` (extracted from old `_parseDelta` — no behaviour change).
- **`MessagePayload.role`** now includes `"tool"` (needed for Anthropic tool-result conversion).

### Tests
- `providers.anthropic.test.ts` — 19 tests (conversion, text-only, thinking, tool use, mixed interleaved, errors)
- `providers.openai-compat.test.ts` — 20 tests (text, reasoning fields, tool call deltas, usage, finish_reason, OpenRouter parity)
- `providers.sse-reader.test.ts` — 12 tests (single/multi-line, events, split chunks, comments, Anthropic format)
- Full suite: 252 tests pass across 10 test files.

### Verification
- `npm run build` ✅, `npx vitest run` ✅ (252/252), `cargo check` ✅

---

## 2026-06-12 — Phase 15B: Discriminated-Union Stream State

### Changed
- **TurnPhase discriminated union** replaces 8 parallel Zustand fields (`streaming`, `abortController`, `streamedText`, etc.) with a single `phase: TurnPhase` state machine in `chatStore`.
- **Transition map**: `idle → preparing → streaming → finishing → idle`, with side paths `streaming → aborted → idle` and `streaming → errored → idle`.
- **Store rewrite**: `sendMessage` uses `for await (const event of runTurn(...))` with phase transitions in the event switch; retry logic transitions to `preparing` on retryable errors.
- **Consumers updated**: `ChatInput.tsx` uses `isTurnActive(phase)`; `ChatPage.tsx` derives `streaming`/`error` from phase; `useKeyboardShortcuts.ts` uses `isStreaming(store.phase)`.

### Added
- **Selectors in `phase.ts`**: `isTurnActive`, `isStreaming`, `isAborted`, `isTurnErrored`, `latestText`, `latestThinking`, `currentSegments`, `currentAbortController`, `currentTurnError`.
- **`capturedInput`** field in store for auto-memory storage post-turn.

### Tests
- `chatStore.phase.test.ts` — 55 tests covering every selector, invariant, and edge case.
- Full suite: 197 tests pass across 8 test files.

### Verification
- `npm run build` ✅, `npx vitest run` ✅ (197/197), `cargo check` ✅

---

## 2026-06-12 — Phase 15A: Component Decomposition

### Changed
- **ChatMessage decomposition** (`src/components/chat/`): 386L → 8 focused sub-components (UserBubble, AssistantBubble, ToolResultBubble, VaultChips, QuickSavePopover, MessageSegments, StreamingMessage, ChatMessage shell at 128L). Root re-export shim preserves all import paths.
- **Sidebar decomposition** (`src/components/Sidebar/`): 585L → 8 sub-components (Sidebar shell at 228L, ProjectSection, ProjectMenu, SessionList, SessionRow, ArchivalToggle, ArchivedProjectRow, NewProjectForm). CSS module moved.
- **ProjectSettingsPanel decomposition** (`src/components/Settings/`): 748L → 9 sub-components (shell at 144L with tab routing, VaultSettingsTab, TextbookTab, ModelSettingsTab, LaTeXSettingsTab, AdvancedTab, PanelHeader, Shared). New tab-bar UI.
- **PdfViewer decomposition** (`src/components/PdfViewer/`): 903L → 4 sub-components (PdfViewer shell at 351L, PdfPageCanvas, PdfNavigationBar, PdfRegionHighlight). Fit-width + capture box state retained in shell.

### Added
- Barrel `index.ts` files for `chat/`, `Sidebar/`, `Settings/`, `PdfViewer/`.

### Verification
- `npm run build` ✅, `cargo check` ✅

---

## 2026-06-12 — Architectural Review & Phase 14 Plan

### Added
- **Phase 14: Architectural Hardening** in `Roadmap.md` — 8 sub-phases (14A–14H) addressing structural debt identified in a full codebase review. No code changes in this entry; this is a planning day.
- **9 implementation plan docs** in `docs/mathmate/`:
  - `Implementation_Phase14_ArchitecturalHardening.md` (overview, sequencing, risks)
  - `Implementation_Phase14A_TypedTauriApiClient.md` — typed `invoke` wrappers in `src/lib/api/*`
  - `Implementation_Phase14B_StreamTurnOrchestrator.md` — extract `chatStore.sendMessage` (~470 lines) into a pure async generator
  - `Implementation_Phase14C_RustServiceLayer.md` — `services/*` modules + centralized `PathScope::guard` (replaces 4 inline reimplementations)
  - `Implementation_Phase14D_VaultBackend.md` — `VaultBackend` strategy interface (replaces 9 inlined Synapse/legacy fallback branches)
  - `Implementation_Phase14E_UnifiedErrorModel.md` — `AppError` type on both sides; merge `StreamError`; fix `session::append_message` data-loss risk
  - `Implementation_Phase14F_CssModuleMigration.md` — top 5 UI primitives → CSS modules
  - `Implementation_Phase14G_Cleanup.md` — 15 small no-behavior-change cleanups (dead code, no-op tests, TODOs, dynamic imports)
  - `Implementation_Phase14H_TsRustTypeAlignment.md` — `ts-rs` codegen foundation for wire types
- **Future Architecture (Phase 15+)** section in `Roadmap.md` for the larger refactors that depend on Phase 14 first: component decomposition, discriminated-union stream state, real Anthropic protocol, integration tests, multi-vault, codegen for the API surface.

### Changed
- **Roadmap checkbox count**: 95 → 122 items. Phase 14 adds 27 new planned items; Phase 15+ adds 8 deferred items.

### Notes
- Sequencing in Phase 14 is deliberate: 14G (cleanup) → 14A (typed client) → 14F (CSS modules, orthogonal) → 14E (error model) → 14C (service layer) → 14B (orchestrator, highest risk) → 14D (vault backend) → 14H (codegen, long-term).
- Every Phase 14 sub-phase is a **no-behavior-change** refactor. No new features; no wire format changes; no Tauri command name changes.
- See `03_Dev_Logs/2026-06-12.md` for the full review findings and rationale.

---

## 2026-06-09 — PDF Viewer Navigation, Zoom Rendering & Free Textbook Initiative Plan

### Added
- **PDF bookmarks sidebar** — The Book tab now reads embedded PDF outline/bookmarks via pdf.js and exposes a toggleable Bookmarks panel. Bookmark entries resolve to page numbers and can be clicked to navigate directly to sections.
- **Explicit page jump** — The page control is now a controlled input with a Go button, Enter-to-submit, Escape-to-clear, and validation for out-of-range pages.
- **PDF viewer caching** — The Book tab now reuses cached Blob URLs and parsed pdf.js document proxies for recently opened textbooks, reducing delay when switching back to the Book tab.
- **Resizable capture box** — Added a Capture Region mode with a movable/resizable selection box and explicit Take Screenshot / Cancel controls, replacing reliance on fragile click-drag capture.

### Fixed
- **PDF Book viewer zoom controls** — Fixed HiDPI canvas rendering so zoom changes re-render the actual PDF page at the requested scale instead of only enlarging the canvas/container viewport. Fit Width now computes against the rendered page CSS width and can show the full page width in the viewer.
- **PDF screenshot selection reliability** — Capture now uses an explicit overlay box and the same canvas crop pipeline, avoiding missed pointer-drag captures.

### Verification
- `npm run build` ✅

### Changed
- **Roadmap**: Marked **PDF Viewer Tab** as completed (was still unchecked despite full implementation).
- **Implementation_PDFViewerTab.md**: Updated status from "Planned" to "Complete".
- **Implementation_FreeTextbooks.md**: Rewrote from legacy SwiftUI prototype architecture to current v2 stack (Tauri/React/TypeScript/Rust) with catalog schema, Tauri commands, React components, and integration with existing PDF infrastructure.

### Added
- **Textbook Content Integration** — Full-text search + agent-proactive retrieval for project textbooks. Users can ask about specific sections/exercises and the AI searches the indexed textbook text automatically.
  - `textbook_index.rs` — Index save/load/search with keyword scoring and snippet extraction (11 tests).
  - `tools/textbook_search.rs` — `search_textbook` tool definition + executor with graceful error handling for all edge cases.
  - `useTextbookIndexer.ts` — pdf.js text extraction hook that sends batches to Rust for caching.
  - `PdfViewer.tsx` — Indexing progress indicator and "✓ Search ready" status in toolbar.
  - `chatStore.ts` — System prompt injection instructing AI to use `search_textbook` when applicable.
  - `get_tool_definitions` now returns 8 tools instead of 7 (added `search_textbook`).

### Changed
- `usePdfRenderer.ts` — Now exposes `pdfDocument` (the pdf.js document proxy) for external hooks.
- `PdfViewer.tsx` — Added `textbookId` and `textbookTitle` props.
- `BookPage.tsx` — Derives stable textbook ID from path and passes it to PdfViewer.
- `tools/mod.rs` — `execute_tool()` now accepts `project_id` parameter, dispatched to `search_textbook`.
- `lib.rs` — `execute_tool` passes `project_id` through to `tools::execute_tool`.

---

## 2026-06-05 — Phase 12D: Process Block & Tool Formatting

### Added
- **`src/lib/toolFormat.ts`** — Four deterministic utility functions for presenting tool calls in the chat UI: `formatToolCall` (humanized action label), `formatToolResult` (short result summary), `formatToolInput` (function-call style input string), `renderToolOutput` (typed structured output data for per-tool rendering). Covers all 7 built-in tools with graceful fallback to raw JSON for unknown tools. 50 unit tests.
- **`src/components/chat/ProcessBlock.tsx`** — New unified collapsible container that wraps all pre-answer activity (reasoning traces + tool calls) in a single Process Block. Handles Case A (pure tool calling) and Case B (reasoning with embedded tool calls) by preserving chronological segment order. Auto-expands during streaming, collapses on completion with a CSS `max-height` transition. Tool rows show humanized labels, result summaries, and expandable detail panels with INPUT (function-call style) and per-tool OUTPUT renderers.
- **PDF → Vault Import** — Parse a PDF's embedded outline (bookmarks/TOC) using `lopdf` and auto-generate vault study notes. The Project Settings panel shows an "Import PDF Structure" section when both a textbook PDF and vault path are configured. Users can select which chapters/sections to import, and MathMate creates `Chapters/<chapter>/<section>.md` files with study note templates, updates `PROGRESS.md` with a chapter/section table, and links the textbook in `Home.md`.

### Changed
- **`src/components/ChatMessage.tsx`** — Replaced the old `TimelineSegment` / `ThinkingSegment` / `ToolCallSegment` / `ToolResultSegment` per-segment renderers with `ProcessBlock` + `ContentSegment`. `ContentSegment` and legacy fallback path unchanged.

### Removed
- `TimelineSegment`, `ThinkingSegment`, `ToolCallSegment`, `ToolResultSegment` inline components from `ChatMessage.tsx` (superseded by `ProcessBlock`).

### Fixed
- **OpenRouter reasoning visibility** — `streamChat()` now opts into OpenRouter reasoning streams with `include_reasoning: true`, allowing reasoning-capable models such as `google/gemini-3.1-flash-lite` to populate MathMate's existing plain-text thinking trace UI when OpenRouter returns readable reasoning. The stream parser also surfaces text/summary entries from `reasoning_details` while ignoring encrypted details.

### Verification
- `npm run build` ✅, `npm test` ✅ (94 passed), `cargo check` ✅

---

## 2026-06-02 — Hardening: Streaming, Tool Loop, Vault Scope

### Changed
- Hardened OpenAI-compatible stream parsing for non-string `delta.content` / reasoning payloads and multiple `delta.tool_calls` in one SSE event.
- Added an explicit max-tool-round terminal assistant message when the model never produces a final answer.
- Scoped legacy `scan_vault` / `read_note` Tauri commands to active project roots and removed unconditional external-file open confirmation bypasses.
- Tightened rendered HTML sanitization by removing high-risk interactive/form tags and SVG `foreignObject`.

### Verification
- `npm run build` ✅, `npm test` ✅, `cargo check` ✅, `cargo test` ✅ (76 passed, 1 ignored)

---

## 2026-06-02 — Phase 13A: Synapse MCP Subprocess Client

### Added
- **`mcp_client.rs`** — New Rust module managing a Synapse MCP subprocess via JSON-RPC over stdio. `McpClient::start()` spawns `synapse mcp start --vault <path>` with MCP initialize handshake; `call()` sends `tools/call` requests with 10s timeout; `list_tools()` converts MCP definitions to MathMate's format; `stop()` kills the child.
- **Binary resolution** — Synapse binary resolved from `SYNAPSE_BIN` env var → `~/.cargo/bin/synapse` → dev workspace sibling.
- **AppState integration** — `mcp_client: Mutex<Option<McpClient>>` in AppState, registered in Tauri managed state.
- **`start_synapse_mcp` / `stop_synapse_mcp`** — Tauri commands to manage the Synapse subprocess lifecycle.
- **`synapse_mcp_status` / `check_synapse_available`** — Status query commands for frontend UI.
- **Synapse-aware tool definitions** — `get_tool_definitions()` returns Synapse tools when MCP client is running; falls back to legacy vault tools when offline.
- **Synapse tool routing** — `execute_tool()` proxies `note_*` and `vault_info` calls through `McpClient::call()` when Synapse is active.
- **Auto-start on project load** — `projectStore.ts` auto-starts/stops Synapse when switching projects with vault paths; VaultPage toolbar shows Synapse/Legacy status indicator.

### Verification
- `cargo check` ✅, `cargo test` ✅ (76 tests), `npm run build` ✅

---

## 2026-06-02 — Phase 13B: Vault UI Redesign

### Added
- **`synapse_call` Tauri command** — `synapse_call(tool, args)` thin proxy through `McpClient::call()` for frontend-driven Synapse operations.
- **`vaultStore.ts` rewrite** — Synapse-backed `loadNotes` (`note_list`), `searchNotes` (`note_search`), `readNote` (`note_read`), `saveNote` (`note_update`), `createNote` (`note_create`), `loadBacklinks` (`note_backlinks`); `checkSynapseStatus` queries `vault_info`; legacy fallback preserved.
- **VaultPage FTS search bar** — 300ms debounced search via `note_search` with result snippets.
- **Folder-grouped note list** — groups by parent folder, root-first alphabetical sorting.
- **Edit mode** — `[Edit]` toggles `<textarea>` with raw body; `[Save]` → `note_update`; unsaved changes indicator.
- **New note** — `[+ New note]` button at list bottom; inline title form → `note_create`, automatically reloads list.
- **Backlinks panel** — collapsible section showing backlinks and forward links with broken-link detection.
- **Synapse status bar** — toolbar shows note count (e.g. "Synapse active (12 notes)") when running; amber banner with `[Start Synapse]` when offline.
- **Error handling** — inline save error below editor with dismiss; note-level error in title bar.

### Verification
- `cargo check` ✅, `cargo test` ✅ (76 tests), `npm run build` ✅

---

## 2026-06-02 — Phase 13C: Context Panel & Chat Integration

### Added
- **Related Notes section** — New section in ContextPanel showing top-5 `note_search` results from the last 3 user messages (debounced 1500ms); hidden when Synapse not running; clickable notes navigate to `/vault`.
- **Note citation chips** — Small chips below assistant messages when the agent creates/updates a vault note; clicking navigates to the Vault tab and selects the note.
- **Quick Save button** — `[Save to vault]` appears on hover over assistant messages; opens a popover with pre-filled title from session name + date; calls `note_create`.
- **Navigation helper** — `pendingSelectPath` + `navigateToNote(path)` in vaultStore; VaultPage watches and auto-selects the target note.

### Verification
- `cargo check` ✅, `cargo test` ✅ (76 tests), `npm run build` ✅

---

## 2026-06-01 — Phase 12C: Reasoning Visibility & Rollout Safety

### Added
- **Timeline UI feature flag** — `timelineEnabled` in configStore, persisted to localStorage. When OFF, forces legacy rendering even if segments exist.
- **Settings toggle** — "Timeline UI" checkbox in General settings tab.

### Safety Guarantees
- Thinking traces remain visible as plain text (collapsible) in both timeline and legacy modes.
- Legacy fallback preserved: old sessions without segments always render correctly.
- Feature flag allows safe rollout: can disable timeline UI without code changes.

### Verification
- `npm run build` ✅
- 47/63 roadmap items completed

---

## 2026-06-01 — Phase 12B: Tool Registry & Execution

### Added
- **Three v1 tools** — `calculate` (numeric evaluation via meval), `graph` (2D function point generation), `vault_search` (keyword search across vault notes). All exposed as OpenAI-compatible function definitions.
- **`tools/` Rust module** — `mod.rs` (registry + dispatcher), `calculate.rs`, `graph.rs`, `vault_search.rs`. 25 new unit tests.
- **Tauri commands** — `get_tool_definitions()` returns OpenAI-compatible tool schema; `execute_tool(call_id, tool_name, arguments, project_id)` dispatches to the right executor with auto vault_path resolution.
- **`buildToolPayload()`** — Wraps messages + tool definitions for the OpenAI function-calling protocol.
- **Multi-round tool loop** — `chatStore` streams with tool definitions, assembles fragmented tool-call deltas, executes via Rust, appends tool results, and continues for up to 3 rounds. Per-tool 8s timeout.
- **Tool call timeline** — `running` status during execution, completed/error after. Tool result segments with success/error styling.

### Changed
- `providers.ts` — `streamChat()` now accepts `{ messages, tools }` payload format alongside raw message arrays.
- `chatStore.ts` — Streaming section replaced with multi-round tool loop. Conversation history accumulated across rounds with proper OpenAI protocol messages.
- `Cargo.toml` — Added `meval = "0.2"` for safe numeric evaluation.

### Verification
- `npm run build` ✅
- `cargo check` ✅
- `cargo test` ✅ (64 tests, 25 new)

---

## 2026-06-01 — Phase 12A: Chat Timeline Data Model

### Added
- **`MessageSegment` type system** — Rust `MessageSegment`/`SegmentKind`/`ToolCallStatus` types with serde tag-based serialization. TypeScript discriminated union `MessageSegment` with 4 variants: `thinking`, `tool_call`, `tool_result`, `content`.
- **Legacy message adapter** — `adaptLegacyMessage()` converts pre-Phase-12 messages (flat `thinking`/`content` fields) into ordered segments for timeline rendering.
- **Tool-call delta streaming** — `_parseDelta()` extracts `delta.tool_calls` from OpenAI-compatible SSE streams. `assembleToolCalls()` stitches fragmented deltas into complete tool calls by index.
- **Live segment assembly** — `chatStore` accumulates `streamSegments` during streaming with stable segment IDs. Thinking and content segments update in-place; tool call segments assembled on stream end.
- **Timeline segment components** — `ThinkingSegment` (collapsible monospace), `ToolCallSegment` (status badge, expandable args), `ToolResultSegment` (error/success styling), `ContentSegment` (reuses markdown+KaTeX).
- **Inline streaming** — Synthetic `__streaming__` message appended to display during streaming with `streamSegments` prop. Removed old Footer streaming overlay.
- **7 new Rust tests** — Segment roundtrip, legacy loading, segment order preservation, tool args not double-encoded, status serde, content parts roundtrip.

### Changed
- `session.rs` — `Message` gains `segments: Vec<MessageSegment>` field (serde default for backward compat). Legacy `thinking` field preserved.
- `types.ts` — `Message.segments` added. `StreamChunk` gains `tool_call_delta`, `tool_call_complete`, `tool_result` fields.
- `providers.ts` — `buildPayload()` supports segment-based assistant messages. `assembleToolCalls()` exported.
- `chatStore.ts` — Streaming loop accumulates `streamSegments`. All state reset paths clear segments + deltas.
- `ChatMessage.tsx` — Segment-based rendering when `segments.length > 0`, legacy fallback otherwise.
- `ChatPage.tsx` — Synthetic streaming message in Virtuoso data. Footer simplified (no streaming overlay).

### Verification
- `npm run build` ✅
- `cargo check` ✅
- `cargo test` ✅ (39 tests, 7 new)

---

## 2026-06-01 — Security: Study-Log Path Containment (Item #8)

### Added (Security)
- **`pathscope::ensure_inside_vault(vault, target)`** — Canonicalizes vault and target, creates parent dirs, verifies target starts with vault. Four unit tests covering ok, outside, prefix-attack, and traversal cases.
- **`src-tauri/src/audit.rs`** — New audit logging module. Appends tab-separated lines to `~/.mathmate/audit.log` with timestamp, event type, session, vault, target, bytes, and SHA-256. Automatic rotation at 1 MB.
- **Auto-generated banner** — Every study log file now starts with:
  ```
  <!-- AUTO-GENERATED by MathMate v2 — DO NOT EDIT -->
  <!-- session_id: ... -->
  <!-- content_sha256: ... -->
  ```
- **Audit log** — Each save writes a line with session_id, vault path, target, byte count, and SHA-256 of content.

### Changed
- `wrapup::save_wrap_up` — Now calls `pathscope::ensure_inside_vault()` before writing. Prepends banner with session_id and content hash. Logs to `~/.mathmate/audit.log`.
- `ChatPage.tsx` — Uses `currentProject.vault_path` instead of hardcoded `~/.mathmate/study_logs`.
- `Cargo.toml` — Added `sha2 = "0.10"` dependency.
- `lib.rs` — Registered `audit` module.

### Verification
- `cargo test` ✅ (32 tests: 24 pathscope + 4 wrapup + 3 audit + 1 doc)
- `cargo check` ✅
- `npm run build` ✅
- `npm run test` ✅ (44 TS tests)

---

## 2026-06-01 — Security: Memory → Prompt Isolation (Item #7)

### Added (Security)
- **`src/lib/memorySafety.ts`** — New shared module with:
  - `scanMemoryContent(content, mode)` — Injection scanner that classifies content as `accepted`, `acceptedWithRedaction` (redacted), or `rejected`. Covers exfil URLs, tool-call JSON, instruction overrides, role hijacks, system impersonation, and API key leakage.
  - `wrapRetrievedMemories(items, opts?)` — Retrieval-time isolation wrapper that sorts by trust score, caps at 8 KB total / 2 KB per item, demotes low-trust items (< 0.30) to a separate warning block, and excludes items below 0.10.
  - `src/lib/memorySafety.test.ts` — 22 unit tests covering all scanner + wrapper cases.
- **`store_memory_with_safety` Rust command** — Authoritative enforcement point in `memory.rs`. Runs the same injection scanner server-side before DB write, persists `scan_status` / `scan_reason` columns, and supports `strict` / `balanced` / `off` modes.
- **DB schema migration** — Idempotent `ALTER TABLE memories ADD COLUMN scan_status` / `scan_reason` for audit trail.
- **`SafetyMode` / `ScanResult` types** — Shared between Rust and TS.
- **Settings UI** — New "Memory Safety" section in Settings → Chat tab: safety mode picker (balanced/strict/off), min trust threshold slider (0.0–1.0), max memory bytes input.
- **MemoryRetrievalBar audit badges** — Per-item scan status badges (⚠️ Redacted / ❌ Rejected) with hover reason, plus header summary showing redacted/rejected counts.

### Changed
- `src/stores/memoryStore.ts` — Now calls `store_memory_with_safety` instead of `store_memory`. Includes TS pre-check for immediate UX feedback before the authoritative Rust scan.
- `src/stores/chatStore.ts` — Auto-store uses `store_memory_with_safety`. Retrieval path now uses `wrapRetrievedMemories` with size caps, trust bucketing, and the "untrusted context" preamble instead of raw concatenation.
- `src/lib/types.ts` — `MemoryItem` gains optional `scan_status` / `scan_reason` fields.
- `src/stores/configStore.ts` — `AppConfig.chat` gains `safety_mode`, `safety_min_trust`, `safety_max_total_bytes`.
- `src-tauri/src/config.rs` — `ChatConfig` gains optional `safety_mode`, `safety_min_trust`, `safety_max_total_bytes`.
- `src/components/MemoryRetrievalBar.tsx` — Shows scan status badges and groups by status.

### Verification
- `npm run build` ✅
- `cargo check` ✅
- `npm run test` ✅ (44 tests: 22 sanitize + 22 memorySafety)
- `cargo test` ✅ (20 pathscope tests)

---

## 2026-06-01 — Security: Sanitizer URL Allowlist + Anchor `rel`

### Added (Security)
- **URL scheme allowlist** in `sanitize.ts`: `javascript:`, `vbscript:`, `data:` (on anchors), `file:`, `blob:` are stripped from `href`/`src`/`xlink:href` attributes. Only `http:`, `https:`, `mailto:`, `data:image/...`, and `asset:` are allowed.
- **Auto-injected `rel="noopener noreferrer"`** on all `<a>` tags that have `target` — prevents reverse tab-nabbing.
- **Forbidden attributes**: `formaction`, `ping`, `autofocus`, `formmethod`, `formenctype`, `formtarget`, `formnovalidate` added to DOMPurify's `FORBID_ATTR` list.
- `src/lib/sanitize.test.ts` — 22 unit tests covering the `safeUrl` validation function.
- `npm run test` / `npm run test:watch` — Vitest test runner integrated with `happy-dom`.

### Changed
- `vite.config.ts` — Added test configuration (`environment: "happy-dom"`).

---

## 2026-06-01 — Security: Tauri Path-Scope Guard

### Added (Security)
- **`src-tauri/src/pathscope.rs`** — New Rust module with path containment logic:
  - `is_within(root, target)` — canonical-path containment check
  - `canonical_inside_any(roots, target)` — checks against multiple roots
  - `safe_extension(path)` — extension allowlist (`.md`, `.pdf`, `.png`, `.jpg`, `.jpeg`, `.webp`, `.gif`, `.txt`, `.json`, `.tex`, `.csv`)
  - `normalize_local_path(raw)` — parses `file:` URIs, plain paths, and `~`; rejects non-local schemes
  - 20 unit tests
- **`read_file_as_base64` now scoped**: Accepts `project_id: Option<String>`. Rejects paths outside the active project's vault, textbook, and `~/.mathmate/`.
- **`open_path` now scoped**: Rejects non-`file:` schemes and disallowed extensions. Requires `confirmed: true` for paths outside all allowed roots. Accepts `project_id: Option<String>` for project-root resolution.
- **`project::load_project()`** — New public function to load a project by ID from active or archived state.

### Changed
- `capabilities/default.json` — Removed unused `shell:default` permission.
- `ChatInput.tsx` — Passes `projectId` when calling `read_file_as_base64`.
- `ChatPage.tsx` — Passes `projectId` and `confirmed: true` when opening textbook links.

---

## 2026-06-01 — Security: Strict Content-Security-Policy

### Added (Security)
- **Content-Security-Policy** in production builds (`tauri.conf.json`). The new policy blocks all inline scripts, disables iframes and forms, restricts `connect-src` to provider API hosts only, and excludes `https:` from `img-src` to prevent data exfiltration via image tags. Only `style-src 'unsafe-inline'` is permitted — required by KaTeX's inline style rendering.
- `docs/mathmate/SECURITY.md` — Threat model overview, CSP directive rationale, and links to all security implementation plans.

---

## 2026-06-01 — Security: No `eval`/`new Function` on Model or User Output

### Fixed (Security)
- **Quiz free-response** and **Function Graph** widgets no longer evaluate model/user output with `new Function()`. Replaced with a safe `safeMath` parser (mathjs AST validation + frozen scope) that only allows arithmetic operators and an allowlisted set of math functions. All code-execution vectors (constructor chains, `globalThis`, unicode escapes, Tauri IPC access) are blocked.

### Added
- `src/lib/safeMath.ts` — Centralized safe arithmetic evaluator using mathjs AST parsing, node-type validation, and frozen-scope evaluation.
- `scripts/check-no-eval.mjs` — CI guard that scans `src/` for any `new Function()` or `eval()` usage. Runs as `prebuild` hook and via `npm run lint:no-eval`.

### Changed
- `package.json` — Added `prebuild` hook and `lint:no-eval` script.

---

## 2026-05-30 — Session Manager

### Added
- **Session Manager page** (`/sessions`) — Full-panel view for browsing, searching, and bulk-managing all sessions across projects. Accessible via new nav button in the sidebar (above Settings).
- **Project-grouped session table** — Sessions sorted by `updated_at` within collapsible project groups with count badges. Sticky group headers.
- **Detail panel** — 292px right panel showing session metadata (created, updated, model, provider, project ID), last-message preview, and actions: rename, open in chat, archive/restore, delete/purge.
- **Bulk actions** — Checkbox multi-select with Archive, Delete (active sessions) and Purge (archived sessions). Confirmation dialogs for destructive actions.
- **Filter & search** — Filter pills (All / Active / Archived) and real-time client-side search across title, model, provider, and project name.
- **Inline rename** — Both from the row-level ⋯ menu and the detail panel. Blur/Enter to save, Escape to cancel.
- **Session Manager nav in sidebar** — Active state highlighting when on `/sessions` route.

### New files
- `src/pages/SessionManagerPage.tsx`
- `src/components/SessionManager/SessionTable.tsx`
- `src/components/SessionManager/SessionTableRow.tsx`
- `src/components/SessionManager/SessionDetailPanel.tsx`
- `src/components/SessionManager/BulkActionBar.tsx`

---

## 2026-05-29 — Phase UX: Chat & Model Polish

### Added
- **Dynamic model catalog** — Model selector now fetches live metadata from OpenRouter API (357+ models) with 24h cache. Shows model names, vision capability badges, and context length badges. Refresh button for on-demand updates. Graceful fallback to static configured models when offline.
- **Vision model filter** — "Vision" toggle chip in model selector filters to image-capable models only. Non-blocking warning toast when sending images to a non-vision model.
- **Full-width assistant layout** — Assistant responses render without bubble chrome (no border, radius, or elevated background) at full width. User message bubbles remain unchanged.
- **LaTeX font size bump** — Default body font increased 14px → 15px, display math 1em → 1.15em for better readability. Settings slider range updated to 13–21.
- **Runtime font size application** — Persisted `ui.font_size` from config is now applied to CSS variables on app load via a configStore subscription effect.
- **Lucide icon migration** — All 25 emoji icons across 12 files replaced with Lucide SVG icons (`Brain`, `AlertTriangle`, `X`, `CheckCircle2`, `XCircle`, `Lightbulb`, `Eye`, `Archive`, `Trash2`, `RotateCcw`, `Settings`, `Package`, `Camera`, `MessageSquare`, `FileText`, `BookOpen`, `BookMarked`, `RefreshCw`). Consistent sizing and `currentColor` inheritance.

### Changed
- **`ModelSelector.tsx`** — Rewritten to support catalog-backed model list with capability badges, vision filter toggle, catalog refresh, and loading/error states. Modal width increased 480px → 520px.
- **`ChatMessage.tsx`** — Assistant messages: transparent background, no border, no border-radius, full width. User messages unchanged.
- **`theme.css`** — Body font 15px, display KaTeX 1.15em multiplier.
- **`SettingsPage.tsx`** — Font slider range 13–21, async config sync effect.

### New files
- `src-tauri/src/models.rs` — Model catalog fetch/cache layer (OpenRouter API, 24h TTL, atomic writes)
- `src/lib/types.ts` — Added `ModelCatalogEntry`, `ModelCatalog`, `ModelPricing` types

### New dependencies
- `lucide-react` — SVG icon library (tree-shakeable, ~1KB per icon)
- `reqwest` (Rust, `blocking` + `json` features) — HTTP client for OpenRouter API

---

## 2026-05-28 — v2.0.0-dev.4 (THQ Security & Fixes)

### Fixed
- **Retry logic bug** — User-cancelled streaming requests (AbortError) are no longer incorrectly retried after a 2s delay. Added early-exit guard before the retry gate; simplified `isRetryable` to only inspect `StreamError.retryable`.
- **Thinking trace data loss**: Thinking/reasoning text is no longer lost on session reload. Added a dedicated `thinking` field to the Message struct (Rust + TypeScript), moving it out of the `flags` map which only accepted booleans.
- **HTML injection vulnerability**: All `dangerouslySetInnerHTML` call sites (message bubbles, streaming footer) now sanitize output through DOMPurify with a KaTeX-safe configuration.
- **Env var access security**: API key resolution now routes through a Rust Tauri command with an explicit whitelist instead of unguarded browser-side reads.

### Security
- **Cleaned leaked OpenRouter API key** from `.env` file and replaced with placeholder values.
- **Added `.gitignore`** for `mathmate/` to prevent future env/key leaks.
- **Added `.env.example`** template for new contributors.


### Added
- **Removed hardcoded DEBUG logs** — `configStore.ts`, `projectStore.ts`, and `App.tsx` no longer have `const DEBUG = true`, global `logLines` accumulators, or debug log panels rendered to users. Loading screen is now a simple centered spinner.
- **Shared invoke helper** — All 7+ copy-pasted `invoke<T>` wrappers consolidated into `src/lib/tauri.ts`. Files now import from the shared module.
- **ErrorBoundary component** — New class-based boundary wraps `ChatMessage`, `VizRenderer`, and `QuizRenderer` individually to prevent render crashes from blanking the entire app.
- **Atomic session writes** — `write_jsonl` now writes to a `.jsonl.tmp` file then atomically renames. Stale temp files are cleaned up on startup.
- **Synapse memory retrieval in chat UI**: On each user message, the system now queries stored memories and injects relevant context into the model's system prompt. Retrieved memories are shown as a collapsible inline bar during streaming.
- **Auto-memory storage**: Each user question is automatically saved as a memory for future retrieval, building a persistent learner profile over time.
- **MemoryRetrievalBar component**: Collapsible inline bar showing retrieved memories with source icons, content excerpts, relevance scores, and tags.
---

## 2026-05-26 — v2.0.0-dev.3 (Phase T3: UI Parity)

### Added (Phase T3)
- **Full tabbed Settings page** — General (font size), Chat (system prompt, max tokens, temperature), Models (provider list), About; persisted via `save_app_config`
- **LaTeX palette** — 70+ snippets, 10 categories, keyboard navigation, search; invocable via ƒx button or ⌘\
- **Math composer** — Live KaTeX preview above input with 80ms debounce
- **Model selector** — Searchable popover with provider tabs, grouped model list
- **Context panel** — Slide-in from right (⌘⌥P) with token usage bar, session stats, memory engine
- **Wrap-up summary** — Study log generation + save-to-vault
- **Toast notifications + error banner** — Floating feedback for save/error
- **Complete keyboard shortcuts** — ⌘N, ⌘1/2/3, ⌘,, ⌘\, ⌘⌥P, ⌘⌫, Esc

### New files
- `src/lib/latexSnippets.ts` — 70+ LaTeX snippets (ported from Swift)
- `src/components/LaTeXPalette.tsx`, `MathComposer.tsx`, `ModelSelector.tsx`, `ContextPanel.tsx`

---

## 2026-05-26 — v2.0.0-dev.2 (Phase T1 + T2)

### Removed
- **Entire widget system**: `WidgetParser`, `WidgetView`, widget resource files. No more `create_widget_spec` tool or widget spec encoding/decoding.
- **Entire tool system**: `ToolCatalog`, `ToolExecutor`, `ToolPolicyManager`, `SynapseManager`. No tool definitions sent to models, no multi-round tool execution loop in streaming.
- **Entire visualization system**: `VisualizationIntentCompiler`, `EntityExtractor`, `SchemaAssembler`, `TypeResolver`, `CompilerLLMFallback`.
- **Entire native primitive system**: 18 files across `NativeWidgets/` including all interactive primitives (function graphs, quizzes, hints, number lines, geometry, tables, diagrams, animations) and their schemas/validators/state stores.
- **`MMExpressionEvaluator`**: Recursive-descent math expression parser (no longer needed without native graph primitives).
- **`ContentPart.widget` case**: Widget part type removed from the content model.
- **`StreamToken.toolCalls`**: Tool call delivery removed from streaming protocol.
- **`ModelProvider` protocol**: `tools: [ToolDefinition]` parameter removed from both `sendMessage` and `streamMessage`.
- **30 widget/tool/visualization tests** removed from the test suite; 3 test files deleted.

### Changed
- **`ChatViewModel.sendMessage`** simplified: streaming is now a pure text/thinking loop with no tool round handling, no widget parser integration, no tool policy management.
- **`ModelProvider.swift`** simplified: `MessagePayload` no longer has `toolCallId`, `toolCalls`, `.tool` role; `AnthropicProvider` and `OpenAIProvider` no longer handle tool calls in streaming responses.
- **`StreamCoordinator`** simplified: only text buffer management helpers remaining.
- **Default system prompt** (SettingsStore): `create_widget_spec` instruction removed.
- **`WrapUpService.swift`**: Fixed pre-existing syntax error (stray `)` at line 123).

### Fixed
- **Blank model responses**: Models were routing output through tool calls (defined in the system prompt), producing empty text channels. Removing tool definitions from the request eliminates this path entirely.

### Validation
- `swift build` ✅ (0 warnings)
- `swift test` ✅ (73/73 tests passing in 4 suites)

---

## 2026-05-24 (Phase E — Items 1–6)

### Added
- **Chat runtime decomposition**: 4 new service files extracted from `ChatViewModel`:
  - `WrapUpService` — wrap-up generation + vault saving (268 lines)
  - `ToolPolicyManager` — mutation policy, tool confirmation state + flow (111 lines)
  - `PromptAssemblyService` — system prompt assembly, widget detection, memory topic hints (122 lines)
  - `StreamCoordinator` — widget parser + text buffer helpers for streaming (86 lines)
- `ChatViewModel` reduced from ~2,216 → ~1,869 lines (347 removed).

### Changed
- **Concurrency hardening**: 2 of 9 `@unchecked Sendable` declarations fixed to `Sendable` (`AnthropicProvider`, `OpenAIProvider`). `AnyCodable` changed from `@unchecked Sendable` to `Sendable` using `any Sendable` for its value type. Remaining 6 instances documented with safety invariants.
- **Session store scalability**: All 5 data-access methods (`loadHeader`, `countMessages`, `updateHeader`, `loadMessages`, `allHeaders`) now use streaming `FileHandle` reads instead of loading entire files into memory.
- **Main-actor I/O offload**: `ConfigurationManager` I/O methods are now `nonisolated`. Image loading uses `Task.detached`.
- **Snapshot pipeline**: Two-phase render properly injects per-unit content. Both phases enforce hard 5s timeout.
- Replaced all `print()` debug logs with `os.Logger`. Replaced `URL(string:)!` with throwing method. Replaced 11 `try!` regexes with `compile()` helper.

---

## 2026-05-22 (Round 5–6 — Phase 9A + 9D Items 1-2)

### Added
- **Composite container primitive (`mm.composite.container`)**: renders multiple primitives in row or column layouts. Each child gets its own graph config and interaction state. TypeResolver detects "side by side", "stacked", "compare" keywords; EntityExtractor handles "compare X and Y" voice commands; SchemaAssembler creates one graph child per expression.
- **Quiz embedded visualization rendering**: quiz primitives (`MMQuizFreeResponseView`, `MMQuizMultipleChoiceView`) now render live native primitives when `visualization` spec is present, replacing gray placeholder boxes. `MMVisualizationSpec.toRawConfig(parentId:)` method converts viz specs to registry-compatible raw configs.
- **Graph tracer & sliders**: draggable point on curve with crosshairs and coordinate label, multi-curve picker dropdown, live tangent toggle (dashed line + slope via central-difference), horizontal slider, keyboard-bound step buttons (←/→), center-reset.
- **Automatic graph annotations**: y-intercepts (`f(0)`), x-intercepts (600-sample + bisection refinement to `1e-10`), local extrema (derivative sign-change detection + second-derivative classification), green dots for intercepts, orange dots for extrema, auto-positioned labels, toggle button.
- **`MMExpressionEvaluator`**: recursive-descent parser supporting `^`, trig functions, `ln`/`log`/`sqrt`/`abs`/`exp`, `pi`/`e`/`x`, unary negation, right-associative power — zero dependencies, replaced NSExpression hacks.
- **Diagram primitive (`mm.diagram.basic`)**: SwiftUI Canvas-based renderer with 5 shape types (rectangle, circle, ellipse, diamond, roundedRect), auto-layout for 3 patterns (venn=overlapping circles, flow=stacked rects+arrows, tree=root+fan-out children), arrow connectors with auto-arrowheads, text labels + sublabels, CSS hex color support.
- **Polar + parametric graph modes**: `mode` field added to `MMGraphFunctionConfig` — `"polar"` for `r=f(theta)` curves (sampled in theta, mapped to x/y), `"parametric"` for `(x(t), y(t))` curves. `MMExpressionEvaluator` extended to accept `[String: Double]` variable map (supports `theta`, `t`, and any named variable). Tracer/slider/annotations gated to cartesian-only for correctness.
- **System prompt simplified**: 82-line native-primitive schema contract replaced with a 6-line `visualize` instruction. `create_widget_spec` retained as low-level escape hatch for precise schema control.
- **Parameter sliders (`MMSliderSpec`)**: Desmos-style sliders rendered below graph canvas. Per-parameter named slider with value readout, SwiftUI `Slider` with continuous range, tinted to match curve color. All expressions (cartesian, polar, parametric) respect slider values via `evaluateWithSliders` helper. EntityExtractor handles 3 patterns: `"slider X from MIN to MAX"`, `"parameter X in [MIN, MAX]"`, `"transform"` auto-detect from expression letters.
- **Animation sequence primitive (`mm.animation.sequence`)**: Stage-sequenced animation layer wrapping any existing primitive via `MMPrimitiveRegistry`. Play/pause/step/first/last controls + scrub progress bar + stage counter. Stages render child primitives at ~30fps with interpolation.
- **Animation interpolation engine (`AnimationInterpolator`)**: Ease-in-out lerp for numeric config fields between adjacent stages. Supports nested path notation (`secantPairs[0][1]`) for array-of-array interpolation. Recursive array and dict merging.
- **Compiler auto-generation for 5 animation patterns**:
  - `secantToTangent`: 7 stages (function → secant at distance 3,2,1.5,1.2,1.05 → tangent) with `secantPairs[0][1]` interpolation
  - `riemannSum`: 4 stages (2, 4, 8, 16 rectangles) — placeholder, actual rectangle rendering future
  - `functionTransform`: 4 shift stages (original → 1 → 3 → full)
  - `stepThrough`: one stage per extracted annotation, cumulative reveal
  - `beforeAfter`: 2-stage comparison with/without annotations
- **TypeResolver animation detection**: "animate", "animation", "play through", "step through", "stage by stage" keywords resolve to `.animationSequence` before other checks.
- **30 end-to-end Intent Compiler tests** (was 26): +2 sliders, +2 animation.

### Fixed
- (none)

---


- **Composite container primitive (`mm.composite.container`)**: renders multiple primitives in row or column layouts. Each child gets its own graph config and interaction state. TypeResolver detects "side by side", "stacked", "compare" keywords; EntityExtractor handles "compare X and Y" voice commands; SchemaAssembler creates one graph child per expression.
- **Quiz embedded visualization rendering**: quiz primitives (`MMQuizFreeResponseView`, `MMQuizMultipleChoiceView`) now render live native primitives when `visualization` spec is present, replacing gray placeholder boxes. `MMVisualizationSpec.toRawConfig(parentId:)` method converts viz specs to registry-compatible raw configs.
- **18 end-to-end Intent Compiler tests**: graph parabola, graph with tangent, domain inference (exp/ln), number line inequality, compound inequality, table values, geometry triangle, validation round-trip, WidgetSpec JSON round-trip, composite row, composite column, composite decode, composite validation, quiz embedded viz config, quiz embedded viz all-primitives build.
- **Graph tracer & sliders**: draggable point on curve with crosshairs and coordinate label, multi-curve picker dropdown, live tangent toggle (dashed line + slope via central-difference), horizontal slider, keyboard-bound step buttons (←/→), center-reset.
- **Automatic graph annotations**: y-intercepts (`f(0)`), x-intercepts (600-sample + bisection refinement to `1e-10`), local extrema (derivative sign-change detection + second-derivative classification), green dots for intercepts, orange dots for extrema, auto-positioned labels, toggle button.
- **`MMExpressionEvaluator`**: recursive-descent parser supporting `^`, trig functions, `ln`/`log`/`sqrt`/`abs`/`exp`, `pi`/`e`/`x`, unary negation, right-associative power — zero dependencies, replaced NSExpression hacks.
- **Diagram primitive (`mm.diagram.basic`)**: SwiftUI Canvas-based renderer with 5 shape types (rectangle, circle, ellipse, diamond, roundedRect), auto-layout for 3 patterns (venn=overlapping circles, flow=stacked rects+arrows, tree=root+fan-out children), arrow connectors with auto-arrowheads, text labels + sublabels, CSS hex color support. 4 end-to-end tests.
- **Polar + parametric graph modes**: `mode` field added to `MMGraphFunctionConfig` — `"polar"` for `r=f(theta)` curves (sampled in theta, mapped to x/y), `"parametric"` for `(x(t), y(t))` curves. `MMExpressionEvaluator` extended to accept `[String: Double]` variable map (supports `theta`, `t`, and any named variable). Tracer/slider/annotations gated to cartesian-only for correctness. 3 end-to-end tests.
- **System prompt simplified**: 82-line native-primitive schema contract replaced with a 6-line `visualize` instruction. `create_widget_spec` retained as low-level escape hatch for precise schema control.

### Fixed
- **Widget interaction state lost on scroll (Critical #1)**: `WidgetView` now derives `Binding<MMInteractionState>` from session-level `MMPrimitiveInteractionStore` owned by `ChatView` (was local `@State` discarded on view recycling). Hint progress, quiz attempts, and solution reveal survive scrolling.
- **Quiz embedded visualization gray placeholder (Critical #3)**: Both quiz views now convert `MMVisualizationSpec` to raw config and render actual primitives via `MMPrimitiveRegistry` instead of showing a gray box.
- **SchemaAssembler missing config fields**: `id` (UUID) and `type` now auto-injected into every assembled config.
- **EntityExtractor missing patterns**: table expression extraction ("for X from"), verb continuation extraction ("and <expr>" for multi-expression graphs), layout-terminator words ("side", "stacked", "vertically" no longer captured as expressions).

---

## 2026-05-22 (earlier)

### Changed
- **Widget tool contract/runtime alignment**: `create_widget_spec` now fully supports `library: "mathmate-native"` in execution (not just schema docs). Native tool calls now accept `type` + `config`, validate against `MMPrimitiveValidator`, and return a valid widget spec payload with optional `responseUnit` passthrough.
- **Widget config decoding robustness**: `WidgetConfig` now accepts mixed JSON in `config.raw` (not only flat string maps), stringifying nested objects/arrays safely for transport.
- **Native primitive decoding from legacy string transport**: `AnyMMPrimitiveConfig(raw: [String: String])` now loosely parses JSON arrays/objects/booleans/numbers, so native specs can survive string-only tool payload paths.

### Fixed
- **`Invalid arguments: library must be one of...` for native widgets**: `WidgetSpec.Library` now includes `mathmate-native` and executor-side validation/error messages are updated accordingly.
- **Native widget routing**: `WidgetView` now routes `library: "mathmate-native"` directly to `MathMateNativeWidgetView` (while preserving `mm.*` fallback compatibility for older sessions).
- **Legacy widget usability after retries**: widget cap now tracks concurrent live widgets (max 2) and releases slots on view disappearance, preventing stale lifetime counts from forcing every subsequent widget into snapshot mode.
- **Runaway widget height / chat whitespace spikes**: widget shells now report bounded container height (instead of `document.body.scrollHeight`), and Swift-side height updates are clamped to a safe range to prevent large blank gaps in chat.
- **Native widget tool-call brittleness**: `create_widget_spec` now tolerates common model argument drift by inferring native `type` from `config.type`, accepting JSON-string `config`, inferring config from top-level fields, auto-generating missing `id`, and normalizing graph `expression/fn/function/equation` into `expressions`.
- **Repeated `create_widget_spec` retries for graph widgets**: native graph specs now fall back to a default expression (`x^2`) when expression fields are omitted, so a usable graph still renders instead of failing across multiple tool rounds.
- **Incorrect native `x^2` plot shape**: fixed graph evaluation so caret exponent forms (`x^n`) are treated as powers instead of bitwise XOR behavior from `NSExpression`, restoring correct parabola rendering.
- **Jagged native graph curves**: increased graph sampling density so polynomial curves render smoothly instead of appearing as coarse line segments.
- **Misleading post-widget narration**: after successful graph widget creation, tool feedback now includes plotted expressions and explicitly instructs follow-up text to describe only visible plotted content (prevents claiming tangent/derivative overlays that are not rendered).
- **Assistant JSON echo after widget creation**: successful `create_widget_spec` tool results are now summarized before being fed back into the next model round, reducing cases where the assistant re-prints raw widget JSON in chat.
- **New-session sidebar desync**: sessions created from the “Start a New Session” setup view now appear immediately under their project in the sidebar by posting the same `MathMateSessionDidUpdate` refresh signal used by other session-creation flows.
- **Graph request detection misses visual-language prompts**: widget contract injection now triggers for natural graphing language (`visualization`, `visualize`, `plot`, `graph`, `curve`, `tangent line`), not only explicit “widget/functionPlot” keywords.
- **Native-only widget execution path**: `create_widget_spec` now rejects non-native libraries and only accepts `library: "mathmate-native"` (`mm.*` primitives). This removes legacy JSXGraph/functionPlot drift paths from the generation pipeline.
- **Legacy widget renderer removal from runtime path**: `WidgetView` no longer instantiates legacy WKWebView widget shells. Non-native specs now render an explicit unsupported-widget notice instead of attempting legacy rendering.
- **Widget library model tightened to native-only**: `WidgetSpec.Library` now exposes only `mathmate-native`, eliminating enum-level drift into legacy library values during new decode/encode flows.
- **Native graph primitive expanded for richer calculus/algebra visuals**: `mm.graph.function` now supports explicit overlays (`lines`, `points`, `shadedRegions`) and helper overlays (`tangentAtX`, `secantPairs`) in addition to base `expressions`.
- **Graph validation made intent-based (not expressions-only)**: graph specs now require at least one visual element (`expressions`/`lines`/`points`/`shadedRegions`) and validate `domain`/`range`/`secantPairs` shape constraints.
- **New native number-line primitive (`mm.numberline.basic`)**: added schema, validator, registry wiring, and a native SwiftUI renderer for points, intervals, ticks, and arrowheaded baseline visuals.
- **Number-line tool normalization added**: `create_widget_spec` now accepts lightweight inequality prompts (e.g. `x >= 2`) and normalizes them into interval data for deterministic native rendering.
- **New native table primitive (`mm.table.values`)**: added schema, validator, registry wiring, and native renderer for explicit row tables or generated function-value tables (`expression` + `xValues`).
- **Table tool normalization added**: `create_widget_spec` now accepts x-value aliases (`xs`, `x`) and normalizes them to `xValues` for stable table rendering.
- **New native geometry primitive (`mm.geometry.canvas`)**: added schema, validator, registry wiring, and native coordinate-plane renderer for points, segments, polygons, and circles.
- **Geometry tool normalization added**: `create_widget_spec` now accepts lightweight geometry aliases (`triangle`, `vertices`, `segment`, `point`) and normalizes them into canonical geometry-canvas config.
- **Legacy widget cap removal**: removed `LegacyWidgetCap` lifecycle/reset logic now that new widget creation is native-only.
- **Native graph robustness with loose model args**: native graph specs still accept common alias fields (`expression`/`fn`/`function`/`equation`) and normalize them to `expressions[]`, with `x^2` fallback when omitted.

### Planning
- **Visualization Intent Compiler (Phase 9)**: Added full implementation plan and roadmap entry for inverting the model-as-JSON-engineer architecture to model-as-director. The new `visualize(description, pedagogical_goal, type_hint)` tool lets models describe visualizations in natural language; MathMate's Intent Compiler builds validated native primitive specs internally. Includes MCP server design for ecosystem access. Phase 9 sub-phases: 9A (Intent Compiler + `visualize` tool), 9B (MCP Server), 9C (Cleanup). Explicitly defers fine-tuning as the wrong solution for schema compliance.
  - Plan: [`Implementation_IntentCompiler.md`](archive/Implementation_IntentCompiler.md)
  - Roadmap: [`Roadmap.md`](./00_Project_Management/Roadmap.md)

## 2026-05-21

### Added
- **Phase 8 Foundation — Stable ContentPart Identity**: Introduced `PartItem` wrapper struct with stable UUID identity for `ContentPart`, replacing fragile array-offset-based `ForEach` iteration. This eliminates view churn when content parts are inserted/removed during streaming. The `Message.parts` property now uses `[PartItem]` with backward-compatible decoding for existing sessions. Added streaming pipeline helpers (`appendPart`, `appendText`, `appendTextToLastPart`) for cleaner text accumulation.
- **Phase 8 Foundation — Per-Part Height Tracking**: Each `LaTeXView` now tracks its height independently via a dictionary keyed by `ContentPart.id`, fixing a bug where only the last math block's height was preserved in messages with multiple blocks.
- **Phase 8 Foundation — Equatable Conformance**: `Message` and `MessageRow` now conform to `Equatable` with fast scalar-field comparison, enabling SwiftUI to skip re-evaluation of unchanged rows during streaming.
- **Phase 8 Foundation — Cached Token Count**: Token counts (prompt, completion, reasoning) are now cached incrementally in `ChatViewModel` instead of being recalculated via O(n) reduce on every render pass. The toolbar and context panel read cached values directly.
- **Phase 8 Foundation — ResponseUnit Data Model**: Introduced `ResponseUnit` and `ResponseUnitType` types for typed, named, flaggable segments within assistant messages. `Message.units` is now the primary storage for assistant content, with backward-compatible computed properties for existing code paths. Streaming pipeline creates units automatically: explanation units for text, toolBlock units for tool calls. This is the architectural foundation for native primitives (Phase B), flag-based intelligence (Phase C), and WKWebView elimination (Phase D).
- **Phase B — Native Teaching Primitives (B1-B5)**: Introduced native SwiftUI views for interactive teaching interactions, replacing WKWebView-based widgets for quiz, hint, and reveal UX. Includes schema validation, primitive registry, interaction state tracking, and consistent card chrome. Primitive types: free-response quiz, multiple-choice quiz, progressive hints, solution reveal, and function graph (native Canvas rendering). This is the first batch of native primitives that will drive the session-to-quiz pipeline and mastery tracking.
- **Phase B — Tool Contract + Tests (B7-B8)**: Updated `create_widget_spec` tool to support `library: "mathmate-native"` with detailed system prompt documentation for quiz, hint, solution, and graph primitives. Added 51 new tests across schema validation, interaction state, and ResponseUnit migration.
- **Message Flagging**: Hover over any chat message to reveal a flag icon. Click to mark it as important — the flag turns orange and stays visible. Flagged messages are persisted and listed via the `/flags` command.
- **Agent Memory Phase A (Re-implemented)**: SQLite-backed memory system with full CRUD for learner facts and memory items, provenance tracking, topic-based scoring, and weighted retrieval. Memory items are stored at `~/.mathmate/memory/memory.sqlite`. The extraction pipeline now processes flagged messages as high-priority observations. Click it to mark the message as important — the flag turns orange and stays visible. Flagged messages are persisted and listed via the `/flags` command. This is the first UX piece for Agent Memory: flagged content will get priority weighting during memory extraction and compaction in Phase B.
- **Runtime Model Pricing**: Settings → About now has a "Refresh from OpenRouter" button that fetches live pricing data from the OpenRouter API. Shows model count, last-refreshed timestamp, and loading state. The bundled `model_prices.json` serves as cold-start fallback.
- **Context Overflow Warning**: The context panel now detects when consumed tokens exceed the selected model's context window, showing a red warning banner with the exact overflow amount and switching the fill bar to red.
- **Editable Project Settings**: Added an "Edit Project…" action in the project sidebar context menu. You can now update project name, vault path, and textbook PDF path after creation (including switching to a replacement PDF file). Also added a toolbar shortcut button next to the textbook pill to jump directly into replacing the active project's PDF.
- **User Message LaTeX Rendering**: User messages now render through the same KaTeX pipeline as assistant messages, so user-entered math syntax displays correctly in chat.
- **LaTeX Palette Coverage**: Added `\min` and `\max` snippets in the Functions category (with search aliases like min/max/argmin/argmax).

### Fixed
- **LaTeX palette search**: Eliminated a bug where searching for "epsilon" or "delta" would sometimes show stale or empty results. Changed `@State` search service to a plain `let`, added `renderEpoch` counter to force view tree re-creation on each search, and simplified the grouping logic.
- **User Bubble Layout Regression**: After enabling KaTeX rendering for user messages, restored right-aligned bubble behavior by constraining user bubble max width and trailing alignment.

---

## 2026-05-20

### Added
- **Searchable Vault Browser**: The Vault tab now has a real-time search/filter bar at the top. Start typing to filter notes by title or path — filtering happens instantly as you type with case-insensitive matching. Displays a clear "no results" state when the search doesn't match any notes.
- **Editable Session Names**: Users can now click directly on the session name at the top of the main toolbar to edit it inline.
- **Textbook PDF Quick Links**: Added rapid-access buttons to open the associated textbook PDF on-disk using the system's default viewer:
  - Convenient pill button in the main window toolbar next to the session title.
  - Richly styled resource card in the Overview tab.
- **Improved Hover Tooltips**: Added helpful descriptive hover tooltips to top window elements, including:
  - The model selector pill button ("Change AI model and provider").
  - The tab bar items ("Switch to Chat/Vault/Overview tab").
  - The project sidebar new-session button ("Create new session").
- **Shift+Enter to Newline**: Pressing **Enter** in the main input box sends the message instantly, while pressing **Shift + Enter** inserts a newline at the cursor position.
- **Agent Flow Control & Reliability**: Complete flow-control features for managing streaming states and errors:
  - **Cancellation**: Pressing the stop button (or hitting enter when already loading) instantly terminates streaming.
  - **Retry**: An actionable retry button in the error banner lets users safely resend their last message.
  - **Regenerate**: A centered floating pill button above the input bar allows users to request a new assistant response from their last turn.
- **Crash-Safe Screenshot Attachments**: Conformed `ImageAttachment` to `Identifiable` to avoid index out-of-range crashes during attachment deletion. Added backwards compatibility for older session JSON records.
- **Reactive Streaming Auto-Scrolling**: The chat stream now automatically and fluidly scrolls down as new tokens (of both thinking and content types) stream in.

### Changed
- **Clear Chat Safety Gate**: The trash can button in the main toolbar now presents a native confirmation dialog to prevent accidental deletion of chat history.

### Fixed
- **Build Unblocked After Missing Memory Sources**: Restored successful compilation by adding temporary Agent Memory placeholder files that were referenced by UI/view models but missing from `Sources/MathMate/` (`MemoryStore`, `MemoryEngine`, `MemoryViewModel`, `MemoryManagerView`).

---

## [Unreleased] - Session Branching

### Added
- **Session branching architecture** (`BranchManager`, `SessionEntry`, `BranchSummaryEntry`)
  - Tree-structured session storage with `id`/`parentId` linking
  - Automatic branch summarization when switching branches
  - Support for multiple conversation paths within a single session file
- **Branch navigation UI** (`BranchTreePicker`, `SessionBrowserViewModel`)
  - Visual tree view of session branches
  - Branch selection and leaf movement
  - Branch count and summary display
- **Slash commands**
  - `/tree` — Open branch tree navigator
  - `/fork` — Create new session from current branch point
  - `/clone` — Duplicate current active branch to new session
- **Backward compatibility**
  - Auto-migration of linear sessions to tree structure
  - Session header versioning for format tracking

### Changed
- `SessionStore` extended to support tree-based entries
- `SessionHeader` enhanced with `branchCount` and `latestBranchId`
- `ChatViewModel` integrated with `BranchManager` for conversation navigation
- Session persistence format extended to support mixed entry types

### Planning
- Full implementation plan: [`Implementation_SessionBranching.md`](archive/Implementation_SessionBranching.md)
- Design references: pi session branching implementation

## 2026-05-19 (Slash Commands + Context Compaction)

### Added
- Slash command handling in chat input.
- `/help` command to list available slash commands.
- `/compact [instructions]` command to summarize older chat history and keep recent messages in the active session.
- `/compact restore` command to restore the latest pre-compaction snapshot for the active session.
- Session rewrite support in `SessionStore` via `replaceMessages(_:to:header:)` to persist compacted message state.
- Compaction metadata entries persisted to session JSONL (`SessionCompactionEntry` with cut index, tokensBefore, custom instructions, and snapshot path).
- Snapshot support in `SessionStore` (`createCompactionSnapshot(for:)`, `restoreLatestCompactionSnapshot(for:)`).

### Changed
- Chat input placeholder now advertises command discovery: `(/help for commands)`.
- Compaction uses a structured summary format (Goal, Constraints, Progress, Next Steps, Critical Context) and falls back to local heuristic summary if provider summarization is unavailable.
- Added proactive auto-compaction when context usage reaches ~85% before sending a new prompt.

### Validation
- `swift build` ✅
- `swift test` ✅ (44/44)

## 2026-05-19 (Project Concept — Workspace Organization)

### Added
- **Project model** (`MathProject`): bundles an Obsidian vault path, scoped session logs, and an optional textbook PDF.
- **Project persistence** (`ProjectStore`): CRUD for `~/.mathmate/projects.json`.
- **Project selector** in sidebar: switch between projects, create/manage via gear button.
- **Project-scoped chat**: sessions are stamped with `projectId`; wrap-ups save to the project's vault.
- **Project-scoped vault browser**: notes are loaded from the active project's vault.
- **Project-scoped study logs**: log list filters by `projectId`.
- **Textbook viewer**: inline PDFKit view for the project's associated textbook (appears in sidebar when configured).
- **Project configuration sheet**: create, edit, delete projects; browse for vault directory and PDF file.

### Changed
- `VaultViewModel` simplified from multi-vault list to single-vault binding (`bindVault(_:)`).
- `SessionHeader` now carries an optional `projectId`.
- `SessionStore.allHeaders(forProjectId:)` supports project-scoped filtering.
- `ChatViewModel.saveWrapUpToVault` now prefers the active project's vault before legacy global config.
- `LogsView` navigation title shows project name when scoped.
- `ContentView` now owns a `ProjectViewModel` and passes it down to Sidebar and detail views.

### Fixed
- Swift 6 concurrency safety: `ProjectStore` is `@MainActor`-isolated.
- `SessionStore.allHeaders` type inference regression after adding optional `forProjectId` parameter.

---

## 2026-05-19 (Vault Path Configuration UI)

### Added
- Vault configuration sheet in the Vault Browser:
  - add new vaults,
  - edit selected vault name/path,
  - remove selected vault,
  - browse for vault folders via `NSOpenPanel`.
- Empty-state action button to open vault configuration directly.

### Changed
- `VaultViewModel` now supports vault persistence operations:
  - `addVault(name:path:)`,
  - `updateSelectedVault(name:path:)`,
  - `removeSelectedVault()`.
- Vault changes are persisted back into `~/.mathmate/config.json` by rewriting only `obsidian.vaults` while preserving other config sections.
- `VaultView` toolbar now includes **Configure Vaults** and refreshes notes after configuration changes.

### Validation
- `swift build` ✅
- `swift test` ❌ (pre-existing unrelated failures in widget parser/content-part tests remain; no new vault-specific failures introduced)

---

## 2026-05-19 (Interactive Widgets Phase 2 — completed)

### Added
- `Sources/MathMate/Widgets/WidgetParser.swift` — stream-safe `WidgetBlockParser` that extracts ` ```widget ` fenced blocks from streaming assistant output.
  - `WidgetParseResult`: `.widget(WidgetSpec)`, `.text(String)`, `.none` (pending close fence).
  - Handles: empty-prefix fence (widget at chunk start), multiple blocks in one chunk, malformed JSON fallback text.
  - `flush()` drains any remaining buffer at end of stream.
  - `assembleWidgetParts()` helper rebuilds `ContentPart` arrays after widget extraction.
- `Resources/widgets/shells/shell-jsxgraph.html` — WebView shell with `window.loadWidget()` entry point and `webkit.messageHandlers.resizeWidget` height bridge.
- `Resources/widgets/js/jsxgraph.min.js` — placeholder (bundled JSXGraph to be added).
- `WidgetView.swift` upgraded: `NSViewRepresentable` + `WKWebView`, `Coordinator` as `WKScriptMessageHandler`, calls `window.loadWidget(spec)` after load, dynamic height via `widgetHeight` message.

### Changed
- OpenAI-compatible streaming now surfaces an explicit truncation notice when `finish_reason == "length"` so partial outputs no longer silently appear as hangs.
- `ChatViewModel` now adds a compact widget-output contract to the effective system prompt when the user asks for widgets, reducing verbose HTML responses and truncation risk.
- `ChatViewModel` now prefers tool-based widget construction: when tool `create_widget_spec` returns a valid spec, the app inserts `.widget` content directly into the assistant message.
- `ChatViewModel` widget streaming now drains parser output fully per chunk and preserves interleaved ordering of text and widgets.
- `ChatViewModel.appendAssistantText` now appends to the last text segment (instead of always mutating index 0), fixing text-after-widget ordering.
- `WidgetParser` now:
  - recognizes inline fences (`... ```widget`) in addition to start-of-chunk fences,
  - returns `.none` instead of empty `.text` on empty-buffer drains.
- `WidgetView` now selects shell by `WidgetSpec.library` (`jsxgraph` vs `functionPlot`) and loads spec on navigation finish.
- `ModelProvider.swift` `WidgetConfig` — fixed `init(from:)` to use `KeyedDecodingContainer` (was incorrectly using `singleValueContainer`, causing decode failures on `{"raw":{}}`).

### Fixed
- Widget shell loading under SwiftPM resource bundling:
  - switched widget shell lookup to `Bundle.module` resource URLs,
  - loaded shell HTML with `loadHTMLString(..., baseURL: Bundle.module.resourceURL)` for stable relative asset resolution,
  - updated shell asset references to flattened bundle paths (`jsxgraph.min.js`, `jsxgraph.css`, `function-plot.min.js`).
- Removed temporary widget-shell debug marker and kept concise user-facing widget load errors.

### Added
- Tool `create_widget_spec` with predefined primitives (`linear_with_sliders`, `linear_function`, `function_plot`) to build validated widget specs instead of raw HTML.
- JSXGraph shell support for `linear_with_sliders` primitive (interactive `m` and `b` sliders with live equation readout).
- `Resources/widgets/shells/shell-functionplot.html` for `functionPlot` widgets.
- Bundled local widget JS libraries under `Sources/MathMate/Resources/widgets/js/`:
  - `jsxgraph.min.js` (JSXGraph)
  - `function-plot.min.js` (function-plot)
- Tool-calling foundations in model/runtime layer:
  - `ToolDefinition`, `ToolCall`, `ToolResult`
  - `StreamToken.toolCalls` for streaming tool call delivery.
- OpenAI-compatible provider support for tool definitions in request payload (`tools` + `tool_choice`).
- Streaming parser support for incremental `delta.tool_calls` assembly.
- New file-tool catalog (`ToolCatalog`) with initial tools:
  - `list_files`, `read_file`, `write_file`, `edit_file`, `search_files`.
- New sandboxed `ToolExecutor` actor with workspace-root path restrictions and guardrails.
- `ChatViewModel` multi-round agent loop:
  - detects tool calls,
  - executes local tools,
  - sends tool results back,
  - continues until final assistant output or max rounds.

### Changed
- `ChatViewModel` now routes model calls through a tool-aware streaming loop.
- App config refresh now re-reads `maxTokens` on each send.
- Added a dedicated per-message **Tools** timeline in chat rows (separate from Thinking trace).
- Replaced the single global mutation toggle with **per-tool mutation policies** (`Allow`, `Ask`, `Block`) in toolbar menu.
- Added an approval modal for `Ask` policy during mutating tool calls.

### Safety
- Tool runtime blocks path escape attempts outside workspace root.
- `edit_file` enforces single unique exact-match replacement.
- `read_file` enforces size and line-slice limits.
- Mutating tools (`write_file`, `edit_file`) now pass through a confirmation gate hook (currently user-toggleable; defaults to allow).

---

## 2026-05-19 (Feature 4 — Interactive Widgets + Session Persistence)

### Added
- Session persistence via JSONL files in `~/.mathmate/sessions/`.
- `SessionStore` with `createSession`, `appendMessage`, `allHeaders`, and `loadMessages`.
- `SessionHeader` struct for session metadata (name, model, provider, timestamps).
- `ChatViewModel` lazy session creation and per-message persistence.
- Widget generation instructions added to the default Math Tutor system prompt.
- Agent can now emit ` ```widget ` blocks with JSXGraph/functionPlot declarative specs.
- Widgets persist automatically inside `Message.parts` via `Codable`.

### Changed
- `clearChat()` now starts a new session on the next message.

---

## 2026-05-19

### Added
- Streaming chat responses for Anthropic + OpenAI-compatible providers (incl. OpenRouter).
- Model selector UI with provider/model dropdown.
- Separate reasoning trace channel (`thinking`) shown in UI.
- Local bundled KaTeX assets (offline-safe rendering).
- `LaTeXNormalizer` with delimiter normalization and artifact cleanup.
- Markdown support for:
  - headings, paragraphs, blockquotes, hr,
  - inline/fenced code,
  - ordered/unordered lists (with continuation handling),
  - GitHub-style tables (with alignment).
- Basic Obsidian vault browser:
  - load configured vaults,
  - recursive markdown note scan,
  - open notes via `obsidian://`.
- Test coverage expanded to 21 tests, including markdown+math regressions.

### Changed
- Rendering pipeline refactored to preserve math via placeholders before markdown parsing, then restore for KaTeX.
- `WKWebView` content update flow stabilized (single loaded shell + JS incremental updates).
- Response spacing/layout tuned for readability (reduced excess whitespace, better table/list styling).
- Reasoning extraction hardened for mixed streaming payload shapes.

### Fixed
- Missing/garbled reasoning traces from OpenRouter-compatible streams.
- Raw markdown and malformed markdown+LaTeX output.
- Table/list breakage caused by math delimiter chunking.
- Symbol-heavy list line-break issues.
- Punctuation-spam reasoning noise in Thinking panel.

### Cleanup
- Removed temporary debug logging from stream/render paths after validation.

---

## 2026-05-26 — v2.0.0-dev.5 (Phase T5: Interactive Extensions)

### Added
- **Interactive visualizations** — Function graph component using Plotly (lazy-loaded, 4.6MB chunk). Supports `sin`, `cos`, `tan`, `sqrt`, `abs`, `log`, `exp`, `^` (power), `pi`, `e`. Responsive, themed, hover labels.
- **Interactive quiz cards** — Three types:
  - Multiple choice: click-to-answer with correct/incorrect feedback
  - Free response: type + submit with fuzzy math answer matching
  - Progressive hints: staged reveal, click for solution
- **Model visualization tags** — Models can emit `<mathmate-viz type="function" expr="...">` tags that render as Plotly graphs. No tool definitions or multi-round loops needed.
- **Model quiz tags** — Models can emit `<mathmate-quiz type="multiple-choice">` (or `free-response`, `progressive-hint`) tags for interactive teaching.
- **System prompt injection** — Viz/quiz instructions automatically prepended to every message, teaching the model to use interactive tags. User's custom system prompt is preserved.
- **Code splitting** — Plotly chunked into a separate lazy-loaded file (only loaded when a visualization is actually rendered).

### Changed
- **ChatMessage now renders interactive segments** — Markdown, visualizations, and quiz cards can all appear within a single message. Parsed via `extractInteractiveSegments()` before rendering.
- **Vite config** — Added `manualChunks` for Plotly to keep initial bundle small (~676KB).

### New files
- `src/lib/interactiveSegments.ts` — Parser for `<mathmate-viz>` and `<mathmate-quiz>` tags
- `src/components/Visualization/FunctionGraph.tsx` — Plotly 2D function graph
- `src/components/Visualization/VizRenderer.tsx` — Routes viz types to components
- `src/components/Quiz/MultipleChoice.tsx` — Interactive multiple choice
- `src/components/Quiz/FreeResponse.tsx` — Type-and-check free response
- `src/components/Quiz/ProgressiveHint.tsx` — Staged hint reveal
- `src/components/Quiz/QuizRenderer.tsx` — Routes quiz types to components

---

## Planned (next)
- Auto-generate study logs into Obsidian vault.
- Add vault note search/filter.
- Add Settings/Preferences UI.
- Package as `.app` for easier local distribution.
