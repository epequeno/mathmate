/**
 * Typed Tauri API wrapper for Tool commands.
 *
 * @module lib/api/tools
 */

import { invoke } from "@tauri-apps/api/core";

export interface ToolResult {
  call_id: string;
  result: unknown;
  is_error: boolean;
}

export const Tools = {
  /** @command: get_tool_definitions */
  getDefinitions: () => invoke<unknown[]>("get_tool_definitions"),

  /** @command: execute_tool */
  execute: (callId: string, toolName: string, arguments_: unknown, projectId?: string) =>
    invoke<ToolResult>("execute_tool", {
      callId,
      toolName,
      arguments: arguments_,
      projectId,
    }),
} as const;
