// ─── Synapse Backend ──────────────────────────────────────────────────
// Vault operations via the local Synapse MCP agent.
//
// See: Implementation_Phase14D_VaultBackend.md §D.2

import { Vault } from "../api";
import { normalizeList, normalizeSearch, normalizeNote, normalizeBacklinks } from "./normalize";
import type {
  VaultBackend,
  VaultEntry,
  VaultNote,
  VaultSearchResult,
  BacklinkInfo,
  VaultHealth,
} from "./types";

/** Strip FTS5-special characters from a search query. */
function sanitizeFtsQuery(q: string): string {
  return q.replace(/[^\w\s-]/g, "").replace(/\s+/g, " ").trim();
}

/** Raw Synapse vault_info response shape. */
interface SynapseVaultInfo {
  vaults: { name: string; path: string; note_count: number }[];
}

export class SynapseBackend implements VaultBackend {
  readonly name = "synapse" as const;
  private _running = false;

  readonly capabilities = {
    read: true,
    list: true,
    search: true,
    write: true,
    create: true,
    delete: true,
    backlinks: true,
    healthCheck: true,
  };

  get running(): boolean {
    return this._running;
  }

  /** Called by the project store when Synapse starts or stops. */
  setRunning(v: boolean): void {
    this._running = v;
  }

  // ── Operations ────────────────────────────────────────────────────

  async list(): Promise<VaultEntry[]> {
    const raw = await Vault.synapseCall<unknown>("note_list", {});
    return normalizeList(raw);
  }

  async read(path: string): Promise<VaultNote> {
    const raw = await Vault.synapseCall<unknown>("note_read", { path });
    return normalizeNote(raw);
  }

  async write(path: string, content: string, title?: string): Promise<void> {
    const args: Record<string, unknown> = { path, content };
    if (title) args.title = title;
    await Vault.synapseCall("note_update", args);
  }

  async create(title: string, content: string): Promise<{ path: string }> {
    const result = await Vault.synapseCall<{ path?: string }>("note_create", {
      title,
      content,
    });
    return { path: result.path ?? "" };
  }

  async delete(path: string): Promise<void> {
    await Vault.synapseCall("note_delete", { path });
  }

  async search(query: string): Promise<VaultSearchResult[]> {
    const raw = await Vault.synapseCall<unknown>("note_search", {
      query: sanitizeFtsQuery(query),
    });
    return normalizeSearch(raw);
  }

  async backlinks(path: string): Promise<BacklinkInfo> {
    const raw = await Vault.synapseCall<unknown>("note_backlinks", { path });
    return normalizeBacklinks(raw);
  }

  async vaultInfo(): Promise<{ name: string; path: string; noteCount: number }[]> {
    const raw = await Vault.synapseCall<SynapseVaultInfo>("vault_info", {});
    return (raw.vaults ?? []).map((v) => ({
      name: v.name,
      path: v.path,
      noteCount: v.note_count,
    }));
  }

  async healthCheck(): Promise<VaultHealth | null> {
    return await Vault.synapseCall<VaultHealth>("health_check", {});
  }
}
