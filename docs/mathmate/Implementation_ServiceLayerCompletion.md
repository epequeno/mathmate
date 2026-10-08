# Implementation Plan — Finish the Rust Service-Layer Migration

**Status:** proposed (not started) · **Raised:** 2026-10-08 · **Follows:** Phase 14C (`archive/Implementation_Phase14C_RustServiceLayer.md`)

## Why

Phase 14C is marked complete in the roadmap, and at the command-registration level it is: `lib.rs` commands mostly call `svc.<service>.method()`. Underneath, the older flat modules in `mathmate/src-tauri/src/` were never removed, and the two layers now overlap. 14C's own notes say the legacy `session.rs` was "kept for backward compat". This plan finishes the job. It is not an emergency: nothing is broken today, which is why it can be scheduled.

Costs of leaving it as is:

- **Two code paths touch the same files.** Deleting a project goes `services/project.rs` → legacy `session::delete_sessions_for_project`, while the live session code is `services/session.rs`. A fix in one is easy to miss in the other.
- **Different path handling.** The legacy modules resolve a fixed `~/.mathmate`; services take an injected base directory. Behaviour in tests (injected) and in the app (fixed) can differ.
- **Reviewers cannot tell which layer is authoritative** without reading both. `docs/ARCHITECTURE.md` documents this as a known rough edge.

## Inventory (verified 2026-10-08 by reading the source)

Legacy flat modules are in `mathmate/src-tauri/src/`; services are in `services/`. Line counts are for orientation.

| Domain | Legacy | Service | State |
|---|---|---|---|
| config | `config.rs` (166) | `services/config.rs` (469) | Service owns the logic. Legacy file has `#![allow(dead_code)]` and no references outside itself. **Deletion candidate.** |
| images | `images.rs` (95) | `services/image.rs` | Legacy has `#![allow(dead_code)]` and no references. **Deletion candidate.** |
| problem_bank | `problem_bank.rs` (1) | `services/problem_bank.rs` | Legacy is a one-line stub. **Deletion candidate.** |
| session | `session.rs` (643) | `services/session.rs` (737) | Service owns its I/O. Legacy still called from `wrapup.rs` (`load_session`), `project.rs` and `services/project.rs` (`delete_sessions_for_project`). **Duplicate logic.** |
| memory | `memory.rs` (403) | `services/memory.rs` (515) | Service **delegates** to legacy free functions (`crate::memory as mem`). |
| models | `models.rs` (172) | `services/models.rs` (24) | Thin wrapper; legacy owns the logic. |
| vault | `vault.rs` (278) | `services/vault.rs` (46) | Thin wrapper; `tools/vault_search.rs` also calls legacy directly. |
| wrapup | `wrapup.rs` (232) | `services/wrapup.rs` (47) | Thin wrapper; legacy calls legacy `session`. |
| textbook | `textbook.rs` (57) | `services/textbook.rs` (111) | Thin wrapper for PDF metadata. |
| project | `project.rs` (272) | `services/project.rs` (444) | Mixed. Five project/vault commands in `lib.rs` (around lines 326–402) call `crate::project::*` directly and bypass the service; `tools/textbook_search.rs` does too. |

Re-derive before starting: `grep -rnE "crate::(session|project|memory|vault|wrapup|models|textbook)::" mathmate/src-tauri/src`.

## Approach

Each step is its own commit, with `cargo test` (177 passing, 1 ignored at the time of writing) and `npm test` (272) green before and after. Do not change behaviour while moving code.

0. **Baseline.** Record the test counts. Add a short manual smoke list (below) and run it once.
1. **Delete the dead legacy modules** (`config`, `images`, `problem_bank`). Prove they are dead by deleting them and running `cargo check`. This is the cheapest win and has no behavioural risk if it compiles.
2. **Session.** Add `SessionService::delete_for_project`, switch `ProjectService` and the wrap-up path to the service, then delete legacy `session.rs`. This is the riskiest step because of the path-handling difference; add a test that a project's sessions are removed from the injected base directory.
3. **Project.** Route the five direct `crate::project::*` commands in `lib.rs` through `ProjectService`; give `tools/textbook_search.rs` what it needs without importing the legacy module (pass the project, or a small trait). Delete legacy `project.rs` once nothing references it.
4. **Decide, then do, the thin wrappers.** For `memory`, `models`, `vault`, `wrapup`, `textbook`: either move the logic into the service and delete the legacy file, or keep the legacy file as an explicitly documented pure-function module that the service wraps. Either is fine; the point is one authoritative layer. Record the decision in `docs/ARCHITECTURE.md`.
5. **Tools.** `tools/vault_search.rs` (and any other tool that imports legacy) should use the service's functions or an injected handle.
6. **Cleanup.** Remove the `#![allow(dead_code)]` markers and the `#[allow(dead_code)] // kept for backward compat` items that become genuinely unused. Update the "Known rough edges" section of `docs/ARCHITECTURE.md` and the roadmap.

## Definition of done

- No `crate::<legacy module>` references outside the module that replaces it.
- Legacy files removed, or deliberately retained and documented per step 4.
- Test counts no lower than the baseline, plus the new tests from steps 2 and 3.
- Smoke list passes.

## Manual smoke list

Create a project with a vault and a textbook · send a chat message (streaming, one tool call) · restart the app and confirm the session reloads · archive and unarchive a session · delete the project and confirm its sessions disappear · generate and save a wrap-up · store and retrieve a memory · switch the active vault.

## Risks

- **Path handling** (step 2) is the main one. The legacy functions use a fixed home-relative path; the service takes a base directory. Cover both in tests.
- **Hidden callers.** A grep for `crate::x::` misses `use crate::{a, b}` forms. Let the compiler find them: delete, then `cargo check`.
- **Scope creep.** This is a move-and-delete refactor. Bug fixes found on the way go in separate commits.

## Related

- `docs/ARCHITECTURE.md` → "Known rough edges"
- Roadmap: *Future Architecture* → "Finish the Rust service-layer migration"
