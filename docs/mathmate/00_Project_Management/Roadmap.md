# MathMate Roadmap

## Phase 1: Foundation ✅
- [x] Create macOS prototype
- [x] LaTeX rendering (KaTeX)
- [x] Basic chat UI

## Phase 2: Model Integration ✅
- [x] Providers/Model Config
- [x] Streaming response handling
- [x] Reasoning traces separate from answers

## Phase 3: Obsidian Integration ✅
- [x] Vault scanning & note browser
- [x] Workspace bundling
- [x] Wrap-Up study logs

## Phase 4: Polish & Refinement ✅
- [x] Slash commands (`/help`, `/compact`)
- [x] Context management
- [x] Settings UI & Study session history

## Phase 5: Agent Harness ✅
- [x] Multi-round tool loops
- [x] Sandboxed file system tools
- [x] User-defined tool policies

## Phase 6: Learning Workflow ✅
- [x] Interactive widget framework
- [x] Persistent SQLite memory (Phases A, B)
- [x] Per-chat tutor modes

## Phase 7: UI Redesign ✅
- [x] Project/session hierarchy overhaul
- [x] Context & Overview panels
- [x] Settings & Memory management views

## Phase 8: Architecture ✅
- [x] Native teaching primitives
- [x] Content containerization & virtualized scroll
- [x] Backend performance (I/O offload, concurrency audit)

## Phase 9: Visualization + Compiler ✅
- [x] Intent compiler (natural language → widget spec)
- [x] Annotation/Tracer system
- [x] Animation & 3D surface primitives

## Phase 10: Tauri Migration ✅
- [x] Full web-based architecture (React + Rust + Vite)
- [x] Native Menu & macOS integration
- [x] DOM-native streaming & rendering (replaces WKWebView)

---

## 🚀 Active Development
### Next: Hardening & Refinement (Phase 11)

**Priority 0: Security & Trust** (preempts all other Phase 11 work — see `SECURITY_AUDIT_2026-05-31.md`)
- [x] **(1) No `eval`/`new Function` on model or user output**: Replace `new Function()` math evaluation in quiz + function-graph renderers with a safe arithmetic parser ([`Implementation_Security_NoEvalOnModelOutput.md`](../archive/Implementation_Security_NoEvalOnModelOutput.md))
- [ ] ~~**(2) OS keychain for API keys**~~ *(deferred)*: Move provider keys out of plaintext `~/.mathmate/models.json` into macOS Keychain / libsecret / Windows DPAPI ([`Implementation_Security_KeychainKeyStorage.md`](../archive/Implementation_Security_KeychainKeyStorage.md))
- [x] **(3) Path scoping for filesystem read commands**: Restrict `read_file_as_base64`, legacy `scan_vault`, and legacy `read_note` to vault, session, and project-textbook roots only ([`Implementation_Security_PathScopeGuard.md`](../archive/Implementation_Security_PathScopeGuard.md))
- [x] **(4) Path scoping for `open_path`**: Restrict to `file:` scheme, allowlisted extensions, and confirm non-vault paths via dialog before passing `confirmed=true` ([`Implementation_Security_PathScopeGuard.md`](../archive/Implementation_Security_PathScopeGuard.md))
- [x] **(5) Strict Content-Security-Policy**: Add a non-null CSP to `tauri.conf.json` (allow self, IPC, `asset:`, `https:`, inline styles for KaTeX) ([`Implementation_Security_ContentSecurityPolicy.md`](../archive/Implementation_Security_ContentSecurityPolicy.md))
- [x] **(6) Sanitizer URL allowlist**: Block `javascript:` / `data:` / `file:` in `<a href>` and `<img src>`; auto-inject `rel="noopener noreferrer"` for `target="_blank"`; forbid `formaction`/`ping`/`autofocus` ([`Implementation_Security_SanitizerHardening.md`](../archive/Implementation_Security_SanitizerHardening.md))
- [x] **(7) Memory → prompt isolation**: Scanner for injection patterns on memory write; wrap retrieved items in a clearly delimited "Memory Context" block with size caps ([`Implementation_Security_MemoryPromptIsolation.md`](../archive/Implementation_Security_MemoryPromptIsolation.md) — extends [`Implementation_AgentMemory_PhaseD_SafetySanitization.md`](../archive/Implementation_AgentMemory_PhaseD_SafetySanitization.md))
- [x] **(8) Study-log path containment**: `save_wrap_up` must canonicalize `vault_path` and verify the final file is inside it; prefix generated markdown with an "auto-generated" banner ([`Implementation_Security_StudyLogPathContainment.md`](../archive/Implementation_Security_StudyLogPathContainment.md))
- [x] **(9) Anchor `rel` attribute**: `target="_blank"` from sanitized output must include `rel="noopener noreferrer"` to prevent tab-nabbing (covered by item 6) ([`Implementation_Security_SanitizerHardening.md`](../archive/Implementation_Security_SanitizerHardening.md))
- [ ] **(10) Book tab PDF streaming**: Replace the whole-file base64 round-trip (`read_project_textbook` → `atob` → Blob) with a custom `book://` Tauri URI scheme supporting HTTP Range requests, so pdf.js fetches only the xref + requested page on first Book-tab visit. Eliminates multi-second first-visit delay for 1000+ page textbooks and is strictly more secure (project-id-only URL, server-side `PathScope::guard` per request). macOS v1; Windows/Linux to follow. ([`Implementation_BookTab_PdfStreaming.md`](../archive/Implementation_BookTab_PdfStreaming.md))

## Phase 12: Chat Timeline & Tool System

The chat UI is rebuilt around a **segment-based timeline** model. Every assistant response is a chronological sequence of thinking traces, tool calls (with results), and user-facing content — rendered inline in a scrollable timeline.

**Phase 12 implementation constraints (v1):**
- Canonical segment schema across Rust + TS (no double-encoded JSON for tool args/results)
- Backward-compatible session loading for legacy JSONL messages (`segments` missing)
- OpenAI-compatible tool-calling protocol (`tool_call_id` preserved, `tool` role result messages)
- Fragmented `delta.tool_calls` parser support (multi-call + partial arguments assembly)
- Safety guardrails: max tool rounds, per-tool timeouts, bounded tool payload sizes
- Reasoning traces remain visible as plain text in timeline UI (user-collapsible)

### A — Timeline Data Model
- [x] **Message segments + compatibility adapters**: Add ordered `MessageSegment` in Rust/TS (`thinking`, `tool_call`, `tool_result`, `content`), preserve user `content` for multimodal/legacy fallback, and update JSONL serialization + load adapters ([`Implementation_Timeline_TimelineDataModel.md`](../archive/Implementation_Timeline_TimelineDataModel.md))
- [x] **Streaming contract normalization**: Add parser contract for fragmented tool-call deltas and emit complete tool-call events to the store layer ([`Implementation_Timeline_TimelineDataModel.md`](../archive/Implementation_Timeline_TimelineDataModel.md))

### B — Tool Registry & Execution
- [x] **Tool definitions (v1 scope)**: Three initial tools (`calculate`, `graph`, `vault_search`) as OpenAI-compatible function definitions in a Rust `tools/` module ([`Implementation_Timeline_ToolRegistryExecution.md`](../archive/Implementation_Timeline_ToolRegistryExecution.md))
- [x] **Tool executors (Rust, restricted v1)**: `calculate` numeric evaluation via `meval` (no symbolic CAS), `graph` 2D function point generation only, `vault_search` bounded note retrieval via existing vault module ([`Implementation_Timeline_ToolRegistryExecution.md`](../archive/Implementation_Timeline_ToolRegistryExecution.md))
- [x] **Multi-round loop + guardrails**: `chatStore` streams → dispatches tool calls to Rust → injects tool results (`tool` role) → continues model loop with max-round/timeout/size limits ([`Implementation_Timeline_ToolRegistryExecution.md`](../archive/Implementation_Timeline_ToolRegistryExecution.md))

### C — Timeline Rendering UI
- [x] **Segment components**: ThinkingSegment, ToolCallSegment, ToolResultSegment, ContentSegment — each with dedicated UI state and status visuals ([`Implementation_Timeline_RenderingUI.md`](../archive/Implementation_Timeline_RenderingUI.md))
- [x] **Live streaming inline**: `streamSegments` rendered inside the in-progress assistant message (no detached Footer overlay); auto-scroll keyed to segment updates ([`Implementation_Timeline_RenderingUI.md`](../archive/Implementation_Timeline_RenderingUI.md))
- [x] **Reasoning visibility + rollout safety**: Thinking stays visible plain text by default (collapsible), with timeline UI shipped behind a temporary feature flag and legacy fallback preserved ([`Implementation_Timeline_RenderingUI.md`](../archive/Implementation_Timeline_RenderingUI.md))
- [x] **OpenRouter reasoning opt-in**: Send `include_reasoning: true` for OpenRouter streams so reasoning-capable models populate the existing plain-text thinking trace UI.

### D — Chat View: Process Block & Tool Formatting
- [x] **Tool format utilities**: Deterministic `formatToolCall`, `formatToolResult`, `formatToolInput`, and `renderToolOutput` functions covering all 7 built-in tools with structured output renderers and raw JSON fallback for unknown tools ([`Implementation_ChatView_ToolFormat.md`](../archive/Implementation_ChatView_ToolFormat.md))
- [x] **Process Block redesign**: Replace per-segment rendering with a unified collapsible Process Block wrapping all pre-answer activity (thinking + tool calls in chronological order). Auto-expands during streaming, collapses on completion. Handles Case A (pure tool calling) and Case B (reasoning with embedded tool calls) correctly ([`Implementation_ChatView_ProcessBlock.md`](../archive/Implementation_ChatView_ProcessBlock.md))

---

**Priority 1: Session Management**
- [x] **Session Manager UI**: Dedicated view for browsing, searching, and bulk-managing all sessions across projects ([`Implementation_SessionManager.md`](../archive/Implementation_SessionManager.md))

**Priority 2: Quality & Stability**
- [ ] **Math answer quality**: Step verifier + mistake detector ([`Implementation_MathQualityTools.md`](../archive/Implementation_MathQualityTools.md))
- [ ] **Learner Levels**: Adapt tutoring depth automatically ([`Implementation_LearnerLevels.md`](../archive/Implementation_LearnerLevels.md))
- [ ] **Quiz Command**: Wire `/quiz` with existing primitives ([`Implementation_QuizSlashCommand.md`](../archive/Implementation_QuizSlashCommand.md))

**Priority 3: Memory & Context**
- [ ] **Memory Hardening**: Retrieval tiers (working/episodic/semantic), trust scoring, and lineage support ([`Implementation_AgentMemory_PhaseC_TieringTrust.md`](../archive/Implementation_AgentMemory_PhaseC_TieringTrust.md))
- [ ] **Sanitization**: Block prompt injection/exfiltration in memory ([`Implementation_AgentMemory_PhaseD_SafetySanitization.md`](../archive/Implementation_AgentMemory_PhaseD_SafetySanitization.md)) — see also [`Implementation_Security_MemoryPromptIsolation.md`](../archive/Implementation_Security_MemoryPromptIsolation.md) for retrieval-side hardening

**Priority 4: Textbook & PDF Pipeline**
- [x] **PDF Processing**: ~~Indexing engine for textbooks using `pymupdf`~~ → Implemented with `lopdf` (pure Rust). Extracts PDF outline/bookmarks as TOC and auto-generates vault study notes (chapters/sections/PROGRESS.md) via Project Settings UI. ([`Implementation_VaultSearchRetrieval.md`](../archive/Implementation_VaultSearchRetrieval.md))
- [x] **PDF Viewer Tab**: Dedicated in-app Book tab with full-width pdf.js rendering, page navigation, zoom, and drag-to-capture region selection. Drag a region → image auto-attaches to chat input → navigate to Chat. Eliminates the external PDF app + screenshot workflow. ([`Implementation_PDFViewerTab.md`](../archive/Implementation_PDFViewerTab.md))
  - 2026-06-09: Fixed HiDPI pdf.js canvas scaling so zoom/Fit Width re-render the actual page width rather than only resizing the viewport/container.
  - 2026-06-09: Added embedded PDF bookmark navigation and explicit validated page-jump controls.
  - 2026-06-09: Added in-memory PDF Blob/document caching for faster Book tab revisits and replaced fragile drag capture with an explicit movable/resizable Capture Region box.
- [x] **Free Textbook Initiative**: Community-indexed collection of open-source math texts ([`Implementation_FreeTextbooks.md`](../archive/Implementation_FreeTextbooks.md))
  - 2026-06-09: Phase 1 complete — 25-entry static catalog, Rust module with download, catalog dialog UI, Project Settings integration. See dev log for details.
- [x] **Textbook Content Integration**: Full-text search + agent-proactive retrieval powered by pdf.js text extraction and keyword indexing. ([`Implementation_TextbookContentIntegration.md`](../archive/Implementation_TextbookContentIntegration.md))
  - 2026-06-09: Phase 1 complete — search index engine (`textbook_index.rs`), pdf.js text extraction hook (`useTextbookIndexer`), agent-proactive `search_textbook` tool, indexing progress UI in PdfViewer toolbar, system prompt injection. See dev log for details.

**Priority 5: Learning Intelligence**
- [ ] **4-Axis Mastery Scoring**: Extend memory DB from a single score to `memory / comprehension / structure / application` axes — the data-layer foundation for the evaluator and knowledge graph ([`Implementation_MasteryScoring4Axis.md`](../archive/Implementation_MasteryScoring4Axis.md))
- [ ] **Mastery Evaluator Agent**: Post-session LLM pass over the chat transcript that scores concepts and writes back to memory DB; upgrades `wrapup.rs` with an intelligent study log ([`Implementation_MasteryEvaluator.md`](../archive/Implementation_MasteryEvaluator.md))
- [ ] **Feynman Mode**: Dedicated study mode where the AI plays a curious non-expert student and the user teaches the concept — multi-turn, session-persisted, feeds comprehension scores to memory ([`Implementation_FeynmanMode.md`](../archive/Implementation_FeynmanMode.md))
- [ ] **Spaced Repetition Flashcards**: AI-generated card decks with SM-2 scheduling, 4-button self-rating, due-today queue, and `/flashcards` slash command ([`Implementation_SpacedRepetitionFlashcards.md`](../archive/Implementation_SpacedRepetitionFlashcards.md))
- [ ] **Knowledge Graph View**: Force-directed 2D concept map per project — nodes sized/colored by mastery, typed edges from evaluator, clickable 4-axis breakdown with Feynman/quiz quick-launch ([`Implementation_KnowledgeGraph.md`](../archive/Implementation_KnowledgeGraph.md))

---

## Phase 13: Synapse MCP Integration

Replace MathMate's hand-rolled vault tools with the Synapse knowledge base, connected via a managed stdio subprocess speaking the MCP JSON-RPC protocol. Gives the AI agent FTS5 search, proper read/update/delete with frontmatter preservation, backlinks, and pagination — and rebuilds the Vault UI on top of these richer primitives.

See master overview: [`Implementation_SynapseIntegration.md`](../archive/Implementation_SynapseIntegration.md)

### 13A — MCP Subprocess Client
- [x] **Synapse MCP subprocess client**: New `mcp_client.rs` module that spawns `synapse mcp start --vault <path>`, speaks JSON-RPC over stdin/stdout, and exposes `start_synapse_mcp` / `stop_synapse_mcp` / `synapse_mcp_status` Tauri commands. Tool routing updated to proxy `note_*` calls through `McpClient`; old vault tools kept as fallback. Binary resolved from `SYNAPSE_BIN` env var → `~/.cargo/bin/synapse` → dev workspace sibling. Synapse status indicator in VaultPage toolbar. ([`Implementation_Synapse_Phase1_McpSubprocess.md`](../archive/Implementation_Synapse_Phase1_McpSubprocess.md))

### 13B — Vault UI Redesign
- [x] **Vault page on Synapse API**: Replace `scan_vault`/`read_note` with `note_list` (real titles + pagination), FTS search bar (`note_search`), edit mode (`note_update`), new note button (`note_create`), and backlinks panel (`note_backlinks`). Add Synapse status indicator to toolbar. ([`Implementation_Synapse_Phase2_VaultUI.md`](../archive/Implementation_Synapse_Phase2_VaultUI.md))

### 13C — Context Panel & Chat Integration
- [x] **Related Notes in context panel**: Background `note_search` on the last 3 user messages (debounced 1.5s); top-5 results shown as clickable links in a new "Related Notes" section of the context panel. Hidden when Synapse is not running. ([`Implementation_Synapse_Phase3_ContextIntegration.md`](../archive/Implementation_Synapse_Phase3_ContextIntegration.md))
- [x] **Note citation chips**: After the agent calls `note_create` or `note_update`, a small chip appears below the assistant message linking to the written file; clicking navigates to the Vault tab and selects the note. ([`Implementation_Synapse_Phase3_ContextIntegration.md`](../archive/Implementation_Synapse_Phase3_ContextIntegration.md))
- [x] **Quick Save button**: Hover affordance on assistant messages to save the content as a new vault note via `note_create`; pre-fills title from session name + date. ([`Implementation_Synapse_Phase3_ContextIntegration.md`](../archive/Implementation_Synapse_Phase3_ContextIntegration.md))

---

## Phase 14: Architectural Hardening

Address structural debt identified in the 2026-06-12 codebase review. **No new features** in this phase; every sub-phase is a no-behavior-change refactor. The goal is to raise the floor so the next ten features can be added without re-fighting the same abstractions.

See overview: [`Implementation_Phase14_ArchitecturalHardening.md`](../archive/Implementation_Phase14_ArchitecturalHardening.md)

### 14G — Cleanup & Dead Code Removal (lowest risk, do first)
Quick, *no-behavior-change* cleanups surfaced by the review. Each item is an independent PR.

- [x] **G.1 — Remove dead `_toolCallDeltas` field**: The field is written repeatedly in `chatStore.sendMessage` but read by no consumer. Repo-wide grep confirms no reads. ([`Implementation_Phase14G_Cleanup.md`](../archive/Implementation_Phase14G_Cleanup.md))
- [x] **G.2 — Reconcile `open_path.confirmed` contract** *(policy-sensitive)*: Kept `confirmed` and documented the two-step confirmation flow in Rust doc comment + both TS call-sites. ([`Implementation_Phase14G_Cleanup.md`](../archive/Implementation_Phase14G_Cleanup.md))
- [x] **G.3 — Fix `wrapup.rs:178` TODO**: `session_id` now flows from frontend → Tauri command → `save_wrap_up`. ([`Implementation_Phase14G_Cleanup.md`](../archive/Implementation_Phase14G_Cleanup.md))
- [x] **G.4 — Remove no-op tests in `pathscope.rs`**: Removed 6 no-op tests + unused `is_within` dead code. 92 real tests survive. ([`Implementation_Phase14G_Cleanup.md`](../archive/Implementation_Phase14G_Cleanup.md))
- [x] **G.5 — Replace dynamic `await import` in `App.tsx` and `chatStore.ts`**: Static imports added; `chatStore` now uses the already-imported `invoke` wrapper. ([`Implementation_Phase14G_Cleanup.md`](../archive/Implementation_Phase14G_Cleanup.md))
- [x] **G.6 — Add `useRef` mount-once guard in `Layout`**: Prevents phantom session creation on remount. ([`Implementation_Phase14G_Cleanup.md`](../archive/Implementation_Phase14G_Cleanup.md))
- [x] **G.7 — Tighten `assembleToolCalls` argument parsing**: Malformed JSON now throws `StreamError(502, retryable: false)`. ([`Implementation_Phase14G_Cleanup.md`](../archive/Implementation_Phase14G_Cleanup.md))
- [x] **G.8 — Add `unlistenRef` cleanup pattern in `App.tsx`**: Scalable `useRef<(() => void)[]>` array of unsub functions. ([`Implementation_Phase14G_Cleanup.md`](../archive/Implementation_Phase14G_Cleanup.md))
- [x] **G.9 — Move JSON-RPC envelope unwrap into `mcp_client.rs`**: Added `call_unwrapped` method; `synapse_call` simplified to one line. ([`Implementation_Phase14G_Cleanup.md`](../archive/Implementation_Phase14G_Cleanup.md))
- [x] **G.10 — Replace `synapse_tools` string array in `execute_tool`**: Now queries live `client.list_tools()`; no more hardcoded drift risk. ([`Implementation_Phase14G_Cleanup.md`](../archive/Implementation_Phase14G_Cleanup.md))
- [x] **G.11 — Decide: error banner vs. chat-as-error-message**: Documented the dual-surface pattern; TODO for 14E.1 consolidation into `<ErrorBanner>`. ([`Implementation_Phase14G_Cleanup.md`](../archive/Implementation_Phase14G_Cleanup.md))
- [x] **G.12 — Remove unused `visionFilterEnabled` flag in `configStore`**: Finding was stale — already wired to `ModelSelector.tsx` with toggle chip + filter logic. No change needed. ([`Implementation_Phase14G_Cleanup.md`](../archive/Implementation_Phase14G_Cleanup.md))
- [x] **G.13 — Strengthen `scripts/check-no-eval.mjs`**: Now catches bare `Function(`, `(0, eval)`, and `setTimeout/setInterval` string-code patterns. All 6 fixture patterns detected. ([`Implementation_Phase14G_Cleanup.md`](../archive/Implementation_Phase14G_Cleanup.md))
- [x] **G.14 — Cap `streamedText` / `streamedThinking` growth**: 1 MB cap per accumulated string with `StreamError` on overflow. ([`Implementation_Phase14G_Cleanup.md`](../archive/Implementation_Phase14G_Cleanup.md))
- [x] **G.15 — Add `@command:` JSDoc annotations + diff-check script**: `scripts/check-api-commands.mjs` diffs `invoke_handler!` in `lib.rs` against `@command:` annotations in `lib/api/*.ts`. Currently tracking 76 commands (evolved from 63 at creation). Added 11 missing annotations to memory/files/config/vault/textbook API modules. ([`Implementation_Phase14G_Cleanup.md`](../archive/Implementation_Phase14G_Cleanup.md))

### 14A — Typed Tauri API Client
- [x] **Typed `invoke` wrappers in `src/lib/api/*`**: 8 modules (`sessions`, `projects`, `config`, `memory`, `tools`, `vault`, `files`, `textbook`, `wrapup`) with typed args/return + `@command:` JSDoc annotations + `index.ts` barrel with `api` facade. All 40+ call sites migrated across stores and components. Dynamic `await import("../lib/tauri")` eliminated from `providers.ts` and `ContextPanel.tsx`. Raw `invoke` now lives only in `lib/api/` and `lib/tauri.ts`. ([`Implementation_Phase14A_TypedTauriApiClient.md`](../archive/Implementation_Phase14A_TypedTauriApiClient.md))
- [x] **ESLint rule** banning raw `invoke` outside `lib/api/` and `lib/tauri.ts`: `scripts/check-no-raw-invoke.mjs` prebuild guard. 0 violations in 145 source files.
- [x] **Wrapper-coverage diff-check script** in `prebuild`: `scripts/check-api-commands.mjs` (see G.15 above).

### 14F — CSS Module Migration (top patterns)
- [x] **Shared `src/styles/components.css`**: 10+ shared classes — `.btn-icon`, `.btn-icon-danger`, `.btn-primary`, `.btn-primary-large`, `.list-row`, `.tooltip`, `.menu-item`, `.model-select-row`, `.image-row`, `.catalog-card`, `.menu-row`.
- [x] **`clsx` utility**: Tiny `cx()` function at `src/lib/clsx.ts` for conditional class merging.
- [x] **File-by-file `.module.css` migration**: `Sidebar` (800→600 lines), `ChatInput`, `ChatMessage`, `LaTeXPalette`, `VaultPage`, `OverviewPage` — all with co-located `.module.css`.
- [x] **Hover handler elimination**: ALL `onMouseEnter`/`onMouseLeave` inline-style-mutation patterns removed from `Sidebar`, `ChatInput`, `ChatMessage`, `LaTeXPalette`, `ModelSelector`, `RecentImagesPanel`, `TextbookCatalogCard`, `VaultPage`, `OverviewPage`, `BulkActionBar`, `SessionTableRow`, `SessionDetailPanel`. Now using GPU-accelerated CSS `:hover` pseudo-classes.
- [x] **ESLint rule banning `style={{...}}` > 5 lines / > 4 keys**: `scripts/check-inline-styles.mjs` informational lint (318 violations across 39 files — full migration deferred to follow-up). Runs as warning by default; `--strict` flag for CI gate.

### 14E — Unified Error Model
- [x] **Rust `AppError` enum** in `src-tauri/src/error.rs`: 11 variants with `#[serde(tag = "kind")]`, `is_retryable()`, `From` impls for `io::Error`, `rusqlite::Error`, `serde_json::Error`. 9 tests. (14E.0)
- [x] **TS `AppError` union** in `src/lib/error.ts`: 12 variants (`auth`..`unknown`), `toAppError(err: unknown)`, `isRetryable`, `isAuth`, `isCancelled`, `errorFromStatus(status, msg, opts?)`. 24 tests. (14E.0)
- [x] **Map `StreamError` → `AppError`**: `providers.ts` now throws typed `AppError` objects from every error path via `errorFromStatus()`. Internal `StreamError` instances (abort reasons) are converted before re-throw. `chatStore.ts` retry logic uses `isRetryable(appErr)` instead of `err instanceof StreamError`. (14E.0)
- [x] **`<ErrorBanner>` component** with kind-specific icons and actions (Retry for `network`/`rate_limit`/`server`/`unavailable`, Dismiss for the rest). ([`Implementation_Phase14E_UnifiedErrorModel.md`](../archive/Implementation_Phase14E_UnifiedErrorModel.md))
- [x] **All Rust commands return `Result<T, AppError>`** (zero `map_err(|e| e.to_string())` boilerplate). (14E.1)
- [x] **Fix `session.append_message` data-loss risk**: Write-before-memory ordering + `fsync` in `SessionService::append`. ([`Implementation_Phase14E_UnifiedErrorModel.md`](../archive/Implementation_Phase14E_UnifiedErrorModel.md))
- [x] **chatStore + configStore + vaultStore**: error fields use `AppError`; catch blocks use `toAppError(err).message`. (14E.1)

### 14C — Rust Service Layer
- [x] **`services/path.rs` with centralized `PathScope::guard`**: Replaces 4 inline reimplementations in `lib.rs`. `guard(raw_path, project_id, check_extension) -> Result<PathBuf, AppError>` + `guard_soft` for two-step `open_path` flow + `open_with_system` co-located + `build_allowed_roots` moved from lib.rs. 7 tests.
- [x] **`SessionService`**: 12 session commands migrated to `svc.sessions.method()`. Service owns its own JSONL I/O, path resolution, and last-session persistence. 7 unit tests. (`services/session.rs` — 460 lines). Legacy `session.rs` kept for backward compat with `wrapup.rs` and `project.rs` (to be migrated in subsequent steps).
- [x] **`MemoryService`**: 6 memory commands migrated to `svc.memory.method()`. Service owns lazy-init SQLite connection (replaces `AppState.db`). DB lifecycle removed from `AppState`. Added `open_db_at` for explicit-path DB open. 15 unit tests (store, query, forget, safety scan at 3 modes, profile, edge cases). (`services/memory.rs` — 420 lines).
- [x] **One service module per domain**: all 63 Tauri commands migrated — PathScope, SessionService, MemoryService, ProjectService, ConfigService, ImageService, VaultService, WrapUpService, TextbookService, ModelCatalogService, SynapseService. ([`Implementation_Phase14C_RustServiceLayer.md`](../archive/Implementation_Phase14C_RustServiceLayer.md))
- [x] **`AppServices` container** managed by Tauri. Registered via `.manage()`. Path-using commands migrated: `read_file_as_base64`, `open_path`, `scan_vault`, `read_note`, `read_project_textbook` all now one-liners calling `svc.path.guard()`.
- [x] **Channel-based `SynapseService` background task**: The MCP client I/O moves off the main task; the BufReader no longer holds a Tauri-wide mutex. ([`Implementation_Phase14C_RustServiceLayer.md`](../archive/Implementation_Phase14C_RustServiceLayer.md))
- [x] **`r2d2_sqlite` connection pool**: Replaces `Mutex<Option<Connection>>`. Removes a latent contention bug between concurrent `query_memories` and `store_memory_with_safety`. ([`Implementation_Phase14C_RustServiceLayer.md`](../archive/Implementation_Phase14C_RustServiceLayer.md))

### 14B — Stream Turn Orchestrator
- [x] **`lib/turn/orchestrator.ts`**: `runTurn()` async generator extracted from `chatStore.sendMessage`. Coordinates streaming + multi-round tool loop; yields `TurnEvent`s. `chatStore.ts`: 843→692 lines (−151).
- [x] **`lib/turn/prompt.ts`**: `buildSystemPrompt()` pure function extracted from the 60-line system-prompt literal in `sendMessage`.
- [x] **`lib/turn/types.ts`**: `TurnEvent` discriminated union (10 variants), `TurnInput`, `TurnDeps` (injectable I/O).
- [x] **Orchestrator unit tests** (13 tests): text-only, tool round (single + timeout + max-rounds), abort, network error, 1 MB overflow, memory storage, segment accumulation.
- [x] **Move auto-store-memory out of the streaming loop** into a Zustand subscription. ([`Implementation_Phase14B_StreamTurnOrchestrator.md`](../archive/Implementation_Phase14B_StreamTurnOrchestrator.md))

### 14D — Vault Backend Abstraction
- [x] **`VaultBackend` strategy interface**: `list`, `read`, `write`, `create`, `delete`, `search`, `backlinks`, `vaultInfo`, `healthCheck`. Replaces 9 inlined `if (synapseRunning) ... else ...` branches. ([`Implementation_Phase14D_VaultBackend.md`](../archive/Implementation_Phase14D_VaultBackend.md))
- [x] **`SynapseBackend` and `LegacyBackend` implementations**: Each with its own response normalizer. ([`Implementation_Phase14D_VaultBackend.md`](../archive/Implementation_Phase14D_VaultBackend.md))
- [x] **Shared `normalize*.ts` test fixtures**: Single place where Synapse's `{ path, title, snippet? }` becomes the frontend's `{ path, title, modifiedAt?, sizeBytes? }`. ([`Implementation_Phase14D_VaultBackend.md`](../archive/Implementation_Phase14D_VaultBackend.md))
- [x] **`projectStore.setCurrentProject` constructs the backend**: The Synapse/legacy decision lives in exactly one place. ([`Implementation_Phase14D_VaultBackend.md`](../archive/Implementation_Phase14D_VaultBackend.md))

### 14H — TS↔Rust Type Alignment via Codegen (long-term)
- [x] **Add `ts-rs` dev-dependency**: Generate `src/lib/types-generated/*.ts` from `#[derive(TS)]` annotations on Rust types. ([`Implementation_Phase14H_TsRustTypeAlignment.md`](../archive/Implementation_Phase14H_TsRustTypeAlignment.md))
- [x] **Annotate all wire types**: `Session`, `Message`, `MessageSegment`, `ContentPart`, `SessionHeader`, `ProviderConfig`, `AppConfig`, `MemoryItem`, `ScanResult`, `SafetyMode`, `ToolDefinition`, `ToolCall`, `ToolResult`, `ModelCatalog`, `TextbookMetadata`, etc. ([`Implementation_Phase14H_TsRustTypeAlignment.md`](../archive/Implementation_Phase14H_TsRustTypeAlignment.md))
- [x] **CI `git diff` check** fails the build if generated files are out of date. ([`Implementation_Phase14H_TsRustTypeAlignment.md`](../archive/Implementation_Phase14H_TsRustTypeAlignment.md))
- [x] **Remove duplicate `MemoryItem` from `src/lib/memorySafety.ts:79`**: Re-export the generated one. ([`Implementation_Phase14H_TsRustTypeAlignment.md`](../archive/Implementation_Phase14H_TsRustTypeAlignment.md))

---

## Phase 15 — Component Health + Wire Protocol + Multi-Vault

> All items depend on Phase 14 being complete. Each gets its own implementation doc (see links).


### 15A — Component Decomposition
- [x] **Split `ChatMessage.tsx` (386L)** → `UserBubble`, `AssistantBubble`, `ToolResultBubble`, `MessageSegments`, `VaultChips`, `QuickSavePopover`, `StreamingMessage`. ([`Implementation_Phase15A_ComponentDecomposition.md`](../archive/Implementation_Phase15A_ComponentDecomposition.md))
- [x] **Split `Sidebar.tsx` (585L)** → `ProjectSection`, `ProjectRow`, `SessionList`, `SessionRow`, `ProjectMenu`, `ArchivalToggle`. ([`Implementation_Phase15A_ComponentDecomposition.md`](../archive/Implementation_Phase15A_ComponentDecomposition.md))
- [x] **Split `ProjectSettingsPanel.tsx` (748L)** → `VaultSettingsTab`, `ModelSettingsTab`, `LaTeXSettingsTab`, `TextbookTab`, `AdvancedTab`. ([`Implementation_Phase15A_ComponentDecomposition.md`](../archive/Implementation_Phase15A_ComponentDecomposition.md))
- [x] **Split `PdfViewer.tsx` (903L)** → `PdfPageCanvas`, `usePdfRenderer`, `usePdfRegionSelect`, `useTextbookIndexer`, `PdfNavigationBar`, `PdfRegionHighlight`. ([`Implementation_Phase15A_ComponentDecomposition.md`](../archive/Implementation_Phase15A_ComponentDecomposition.md))

### 15B — Discriminated-Union Stream State
- [x] **`phase: TurnPhase` discriminated union** replaces parallel streaming fields (`streaming`, `abortController`, `streamedText`, `streamedThinking`, `streamSegments`) in `useChatStore` with one authoritative turn state object. ([`Implementation_Phase15B_DiscriminatedUnionStreamState.md`](../archive/Implementation_Phase15B_DiscriminatedUnionStreamState.md))
- [x] **Phase transition map**: `idle → preparing → streaming → finishing → idle` with explicit `aborted`/`errored` terminal states before cleanup. ([`Implementation_Phase15B_DiscriminatedUnionStreamState.md`](../archive/Implementation_Phase15B_DiscriminatedUnionStreamState.md))
- [x] **Selector-based UI reads**: `isTurnActive`, `isStreaming`, `currentAbortController`, `latestText`, `latestThinking`, `currentTurnError`. ([`Implementation_Phase15B_DiscriminatedUnionStreamState.md`](../archive/Implementation_Phase15B_DiscriminatedUnionStreamState.md))
- [x] **Keep `visionWarning` separate from turn FSM** (toast-level UI concern; no behavior change). ([`Implementation_Phase15B_DiscriminatedUnionStreamState.md`](../archive/Implementation_Phase15B_DiscriminatedUnionStreamState.md))

### 15C — Anthropic Wire-Protocol Support
- [x] **Wire-variant routing by provider**: keep OpenRouter on OpenAI-compatible parsing (even for Claude models), route only native Anthropic providers to Anthropic-native request/parser paths. ([`Implementation_Phase15C_AnthropicWireProtocol.md`](../archive/Implementation_Phase15C_AnthropicWireProtocol.md))
- [x] **Split request builders + SSE frame parsers**: OpenAI-compatible path unchanged; Anthropic-native path handles `/v1/messages`, Anthropic headers, and full-frame SSE parsing. ([`Implementation_Phase15C_AnthropicWireProtocol.md`](../archive/Implementation_Phase15C_AnthropicWireProtocol.md))
- [x] **Anthropic tool/thinking mapping with stable IDs**: map thinking deltas and tool-use JSON deltas into existing `StreamChunk` shape used by `assembleToolCalls()`. ([`Implementation_Phase15C_AnthropicWireProtocol.md`](../archive/Implementation_Phase15C_AnthropicWireProtocol.md))
- [x] **Parser parity tests**: Anthropic fixtures + OpenAI/OpenRouter regression fixtures to prevent cross-provider breakage. ([`Implementation_Phase15C_AnthropicWireProtocol.md`](../archive/Implementation_Phase15C_AnthropicWireProtocol.md))

### 15D — Turn Orchestrator E2E Tests
- [x] **Contract fixture suite** (8 scenarios): text-only, single tool, multi-tool, abort pre-stream, abort mid-stream, error pre-stream, error mid-stream, max-tool-rounds. ([`Implementation_Phase15D_TurnOrchestratorE2ETests.md`](../archive/Implementation_Phase15D_TurnOrchestratorE2ETests.md))
- [x] **Deterministic helper utilities**: chunk generators + tool-call delta factories for scripted `streamChat` rounds (no live network). ([`Implementation_Phase15D_TurnOrchestratorE2ETests.md`](../archive/Implementation_Phase15D_TurnOrchestratorE2ETests.md))
- [x] **Assert against current `runTurn()` contract**: event-kind order for success paths; thrown behavior for abort/error paths. ([`Implementation_Phase15D_TurnOrchestratorE2ETests.md`](../archive/Implementation_Phase15D_TurnOrchestratorE2ETests.md))

### 15E — Multi-Vault Support
- [x] **`vault_path` → `vaults: VaultRef[]` + `active_vault_id`** in `MathProject`, with load-time migration invariants and schema versioning. ([`Implementation_Phase15E_MultiVaultSupport.md`](../archive/Implementation_Phase15E_MultiVaultSupport.md))
- [x] **`VaultRef` + `VaultKind` model**: `id`, `name`, `path`, `kind` (`Synapse|Legacy|Classroom`), `read_only`, `position`. ([`Implementation_Phase15E_MultiVaultSupport.md`](../archive/Implementation_Phase15E_MultiVaultSupport.md))
- [x] **5 new Rust commands**: `update_project_vaults`, `set_active_vault`, `add_vault`, `remove_vault`, `rename_vault`. ([`Implementation_Phase15E_MultiVaultSupport.md`](../archive/Implementation_Phase15E_MultiVaultSupport.md))
- [x] **Active-vault backend routing + Synapse lifecycle rules**: `setCurrentProject` resolves vault path from `active_vault_id`; `setActiveVault`/`addVault`/`removeVault` each trigger Synapse restart; `startSynapse()` uses resolved active vault path.
- [x] **`VaultSwitcher` UI + read-only classroom behavior**: Shows all vaults, highlights active, supports add/remove/switch with kind badges and read-only lock indicators.

### 15F — Auto-Generate `src/lib/api/*` Wrappers *(stretch goal)*
- [x] **Codegen from Rust commands**: Parse `lib.rs` for `#[tauri::command]` attrs → generate typed TS wrappers. ([`Implementation_Phase14A_TypedTauriApiClient.md`](../archive/Implementation_Phase14A_TypedTauriApiClient.md))
- [x] **Inventory verified**: 76 Rust commands → 76 typed TS wrappers with `@command` annotations across 10 API modules, verified by `check-api-commands.mjs` prebuild step. ([`Implementation_Phase14A_TypedTauriApiClient.md`](../archive/Implementation_Phase14A_TypedTauriApiClient.md))

---

## 🔭 Future Architecture (Phase 17+)

Post-Phase-16 opportunities. No committed Phase 17 implementation docs yet; each item should get its own plan when prioritized.

- [ ] **Code-generated `invoke_handler!` surface**: Specta supports this; ts-rs does not. Worth considering if/when the command surface grows.
- [ ] **Store/library revisit (only if warranted by data)**: Zustand replacement is not currently planned; revisit only if post-15 evidence shows issues beyond state shape/responsibility.

---

---

## Phase 16 — Competitive Math Support

Support for students preparing for olympiad-level competitions (AMC → AIME → USAMO/IMO, Putnam, etc.). Introduces a new olympiad-coach tutor style, hint-ladder UI, problem bank, dedicated free resource catalog entries, and structured proof critique.

> **Research basis:** LLMs are unreliable for olympiad-level *proof generation* (<5% on USAMO 2025 for most models; Gemini 2.5 Pro ~25%). Proof *critique* is more tractable but requires explicit reliability framing. Hint ladder and problem bank are the highest-integrity features. See [`Implementation_CompetitiveMath_Phase4_ProofCritique.md`](../archive/Implementation_CompetitiveMath_Phase4_ProofCritique.md) for full reliability notes.

### 16A — Hint Ladder & Olympiad Coach Mode
- [x] **Olympiad Coach tutor style**: new system prompt profile; watches the student think, asks diagnostic questions, does not give solutions unprompted ([`Implementation_CompetitiveMath_Phase1_HintLadder.md`](../archive/Implementation_CompetitiveMath_Phase1_HintLadder.md))
- [x] **Hint ladder widget**: sequenced pull-on-demand hints (H1 meta-strategy → H2 structural → H3 key insight → solution sketch); student must log attempt before H1 unlocks ([`Implementation_CompetitiveMath_Phase1_HintLadder.md`](../archive/Implementation_CompetitiveMath_Phase1_HintLadder.md))
- [x] **`/problem` slash command**: opens hint ladder from a pasted problem statement ([`Implementation_CompetitiveMath_Phase1_HintLadder.md`](../archive/Implementation_CompetitiveMath_Phase1_HintLadder.md))
- [x] **Session outcome tracking**: `hints_used`, `solved`, `elapsed_seconds` stored in session header ([`Implementation_CompetitiveMath_Phase1_HintLadder.md`](../archive/Implementation_CompetitiveMath_Phase1_HintLadder.md))

### 16B — Problem Bank & Practice Sessions
- [x] **Bundled problem bank** (~60 curated public-domain problems: IMO, USAMO, AIME, AMC, Putnam) shipped as `resources/problem-bank.json` ([`Implementation_CompetitiveMath_Phase2_ProblemBank.md`](../archive/Implementation_CompetitiveMath_Phase2_ProblemBank.md))
- [x] **Practice session flow**: problem picker (topic/difficulty/source filters + random), optional countdown timer, hint ladder integration, outcome recording ([`Implementation_CompetitiveMath_Phase2_ProblemBank.md`](../archive/Implementation_CompetitiveMath_Phase2_ProblemBank.md))
- [x] **Problem log & Overview stats card**: attempt history filterable by topic/outcome; competition prep stats on Overview page ([`Implementation_CompetitiveMath_Phase2_ProblemBank.md`](../archive/Implementation_CompetitiveMath_Phase2_ProblemBank.md))
- [x] **Vault integration**: completed attempts generate structured vault notes (problem statement, approach, what I learned) ([`Implementation_CompetitiveMath_Phase2_ProblemBank.md`](../archive/Implementation_CompetitiveMath_Phase2_ProblemBank.md))

### 16C — Competition Resource Catalog
- [x] **10 Evan Chen resources added** to free textbook catalog (Napkin, OTIS Excerpts, Barycentric Coordinates, Complex Numbers, Inequalities, Functional Equations, Number Theory, Probabilistic Method, Monsters, Olympiad Syllabus) — all CC-BY-SA 4.0 ([`Implementation_CompetitiveMath_Phase3_Catalog.md`](../archive/Implementation_CompetitiveMath_Phase3_Catalog.md))
- [x] **New olympiad subject tags** (`olympiad-general`, `-geometry`, `-algebra`, `-number-theory`, `-combinatorics`) with dedicated filter group in catalog UI ([`Implementation_CompetitiveMath_Phase3_Catalog.md`](../archive/Implementation_CompetitiveMath_Phase3_Catalog.md))
- [x] **Project wizard integration**: selecting an olympiad-tagged resource auto-suggests Olympiad Coach tutor style ([`Implementation_CompetitiveMath_Phase3_Catalog.md`](../archive/Implementation_CompetitiveMath_Phase3_Catalog.md))

### 16D — Proof Critique
- [x] **`/critique` slash command + proof submission panel**: structured form with problem context, proof textarea, feedback focus selector ([`Implementation_CompetitiveMath_Phase4_ProofCritique.md`](../archive/Implementation_CompetitiveMath_Phase4_ProofCritique.md))
- [x] **Structured critique card**: traffic-light rendering (🔴 logic gaps / 🟡 double-check / 🟢 style); always shows reliability disclaimer ([`Implementation_CompetitiveMath_Phase4_ProofCritique.md`](../archive/Implementation_CompetitiveMath_Phase4_ProofCritique.md))
- [x] **Model recommendation nudge**: if not on Gemini 2.5 Pro, surface a switch suggestion in the submission panel ([`Implementation_CompetitiveMath_Phase4_ProofCritique.md`](../archive/Implementation_CompetitiveMath_Phase4_ProofCritique.md))
- [x] **Practice session integration**: "Critique my proof" offered after practice session outcome recording ([`Implementation_CompetitiveMath_Phase4_ProofCritique.md`](../archive/Implementation_CompetitiveMath_Phase4_ProofCritique.md))
- [x] **Segment persistence**: critique card persists in session timeline via `proof-critique` segment type; survives session refresh

### 16E — Lean Formal Verification *(future / stretch)*
- [ ] **LLM → Lean 4 translation pipeline**: informal proof → Lean 4 via DeepSeek-Prover or similar → type-check locally; cannot produce false positives ([`Implementation_CompetitiveMath_Phase4_ProofCritique.md`](../archive/Implementation_CompetitiveMath_Phase4_ProofCritique.md))
- [ ] Prerequisites: affordable Lean translation model, local Lean 4 subprocess, user education on formal proof style


---

## Phase 17 — Pedagogical Guardrails

Evidence-driven changes grounded in the 2024–2026 pedagogical research literature on AI in education. The central finding: unguarded AI access degrades learning — students complete tasks faster but perform worse without the tool, and don't perceive the decline ([Bastani et al., 2025](https://www.pnas.org/doi/10.1073/pnas.2422633122); [Lehmann et al., 2024](https://arxiv.org/abs/2409.09047); [Stanford SCALE, 2026](https://scale.stanford.edu/sites/default/files/The%20Evidence%20Base%20on%20AI%20in%20K-12%20Report.pdf)). The difference between harmful and helpful AI tutoring is design — guardrails that scaffold rather than substitute.

> **Research basis:** Full review at `~/Dropbox/eapsoftware-research/MathMate/pedagogical-research/AI-LLMs-Education-Research-Review.md`. See also README § Pedagogical Foundation.

### 17A — Default System Prompt Guardrails

The main chat system prompt (`turn/prompt.ts`, `chatStore.ts`) now includes pedagogical guardrails that make the default path scaffold rather than substitute. Previously said only "Answer as a clear math tutor" — functionally equivalent to Bastani et al.'s harmful GPT Base arm.

- [x] **Pedagogical instructions in `SYSTEM_INSTRUCTIONS`**: Added a `## Pedagogical approach` section directing the AI to (1) ask what the student has tried before helping, (2) prefer guiding questions over direct answers, (3) provide the next step rather than the full solution, (4) explain *why* a step works, not just *what* to do, (5) show each step explicitly and flag uncertainty, (6) answer conceptual questions directly (complement, not substitution). Applied to both `turn/prompt.ts` and the live copy in `chatStore.ts`.
- [ ] **Attempt-aware response calibration**: When the system prompt or context indicates the student has already attempted the problem (hint ladder, practice session), provide more direct help; when no attempt is present, scaffold first. ([`Implementation_Phase17_SystemPromptGuardrails.md`](../archive/Implementation_Phase17_SystemPromptGuardrails.md))
- [ ] **Guardrail A/B test harness**: Structured comparison of guarded vs. unguarded responses on a fixed problem set, measuring response type (full solution vs. hint/guide) and step visibility. ([`Implementation_Phase17_SystemPromptGuardrails.md`](../archive/Implementation_Phase17_SystemPromptGuardrails.md))

**Research support:** Bastani et al. — guardrails that avoid giving answers "essentially eradicated" the crutch effect. Kakarla et al. — tutors should guide, not correct. Favero et al. — "intentional, transparent, and critically informed use" empowers rather than diminishes.

### 17B — Hint Ladder as Default for Problem-Solving

The hint ladder is currently opt-in (`/problem` command or `<mathmate-quiz>` tag). The research says the default mode of use matters most — make scaffolded problem-solving the path of least resistance.

- [ ] **Problem detection + hint-ladder redirect**: When the AI detects a problem-solving request (a pasted problem, a "solve this" prompt), offer the hint ladder rather than a full solution. Soft redirect via system prompt instruction — not a hard gate. ([`Implementation_Phase17_HintLadderDefault.md`](../archive/Implementation_Phase17_HintLadderDefault.md))
- [ ] **"Walk me through it" UI affordance**: Button in the chat input area that switches the next turn into hint-ladder mode for any problem the student pastes. ([`Implementation_Phase17_HintLadderDefault.md`](../archive/Implementation_Phase17_HintLadderDefault.md))
- [ ] **Graduated hint withdrawal**: For repeat problems on the same topic, reduce hint verbosity based on prior mastery (depends on 17C). ([`Implementation_Phase17_HintLadderDefault.md`](../archive/Implementation_Phase17_HintLadderDefault.md))

**Research support:** Bastani et al. — the default mode of use is what determines harm. Lehmann et al. — substitution (giving solutions) is the harmful mode; complement (explaining/hinting) is the beneficial mode. Stadler et al. — "easier doesn't mean better."

### 17C — Mastery Tracking & Adaptive Scaffolding

The memory DB (`memory.rs`) stores arbitrary text memories with FTS5 search and a flat `learner_profile` key-value table. It does not track per-topic mastery or struggle history. Add structured mastery tracking to enable adaptive scaffolding and surface the perception gap.

- [ ] **Mastery table schema**: Add `mastery(topic TEXT, level REAL, last_assessed TEXT, attempts INTEGER, hints_needed INTEGER)` to the memory DB; migrate existing schema idempotently. ([`Implementation_Phase17_MasteryTracking.md`](../archive/Implementation_Phase17_MasteryTracking.md))
- [ ] **Post-session mastery evaluation**: Extend `wrapup.rs` to score concepts from the session transcript and write back to the mastery table; upgrade the study log with mastery deltas. ([`Implementation_Phase17_MasteryTracking.md`](../archive/Implementation_Phase17_MasteryTracking.md))
- [ ] **Adaptive hint ladder difficulty**: Feed mastery scores into the hint generation prompt — more scaffolding for low-mastery topics, less for mastered ones. ([`Implementation_Phase17_MasteryTracking.md`](../archive/Implementation_Phase17_MasteryTracking.md))
- [ ] **Spaced repetition of helped problems**: Re-surface problems the student previously needed hints on, at increasing intervals (SM-2 or similar). Depends on the existing spaced-repetition roadmap item (Phase 11, Priority 5). ([`Implementation_Phase17_MasteryTracking.md`](../archive/Implementation_Phase17_MasteryTracking.md))

**Research support:** Bastani et al. — low prior knowledge students are most at risk; adaptive scaffolding provides more structure for beginners. Lehmann et al. — AI widened achievement gaps for low prior knowledge. Stanford SCALE — "gains weaken or disappear when AI access is removed"; spaced repetition targets transfer.

### 17D — Unassisted Check-Ins

The perception gap (Bastani et al., Yu et al.) is one of the most dangerous findings: students don't know they're learning less. Periodic no-AI practice sessions would surface the gap between assisted and unassisted performance.

- [ ] **"Practice without hints" mode**: Quiz/practice session where the hint ladder is disabled and the AI only verifies correctness after submission. Uses the existing quiz + problem bank infrastructure. ([`Implementation_Phase17_UnassessedCheckins.md`](../archive/Implementation_Phase17_UnassessedCheckins.md))
- [ ] **Assisted vs. unassisted performance dashboard**: Track and display both "with AI" and "without AI" performance per topic, so students can see where their unassisted ability is lagging. Depends on 17C mastery tracking. ([`Implementation_Phase17_UnassessedCheckins.md`](../archive/Implementation_Phase17_UnassessedCheckins.md))
- [ ] **Perception-gap nudge**: After a practice session, if unassisted performance is significantly below assisted performance on the same topic, surface a gentle prompt to practice that topic without hints. ([`Implementation_Phase17_UnassessedCheckins.md`](../archive/Implementation_Phase17_UnassessedCheckins.md))

**Research support:** Bastani et al. — students were "overly optimistic" about how much they'd learned; the perception gap is invisible. Yu et al. — the "speedup illusion" creates a false sense of productivity. Stanford SCALE — "tools designed to foster independent reasoning are more likely to support durable learning."

### 17E — AI Error Awareness

Bastani et al. found GPT-4 made errors 49% of the time on math problems. The visible reasoning traces help — students *can* check each step — but there's no mechanism to flag potential errors or encourage verification.

- [ ] **Step-by-step verification prompt**: System prompt instruction to show each step explicitly and flag uncertainty ("I'm not fully confident in this step — verify the algebra"). ([`Implementation_Phase17_ErrorAwareness.md`](../archive/Implementation_Phase17_ErrorAwareness.md))
- [ ] **"Check my work" tool**: A tool the student can invoke that asks the AI to verify a specific step or the full solution, rather than trusting the initial output. ([`Implementation_Phase17_ErrorAwareness.md`](../archive/Implementation_Phase17_ErrorAwareness.md))

**Research support:** Bastani et al. — GPT-4 gave wrong answers 49% of the time; students either couldn't detect errors or didn't bother checking. Favero et al. — over-reliance leads to "cognitive atrophy" and loss of agency.

---

## 📌 Deferred / Strategic

- [ ] **MCP Implementation**: Enable `mathmate` as a server for external tools (Deferred; await ecosystem maturity)
- [ ] **Commercialization**: Strategy roadmap details (`docs/mathmate/00_Project_Management/Commercialization_Strategy.md`)
- [ ] **Classroom/Collab**: Multi-user teaching sessions (`docs/mathmate/Implementation_Collaboration_Classroom.md`)
