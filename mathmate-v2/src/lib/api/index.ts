/**
 * Typed Tauri API client — the single entry point for all backend calls.
 *
 * Every method corresponds 1:1 with a Tauri command registered in lib.rs.
 * Argument names use camelCase (TS convention); Tauri auto-coerces to
 * snake_case on the Rust side.
 *
 * @module lib/api
 */

export { Sessions } from "./sessions";
export { Projects } from "./projects";
export type { SynapseStatus as ProjectSynapseStatus } from "./projects";
export { Config } from "./config";
export { Memory } from "./memory";
export { Tools } from "./tools";
export type { ToolResult } from "./tools";
export { Vault } from "./vault";
export type { SynapseStatus as VaultSynapseStatus } from "./vault";
export { Files } from "./files";
export type { RecentImageEntry } from "./files";
export { Textbook } from "./textbook";
export type { TocEntry, ImportResult, PageContent, TextbookIndexMeta } from "./textbook";
export { WrapUp } from "./wrapup";

import { Sessions } from "./sessions";
import { Projects } from "./projects";
import { Config } from "./config";
import { Memory } from "./memory";
import { Tools } from "./tools";
import { Vault } from "./vault";
import { Files } from "./files";
import { Textbook } from "./textbook";
import { WrapUp } from "./wrapup";

/** Convenience aggregate: `api.Sessions.load(...)` etc. */
export const api = {
  Sessions,
  Projects,
  Config,
  Memory,
  Tools,
  Vault,
  Files,
  Textbook,
  WrapUp,
} as const;
