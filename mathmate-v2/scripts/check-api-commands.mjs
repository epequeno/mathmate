/**
 * check-api-commands.mjs — CI guard: every Tauri command must have a
 * corresponding `@command:` JSDoc annotation in src/lib/api/*.ts,
 * and every annotation must have a matching Tauri command.
 *
 * Scans:
 *   - src-tauri/src/lib.rs for #[tauri::command] fn registrations
 *   - src/lib/api/*.ts for @command: JSDoc tags
 *
 * Exits non-zero on any mismatch; prints a diff on success.
 */

import { readFileSync, readdirSync } from "fs";
import { join, relative, dirname } from "path";
import { fileURLToPath } from "url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LIB_RS = join(ROOT, "src-tauri", "src", "lib.rs");
const API_DIR = join(ROOT, "src", "lib", "api");

// ── Extract Tauri commands from lib.rs ──────────────────────────────────
// Commands are registered via `invoke_handler!` macro or `#[tauri::command]`
// on fn declarations.  We look for both patterns.

const libRsContent = readFileSync(LIB_RS, "utf-8");

// Pattern 1: direct registration via invoke_handler! macro
// Example: .invoke_handler(tauri::generate_handler![list_projects, create_project, ...])
const invokeHandlerMatch = libRsContent.match(
  /tauri::generate_handler!\[([^\]]+)\]/
);
const rustCommands = new Set();
if (invokeHandlerMatch) {
  // Split on commas, trim, filter out comments and empty entries
  const raw = invokeHandlerMatch[1];
  const args = raw
    .split(/\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("//"))
    .join(",")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const arg of args) {
    if (arg) rustCommands.add(arg);
  }
}

// Pattern 2: standalone #[tauri::command] exported functions not in handler
// (belt-and-suspenders — the handler macro is the canonical list)
const cmdRegex = /#\[tauri::command(?:\s*\([^)]*\))?\]\s*(?:pub\s+)?(?:async\s+)?fn\s+(\w+)/g;
let m;
while ((m = cmdRegex.exec(libRsContent)) !== null) {
  rustCommands.add(m[1]);
}

if (rustCommands.size === 0) {
  console.error("ERROR: No Tauri commands found in lib.rs");
  process.exit(1);
}

// ── Extract @command: annotations from API modules ──────────────────────

const tsCommands = new Map(); // commandName → file:line
const apiFiles = readdirSync(API_DIR, { withFileTypes: true })
  .filter((e) => e.isFile() && e.name.endsWith(".ts") && e.name !== "index.ts")
  .map((e) => join(API_DIR, e.name));

const annotationRegex = /@command:\s*(\w+)/g;

for (const file of apiFiles) {
  const content = readFileSync(file, "utf-8");
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    annotationRegex.lastIndex = 0;
    let am;
    while ((am = annotationRegex.exec(lines[i])) !== null) {
      tsCommands.set(am[1], `${relative(ROOT, file)}:${i + 1}`);
    }
  }
}

// ── Diff ────────────────────────────────────────────────────────────────

let hasError = false;

// Commands in Rust but not in TS
for (const cmd of [...rustCommands].sort()) {
  if (!tsCommands.has(cmd)) {
    console.error(`MISSING: Tauri command "${cmd}" has no @command: annotation in src/lib/api/`);
    hasError = true;
  }
}

// Annotations in TS but not in Rust
for (const [cmd, loc] of [...tsCommands].sort()) {
  if (!rustCommands.has(cmd)) {
    console.error(`STALE: @command: "${cmd}" at ${loc} has no matching Tauri command`);
    hasError = true;
  }
}

if (hasError) {
  console.error(
    `\nFAIL: ${rustCommands.size} Rust commands, ${tsCommands.size} TS annotations — mismatches found.`
  );
  process.exit(1);
} else {
  console.log(
    `OK: ${rustCommands.size} Rust commands == ${tsCommands.size} TS @command: annotations`
  );
}
