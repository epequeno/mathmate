# Implementation Plan — Phase 15E: Multi-Vault Support

## Objective

Replace `currentProject.vault_path: string | null` with `currentProject.vaults: VaultRef[]`, allowing a project to reference multiple vaults. This enables:
1. A per-chapter vault alongside the main project vault
2. A shared classroom vault (read-only) alongside a personal vault
3. Synapse + legacy vaults coexisting in the same project

The `VaultBackend` strategy (Phase 14D) provides the foundation; this plan extends the project data model and updates the frontend to show a vault switcher.

## Current Pain

- `vault_path: string | null` on `MathProject` stores exactly one vault path
- Switching vaults requires a full project change (different project = different vault)
- `vaultStore` operations all go through the current project's single vault path
- The vault switcher in the sidebar is effectively one vault per project

Real use cases that don't work:
- "I want my calculus notes in one vault and my linear algebra notes in another, both under the same project"
- "My teacher shared a read-only vault with class resources — I want it alongside my personal vault"
- "I use Synapse for my main notes but want a legacy vault for PDF exports"

## Proposed Design

### E.1 Data model

```ts
// In Rust (src-tauri/src/project.rs)

// VaultRef replaces the single vault_path field
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "export-types", derive(TS))]
#[cfg_attr(feature = "export-types", ts(export, export_to = "project.ts"))]
pub struct VaultRef {
    pub id: String,           // UUID, stable identity
    pub name: String,         // user-visible short name: "Calculus Notes"
    pub path: PathBuf,        // absolute path on disk
    pub backend: VaultBackend, // "synapse" | "legacy" | "classroom"
    pub read_only: bool,      // classroom shared vault
    pub position: u8,         // tab order in vault switcher
}

// Project.vaults replaces project.vault_path
pub struct MathProject {
    pub id: String,
    pub name: String,
    pub vaults: Vec<VaultRef>,
    pub active_vault_id: String,  // which vault is currently selected
    // ... rest of existing fields
}
```

### E.2 Migration

```ts
// In Rust: on project load from JSON
// If project.vault_path is non-null and project.vaults is empty:
//   project.vaults = [{ id: uuid!, name: "Main Vault", path: old_vault_path,
//                       backend: "synapse", read_only: false, position: 0 }]
//   project.active_vault_id = vault_ref.id
// If project.vault_path is non-null and project.vaults is non-empty:
//   migrate: add missing VaultRef entries (keep old path as first entry)
```

This is a **one-time data migration** in the JSON load path. The on-disk JSON format gets the new field; old JSON files get the migration applied at read time.

### E.3 Rust service changes

```ts
// In services/project.rs

// update_project_vaults(project_id, vaults[]) — add/remove/reorder vaults
// set_active_vault(project_id, vault_id)       — switch active vault
// add_vault(project_id, vault_ref)             — add a new vault reference
// remove_vault(project_id, vault_id)           — remove a vault reference (keeps files on disk)
// rename_vault(project_id, vault_id, name)     — rename in the VaultRef
```

These become new Tauri commands (add 5 commands).

### E.4 Frontend: VaultSwitcher component

```
VaultSwitcher.tsx          (drop-down: list vaults + "Add Vault" + "Remove" for active)
├── VaultTab.tsx           (single vault tab with icon + name)
├── VaultAddDialog.tsx     (native folder picker + backend selector + name input)
└── VaultRemoveDialog.tsx  (confirm: removes ref but not files on disk)
```

The `VaultSwitcher` lives in the `ContextPanel` header or `Sidebar` vault section. It switches the `active_vault_id` in the project store, which `vaultStore` uses to derive `currentVault`.

### E.5 `vaultStore` update

```ts
// Current:
currentVault: VaultRef | null  // derived from projectStore.currentProject?.vault_path

// New:
currentVault: VaultRef | null  // derived from projectStore.currentProject?.vaults.find(v => v.id === projectStore.currentProject?.active_vault_id)
activeVaultId: string | null   // from currentProject.active_vault_id
```

All existing `vaultStore` methods (`list`, `read`, `write`, `create`, `delete`, `search`, `backlinks`, `vaultInfo`, `healthCheck`) are unchanged — they already operate through the `VaultBackend` which is constructed from `currentProject.vaults`. The backend construction in `projectStore.setCurrentProject` changes to select the active vault from the array.

### E.6 The `VaultBackend` strategy from Phase 14D

The `VaultBackend` strategy already handles Synapse vs legacy. The only change is that `SynapseBackend` and `LegacyBackend` are now instantiated per `VaultRef` rather than per project. The routing is:

```
currentProject.vaults[]
  └─→ [active_vault_id] → current VaultRef
        └─→ VaultBackend.for(ref.backend, ref.path)
              └─→ SynapseBackend | LegacyBackend
```

## Task Checklist

### Data model
- [ ] Add `VaultRef` struct in Rust `project.rs` with `#[derive(TS)]` annotation
- [ ] Add `VaultBackend` enum: `Synapse | Legacy | Classroom`
- [ ] Add `vaults: Vec<VaultRef>` and `active_vault_id: String` fields to `MathProject`
- [ ] Add `export-types` feature re-export for `VaultRef` + `MathProject` in `services/project.rs`
- [ ] Add migration in `project.rs`: load-time conversion of `vault_path → vaults[0]`
- [ ] Regenerate TS types: `npm run generate:ts-types`

### Rust commands
- [ ] Add `update_project_vaults` command (replace vault list)
- [ ] Add `set_active_vault` command
- [ ] Add `add_vault` command
- [ ] Add `remove_vault` command
- [ ] Add `rename_vault` command
- [ ] Regenerate TS API wrappers (`npm run generate:ts-types` after adding commands)

### Frontend
- [ ] Add `src/components/VaultSwitcher.tsx`
- [ ] Add `src/components/VaultSwitcher/VaultTab.tsx`
- [ ] Add `src/components/VaultSwitcher/VaultAddDialog.tsx`
- [ ] Add `src/components/VaultSwitcher/VaultRemoveDialog.tsx`
- [ ] Update `projectStore.ts`:
  - `setCurrentProject` constructs the backend from `activeVault` (first vault or selected)
  - `setActiveVault(id)` updates `active_vault_id`
  - `addVault(vaultRef)`, `removeVault(vaultId)`, `updateVaults(vaults[])`
  - `currentProject.vault_path` is removed
- [ ] Update `vaultStore.ts`: derive `currentVault` from `activeVaultId` in `currentProject`
- [ ] Update `ChatPage.tsx`, `ContextPanel.tsx`, `VaultPage.tsx` to use `VaultSwitcher`
- [ ] Add `vaultStore.vaults[]` derived from `projectStore.currentProject?.vaults`

### Tests
- [ ] Update Rust project tests for new data model
- [ ] Add `src/lib/vault/vaultswitcher.test.tsx` (render VaultSwitcher with 1 vault, 2 vaults, read-only vault)
- [ ] Verify the migration path: load an old JSON project with `vault_path` and confirm it becomes `vaults[0]`

## Validation

- `npm run build` ✅
- `npm test` ✅
- `cargo test` ✅
- Manual smoke:
  1. Create a new project — should have one vault (empty path or default)
  2. Add a second vault via VaultSwitcher → folder picker → confirm
  3. Switch between vaults — vaultStore operations should use the selected vault
  4. Search in vault A, switch to vault B, search again — results differ
  5. Remove a vault from the project — files remain on disk; project loads without errors
  6. Load an old project (JSON with `vault_path`) — migration produces a `vaults` array

## Acceptance Criteria

- A project can have 1–N vault references
- `vault_path: string | null` is removed from the JSON format (migrated)
- All existing vault operations (list, read, write, create, delete, search) work on the active vault
- The VaultSwitcher UI shows all vaults in the project with the active vault highlighted
- Adding a new vault prompts for a folder (native dialog) and a name
- Removing a vault removes it from the project but not from disk
- Read-only vaults (classroom) show a lock indicator and disable write operations in the UI

## Risks

- **Old JSON project migration.** Migration happens at load time. If `vault_path` is null, the project has no vault. Mitigation: in `init_vault`, check if `vaults` is empty and create a default vault.
- **Synapse per-vault vs per-project.** Synapse currently initializes one MCP client per project. If a project has two Synapse vaults, do they share one MCP connection or need two? Mitigation: keep one Synapse connection per project (as today) — both Synapse vaults use the same connection. The path check in `VaultBackend` is per-call.
- **API key for multiple vaults.** If vault A needs a Synapse API key and vault B is a legacy vault, both should work independently. This is already handled by `VaultBackend`.
- **Data migration is one-way.** Old JSON files get migrated on load. Once loaded and saved, they use the new format. Mitigation: add a version field to the JSON format for future migrations.

## Out of Scope

- **Classroom/collab sync.** Read-only classroom vaults are a data-model feature; the actual sync/live-collaboration protocol is a separate Phase 15+ item.
- **Vault nesting.** No sub-folders within a vault (each `VaultRef` points to one directory). Users can organize with sub-folders if they want.
- **Vault templates.** No "create vault from template" feature.
