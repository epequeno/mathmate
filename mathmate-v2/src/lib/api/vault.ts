/**
 * Typed Tauri API wrapper for Vault commands.
 *
 * @module lib/api/vault
 */

import { invoke } from "@tauri-apps/api/core";
import type { VaultNote } from "../types";

export interface SynapseStatus {
  running: boolean;
  tool_count: number;
}

export const Vault = {
  /** @command: synapse_call */
  synapseCall: <T>(tool: string, args?: unknown) =>
    invoke<T>("synapse_call", { tool, args: args ?? {} }),

  /** @command: scan_vault */
  scan: (path: string, projectId: string) =>
    invoke<VaultNote[]>("scan_vault", { path, projectId }),

  /** @command: read_note */
  readNote: (path: string, projectId?: string) =>
    invoke<string>("read_note", { path, projectId }),

  /** @command: synapse_mcp_status */
  synapseStatus: () =>
    invoke<SynapseStatus>("synapse_mcp_status"),

  /** @command: init_vault */
  init: (vaultPath: string, projectName: string) =>
    invoke<void>("init_vault", { vaultPath, projectName }),

  /** @command: check_synapse_available */
  checkSynapseAvailable: () =>
    invoke<boolean>("check_synapse_available"),
} as const;
