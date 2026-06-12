// ─── Vault Backend Strategy Interface ─────────────────────────────────
// Phase 14D: The vault store depends on this interface, not on whether
// Synapse is running.  New backends (in-memory test, S3, etc.) can be
// added with zero changes to the store or components.
//
// See: Implementation_Phase14D_VaultBackend.md

// ─── Shared Shapes ────────────────────────────────────────────────────

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
  forward_links: { path: string; title: string; exists: boolean }[];
}

export interface VaultHealth {
  vault: { healthy: boolean; noteCount: number; totalFileSizeBytes: number; path: string };
  fts: { status: string; indexedNoteCount: number; lastIndexedAt: number | null };
  embeddings: { provider: string; status: string; indexedNoteCount: number; dimensions: number | null };
}

// ─── Backend Interface ────────────────────────────────────────────────

export interface VaultBackend {
  /** Human-readable backend name for debugging. */
  readonly name: "synapse" | "legacy";

  /** Whether the backend is currently operational. */
  readonly running: boolean;

  /** Which operations this backend can perform. */
  readonly capabilities: {
    read: boolean;
    list: boolean;
    search: boolean;
    write: boolean;
    create: boolean;
    delete: boolean;
    backlinks: boolean;
    healthCheck: boolean;
  };

  /** List all notes in the vault. */
  list(): Promise<VaultEntry[]>;

  /** Read a single note by path. */
  read(path: string): Promise<VaultNote>;

  /** Write content to an existing note. */
  write(path: string, content: string, title?: string): Promise<void>;

  /** Create a new note. */
  create(title: string, content: string): Promise<{ path: string }>;

  /** Delete a note by path. */
  delete(path: string): Promise<void>;

  /** Full-text search across notes. */
  search(query: string): Promise<VaultSearchResult[]>;

  /** Get backlinks for a note. */
  backlinks(path: string): Promise<BacklinkInfo>;

  /** Get vault metadata (name, path, note count). */
  vaultInfo(): Promise<{ name: string; path: string; noteCount: number }[]>;

  /** Deep health check (FTS index, embeddings, etc.). */
  healthCheck(): Promise<VaultHealth | null>;
}
