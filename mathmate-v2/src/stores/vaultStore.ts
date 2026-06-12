import { create } from "zustand";
import { Vault as VaultApi } from "../lib/api";
import type { VaultNote } from "../lib/types";

// ─── Synapse Response Types ─────────────────────────────────────────────
// These match the Synapse MCP tool response shapes.

/** Strip FTS5-special characters from a search query to avoid syntax errors. */
function sanitizeFtsQuery(q: string): string {
  return q.replace(/[^\w\s-]/g, "").replace(/\s+/g, " ").trim();
}

interface SynapseNoteEntry {
  path: string;
  title: string;
  /** Optional snippet from search results */
  snippet?: string;
}

interface SynapseNoteDetail {
  path: string;
  title: string;
  body: string;
  frontmatter?: Record<string, unknown>;
}

interface SynapseBacklinks {
  backlinks: string[];
  forward_links: { target: string; title: string; exists: boolean }[];
}

interface SynapseVaultInfo {
  vaults: { name: string; path: string; note_count: number }[];
}

// ─── Frontend Types ────────────────────────────────────────────────────

export interface NoteEntry {
  path: string;
  title: string;
}

export interface SearchResult {
  path: string;
  title: string;
  snippet: string;
}

export interface NoteDetail {
  path: string;
  title: string;
  body: string;
}

export interface BacklinkInfo {
  backlinks: { path: string; title: string }[];
  forward_links: { path: string; title: string; exists: boolean }[];
}

/** Health check result from Synapse health_check tool */
export interface SynapseHealth {
  vault: { healthy: boolean; note_count: number; total_file_size_bytes: number; path: string };
  fts: { status: string; indexed_note_count: number; last_indexed_at: number | null };
  embeddings: { provider: string; status: string; indexed_note_count: number; dimensions: number | null };
}

interface VaultState {
  notes: NoteEntry[];
  loading: boolean;
  error: string | null;
  searchResults: SearchResult[] | null;
  searchQuery: string;
  selectedNote: NoteDetail | null;
  backlinks: BacklinkInfo | null;
  synapseRunning: boolean;
  noteCount: number;
  pendingSelectPath: string | null;
  synapseHealth: SynapseHealth | null;

  loadNotes: () => Promise<void>;
  searchNotes: (q: string) => Promise<void>;
  clearSearch: () => void;
  readNote: (path: string) => Promise<void>;
  saveNote: (path: string, content: string, title?: string) => Promise<void>;
  createNote: (title: string, content: string) => Promise<{ path: string } | null>;
  deleteNote: (path: string) => Promise<void>;
  loadBacklinks: (path: string) => Promise<void>;
  checkSynapseStatus: () => Promise<void>;
  runHealthCheck: () => Promise<void>;
  navigateToNote: (path: string) => void;
}

/**
 * Helper to call a Synapse MCP tool via the `synapse_call` Tauri command.
 */
async function synapseCall<T>(tool: string, args?: Record<string, unknown>): Promise<T> {
  return VaultApi.synapseCall<T>(tool, args);
}

export const useVaultStore = create<VaultState>((set, get) => ({
  notes: [],
  loading: false,
  error: null,
  searchResults: null,
  searchQuery: "",
  selectedNote: null,
  backlinks: null,
  synapseRunning: false,
  noteCount: 0,
  pendingSelectPath: null,
  synapseHealth: null,

  loadNotes: async () => {
    set({ loading: true, error: null });
    try {
      // Try Synapse first
      if (get().synapseRunning) {
        const raw = await synapseCall<unknown>("note_list", {});
        const entries = Array.isArray(raw)
          ? raw
          : (raw as Record<string, unknown>).notes ?? [];
        const notes: NoteEntry[] = (entries as SynapseNoteEntry[]).map((n) => ({
          path: n.path,
          title: n.title || n.path.split("/").pop()?.replace(/\.md$/i, "") || n.path,
        }));
        set({ notes, loading: false, noteCount: notes.length });
      } else {
        // Fallback to legacy scan_vault
        throw new Error("Synapse not running");
      }
    } catch {
      // Legacy fallback: try scan_vault
      try {
        // We need the vault path — read from project store
        const { useProjectStore } = await import("./projectStore");
        const project = useProjectStore.getState().currentProject;
        if (project?.vault_path) {
          const vaultNotes = await VaultApi.scan(project.vault_path, project.id);
          const notes: NoteEntry[] = vaultNotes.map((n) => ({
            path: n.path,
            title: n.title || n.filename,
          }));
          set({ notes, loading: false, noteCount: notes.length });
        } else {
          set({ notes: [], loading: false, noteCount: 0 });
        }
      } catch (err) {
        set({ error: String(err), loading: false });
      }
    }
  },

  searchNotes: async (q: string) => {
    set({ searchQuery: q });
    if (!q.trim()) {
      set({ searchResults: null });
      return;
    }
    try {
      if (!get().synapseRunning) {
        // Legacy search via note filenames
        const notes = get().notes;
        const lower = q.toLowerCase();
        const results = notes
          .filter((n) => n.title.toLowerCase().includes(lower) || n.path.toLowerCase().includes(lower))
          .map((n) => ({ path: n.path, title: n.title, snippet: "" }));
        set({ searchResults: results });
        return;
      }
      const raw = await synapseCall<unknown>("note_search", { query: sanitizeFtsQuery(q) });
      const entries = Array.isArray(raw)
        ? raw
        : (raw as Record<string, unknown>).results ?? [];
      const results: SearchResult[] = (entries as SynapseNoteEntry[]).map((n) => ({
        path: n.path,
        title: n.title || n.path.split("/").pop()?.replace(/\.md$/i, "") || n.path,
        snippet: n.snippet ?? "",
      }));
      set({ searchResults: results });
    } catch (err) {
      console.error("Search failed:", err);
      set({ searchResults: [] });
    }
  },

  clearSearch: () => {
    set({ searchQuery: "", searchResults: null });
  },

  readNote: async (path: string) => {
    try {
      if (get().synapseRunning) {
        const detail = await synapseCall<SynapseNoteDetail>("note_read", { path });
        set({
          selectedNote: {
            path: detail.path,
            title: detail.title || path.split("/").pop()?.replace(/\.md$/i, "") || path,
            body: detail.body,
          },
        });
      } else {
        // Legacy fallback
        const { useProjectStore } = await import("./projectStore");
        const projectId = useProjectStore.getState().currentProject?.id;
        const content = await VaultApi.readNote(path, projectId);
        const filename = path.split("/").pop()?.replace(/\.md$/i, "") || path;
        set({
          selectedNote: { path, title: filename, body: content },
        });
      }
    } catch (err) {
      console.error("Failed to read note:", err);
      set({ error: String(err) });
    }
  },

  saveNote: async (path: string, content: string, title?: string) => {
    try {
      if (get().synapseRunning) {
        const args: Record<string, unknown> = { path, content };
        if (title) args.title = title;
        await synapseCall("note_update", args);
      } else {
        // Legacy: no save support
        throw new Error("Cannot save — Synapse not running");
      }
    } catch (err) {
      throw err;
    }
  },

  createNote: async (title: string, content: string) => {
    try {
      if (get().synapseRunning) {
        const result = await synapseCall<{ path?: string }>("note_create", { title, content });
        // Reload notes to show the new one
        get().loadNotes();
        return result.path ? { path: result.path } : null;
      }
      throw new Error("Cannot create — Synapse not running");
    } catch (err) {
      console.error("Failed to create note:", err);
      set({ error: String(err) });
      return null;
    }
  },

  deleteNote: async (path: string) => {
    try {
      if (get().synapseRunning) {
        await synapseCall("note_delete", { path });
        // Deselect if we just deleted the selected note
        const selected = get().selectedNote;
        if (selected?.path === path) {
          set({ selectedNote: null, backlinks: null });
        }
        // Reload list
        await get().loadNotes();
      } else {
        throw new Error("Cannot delete — Synapse not running");
      }
    } catch (err) {
      console.error("Failed to delete note:", err);
      set({ error: String(err) });
      throw err;
    }
  },

  loadBacklinks: async (path: string) => {
    try {
      if (get().synapseRunning) {
        const bl = await synapseCall<SynapseBacklinks>("note_backlinks", { path });
        // Transform Synapse response to BacklinkInfo for VaultPage compatibility
        set({
          backlinks: {
            backlinks: (bl.backlinks ?? []).map((b: string) => ({
              path: b.endsWith(".md") ? b : `${b}.md`,
              title: b.split("/").pop()?.replace(/\.md$/i, "") || b,
            })),
            forward_links: (bl.forward_links ?? []).map((fl) => ({
              path: fl.target,
              title: fl.title,
              exists: fl.exists,
            })),
          },
        });
      } else {
        set({ backlinks: { backlinks: [], forward_links: [] } });
      }
    } catch (err) {
      console.error("Failed to load backlinks:", err);
      set({ backlinks: { backlinks: [], forward_links: [] } });
    }
  },

  checkSynapseStatus: async () => {
    try {
      const status = await VaultApi.synapseStatus();
      set({ synapseRunning: status.running });
      if (status.running) {
        // Fetch note count from vault_info
        try {
          const info = await synapseCall<SynapseVaultInfo>("vault_info", {});
          // vault_info returns { vaults: [{ name, path, note_count }] }
          if (info.vaults && info.vaults.length > 0) {
            set({ noteCount: info.vaults[0].note_count });
          }
        } catch {
          // Fallback to local count
        }
      }
    } catch {
      set({ synapseRunning: false });
    }
  },

  runHealthCheck: async () => {
    try {
      if (get().synapseRunning) {
        const health = await synapseCall<SynapseHealth>("health_check", {});
        set({ synapseHealth: health });
      } else {
        set({ synapseHealth: null });
      }
    } catch {
      set({ synapseHealth: null });
    }
  },

  navigateToNote: (path: string) => {
    set({ pendingSelectPath: path });
  },
}));
