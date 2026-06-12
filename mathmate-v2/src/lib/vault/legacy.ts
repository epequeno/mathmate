// ─── Legacy Backend ───────────────────────────────────────────────────
// Vault operations directly against the filesystem via Tauri commands.
// Limited capabilities: no create, delete, search (FTS), or healthCheck.
//
// See: Implementation_Phase14D_VaultBackend.md §D.2

import { Vault } from "../api";
import type {
  VaultBackend,
  VaultEntry,
  VaultNote,
  VaultSearchResult,
  BacklinkInfo,
  VaultHealth,
} from "./types";

export class LegacyBackend implements VaultBackend {
  readonly name = "legacy" as const;

  readonly capabilities = {
    read: true,
    list: true,
    search: false,   // filename-only, handled in the store
    write: false,
    create: false,
    delete: false,
    backlinks: false,
    healthCheck: false,
  };

  constructor(
    readonly vaultPath: string,
    readonly projectId: string | null,
  ) {}

  get running(): boolean {
    return !!this.vaultPath;
  }

  // ── Operations ────────────────────────────────────────────────────

  async list(): Promise<VaultEntry[]> {
    if (!this.projectId) return [];
    const notes = await Vault.scan(this.vaultPath, this.projectId);
    return notes.map((n) => ({
      path: n.path,
      title: n.title || n.filename,
      sizeBytes: n.size_bytes,
    }));
  }

  async read(path: string): Promise<VaultNote> {
    const content = await Vault.readNote(path, this.projectId ?? undefined);
    const filename = path.split("/").pop()?.replace(/\.md$/i, "") || path;
    return { path, title: filename, body: content };
  }

  async write(_path: string, _content: string, _title?: string): Promise<void> {
    throw new Error("Cannot save — Synapse not running");
  }

  async create(_title: string, _content: string): Promise<{ path: string }> {
    throw new Error("Cannot create — Synapse not running");
  }

  async delete(_path: string): Promise<void> {
    throw new Error("Cannot delete — Synapse not running");
  }

  async search(_query: string): Promise<VaultSearchResult[]> {
    // Legacy search is handled by the store (filename match on client side).
    return [];
  }

  async backlinks(_path: string): Promise<BacklinkInfo> {
    return { backlinks: [], forward_links: [] };
  }

  async vaultInfo(): Promise<{ name: string; path: string; noteCount: number }[]> {
    return [];
  }

  async healthCheck(): Promise<VaultHealth | null> {
    return null;
  }
}
