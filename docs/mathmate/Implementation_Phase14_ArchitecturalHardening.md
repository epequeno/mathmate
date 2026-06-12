# Implementation Plan — Phase 14: Architectural Hardening

## Objective

Address the structural debt identified in the 2026-06-12 codebase review: a god-object chat store, an untyped Tauri invoke surface, a routing-table-style Rust command layer, duplicated Synapse/legacy vault backends, inconsistent error handling, inline-styled mega-components, and a TS↔Rust type system that can drift silently. The goal is **not** to add features — it is to raise the floor so the next ten features can be added without re-fighting the same abstractions.

## Motivation

The codebase has reached a size and coupling level where small changes have non-local consequences. Concretely:

- `chatStore.sendMessage` is ~470 lines and mixes 11 concerns; it has no automated tests.
- The frontend makes **at least 25 `invoke<...>` calls** (current grep; exact count should come from a generated inventory) with hand-written argument names that are silently coerced to snake_case on the Rust side; contract drift is invisible to the compiler.
- `lib.rs` is 1015 lines of `#[tauri::command]` routing; the path-scope guard is reimplemented four times in four slightly different ways.
- The "Synapse running?" boolean is checked in 9 store methods, each with a different fallback branch.
- The streaming state is 8 loosely-coupled fields in a Zustand store; the segment timeline can be cleared mid-tool-round and the UI briefly shows the message as if it were final.
- Inline styles dominate. Buttons reimplement `:hover` via `onMouseEnter` event handlers that mutate `e.currentTarget.style`.
- The two safety-scanner implementations (TS `memorySafety.ts`, Rust `memory.rs`) are parallel code paths with no shared source of truth.

These are not bugs — they are all working today. They are *velocity taxes* paid on every new feature.

## Scope

### In scope
- Typed Tauri API client module (`lib/api/*`)
- `StreamTurnOrchestrator` extraction from `chatStore`
- Rust service-layer refactor (`services/*`) and path-scope centralization
- `VaultBackend` strategy interface replacing the Synapse/legacy if-branching
- Unified `AppError` type (Rust + TS) and error-banners in the UI
- CSS-module migration for the 5 most-repeated UI patterns
- A "cleanup" sweep: dead code, broken/incomplete tests, structural TODOs
- Foundation for codegen-based TS↔Rust type alignment (no codegen yet — that's a follow-up)

### Out of scope (deferred to Phase 15+)
- Full Anthropic wire-protocol support (current code is string-matched but the parser reads OpenAI shape, so Anthropic actually does not work today)
- Component decomposition of `ChatMessage`, `Sidebar`, `ProjectSettingsPanel`, `PdfViewer`
- Discriminated-union stream state model (requires 14B first)
- Integration tests for the streaming flow
- Code-generated TS↔Rust schemas (`ts-rs` / `specta` adoption)
- Multi-vault support
- Replacing Zustand

## Sequencing

The phases are intentionally ordered to minimize risk:

| Order | Phase | Why here |
|------:|-------|----------|
| 1 | **14G — Cleanup & dead code** | Removes the safest items first and refreshes stale assumptions in the docs before larger refactors. |
| 2 | **14A — Typed Tauri API client** | Touches every `invoke` call but is mostly mechanical. Required before 14C/14D can be designed cleanly. |
| 3 | **14F — CSS module migration (top patterns)** | Orthogonal to backend refactors; can be parallelized. Improves dev velocity from day 1. |
| 4 | **14E.0 — Error taxonomy foundation** | Define shared Rust+TS `AppError` taxonomy and mapping helpers *before* service extraction, so 14C does not invent a second error model. |
| 5 | **14C — Rust service layer** | Largest refactor. Adopts the 14E.0 error model while centralizing path scope and command routing. |
| 6 | **14E.1 — Structured IPC + ErrorBanner rollout** | Finish the error migration end-to-end after 14C has a stable service surface. |
| 7 | **14B — Stream turn orchestrator** | Highest-leverage and highest-risk refactor. Lands after error + service foundations and contract tests are in place. |
| 8 | **14D — Vault backend abstraction** | Mostly mechanical once 14A and 14C are done; must include explicit capability gating for unsupported legacy operations. |
| 9 | **14H — TS↔Rust type alignment (codegen foundation)** | Long-term investment. Land last; depends on 14A and 14C stabilizing the contract surface. |

## Sub-plans

- [`Implementation_Phase14A_TypedTauriApiClient.md`](./Implementation_Phase14A_TypedTauriApiClient.md)
- [`Implementation_Phase14B_StreamTurnOrchestrator.md`](./Implementation_Phase14B_StreamTurnOrchestrator.md)
- [`Implementation_Phase14C_RustServiceLayer.md`](./Implementation_Phase14C_RustServiceLayer.md)
- [`Implementation_Phase14D_VaultBackend.md`](./Implementation_Phase14D_VaultBackend.md)
- [`Implementation_Phase14E_UnifiedErrorModel.md`](./Implementation_Phase14E_UnifiedErrorModel.md)
- [`Implementation_Phase14F_CssModuleMigration.md`](./Implementation_Phase14F_CssModuleMigration.md)
- [`Implementation_Phase14G_Cleanup.md`](./Implementation_Phase14G_Cleanup.md)
- [`Implementation_Phase14H_TsRustTypeAlignment.md`](./Implementation_Phase14H_TsRustTypeAlignment.md)

## Validation

- `npm run build` ✅
- `cargo check` ✅
- `cargo test` ✅ (test count must not drop; new tests expected from each sub-phase)
- `npm test` ✅
- Manual smoke: a single chat turn (text + image), a tool round-trip, a vault CRUD op, an interrupted stream, a session reload

## Pre-flight guardrails (required before implementation)

- Phase 14 docs must be committed/tracked in git before code work begins.
- Generate a fresh `invoke(...)` inventory from `src/` and attach it to 14A; do not rely on stale hand counts.
- Add stream-turn contract fixtures (text-only, tool round, abort, error) before 14B extraction.
- Confirm all “cleanup” assumptions with grep + code pointers in each PR description.

## Risks

- **14B has the highest behavior-change risk.** Mitigation: keep the existing `sendMessage` as a thin wrapper that calls the orchestrator and land stream-turn contract tests before the refactor.
- **14C is large and cross-cutting (not purely mechanical).** Mitigation: do it in sub-steps per service (`SessionService` first, then `MemoryService`, then `ToolService`, etc.) and keep the original Tauri command surface stable so rollback is possible at the service boundary.
- **14D can drift behavior between Synapse and legacy paths.** Mitigation: codify backend capabilities and add normalization fixtures shared by both backends.
- **14E can lose type information if partially migrated.** Mitigation: split into 14E.0 (taxonomy) and 14E.1 (structured IPC + UI), and avoid introducing a second temporary error schema in 14C.

## Non-goals (explicit)

- No new features ship as part of Phase 14. Each sub-plan must be a *no-feature* change.
- No migration of existing session JSONL files.
- No change to the JSON-RPC protocol on the wire (for Synapse).
- No change to the Tauri command name surface (the `invoke("...")` strings stay the same — only the wrapping changes).
