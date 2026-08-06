# Implementation Plan — Phase 14H: TS↔Rust Type Alignment via Codegen

## Objective

Eliminate the parallel `serde::Serialize/Deserialize` and TypeScript type definitions for the wire payloads (sessions, messages, tool calls, model catalog, vault entries, etc.) by generating the TS types from the Rust types. This is the long-term, sustainable replacement for the manual wrappers introduced in Phase 14A.

## Current Pain

The codebase declares the same data shapes in two places. Examples already counted:

| Shape | TS | Rust |
|---|---|---|
| `Session` | `src/lib/types.ts:48` | `src-tauri/src/session.rs:78` |
| `Message` | `src/lib/types.ts:36` | `src-tauri/src/session.rs:60` |
| `MessageSegment` | `src/lib/types.ts:14` | `src-tauri/src/session.rs:43` |
| `SegmentKind` (TS union) | `src/lib/types.ts:14` | `src-tauri/src/session.rs:25` (`enum SegmentKind`) |
| `ContentPart` | `src/lib/types.ts:6` | `src-tauri/src/session.rs:18` |
| `ProviderConfig` | `src/stores/configStore.ts:21` | `src-tauri/src/config.rs:5` |
| `ModelCatalog` | `src/lib/types.ts:240` | `src-tauri/src/models.rs` |
| `TextbookMetadata` | `src/lib/types.ts:202` | `src-tauri/src/textbook.rs` |
| `MemoryItem` | `src/lib/types.ts:188` (in types.ts) + `src/lib/memorySafety.ts:79` (redeclared) | `src-tauri/src/memory.rs:30` |
| `ToolDefinition` / `ToolCall` / `ToolResult` | `src/lib/types.ts` (inferred) | `src-tauri/src/tools/mod.rs:7` |
| `MemoryItem` (Synapse) | `src/stores/vaultStore.ts:38` | (Synapse binary, not MathMate) |
| `ScanResult` (memory safety) | `src/lib/memorySafety.ts:21` | `src-tauri/src/memory.rs:10` |

Two fields have already drifted silently:

- `Message.segments` in TS is a discriminated union; in Rust, `MessageSegment` uses a separate `SegmentKind` enum. Both serialize correctly because the field names match, but the TS-side discriminated union is purely synthetic — the runtime does not enforce the `type` field.
- `MemoryItem` in `src/lib/types.ts` does not include `trust_score`, but the version in `src/lib/memorySafety.ts:79` does. The "official" one is in flux.

## Proposed Design

### H.1 Tooling choice: `ts-rs` (preferred) or `specta`

Two mature options exist:

- **`ts-rs`** — generates `interface Foo { ... }` declarations from Rust structs/enums. Pure build-time codegen; no runtime dependency. Mature, ~1k GitHub stars. Works with serde, supports generics, handles untagged/enum representations.
- **`specta`** — also build-time, but generates more types (functions, etc.) and supports more formats. Slightly more invasive.

`ts-rs` is the better fit for MathMate's use case: the goal is to align a small set of structs/enums, not to generate the full API surface. Add `ts-rs = "10"` to `Cargo.toml` dev-dependencies, annotate the wire types with `#[derive(TS)] #[ts(export, export_to = "../../src/lib/types-generated/")]`, and run `cargo test` (or a dedicated `cargo run --bin export-types`) to produce the `.ts` files.

### H.2 Generated type location

Place generated types in `src/lib/types-generated/`:

```
src/lib/types-generated/
  session.ts        // from Rust session::Session, Message, etc.
  config.ts         // from Rust config::ProviderConfig, AppConfig
  memory.ts         // from Rust memory::MemoryItem, ScanResult
  tool.ts           // from Rust tools::ToolDefinition, ToolCall, ToolResult
  model.ts          // from Rust models::ModelCatalog
  index.ts          // re-exports
```

These files are **generated** and must not be hand-edited. Add a CI step (or `prebuild`) that runs the codegen and fails if the committed files differ from the freshly generated ones.

### H.3 Hand-written vs. generated: what's allowed

- **Generated:** the wire types — anything that crosses the IPC boundary.
- **Hand-written:** the UI state types (e.g. `useChatStore.error: AppError | null`), the in-memory accumulators (`streamedText`), the local helper types (`WrappedMemories` from `memorySafety.ts`), the in-progress orchestrator state.

The rule: if a type is part of the contract with Rust, it must be generated. If it is internal to the frontend, it can be hand-written.

### H.4 Refactor sequence

- [ ] **H.4.a** Add `ts-rs` to dev-dependencies. Configure export path to `src/lib/types-generated/`.
- [ ] **H.4.b** Annotate `Session`, `Message`, `MessageSegment`, `ContentPart`, `SessionHeader`, `SessionLine` in `src-tauri/src/session.rs`. Generate. Compare against the existing `src/lib/types.ts` definitions; resolve any drift.
- [ ] **H.4.c** Annotate `ProviderConfig`, `AppConfig` in `src-tauri/src/config.rs`. Generate. Same drill.
- [ ] **H.4.d** Annotate `MemoryItem`, `ScanResult`, `SafetyMode` in `src-tauri/src/memory.rs`. Generate. Update `src/lib/memorySafety.ts:79` to re-export the generated `MemoryItem` (or remove the redeclaration).
- [ ] **H.4.e** Annotate `ToolDefinition`, `ToolCall`, `ToolResult` in `src-tauri/src/tools/mod.rs`. Generate.
- [ ] **H.4.f** Annotate `ModelCatalog`, `ModelCatalogEntry` in `src-tauri/src/models.rs`. Generate.
- [ ] **H.4.g** Repeat for the remaining wire types (`TextbookMetadata`, `TextbookIndexMeta`, `VaultNote`, etc.).
- [ ] **H.4.h** Replace hand-written types in `src/lib/types.ts` with `export * from "./types-generated/session"`. Delete the hand-written definitions.
- [ ] **H.4.i** Add a CI step that runs the codegen and `git diff` against the committed files; fail the build on diff.

### H.5 Codegen flow

```bash
# In src-tauri/
cargo test export_types -- --ignored  # runs a doctest that exports types
git diff --exit-code ../../src/lib/types-generated/  # CI fails if drift
```

The "export" test is `#[ignore]`-d in normal `cargo test` runs (no export side effect) and runs in CI. Alternative: a `build.rs` step, but `ts-rs` is more commonly used via a test.

### H.6 Caveats and edge cases

- **Tagged enums and `untagged` representations.** The TS-side discriminated union is *added* by the `#[serde(tag = "type")]` attribute; `ts-rs` honors this and generates the correct TS.
- **`Option<T>` for nullable fields.** Maps to `T | null` on the TS side. Need to verify all consumers handle `null` correctly (some currently assume `undefined`).
- **`#[serde(skip_serializing_if = "Option::is_none")]`** means the field is absent on the wire, not `null`. The TS type should reflect this with `?:` on the optional field.
- **Enum representations other than externally-tagged** (e.g. internally tagged, adjacently tagged) need explicit `#[ts(...)]` hints. The `MessageSegment` ↔ `SegmentKind` situation in the current code is the model for what to expect.

## Task Checklist

- [ ] Add `ts-rs = "10"` to `src-tauri/Cargo.toml` dev-dependencies.
- [ ] Add `#[derive(TS)]` to all wire types in `src-tauri/src/{session,config,memory,tools,models,textbook,vault}.rs`.
- [ ] Run codegen. Resolve any compile errors (often: missing `ts-rs` features, lifetimes, generic bounds).
- [ ] Update TS imports in `src/lib/types.ts`, `src/stores/*Store.ts`, `src/lib/api/*.ts` (from 14A) to re-export from `types-generated/`.
- [ ] Add the CI `git diff` check.
- [ ] Add a "do not hand-edit" header comment to every generated file (auto-included by `ts-rs`).
- [ ] Document the rule: "if it crosses the IPC boundary, it must be generated."

## Validation

- `cargo test` ✅
- `cargo run --bin export-types` (or equivalent) produces the same files that are committed
- `npm run build` ✅
- `npm test` ✅
- A roundtrip test (from 14E) that sends a `Session` from Rust, parses it in TS, and confirms the types align.

## Acceptance Criteria

- Every type that crosses the IPC boundary is generated from Rust.
- The hand-written definitions in `src/lib/types.ts` are either deleted or clearly marked "UI-only, not wire types."
- The CI check fails if the generated files are out of date.
- The duplicate `MemoryItem` in `src/lib/memorySafety.ts:79` is removed.

## Risks

- **`ts-rs` does not support every serde feature.** If a type uses something exotic, the codegen will fail and we'll need to either refactor the type or hand-write it (and document the exception).
- **The TS import paths in 14A's typed client need to be updated to point to the generated types.** The client itself does not change.
- **The "drift" detection requires CI to run on every PR.** If CI is ever bypassed, the drift can re-accumulate. Mitigation: add a `prebuild` script that runs the codegen locally too.

## Out of scope (deferred to Phase 15+)

- **Auto-generating the `invoke_handler!` surface from a Rust trait.** Specta supports this; ts-rs does not. Worth considering if/when we add more services.
- **Auto-generating the `src/lib/api/*` wrappers (14A) from a single source of truth.** Possible with `ts-rs` + a custom macro, but premature.
- **Auto-generating test fixtures for roundtrip serialization.** Possible but again premature.
