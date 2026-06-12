// ─── Vault Store ──────────────────────────────────────────────────────
// Thin Zustand shell that delegates to a VaultBackend strategy.
// No branching on synapseRunning — the backend owns all transport logic.
//
// See: Implementation_Phase14D_VaultBackend.md §D.4

import { create } from "zustand";
import { toAppError } from "../lib/error";
import type {
  VaultBackend,
  VaultEntry,
  VaultSearchResult,
  BacklinkInfo,
  VaultHealth,
} from "../lib/vault/types";

// ─── Store Shapes ─────────────────────────────────────────────────────

export interface NoteEntry {
  path: string;
  title: string;
}

export interface NoteDetail {
  path: string;
  title: string;
  body: string;
}

interface VaultState {
  /** Active vault backend (null when no project / no vault). */
  backend: VaultBackend | null;

  notes: NoteEntry[];
  loading: boolean;
  error: string | null;
  searchResults: VaultSearchResult[] | null;
  searchQuery: string;
  selectedNote: NoteDetail | null;
  backlinks: BacklinkInfo | null;
  noteCount: number;
  pendingSelectPath: string | null;
  synapseHealth: VaultHealth | null;
  /** Mirror of Synapse running state for compatibility (ContextPanel, VaultPage). */
  synapseRunning: boolean;

  // ── Backend lifecycle ────────────────────────────────────────────
  setBackend: (backend: VaultBackend | null) => void;
  /** Called by projectStore when Synapse starts/stops. */
  notifySynapseRunning: (running: boolean) => void;
  /** Passthrough to projectStore for existing callers. */
  checkSynapseStatus: () => Promise<void>;

  // ── Actions ──────────────────────────────────────────────────────
  loadNotes: () => Promise<void>;
  searchNotes: (q: string) => Promise<void>;
  clearSearch: () => void;
  readNote: (path: string) => Promise<void>;
  saveNote: (path: string, content: string, title?: string) => Promise<void>;
  createNote: (title: string, content: string) => Promise<{ path: string } | null>;
  deleteNote: (path: string) => Promise<void>;
  loadBacklinks: (path: string) => Promise<void>;
  runHealthCheck: () => Promise<void>;
  navigateToNote: (path: string) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────

function toNoteEntry(e: VaultEntry): NoteEntry {
  return { path: e.path, title: e.title };
}

// ─── Store ────────────────────────────────────────────────────────────

export const useVaultStore = create<VaultState>((set, get) => ({
  backend: null,

  notes: [],
  loading: false,
  error: null,
  searchResults: null,
  searchQuery: "",
  selectedNote: null,
  backlinks: null,
  noteCount: 0,
  pendingSelectPath: null,
  synapseHealth: null,
  synapseRunning: false,

  // ── Backend lifecycle ──────────────────────────────────────────────

  setBackend: (backend: VaultBackend | null) => {
    set({
      backend,
      // Reset state when backend changes.
      notes: [],
      searchResults: null,
      searchQuery: "",
      selectedNote: null,
      backlinks: null,
      noteCount: 0,
      pendingSelectPath: null,
      synapseHealth: null,
      synapseRunning: backend?.running ?? false,
      error: null,
      loading: false,
    });
  },

  notifySynapseRunning: (running: boolean) => {
    const b = get().backend;
    if (b && "setRunning" in b) {
      (b as any).setRunning(running);
    }
    set({ synapseRunning: running });
  },

  checkSynapseStatus: async () => {
    // Passthrough to projectStore for existing callers (VaultPage).
    const { useProjectStore } = await import("./projectStore");
    await useProjectStore.getState().checkSynapseStatus();
  },

  // ── Actions ────────────────────────────────────────────────────────

  loadNotes: async () => {
    const b = get().backend;
    if (!b) return;

    set({ loading: true, error: null });
    try {
      // Legacy search: filename-only match on the client side
      const notes = await b.list();
      const entries = notes.map(toNoteEntry);
      set({ notes: entries, loading: false, noteCount: entries.length });
    } catch (err) {
      set({ error: toAppError(err).message, loading: false });
    }
  },

  searchNotes: async (q: string) => {
    set({ searchQuery: q });
    if (!q.trim()) {
      set({ searchResults: null });
      return;
    }

    const b = get().backend;
    if (!b) return;

    try {
      if (b.capabilities.search) {
        const results = await b.search(q);
        set({ searchResults: results });
      } else {
        // Legacy: filename fallback
        const notes = get().notes;
        const lower = q.toLowerCase();
        const results: VaultSearchResult[] = notes
          .filter(
            (n) =>
              n.title.toLowerCase().includes(lower) ||
              n.path.toLowerCase().includes(lower),
          )
          .map((n) => ({ path: n.path, title: n.title, snippet: "" }));
        set({ searchResults: results });
      }
    } catch (err) {
      console.error("Search failed:", err);
      set({ searchResults: [] });
    }
  },

  clearSearch: () => {
    set({ searchQuery: "", searchResults: null });
  },

  readNote: async (path: string) => {
    const b = get().backend;
    if (!b) return;

    try {
      const note = await b.read(path);
      set({
        selectedNote: {
          path: note.path,
          title: note.title,
          body: note.body,
        },
      });
    } catch (err) {
      console.error("Failed to read note:", err);
      set({ error: toAppError(err).message });
    }
  },

  saveNote: async (path: string, content: string, title?: string) => {
    const b = get().backend;
    if (!b) throw new Error("No vault backend");
    await b.write(path, content, title);
  },

  createNote: async (title: string, content: string) => {
    const b = get().backend;
    if (!b) return null;

    try {
      const result = await b.create(title, content);
      // Reload notes to show the new one
      get().loadNotes();
      return result;
    } catch (err) {
      console.error("Failed to create note:", err);
      set({ error: toAppError(err).message });
      return null;
    }
  },

  deleteNote: async (path: string) => {
    const b = get().backend;
    if (!b) throw new Error("No vault backend");

    try {
      await b.delete(path);
      // Deselect if we just deleted the selected note
      const selected = get().selectedNote;
      if (selected?.path === path) {
        set({ selectedNote: null, backlinks: null });
      }
      // Reload list
      await get().loadNotes();
    } catch (err) {
      console.error("Failed to delete note:", err);
      set({ error: toAppError(err).message });
      throw err;
    }
  },

  loadBacklinks: async (path: string) => {
    const b = get().backend;
    if (!b) return;

    try {
      const bl = await b.backlinks(path);
      set({ backlinks: bl });
    } catch (err) {
      console.error("Failed to load backlinks:", err);
      set({ backlinks: { backlinks: [], forward_links: [] } });
    }
  },

  runHealthCheck: async () => {
    const b = get().backend;
    if (!b) {
      set({ synapseHealth: null });
      return;
    }

    try {
      const health = await b.healthCheck();
      set({ synapseHealth: health });
    } catch {
      set({ synapseHealth: null });
    }
  },

  navigateToNote: (path: string) => {
    set({ pendingSelectPath: path });
  },
}));
