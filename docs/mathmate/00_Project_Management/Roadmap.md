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
- [x] **(1) No `eval`/`new Function` on model or user output**: Replace `new Function()` math evaluation in quiz + function-graph renderers with a safe arithmetic parser ([`Implementation_Security_NoEvalOnModelOutput.md`](../Implementation_Security_NoEvalOnModelOutput.md))
- [ ] ~~**(2) OS keychain for API keys**~~ *(deferred)*: Move provider keys out of plaintext `~/.mathmate/models.json` into macOS Keychain / libsecret / Windows DPAPI ([`Implementation_Security_KeychainKeyStorage.md`](../Implementation_Security_KeychainKeyStorage.md))
- [x] **(3) Path scoping for filesystem read commands**: Restrict `read_file_as_base64`, legacy `scan_vault`, and legacy `read_note` to vault, session, and project-textbook roots only ([`Implementation_Security_PathScopeGuard.md`](../Implementation_Security_PathScopeGuard.md))
- [x] **(4) Path scoping for `open_path`**: Restrict to `file:` scheme, allowlisted extensions, and confirm non-vault paths via dialog before passing `confirmed=true` ([`Implementation_Security_PathScopeGuard.md`](../Implementation_Security_PathScopeGuard.md))
- [x] **(5) Strict Content-Security-Policy**: Add a non-null CSP to `tauri.conf.json` (allow self, IPC, `asset:`, `https:`, inline styles for KaTeX) ([`Implementation_Security_ContentSecurityPolicy.md`](../Implementation_Security_ContentSecurityPolicy.md))
- [x] **(6) Sanitizer URL allowlist**: Block `javascript:` / `data:` / `file:` in `<a href>` and `<img src>`; auto-inject `rel="noopener noreferrer"` for `target="_blank"`; forbid `formaction`/`ping`/`autofocus` ([`Implementation_Security_SanitizerHardening.md`](../Implementation_Security_SanitizerHardening.md))
- [x] **(7) Memory → prompt isolation**: Scanner for injection patterns on memory write; wrap retrieved items in a clearly delimited "Memory Context" block with size caps ([`Implementation_Security_MemoryPromptIsolation.md`](../Implementation_Security_MemoryPromptIsolation.md) — extends [`Implementation_AgentMemory_PhaseD_SafetySanitization.md`](../Implementation_AgentMemory_PhaseD_SafetySanitization.md))
- [x] **(8) Study-log path containment**: `save_wrap_up` must canonicalize `vault_path` and verify the final file is inside it; prefix generated markdown with an "auto-generated" banner ([`Implementation_Security_StudyLogPathContainment.md`](../Implementation_Security_StudyLogPathContainment.md))
- [x] **(9) Anchor `rel` attribute**: `target="_blank"` from sanitized output must include `rel="noopener noreferrer"` to prevent tab-nabbing (covered by item 6) ([`Implementation_Security_SanitizerHardening.md`](../Implementation_Security_SanitizerHardening.md))

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
- [x] **Message segments + compatibility adapters**: Add ordered `MessageSegment` in Rust/TS (`thinking`, `tool_call`, `tool_result`, `content`), preserve user `content` for multimodal/legacy fallback, and update JSONL serialization + load adapters ([`Implementation_Timeline_TimelineDataModel.md`](../Implementation_Timeline_TimelineDataModel.md))
- [x] **Streaming contract normalization**: Add parser contract for fragmented tool-call deltas and emit complete tool-call events to the store layer ([`Implementation_Timeline_TimelineDataModel.md`](../Implementation_Timeline_TimelineDataModel.md))

### B — Tool Registry & Execution
- [x] **Tool definitions (v1 scope)**: Three initial tools (`calculate`, `graph`, `vault_search`) as OpenAI-compatible function definitions in a Rust `tools/` module ([`Implementation_Timeline_ToolRegistryExecution.md`](../Implementation_Timeline_ToolRegistryExecution.md))
- [x] **Tool executors (Rust, restricted v1)**: `calculate` numeric evaluation via `meval` (no symbolic CAS), `graph` 2D function point generation only, `vault_search` bounded note retrieval via existing vault module ([`Implementation_Timeline_ToolRegistryExecution.md`](../Implementation_Timeline_ToolRegistryExecution.md))
- [x] **Multi-round loop + guardrails**: `chatStore` streams → dispatches tool calls to Rust → injects tool results (`tool` role) → continues model loop with max-round/timeout/size limits ([`Implementation_Timeline_ToolRegistryExecution.md`](../Implementation_Timeline_ToolRegistryExecution.md))

### C — Timeline Rendering UI
- [x] **Segment components**: ThinkingSegment, ToolCallSegment, ToolResultSegment, ContentSegment — each with dedicated UI state and status visuals ([`Implementation_Timeline_RenderingUI.md`](../Implementation_Timeline_RenderingUI.md))
- [x] **Live streaming inline**: `streamSegments` rendered inside the in-progress assistant message (no detached Footer overlay); auto-scroll keyed to segment updates ([`Implementation_Timeline_RenderingUI.md`](../Implementation_Timeline_RenderingUI.md))
- [x] **Reasoning visibility + rollout safety**: Thinking stays visible plain text by default (collapsible), with timeline UI shipped behind a temporary feature flag and legacy fallback preserved ([`Implementation_Timeline_RenderingUI.md`](../Implementation_Timeline_RenderingUI.md))
- [x] **OpenRouter reasoning opt-in**: Send `include_reasoning: true` for OpenRouter streams so reasoning-capable models populate the existing plain-text thinking trace UI.

### D — Chat View: Process Block & Tool Formatting
- [x] **Tool format utilities**: Deterministic `formatToolCall`, `formatToolResult`, `formatToolInput`, and `renderToolOutput` functions covering all 7 built-in tools with structured output renderers and raw JSON fallback for unknown tools ([`Implementation_ChatView_ToolFormat.md`](../Implementation_ChatView_ToolFormat.md))
- [x] **Process Block redesign**: Replace per-segment rendering with a unified collapsible Process Block wrapping all pre-answer activity (thinking + tool calls in chronological order). Auto-expands during streaming, collapses on completion. Handles Case A (pure tool calling) and Case B (reasoning with embedded tool calls) correctly ([`Implementation_ChatView_ProcessBlock.md`](../Implementation_ChatView_ProcessBlock.md))

---

**Priority 1: Session Management**
- [x] **Session Manager UI**: Dedicated view for browsing, searching, and bulk-managing all sessions across projects ([`Implementation_SessionManager.md`](../Implementation_SessionManager.md))

**Priority 2: Quality & Stability**
- [ ] **Math answer quality**: Step verifier + mistake detector ([`Implementation_MathQualityTools.md`](../Implementation_MathQualityTools.md))
- [ ] **Learner Levels**: Adapt tutoring depth automatically ([`Implementation_LearnerLevels.md`](../Implementation_LearnerLevels.md))
- [ ] **Quiz Command**: Wire `/quiz` with existing primitives ([`Implementation_QuizSlashCommand.md`](../Implementation_QuizSlashCommand.md))

**Priority 3: Memory & Context**
- [ ] **Memory Hardening**: Retrieval tiers (working/episodic/semantic), trust scoring, and lineage support ([`Implementation_AgentMemory_PhaseC_TieringTrust.md`](../Implementation_AgentMemory_PhaseC_TieringTrust.md))
- [ ] **Sanitization**: Block prompt injection/exfiltration in memory ([`Implementation_AgentMemory_PhaseD_SafetySanitization.md`](../Implementation_AgentMemory_PhaseD_SafetySanitization.md)) — see also [`Implementation_Security_MemoryPromptIsolation.md`](../Implementation_Security_MemoryPromptIsolation.md) for retrieval-side hardening

**Priority 4: Textbook & PDF Pipeline**
- [x] **PDF Processing**: ~~Indexing engine for textbooks using `pymupdf`~~ → Implemented with `lopdf` (pure Rust). Extracts PDF outline/bookmarks as TOC and auto-generates vault study notes (chapters/sections/PROGRESS.md) via Project Settings UI. ([`Implementation_VaultSearchRetrieval.md`](../Implementation_VaultSearchRetrieval.md))
- [x] **PDF Viewer Tab**: Dedicated in-app Book tab with full-width pdf.js rendering, page navigation, zoom, and drag-to-capture region selection. Drag a region → image auto-attaches to chat input → navigate to Chat. Eliminates the external PDF app + screenshot workflow. ([`Implementation_PDFViewerTab.md`](../Implementation_PDFViewerTab.md))
  - 2026-06-09: Fixed HiDPI pdf.js canvas scaling so zoom/Fit Width re-render the actual page width rather than only resizing the viewport/container.
  - 2026-06-09: Added embedded PDF bookmark navigation and explicit validated page-jump controls.
  - 2026-06-09: Added in-memory PDF Blob/document caching for faster Book tab revisits and replaced fragile drag capture with an explicit movable/resizable Capture Region box.
- [x] **Free Textbook Initiative**: Community-indexed collection of open-source math texts ([`Implementation_FreeTextbooks.md`](../Implementation_FreeTextbooks.md))
  - 2026-06-09: Phase 1 complete — 25-entry static catalog, Rust module with download, catalog dialog UI, Project Settings integration. See dev log for details.
- [x] **Textbook Content Integration**: Full-text search + agent-proactive retrieval powered by pdf.js text extraction and keyword indexing. ([`Implementation_TextbookContentIntegration.md`](../Implementation_TextbookContentIntegration.md))
  - 2026-06-09: Phase 1 complete — search index engine (`textbook_index.rs`), pdf.js text extraction hook (`useTextbookIndexer`), agent-proactive `search_textbook` tool, indexing progress UI in PdfViewer toolbar, system prompt injection. See dev log for details.

**Priority 5: Learning Intelligence**
- [ ] **4-Axis Mastery Scoring**: Extend memory DB from a single score to `memory / comprehension / structure / application` axes — the data-layer foundation for the evaluator and knowledge graph ([`Implementation_MasteryScoring4Axis.md`](../Implementation_MasteryScoring4Axis.md))
- [ ] **Mastery Evaluator Agent**: Post-session LLM pass over the chat transcript that scores concepts and writes back to memory DB; upgrades `wrapup.rs` with an intelligent study log ([`Implementation_MasteryEvaluator.md`](../Implementation_MasteryEvaluator.md))
- [ ] **Feynman Mode**: Dedicated study mode where the AI plays a curious non-expert student and the user teaches the concept — multi-turn, session-persisted, feeds comprehension scores to memory ([`Implementation_FeynmanMode.md`](../Implementation_FeynmanMode.md))
- [ ] **Spaced Repetition Flashcards**: AI-generated card decks with SM-2 scheduling, 4-button self-rating, due-today queue, and `/flashcards` slash command ([`Implementation_SpacedRepetitionFlashcards.md`](../Implementation_SpacedRepetitionFlashcards.md))
- [ ] **Knowledge Graph View**: Force-directed 2D concept map per project — nodes sized/colored by mastery, typed edges from evaluator, clickable 4-axis breakdown with Feynman/quiz quick-launch ([`Implementation_KnowledgeGraph.md`](../Implementation_KnowledgeGraph.md))

---

## Phase 13: Synapse MCP Integration

Replace MathMate's hand-rolled vault tools with the Synapse knowledge base, connected via a managed stdio subprocess speaking the MCP JSON-RPC protocol. Gives the AI agent FTS5 search, proper read/update/delete with frontmatter preservation, backlinks, and pagination — and rebuilds the Vault UI on top of these richer primitives.

See master overview: [`Implementation_SynapseIntegration.md`](../Implementation_SynapseIntegration.md)

### 13A — MCP Subprocess Client
- [x] **Synapse MCP subprocess client**: New `mcp_client.rs` module that spawns `synapse mcp start --vault <path>`, speaks JSON-RPC over stdin/stdout, and exposes `start_synapse_mcp` / `stop_synapse_mcp` / `synapse_mcp_status` Tauri commands. Tool routing updated to proxy `note_*` calls through `McpClient`; old vault tools kept as fallback. Binary resolved from `SYNAPSE_BIN` env var → `~/.cargo/bin/synapse` → dev workspace sibling. Synapse status indicator in VaultPage toolbar. ([`Implementation_Synapse_Phase1_McpSubprocess.md`](../Implementation_Synapse_Phase1_McpSubprocess.md))

### 13B — Vault UI Redesign
- [x] **Vault page on Synapse API**: Replace `scan_vault`/`read_note` with `note_list` (real titles + pagination), FTS search bar (`note_search`), edit mode (`note_update`), new note button (`note_create`), and backlinks panel (`note_backlinks`). Add Synapse status indicator to toolbar. ([`Implementation_Synapse_Phase2_VaultUI.md`](../Implementation_Synapse_Phase2_VaultUI.md))

### 13C — Context Panel & Chat Integration
- [x] **Related Notes in context panel**: Background `note_search` on the last 3 user messages (debounced 1.5s); top-5 results shown as clickable links in a new "Related Notes" section of the context panel. Hidden when Synapse is not running. ([`Implementation_Synapse_Phase3_ContextIntegration.md`](../Implementation_Synapse_Phase3_ContextIntegration.md))
- [x] **Note citation chips**: After the agent calls `note_create` or `note_update`, a small chip appears below the assistant message linking to the written file; clicking navigates to the Vault tab and selects the note. ([`Implementation_Synapse_Phase3_ContextIntegration.md`](../Implementation_Synapse_Phase3_ContextIntegration.md))
- [x] **Quick Save button**: Hover affordance on assistant messages to save the content as a new vault note via `note_create`; pre-fills title from session name + date. ([`Implementation_Synapse_Phase3_ContextIntegration.md`](../Implementation_Synapse_Phase3_ContextIntegration.md))

---

## Phase 14: Architectural Hardening

Address structural debt identified in the 2026-06-12 codebase review. **No new features** in this phase; every sub-phase is a no-behavior-change refactor. The goal is to raise the floor so the next ten features can be added without re-fighting the same abstractions.

See overview: [`Implementation_Phase14_ArchitecturalHardening.md`](../Implementation_Phase14_ArchitecturalHardening.md)

### 14G — Cleanup & Dead Code Removal (lowest risk, do first)
Quick, *no-behavior-change* cleanups surfaced by the review. Each item is an independent PR.

- [x] **G.1 — Remove dead `_toolCallDeltas` field**: The field is written repeatedly in `chatStore.sendMessage` but read by no consumer. Repo-wide grep confirms no reads. ([`Implementation_Phase14G_Cleanup.md`](../Implementation_Phase14G_Cleanup.md))
- [x] **G.2 — Reconcile `open_path.confirmed` contract** *(policy-sensitive)*: Kept `confirmed` and documented the two-step confirmation flow in Rust doc comment + both TS call-sites. ([`Implementation_Phase14G_Cleanup.md`](../Implementation_Phase14G_Cleanup.md))
- [x] **G.3 — Fix `wrapup.rs:178` TODO**: `session_id` now flows from frontend → Tauri command → `save_wrap_up`. ([`Implementation_Phase14G_Cleanup.md`](../Implementation_Phase14G_Cleanup.md))
- [x] **G.4 — Remove no-op tests in `pathscope.rs`**: Removed 6 no-op tests + unused `is_within` dead code. 92 real tests survive. ([`Implementation_Phase14G_Cleanup.md`](../Implementation_Phase14G_Cleanup.md))
- [x] **G.5 — Replace dynamic `await import` in `App.tsx` and `chatStore.ts`**: Static imports added; `chatStore` now uses the already-imported `invoke` wrapper. ([`Implementation_Phase14G_Cleanup.md`](../Implementation_Phase14G_Cleanup.md))
- [x] **G.6 — Add `useRef` mount-once guard in `Layout`**: Prevents phantom session creation on remount. ([`Implementation_Phase14G_Cleanup.md`](../Implementation_Phase14G_Cleanup.md))
- [x] **G.7 — Tighten `assembleToolCalls` argument parsing**: Malformed JSON now throws `StreamError(502, retryable: false)`. ([`Implementation_Phase14G_Cleanup.md`](../Implementation_Phase14G_Cleanup.md))
- [x] **G.8 — Add `unlistenRef` cleanup pattern in `App.tsx`**: Scalable `useRef<(() => void)[]>` array of unsub functions. ([`Implementation_Phase14G_Cleanup.md`](../Implementation_Phase14G_Cleanup.md))
- [x] **G.9 — Move JSON-RPC envelope unwrap into `mcp_client.rs`**: Added `call_unwrapped` method; `synapse_call` simplified to one line. ([`Implementation_Phase14G_Cleanup.md`](../Implementation_Phase14G_Cleanup.md))
- [x] **G.10 — Replace `synapse_tools` string array in `execute_tool`**: Now queries live `client.list_tools()`; no more hardcoded drift risk. ([`Implementation_Phase14G_Cleanup.md`](../Implementation_Phase14G_Cleanup.md))
- [x] **G.11 — Decide: error banner vs. chat-as-error-message**: Documented the dual-surface pattern; TODO for 14E.1 consolidation into `<ErrorBanner>`. ([`Implementation_Phase14G_Cleanup.md`](../Implementation_Phase14G_Cleanup.md))
- [x] **G.12 — Remove unused `visionFilterEnabled` flag in `configStore`**: Finding was stale — already wired to `ModelSelector.tsx` with toggle chip + filter logic. No change needed. ([`Implementation_Phase14G_Cleanup.md`](../Implementation_Phase14G_Cleanup.md))
- [x] **G.13 — Strengthen `scripts/check-no-eval.mjs`**: Now catches bare `Function(`, `(0, eval)`, and `setTimeout/setInterval` string-code patterns. All 6 fixture patterns detected. ([`Implementation_Phase14G_Cleanup.md`](../Implementation_Phase14G_Cleanup.md))
- [x] **G.14 — Cap `streamedText` / `streamedThinking` growth**: 1 MB cap per accumulated string with `StreamError` on overflow. ([`Implementation_Phase14G_Cleanup.md`](../Implementation_Phase14G_Cleanup.md))
- [ ] **G.15 — Add `@command:` JSDoc annotations + diff-check script**: Blocked on 14A (typed API client modules must exist first). Deferred. ([`Implementation_Phase14G_Cleanup.md`](../Implementation_Phase14G_Cleanup.md))

### 14A — Typed Tauri API Client
- [x] **Typed `invoke` wrappers in `src/lib/api/*`**: 8 modules (`sessions`, `projects`, `config`, `memory`, `tools`, `vault`, `files`, `textbook`, `wrapup`) with typed args/return + `@command:` JSDoc annotations + `index.ts` barrel with `api` facade. All 40+ call sites migrated across stores and components. Dynamic `await import("../lib/tauri")` eliminated from `providers.ts` and `ContextPanel.tsx`. Raw `invoke` now lives only in `lib/api/` and `lib/tauri.ts`. ([`Implementation_Phase14A_TypedTauriApiClient.md`](../Implementation_Phase14A_TypedTauriApiClient.md))
- [ ] **ESLint rule** banning raw `invoke` outside `lib/api/` and `lib/tauri.ts` (deferred).
- [ ] **Wrapper-coverage diff-check script** in `prebuild` (deferred).

### 14F — CSS Module Migration (top patterns)
- [x] **Shared `src/styles/components.css`**: 10+ shared classes — `.btn-icon`, `.btn-icon-danger`, `.btn-primary`, `.btn-primary-large`, `.list-row`, `.tooltip`, `.menu-item`, `.model-select-row`, `.image-row`, `.catalog-card`, `.menu-row`.
- [x] **`clsx` utility**: Tiny `cx()` function at `src/lib/clsx.ts` for conditional class merging.
- [x] **File-by-file `.module.css` migration**: `Sidebar` (800→600 lines), `ChatInput`, `ChatMessage`, `LaTeXPalette`, `VaultPage`, `OverviewPage` — all with co-located `.module.css`.
- [x] **Hover handler elimination**: ALL `onMouseEnter`/`onMouseLeave` inline-style-mutation patterns removed from `Sidebar`, `ChatInput`, `ChatMessage`, `LaTeXPalette`, `ModelSelector`, `RecentImagesPanel`, `TextbookCatalogCard`, `VaultPage`, `OverviewPage`, `BulkActionBar`, `SessionTableRow`, `SessionDetailPanel`. Now using GPU-accelerated CSS `:hover` pseudo-classes.
- [ ] **ESLint rule banning `style={{...}}` > 5 lines / > 4 keys**: Deferred.

### 14E — Unified Error Model
- [ ] **Rust `AppError` enum** with `thiserror`, `is_retryable`, and `From` impls for `io::Error`, `rusqlite::Error`, `serde_json::Error`. ([`Implementation_Phase14E_UnifiedErrorModel.md`](../Implementation_Phase14E_UnifiedErrorModel.md))
- [ ] **TS `AppError` union** with `toAppError(err: unknown)` and `isRetryable(err)`. ([`Implementation_Phase14E_UnifiedErrorModel.md`](../Implementation_Phase14E_UnifiedErrorModel.md))
- [ ] **Merge `StreamError` into `AppError`**: Stop parsing English error messages in the frontend. ([`Implementation_Phase14E_UnifiedErrorModel.md`](../Implementation_Phase14E_UnifiedErrorModel.md))
- [ ] **`<ErrorBanner>` component** with kind-specific icons and actions (Retry for `network`/`rate_limit`/`server`, "Switch key" for `auth`, Dismiss for the rest). ([`Implementation_Phase14E_UnifiedErrorModel.md`](../Implementation_Phase14E_UnifiedErrorModel.md))
- [ ] **Fix `session.append_message` data-loss risk**: Add `fsync` to `append_message`; coordinate in-memory and on-disk updates. ([`Implementation_Phase14E_UnifiedErrorModel.md`](../Implementation_Phase14E_UnifiedErrorModel.md))

### 14C — Rust Service Layer
- [ ] **`services/path.rs` with centralized `PathScope::guard`**: Replaces 4 inline reimplementations in `lib.rs`. Single canonical source for "is this path allowed?" ([`Implementation_Phase14C_RustServiceLayer.md`](../Implementation_Phase14C_RustServiceLayer.md))
- [ ] **One service module per domain**: `SessionService`, `ProjectService`, `ConfigService`, `MemoryService`, `VaultService`, `SynapseService`, `ToolService`, `FileService`, `TextbookService`, `ModelCatalogService`, `ImageService`, `WrapUpService`. ([`Implementation_Phase14C_RustServiceLayer.md`](../Implementation_Phase14C_RustServiceLayer.md))
- [ ] **`AppServices` container** managed by Tauri. `#[tauri::command]` functions become one-line wrappers. (`lib.rs` shrinks from 1015 → ≤ 250 lines.) ([`Implementation_Phase14C_RustServiceLayer.md`](../Implementation_Phase14C_RustServiceLayer.md))
- [ ] **Channel-based `SynapseService` background task**: The MCP client I/O moves off the main task; the BufReader no longer holds a Tauri-wide mutex. ([`Implementation_Phase14C_RustServiceLayer.md`](../Implementation_Phase14C_RustServiceLayer.md))
- [ ] **`r2d2_sqlite` connection pool**: Replaces `Mutex<Option<Connection>>`. Removes a latent contention bug between concurrent `query_memories` and `store_memory_with_safety`. ([`Implementation_Phase14C_RustServiceLayer.md`](../Implementation_Phase14C_RustServiceLayer.md))

### 14B — Stream Turn Orchestrator
- [ ] **`StreamTurnOrchestrator` async generator** extracted from `chatStore.sendMessage`. Takes a snapshot of world state, emits `TurnEvent`s. `chatStore.sendMessage` shrinks from ~470 lines to ≤ 80. ([`Implementation_Phase14B_StreamTurnOrchestrator.md`](../Implementation_Phase14B_StreamTurnOrchestrator.md))
- [ ] **`buildSystemPrompt(...)` pure helper**: Extracted from the middle of `sendMessage`. 60 lines of literal become a testable function. ([`Implementation_Phase14B_StreamTurnOrchestrator.md`](../Implementation_Phase14B_StreamTurnOrchestrator.md))
- [ ] **Orchestrator unit tests**: text-only turn, single tool round, abort, max-rounds, network error, vision warning. ([`Implementation_Phase14B_StreamTurnOrchestrator.md`](../Implementation_Phase14B_StreamTurnOrchestrator.md))
- [ ] **Move auto-store-memory out of the streaming loop** into a Zustand subscription. ([`Implementation_Phase14B_StreamTurnOrchestrator.md`](../Implementation_Phase14B_StreamTurnOrchestrator.md))

### 14D — Vault Backend Abstraction
- [ ] **`VaultBackend` strategy interface**: `list`, `read`, `write`, `create`, `delete`, `search`, `backlinks`, `vaultInfo`, `healthCheck`. Replaces 9 inlined `if (synapseRunning) ... else ...` branches. ([`Implementation_Phase14D_VaultBackend.md`](../Implementation_Phase14D_VaultBackend.md))
- [ ] **`SynapseBackend` and `LegacyBackend` implementations**: Each with its own response normalizer. ([`Implementation_Phase14D_VaultBackend.md`](../Implementation_Phase14D_VaultBackend.md))
- [ ] **Shared `normalize*.ts` test fixtures**: Single place where Synapse's `{ path, title, snippet? }` becomes the frontend's `{ path, title, modifiedAt?, sizeBytes? }`. ([`Implementation_Phase14D_VaultBackend.md`](../Implementation_Phase14D_VaultBackend.md))
- [ ] **`projectStore.setCurrentProject` constructs the backend**: The Synapse/legacy decision lives in exactly one place. ([`Implementation_Phase14D_VaultBackend.md`](../Implementation_Phase14D_VaultBackend.md))

### 14H — TS↔Rust Type Alignment via Codegen (long-term)
- [ ] **Add `ts-rs` dev-dependency**: Generate `src/lib/types-generated/*.ts` from `#[derive(TS)]` annotations on Rust types. ([`Implementation_Phase14H_TsRustTypeAlignment.md`](../Implementation_Phase14H_TsRustTypeAlignment.md))
- [ ] **Annotate all wire types**: `Session`, `Message`, `MessageSegment`, `ContentPart`, `SessionHeader`, `ProviderConfig`, `AppConfig`, `MemoryItem`, `ScanResult`, `SafetyMode`, `ToolDefinition`, `ToolCall`, `ToolResult`, `ModelCatalog`, `TextbookMetadata`, etc. ([`Implementation_Phase14H_TsRustTypeAlignment.md`](../Implementation_Phase14H_TsRustTypeAlignment.md))
- [ ] **CI `git diff` check** fails the build if generated files are out of date. ([`Implementation_Phase14H_TsRustTypeAlignment.md`](../Implementation_Phase14H_TsRustTypeAlignment.md))
- [ ] **Remove duplicate `MemoryItem` from `src/lib/memorySafety.ts:79`**: Re-export the generated one. ([`Implementation_Phase14H_TsRustTypeAlignment.md`](../Implementation_Phase14H_TsRustTypeAlignment.md))

---

## 🔭 Future Architecture (Phase 15+)

Larger refactors that depend on Phase 14 landing first. No plans yet — each will get its own implementation doc when picked up.

- [ ] **Component decomposition**: `ChatMessage.tsx` (619 lines) → `UserBubble`, `AssistantBubble`, `MessageSegments`, `MessageLightbox`, `VaultChips`, `QuickSavePopover`. `Sidebar.tsx` (810 lines) → `Sidebar`, `ProjectSection`, `SessionRow`, `ProjectMenu`, plus `Sidebar.module.css`. `ProjectSettingsPanel.tsx` (751 lines) → similar split. `PdfViewer.tsx` (903 lines) → extract `usePdfRenderer`, `useTextbookIndexer`, `usePdfRegionSelect` hooks and a `PdfPageCanvas` component.
- [ ] **Discriminated-union stream state model**: Replace the 8 loose fields (`streamedText`, `streamedThinking`, `streamSegments`, `_toolCallDeltas`, `streaming`, `abortController`, `error`, `visionWarning`) in `useChatStore` with a single `phase: TurnPhase` discriminated union. Depends on 14B.
- [ ] **Anthropic wire-protocol support**: Current code in `lib/providers.ts` string-matches "anthropic" / "claude" and adds the right headers, but `_parseDelta` reads `choice.delta` (OpenAI shape) — Anthropic returns `content_block_delta`. Either implement the real wire protocol or remove the partial code.
- [ ] **Integration tests for the streaming/turn flow**: A `tests/turn_orchestrator_e2e.test.ts` that mocks `streamChat` with a scripted generator and asserts the event stream for text-only, tool-round, abort, error, and max-rounds scenarios. Depends on 14B.
- [ ] **Multi-vault support**: A user can have multiple projects with different vaults. `currentProject.vault_path` becomes `currentProject.vaults: VaultRef[]`. The `VaultBackend` strategy from 14D is the foundation.
- [ ] **Code-generated `invoke_handler!` surface**: Specta supports this; ts-rs does not. Worth considering if/when the command surface grows.
- [ ] **Auto-generate the `src/lib/api/*` wrappers (14A) from a single source of truth**: Possible with `ts-rs` + a custom macro, but premature.
- [ ] **Replace Zustand**: Not on the table. The store problems identified are about shape and responsibility, not library choice.

---

## 📌 Deferred / Strategic
- [ ] **MCP Implementation**: Enable `mathmate` as a server for external tools (Deferred; await ecosystem maturity)
- [ ] **Commercialization**: Strategy roadmap details (`docs/mathmate/00_Project_Management/Commercialization_Strategy.md`)
- [ ] **Classroom/Collab**: Multi-user teaching sessions (`docs/mathmate/Implementation_Collaboration_Classroom.md`)
