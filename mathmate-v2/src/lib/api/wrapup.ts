/**
 * Typed Tauri API wrapper for Wrap-up commands.
 *
 * @module lib/api/wrapup
 */

import { invoke } from "@tauri-apps/api/core";
import type { WrapUpResult } from "../types";

export const WrapUp = {
  /** @command: generate_wrap_up */
  generate: (sessionId: string) =>
    invoke<WrapUpResult>("generate_wrap_up", { sessionId }),

  /** @command: save_wrap_up */
  save: (
    projectName: string,
    vaultPath: string,
    content: string,
    sessionId: string
  ) => invoke<string>("save_wrap_up", { projectName, vaultPath, content, sessionId }),
} as const;
