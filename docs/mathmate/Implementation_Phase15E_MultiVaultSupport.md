# Implementation Plan — Phase 15E: Multi-Vault Support

## Objective

Replace single-vault project state (`vault_path`) with multi-vault project state (`vaults[] + active_vault_id`) so one project can attach multiple vault references and switch an active vault at runtime.

## Scope Decisions (locked before implementation)

1. **Single active vault at a time** for all read/write/tool operations.
2. **One Synapse MCP process at a time**, bound to the active Synapse vault path.
3. Switching active vault:
   - Synapse → Synapse (different path): restart Synapse on new path
   - Synapse → Legacy/Classroom: stop Synapse
   - Legacy/Classroom → Synapse: start Synapse on selected path
4. Rust enum name will be **`VaultKind`** (avoid collision with frontend `VaultBackend` interface).

## Current Pain

- `MathProject.vault_path` stores exactly one vault.
- Switching vaults requires changing projects.
- Backend selection is project-level, not active-vault-level.
- `vault_path` is hard-wired in multiple Rust/TS paths (`tools`, `pathscope`, `wrapup`, stores/pages).

## Proposed Design

### E.1 Data model

```rust
// src-tauri/src/project.rs

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "export-types", derive(ts_rs::TS))]
#[cfg_attr(feature = "export-types", ts(export, export_to = "project.ts"))]
pub enum VaultKind {
    Synapse,
    Legacy,
    Classroom,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "export-types", derive(ts_rs::TS))]
#[cfg_attr(feature = "export-types", ts(export, export_to = "project.ts"))]
pub struct VaultRef {
    pub id: String,
    pub name: String,
    pub path: String,
    pub kind: VaultKind,
    pub read_only: bool,
    pub position: u16,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MathProject {
    pub id: String,
    pub name: String,
    pub vaults: Vec<VaultRef>,
    pub active_vault_id: Option<String>,
    pub schema_version: Option<u32>,
    // existing fields...
}
```

### E.2 Migration invariants

Run migration in project load path (`project.rs` + `services/project.rs`):

- If old `vault_path` exists and `vaults` empty:
  - create `vaults[0]` from old path (`kind = Synapse`, `read_only = false`, `position = 0`)
  - set `active_vault_id = Some(vaults[0].id)`
- If `vaults` non-empty and `active_vault_id` missing/invalid:
  - set to first vault by `position`
- Ensure each vault has non-empty `id`; generate if missing
- Normalize `position` to contiguous sequence
- If `vaults` empty, force `active_vault_id = None`
- Set `schema_version = Some(2)` after migration

### E.3 Backend routing model

Routing moves from project-level to active-vault-level:

```text
project.vaults + project.active_vault_id
  -> active VaultRef
  -> backend factory by VaultRef.kind
  -> SynapseBackend | LegacyBackend | ClassroomBackend (read-only wrapper)
```

`projectStore.setCurrentProject` and `setActiveVault` become the only places that construct/swap backends.

### E.4 Cross-cutting backend changes (must be in plan, not discovered mid-PR)

#### Rust
- `src-tauri/src/project.rs` and `src-tauri/src/services/project.rs`
  - new structs/enums + migration
- `src-tauri/src/lib.rs`
  - add vault management commands
  - update tool execution path to resolve **active** vault path (not `project.vault_path`)
- `src-tauri/src/services/path.rs`
  - `build_allowed_roots()` must include all project vault paths
- `src-tauri/src/services/synapse.rs` usage in command layer
  - sync lifecycle to active vault transitions

#### Type export / TS contract
- add project type exports (`project.ts`) to `types_export` and `src-tauri/tests/export_types.rs`
- update frontend imports to use generated project types where appropriate

#### Frontend
- `src/lib/types.ts` / `src/lib/api/projects.ts` contract updates
- `src/stores/projectStore.ts`
  - active-vault selection actions
  - backend rebuild and Synapse lifecycle on switch
- `src/stores/vaultStore.ts`
  - derive `currentVault` from active id
- pages/components referencing `currentProject.vault_path`
  - `ChatPage.tsx`, `VaultPage.tsx`, `OverviewPage.tsx`, `ProjectSettingsPanel.tsx`
  - wrap-up save flow must use active vault path

### E.5 Commands

Add commands (service + tauri wrappers + TS API wrapper):
- `update_project_vaults(project_id, vaults)`
- `set_active_vault(project_id, vault_id)`
- `add_vault(project_id, vault_ref)`
- `remove_vault(project_id, vault_id)`
- `rename_vault(project_id, vault_id, name)`

Removal invariants:
- if removed vault is active, select next by `position` (or previous); if none, `active_vault_id = None`
- removing a vault ref never deletes on-disk files

### E.6 UI

Add `VaultSwitcher` surface:

```text
VaultSwitcher.tsx
├── VaultTab.tsx
├── VaultAddDialog.tsx
└── VaultRemoveDialog.tsx
```

Must show:
- active vault highlight,
- backend badge (`Synapse`, `Legacy`, `Classroom`),
- lock icon + disabled write actions for `read_only` / classroom vaults.

## Task Checklist

### Data model + migration
- [ ] Add `VaultKind` + `VaultRef` in Rust project model
- [ ] Add `vaults` + `active_vault_id` to `MathProject`
- [ ] Implement load-time migration and invariants
- [ ] Add/propagate `schema_version`

### Rust commands/services
- [ ] Add 5 vault-management commands
- [ ] Update `execute_tool` path resolution to active vault
- [ ] Update `build_allowed_roots` to include all project vault paths
- [ ] Wire Synapse start/stop/restart to active vault transitions

### Type export / TS wrappers
- [ ] Export project-related TS types (`project.ts`) via `ts-rs`
- [ ] Update export test (`src-tauri/tests/export_types.rs`)
- [ ] Update TS API wrappers for new commands

### Frontend stores/UI
- [ ] Add active-vault actions in `projectStore`
- [ ] Update `vaultStore` derivations
- [ ] Implement `VaultSwitcher` + dialogs
- [ ] Remove all direct `currentProject.vault_path` callsites

### Tests
- [ ] Rust migration tests: old JSON (`vault_path`) -> new model
- [ ] Rust invariants tests: invalid active id, empty vault list, remove-active behavior
- [ ] Frontend tests for switcher states (1 vault, many vaults, read-only)
- [ ] Store tests for backend swap + Synapse lifecycle transitions

## Validation

- `npm run build` ✅
- `npm test` ✅
- `cargo check` ✅
- `cargo test` ✅
- Manual smoke:
  1. Load old project JSON and verify migration
  2. Add/remove/rename vault refs
  3. Switch active vault and verify notes/search/tool execution follow active vault
  4. Switch between two Synapse vaults and verify restart behavior
  5. Classroom/read-only vault disables writes

## Acceptance Criteria

- Projects support 0..N vault references with stable active selection
- No runtime dependency on legacy `vault_path` remains
- Active vault governs all vault operations and tool-vault context
- Synapse lifecycle is deterministic on vault switches
- Migration is safe, idempotent, and covered by tests

## Risks

- **Hidden `vault_path` coupling**: mitigate via grep-driven checklist and CI assertion against new usages.
- **Synapse restart race on rapid switching**: mitigate by serializing switch operations in `projectStore`.
- **Migration edge cases**: mitigate with fixture files for malformed/partial old JSON.

## Out of Scope

- Collaborative sync protocol for classroom vaults
- Multi-active-vault querying in a single call
- Vault nesting/templates
