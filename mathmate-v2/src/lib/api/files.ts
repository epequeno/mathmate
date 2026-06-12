/**
 * Typed Tauri API wrapper for File utility commands.
 *
 * @module lib/api/files
 */

import { invoke } from "@tauri-apps/api/core";

export interface RecentImageEntry {
  path: string;
  filename: string;
  modified_at: number;
  size_bytes: number;
}

export const Files = {
  /** @command: read_user_selected_file */
  readBase64: (path: string) =>
    invoke<string>("read_user_selected_file", { path }),

  /** @command: list_recent_images */
  listRecentImages: (limit?: number) =>
    invoke<RecentImageEntry[]>("list_recent_images", { limit }),

  /**
   * Open a file or folder in the OS default handler.
   *
   * @command: open_path
   *
   * The two-step confirmation flow:
   * 1. Call with `confirmed: false` — the frontend shows a
   *    confirmation dialog. The Rust side sends a Tauri event
   *    `open_path.confirmed` after validation.
   * 2. User confirms → call with `confirmed: true` to actually open.
   */
  openPath: (
    path: string,
    projectId: string | undefined,
    confirmed: boolean
  ) => invoke<void>("open_path", { path, projectId, confirmed }),
} as const;
