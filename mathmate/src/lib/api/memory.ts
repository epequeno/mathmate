/**
 * Typed Tauri API wrapper for Memory commands.
 *
 * @module lib/api/memory
 */

import { invoke } from "@tauri-apps/api/core";
import type { MemoryItem } from "../types";

export type SafetyMode = "strict" | "balanced" | "off";

export interface ScanResult {
  kind: string;
  reason?: string;
}

export const Memory = {
  /** @command: query_memories */
  query: (query: string, limit?: number) =>
    invoke<MemoryItem[]>("query_memories", { query, limit }),

  /** @command: store_memory */
  store: (memory: MemoryItem) =>
    invoke<void>("store_memory", { memory }),

  /** @command: store_memory_with_safety */
  storeWithSafety: (memory: MemoryItem, mode?: SafetyMode) =>
    invoke<ScanResult>("store_memory_with_safety", { memory, mode }),

  /** @command: forget_memory */
  forget: (memoryId: string) =>
    invoke<void>("forget_memory", { memoryId }),

  /** @command: get_profile */
  getProfile: (key: string) =>
    invoke<string | null>("get_profile", { key }),

  /** @command: set_profile */
  setProfile: (key: string, value: string) =>
    invoke<void>("set_profile", { key, value }),
} as const;
