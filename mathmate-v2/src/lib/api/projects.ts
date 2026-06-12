/**
 * Typed Tauri API wrapper for Project commands.
 *
 * @module lib/api/projects
 */

import { invoke } from "@tauri-apps/api/core";
import type { MathProject } from "../types";

export interface SynapseStatus {
  running: boolean;
  vault_path: string | null;
  tool_count: number;
}

export const Projects = {
  /** @command: list_projects */
  list: () => invoke<MathProject[]>("list_projects"),

  /** @command: list_archived_projects */
  listArchived: () => invoke<MathProject[]>("list_archived_projects"),

  /** @command: create_project */
  create: (params: {
    name: string;
    vaultPath?: string;
    textbookPath?: string;
    defaultModel?: string;
    tutorStyle?: string;
  }) => invoke<MathProject>("create_project", params),

  /** @command: update_project */
  update: (project: MathProject) =>
    invoke<void>("update_project", { project }),

  /** @command: delete_project */
  delete: (projectId: string) =>
    invoke<void>("delete_project", { projectId }),

  /** @command: delete_project_cascade */
  deleteCascade: (projectId: string) =>
    invoke<void>("delete_project_cascade", { projectId }),

  /** @command: archive_project */
  archive: (projectId: string) =>
    invoke<void>("archive_project", { projectId }),

  /** @command: unarchive_project */
  unarchive: (projectId: string) =>
    invoke<void>("unarchive_project", { projectId }),

  // ─── Synapse MCP (vault orchestration) ───────

  /** @command: start_synapse_mcp */
  startSynapse: (vaultPath: string) =>
    invoke<void>("start_synapse_mcp", { vaultPath }),

  /** @command: stop_synapse_mcp */
  stopSynapse: () => invoke<void>("stop_synapse_mcp"),

  /** @command: synapse_mcp_status */
  synapseStatus: () => invoke<SynapseStatus>("synapse_mcp_status"),
} as const;
