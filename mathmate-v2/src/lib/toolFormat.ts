/**
 * toolFormat.ts
 *
 * Deterministic utilities for presenting tool calls in the chat Process Block.
 * All functions are pure — no React, no store access, no side effects.
 *
 * Four exports:
 *   formatToolCall   — humanized action label for collapsed tool row
 *   formatToolResult — short result summary for collapsed tool row
 *   formatToolInput  — function-call style string for expanded INPUT section
 *   renderToolOutput — structured output data for expanded OUTPUT section
 *
 * Known tools (7 built-in):
 *   calculate, get_current_date, graph,
 *   vault_list, vault_read, vault_search, vault_write
 *
 * Unknown tools fall back gracefully in all functions.
 */

// ─── Internal helpers ────────────────────────────────────────────────────────

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function num(v: unknown): number {
  return typeof v === "number" ? v : 0;
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + "…" : s;
}

/** Safely cast result to a plain object; returns null on failure. */
function asObject(result: unknown): Record<string, unknown> | null {
  if (result !== null && typeof result === "object" && !Array.isArray(result)) {
    return result as Record<string, unknown>;
  }
  return null;
}

// ─── formatToolCall ──────────────────────────────────────────────────────────

/**
 * Returns a short human-readable present-tense label describing the tool call.
 * Used in the collapsed tool row.
 *
 * Examples:
 *   vault_search({ query: "integration" })  →  'Searched notes for "integration"'
 *   calculate({ expression: "2+2" })        →  "Calculated 2+2"
 *   get_current_date()                      →  "Got current date"
 *   unknown_tool(…)                         →  "unknown_tool"
 */
export function formatToolCall(
  name: string,
  args: Record<string, unknown>
): string {
  switch (name) {
    case "vault_search": {
      const q = truncate(str(args.query), 60);
      return `Searched notes for "${q}"`;
    }
    case "vault_read": {
      const p = str(args.path);
      return `Read "${p}"`;
    }
    case "vault_write": {
      const p = str(args.path);
      return `Wrote "${p}"`;
    }
    case "vault_list":
      return "Listed vault";
    case "calculate": {
      const expr = truncate(str(args.expression), 60);
      return `Calculated ${expr}`;
    }
    case "graph": {
      const expr = truncate(str(args.expression), 60);
      return `Graphed ${expr}`;
    }
    case "get_current_date":
      return "Got current date";
    default:
      return name;
  }
}

// ─── formatToolResult ────────────────────────────────────────────────────────

/**
 * Returns a short string for the right-aligned result summary in the collapsed
 * tool row. Always returns "" (empty) rather than throwing on bad data.
 *
 * Examples:
 *   vault_search, { results: [{…},{…}] }  →  "2 results"
 *   vault_write,  { updated: true }       →  "updated"
 *   calculate,    { value: 42 }           →  "42"
 *   any tool,     isError: true           →  "error"
 */
export function formatToolResult(
  name: string,
  result: unknown,
  isError: boolean
): string {
  if (isError) return "error";

  try {
    const r = asObject(result);
    if (!r) return "";

    switch (name) {
      case "vault_search": {
        const results = Array.isArray(r.results) ? r.results : [];
        const n = results.length;
        return `${n} result${n !== 1 ? "s" : ""}`;
      }
      case "vault_read": {
        const content = str(r.content);
        return content.length > 0 ? `${content.length} chars` : "";
      }
      case "vault_write":
        return r.updated === true ? "updated" : "created";
      case "vault_list": {
        const files = Array.isArray(r.files) ? r.files : [];
        const n = files.length;
        return `${n} file${n !== 1 ? "s" : ""}`;
      }
      case "calculate": {
        const val = r.value;
        return val !== undefined ? String(val) : "";
      }
      case "graph": {
        const points = Array.isArray(r.points) ? r.points : [];
        return `${points.length} pts`;
      }
      case "get_current_date":
        return str(r.date);
      default:
        return "";
    }
  } catch {
    return "";
  }
}

// ─── formatToolInput ─────────────────────────────────────────────────────────

/**
 * Returns a function-call style string for the INPUT section of an expanded
 * tool row. Always a single line.
 *
 * Examples:
 *   vault_search, { query: "integration" }            →  'vault_search({ query: "integration" })'
 *   vault_write,  { path: "a.md", content: "…long…" } →  'vault_write({ path: "a.md", content: "…" })'
 *   vault_list,   {}                                  →  'vault_list()'
 *   get_current_date, {}                              →  'get_current_date()'
 */
export function formatToolInput(
  name: string,
  args: Record<string, unknown>
): string {
  const keys = Object.keys(args);
  if (keys.length === 0) return `${name}()`;

  const pairs = keys.map((k) => {
    const v = args[k];
    if (typeof v === "string") {
      return `${k}: "${truncate(v, 80)}"`;
    }
    if (typeof v === "number" || typeof v === "boolean") {
      return `${k}: ${v}`;
    }
    // Objects/arrays: compact JSON, truncated
    const serialized = JSON.stringify(v);
    return `${k}: ${truncate(serialized, 80)}`;
  });

  return `${name}({ ${pairs.join(", ")} })`;
}

// ─── renderToolOutput ────────────────────────────────────────────────────────

/**
 * Structured output data for the expanded OUTPUT section of a tool row.
 * Returns a discriminated union that the ToolRow component renders.
 * This keeps rendering logic in the component while keeping data shaping here.
 */

export type ToolOutputData =
  | { kind: "vault_search"; results: VaultSearchResult[]; overflow: number }
  | { kind: "vault_read"; path: string; charCount: number; lineCount: number; preview: string }
  | { kind: "vault_write"; path: string; bytes: number; updated: boolean }
  | { kind: "vault_list"; totalFiles: number; groups: VaultListGroup[]; overflow: number }
  | { kind: "calculate"; value: string }
  | { kind: "graph"; pointCount: number; expression: string; xmin: number; xmax: number }
  | { kind: "get_current_date"; date: string; dayOfWeek: string }
  | { kind: "error"; message: string; raw: string }
  | { kind: "raw_json"; json: string };

export interface VaultSearchResult {
  filename: string;
  path: string;
  snippet: string;
}

export interface VaultListGroup {
  label: string;       // e.g. "Calculus II/" or "PROGRESS.md"
  isDir: boolean;
  count: number;       // file count for dirs; 0 for bare files
}

const MAX_SEARCH_DISPLAY = 5;
const MAX_LIST_DISPLAY = 6;

/**
 * Parses `result` for the given tool and returns typed output data for rendering.
 * Never throws — always returns a valid ToolOutputData.
 */
export function renderToolOutput(
  name: string,
  result: unknown,
  isError: boolean
): ToolOutputData {
  // ── Error state ──────────────────────────────────────────────────
  if (isError) {
    const r = asObject(result);
    const message = r ? str(r.error) : "";
    const raw = safeStringify(result);
    return { kind: "error", message, raw };
  }

  try {
    const r = asObject(result);
    if (!r) {
      return { kind: "raw_json", json: safeStringify(result) };
    }

    switch (name) {
      // ── vault_search ─────────────────────────────────────────────
      case "vault_search": {
        const raw = Array.isArray(r.results) ? r.results : [];
        const results: VaultSearchResult[] = raw.map((item: unknown) => {
          const obj = asObject(item) ?? {};
          const path = str(obj.path ?? obj.file_path ?? "");
          const filename = path.split("/").pop() ?? path;
          const snippet =
            str(obj.snippet ?? obj.excerpt ?? obj.content ?? "").replace(/\s+/g, " ").slice(0, 120);
          return { filename, path, snippet };
        });
        const overflow = Math.max(0, results.length - MAX_SEARCH_DISPLAY);
        return {
          kind: "vault_search",
          results: results.slice(0, MAX_SEARCH_DISPLAY),
          overflow,
        };
      }

      // ── vault_read ───────────────────────────────────────────────
      case "vault_read": {
        const path = str(r.path ?? "");
        const content = str(r.content ?? "");
        const lines = content.split("\n");
        const preview = lines.slice(0, 10).join("\n");
        return {
          kind: "vault_read",
          path,
          charCount: content.length,
          lineCount: lines.length,
          preview,
        };
      }

      // ── vault_write ──────────────────────────────────────────────
      case "vault_write": {
        const path = str(r.path ?? "");
        const bytes = num(r.bytes_written ?? 0);
        const updated = r.updated === true;
        return { kind: "vault_write", path, bytes, updated };
      }

      // ── vault_list ───────────────────────────────────────────────
      case "vault_list": {
        const files = Array.isArray(r.files) ? r.files : [];
        const totalFiles = files.length;

        // Group by top-level directory
        const dirCounts = new Map<string, number>();
        const bareFiles: string[] = [];

        for (const item of files) {
          const obj = asObject(item) ?? {};
          const relPath = str(obj.relative_path ?? obj.path ?? "");
          const slashIdx = relPath.indexOf("/");
          if (slashIdx > 0) {
            const dir = relPath.slice(0, slashIdx + 1); // "Calculus II/"
            dirCounts.set(dir, (dirCounts.get(dir) ?? 0) + 1);
          } else {
            bareFiles.push(relPath);
          }
        }

        const groups: VaultListGroup[] = [];
        for (const [dir, count] of dirCounts.entries()) {
          groups.push({ label: dir, isDir: true, count });
        }
        for (const file of bareFiles) {
          groups.push({ label: file, isDir: false, count: 0 });
        }
        // Sort: dirs first, then files, each alphabetically
        groups.sort((a, b) => {
          if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
          return a.label.localeCompare(b.label);
        });

        const overflow = Math.max(0, groups.length - MAX_LIST_DISPLAY);
        return {
          kind: "vault_list",
          totalFiles,
          groups: groups.slice(0, MAX_LIST_DISPLAY),
          overflow,
        };
      }

      // ── calculate ────────────────────────────────────────────────
      case "calculate": {
        const value = r.value !== undefined ? String(r.value) : "";
        return { kind: "calculate", value };
      }

      // ── graph ─────────────────────────────────────────────────────
      case "graph": {
        const points = Array.isArray(r.points) ? r.points : [];
        const expression = str(r.expression ?? "");
        const meta = asObject(r.meta) ?? {};
        const xmin = num(meta.xmin ?? -10);
        const xmax = num(meta.xmax ?? 10);
        return { kind: "graph", pointCount: points.length, expression, xmin, xmax };
      }

      // ── get_current_date ─────────────────────────────────────────
      case "get_current_date": {
        const date = str(r.date ?? "");
        const dayOfWeek = str(r.day_of_week ?? "");
        return { kind: "get_current_date", date, dayOfWeek };
      }

      // ── fallback ─────────────────────────────────────────────────
      default:
        return { kind: "raw_json", json: safeStringify(result) };
    }
  } catch {
    return { kind: "raw_json", json: safeStringify(result) };
  }
}

// ─── Internal ────────────────────────────────────────────────────────────────

function safeStringify(v: unknown): string {
  try {
    return JSON.stringify(v, null, 2) ?? "";
  } catch {
    return String(v);
  }
}
