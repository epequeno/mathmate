/**
 * Typed Tauri API wrapper for Session commands.
 *
 * @module lib/api/sessions
 *
 * Every method corresponds 1:1 with a Tauri command registered
 * in lib.rs. Argument names use camelCase (the TS convention);
 * Tauri auto-coerces to snake_case on the Rust side.
 */

import { invoke } from "@tauri-apps/api/core";
import type { Message, Session, SessionHeader } from "../types";

export const Sessions = {
  /** @command: load_session */
  load: (sessionId: string) =>
    invoke<Session>("load_session", { sessionId }),

  /** @command: list_sessions */
  list: (projectId: string | null) =>
    invoke<SessionHeader[]>("list_sessions", { projectId }),

  /** @command: create_session */
  create: (header: SessionHeader, initialMessage: Message | null) =>
    invoke<Session>("create_session", { header, initialMessage }),

  /** @command: append_message */
  append: (sessionId: string, message: Message) =>
    invoke<Session>("append_message", { sessionId, message }),

  /** @command: rename_session */
  rename: (sessionId: string, title: string) =>
    invoke<Session>("rename_session", { sessionId, title }),

  /** @command: delete_session */
  delete: (sessionId: string) =>
    invoke<void>("delete_session", { sessionId }),

  /** @command: archive_session */
  archive: (sessionId: string) =>
    invoke<void>("archive_session", { sessionId }),

  /** @command: unarchive_session */
  unarchive: (sessionId: string) =>
    invoke<void>("unarchive_session", { sessionId }),

  /** @command: list_archived_sessions */
  listArchived: (projectId: string | null) =>
    invoke<SessionHeader[]>("list_archived_sessions", { projectId }),

  /** @command: purge_session */
  purge: (sessionId: string) =>
    invoke<void>("purge_session", { sessionId }),

  /** @command: save_last_session */
  saveLast: (sessionId: string) =>
    invoke<void>("save_last_session", { sessionId }),

  /** @command: get_last_session */
  getLast: () => invoke<string | null>("get_last_session"),
} as const;
