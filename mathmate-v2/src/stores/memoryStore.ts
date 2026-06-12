import { create } from "zustand";
import type { MemoryItem } from "../lib/types";
import { invoke } from "../lib/tauri";
import { scanMemoryContent } from "../lib/memorySafety";
import type { SafetyMode } from "../lib/memorySafety";

interface MemoryState {
  memories: MemoryItem[];
  loading: boolean;
  /** Last write scan result (for UI feedback) */
  lastScanResult: { kind: string; reason?: string } | null;
  queryMemories: (query: string, limit?: number) => Promise<void>;
  storeMemory: (memory: MemoryItem, safetyMode?: SafetyMode) => Promise<void>;
  forgetMemory: (id: string) => Promise<void>;
  clearScanResult: () => void;
}

export const useMemoryStore = create<MemoryState>((set) => ({
  memories: [],
  loading: false,
  lastScanResult: null,

  queryMemories: async (query: string, limit = 20) => {
    set({ loading: true });
    try {
      const memories = await invoke<MemoryItem[]>("query_memories", { query, limit });
      set({ memories, loading: false });
    } catch (err) {
      console.error("Failed to query memories:", err);
      set({ loading: false });
    }
  },

  storeMemory: async (memory: MemoryItem, safetyMode: SafetyMode = "balanced") => {
    // Local pre-check for immediate UX feedback
    const preview = scanMemoryContent(memory.content, safetyMode);
    if (preview.kind === "rejected") {
      set({ lastScanResult: { kind: "rejected", reason: preview.reason } });
      return; // Don't send to Rust — will be rejected there too
    }

    try {
      const result = await invoke<{ kind: string; reason?: string }>("store_memory_with_safety", {
        memory,
        mode: safetyMode,
      });
      set({ lastScanResult: { kind: result.kind, reason: result.reason } });
    } catch (err) {
      console.error("Failed to store memory:", err);
    }
  },

  forgetMemory: async (id: string) => {
    try {
      await invoke("forget_memory", { memoryId: id });
      set((s) => ({ memories: s.memories.filter((m) => m.id !== id) }));
    } catch (err) {
      console.error("Failed to forget memory:", err);
    }
  },

  clearScanResult: () => set({ lastScanResult: null }),
}));