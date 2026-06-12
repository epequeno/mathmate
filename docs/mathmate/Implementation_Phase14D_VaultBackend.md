# Implementation Plan — Phase 14D: Vault Backend Abstraction

## Objective

Replace the inlined "if Synapse is running, do this; else do that" branching in `vaultStore.ts` with a `VaultBackend` strategy interface. The store depends on the interface, not the implementation. This is a prerequisite for the multi-vault roadmap item and removes a recurring source of cross-store / cross-feature coupling.

## Current Pain

`vaultStore.ts` has 9 actions (`loadNotes`, `searchNotes`, `readNote`, `saveNote`, `createNote`, `deleteNote`, `loadBacklinks`, `checkSynapseStatus`, `runHealthCheck`), every one of which starts with `if (get().synapseRunning) { ... } else { ... }` and ends with a different normalization of the response shape.

Concrete consequences:

- **The `synapseRunning` boolean is checked 9 times** in one store. Each check has a different fallback branch. The store has no single place to ask "what's the active backend?"
- **Response normalization is undocumented.** `loadNotes` does `Array.isArray(raw) ? raw : (raw as Record<string, unknown>).notes ?? []`. `searchNotes` does the same with `results` instead of `notes`. There is no shared parser and no test that says "loadNotes produces the same shape as searchNotes."
- **Synapse response types are declared in `vaultStore.ts`** (`SynapseNoteEntry`, `SynapseNoteDetail`, `SynapseBacklinks`, `SynapseVaultInfo`) as a parallel type system separate from `lib/types.ts`. These will drift.
- **There are at least 4 different "list files in vault" implementations:** `tools/vault_list.rs::collect_md_files`, `vault::scan_vault`, the `synapseCall("note_list")` path, and the `useVaultStore.loadNotes` normalization. They have different sort orders and different hidden-file rules.
- **The legacy fallback path is dead in practice** (the app requires Synapse for most features) but visually indistinguishable from the live path. Every reader of `loadNotes` has to mentally evaluate both branches.

## Proposed Design

### D.1 The `VaultBackend` interface

```ts
// src/lib/vault/types.ts
export interface VaultEntry {
  path: string;
  title: string;
  modifiedAt?: string;
  sizeBytes?: number;
}

export interface VaultNote {
  path: string;
  title: string;
  body: string;
  frontmatter?: Record<string, unknown>;
}

export interface VaultSearchResult {
  path: string;
  title: string;
  snippet: string;
}

export interface BacklinkInfo {
  backlinks: { path: string; title: string }[];
  forwardLinks: { path: string; title: string; exists: boolean }[];
}

export interface VaultHealth {
  vault: { healthy: boolean; noteCount: number; totalFileSizeBytes: number; path: string };
  fts: { status: string; indexedNoteCount: number; lastIndexedAt: number | null };
  embeddings: { provider: string; status: string; indexedNoteCount: number; dimensions: number | null };
}

export interface VaultBackend {
  readonly name: "synapse" | "legacy";
  readonly running: boolean;
  readonly capabilities: {
    read: true;
    list: true;
    search: true;
    write: boolean;
    create: boolean;
    delete: boolean;
    backlinks: boolean;
    healthCheck: boolean;
  };
  list(): Promise<VaultEntry[]>;
  read(path: string): Promise<VaultNote>;
  write(path: string, content: string, title?: string): Promise<void>;
  create(title: string, content: string): Promise<{ path: string }>;
  delete(path: string): Promise<void>;
  search(query: string): Promise<VaultSearchResult[]>;
  backlinks(path: string): Promise<BacklinkInfo>;
  vaultInfo(): Promise<{ name: string; path: string; noteCount: number }[]>;
  healthCheck(): Promise<VaultHealth | null>;
}
```

### D.2 The two implementations

```ts
// src/lib/vault/synapse.ts
export class SynapseBackend implements VaultBackend {
  readonly name = "synapse" as const;
  constructor(private readonly api: TypedApiClient) {}

  get running(): boolean { /* reads from a watch/signal */ }

  private call<T>(tool: string, args: Record<string, unknown> = {}): Promise<T> {
    return this.api.Synapse.call<T>(tool, args);
  }

  async list(): Promise<VaultEntry[]> {
    const raw = await this.call<unknown>("note_list", {});
    return normalizeList(raw);
  }
  // ... etc
}
```

```ts
// src/lib/vault/legacy.ts
export class LegacyBackend implements VaultBackend {
  readonly name = "legacy" as const;
  get running(): boolean { return !!this.vaultPath; }

  constructor(
    private readonly api: TypedApiClient,
    private readonly vaultPath: string,
    private readonly projectId: string | null,
  ) {}

  async list(): Promise<VaultEntry[]> {
    const notes = await this.api.Vault.scan(this.vaultPath, this.projectId);
    return notes.map(n => ({ path: n.path, title: n.title, sizeBytes: n.size_bytes }));
  }
  // ... etc
}
```

### D.3 Normalization as a first-class concern

```ts
// src/lib/vault/normalize.ts
// Tested in isolation. Both backends call these.

export function normalizeList(raw: unknown): VaultEntry[] {
  const arr = Array.isArray(raw) ? raw : (raw as any)?.notes ?? [];
  return (arr as SynapseNoteEntry[]).map(toVaultEntry);
}

export function normalizeSearch(raw: unknown): VaultSearchResult[] {
  const arr = Array.isArray(raw) ? raw : (raw as any)?.results ?? [];
  return (arr as SynapseNoteEntry[]).map(toVaultSearchResult);
}

export function normalizeBacklinks(raw: unknown): BacklinkInfo {
  const r = raw as SynapseBacklinks;
  return {
    backlinks: (r.backlinks ?? []).map(toBacklink),
    forwardLinks: (r.forward_links ?? []).map(toForwardLink),
  };
}
```

The `toVaultEntry` mappers are the single place where Synapse's `{ path, title, snippet? }` shape becomes the frontend's `{ path, title, modifiedAt?, sizeBytes? }` shape.

### D.4 The store as a thin shell

```ts
// src/stores/vaultStore.ts (after 14D)
class VaultStore {
  private backend: VaultBackend;
  // ... existing state ...

  async loadNotes() {
    set({ loading: true, error: null });
    try {
      const notes = await this.backend.list();
      set({ notes, loading: false, noteCount: notes.length });
    } catch (err) {
      set({ error: toAppError(err).message, loading: false });
    }
  }

  // ... etc
}
```

The store no longer reads `synapseRunning` directly. Instead, a small effect subscribes to the project's `vault_path` and switches `this.backend` when it changes. UI actions (Create/Delete/Save/Backlinks/Health) are gated by `backend.capabilities` rather than assuming every backend supports every operation.

### D.5 Project switcher

```ts
// src/stores/projectStore.ts (after 14D)
setCurrentProject(project: MathProject | null) {
  if (project?.vault_path) {
    const backend = project.synapse_enabled
      ? new SynapseBackend(api)
      : new LegacyBackend(api, project.vault_path, project.id);
    useVaultStore.getState().setBackend(backend);
  } else {
    useVaultStore.getState().setBackend(null);
  }
}
```

This is the right model for the upcoming multi-vault feature: the project store knows the vault, the vault store knows the backend, the backends know their transport.

## Task Checklist

- [ ] Define `src/lib/vault/types.ts` with the `VaultBackend` interface and shared types.
- [ ] Create `src/lib/vault/normalize.ts` with the normalizers.
- [ ] Create `src/lib/vault/synapse.ts` (SynapseBackend) and `src/lib/vault/legacy.ts` (LegacyBackend).
- [ ] Move the four `Synapse*` response types from `vaultStore.ts` to `src/lib/vault/normalize.ts` and mark them internal.
- [ ] Rewrite `vaultStore.ts` as a thin shell that holds the active `VaultBackend` and delegates.
- [ ] Update `projectStore.setCurrentProject` to construct the appropriate backend.
- [ ] Add `src/lib/vault/normalize.test.ts` with fixtures for both response shapes that all backends may produce.
- [ ] Add `src/lib/vault/synapse.test.ts` and `src/lib/vault/legacy.test.ts` with mocked `TypedApiClient`.
- [ ] Add `src/lib/vault/capabilities.test.ts` to verify each UI action is enabled/disabled correctly per backend.
- [ ] Add `setBackend(backend: VaultBackend | null)` to `vaultStore`.

## Validation

- `npm run build` ✅
- `npm test` ✅
- `cargo test` ✅ (no Rust change in 14D, but check `tools/vault_list.rs` stays compatible)
- Manual smoke: with Synapse running, perform every action on a vault. Stop Synapse, fall back to legacy, repeat. Switch projects with different vault configs.

## Acceptance Criteria

- `vaultStore` has zero `if (get().synapseRunning) { ... } else { ... }` branches.
- The four response normalizers are unit-tested with documented fixtures.
- The Synapse/legacy decision lives in exactly one place (`projectStore.setCurrentProject` or a dedicated effect in `vaultStore`).
- A new `VaultBackend` implementation (e.g. an in-memory test backend, or a future S3-backed one) can be added with no changes to `vaultStore` or the components that consume it.
- The wire format and Tauri command surface is unchanged (the 14A wrappers continue to work).

## Risks

- **Behavior drift between backends.** The legacy backend currently cannot `create`, `delete`, `save`, or `backlinks`. **Decision:** model support explicitly through `backend.capabilities` and gate UI affordances before invocation; unsupported method calls still return typed `AppError` as a safety net.
- **The `vaultHealth` field is dead state today** (set by `runHealthCheck`, never read). The interface should still include it; remove the store field if no consumer is added.
- **The `noteCount` field on the store is fed by both `loadNotes` and `vaultInfo`**, which disagree. The interface should pick one source of truth; the store can re-derive the other from `loadNotes`.
