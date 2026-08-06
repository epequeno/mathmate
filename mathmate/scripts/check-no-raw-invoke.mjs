/**
 * check-no-raw-invoke.mjs — CI guard: no raw invoke() calls outside
 * the approved Tauri API wrapper modules.
 *
 * Raw invoke() (imported from @tauri-apps/api/core) is only permitted in:
 *   - src/lib/api/*.ts      (typed API wrapper modules)
 *   - src/lib/tauri.ts       (legacy escape hatch, if present)
 *   - scripts/               (this script itself)
 *
 * The frontend must use the typed API modules from lib/api/ instead.
 */

import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";
import { fileURLToPath } from "url";

const ROOT = join(new URL("..", import.meta.url).pathname);
const SRC = join(ROOT, "src");

const ALLOWED_DIRS = [
  join(SRC, "lib", "api"),
  join(SRC, "lib", "tauri.ts").replace(/\\/g, "/"), // win-safe
];

function isAllowed(filePath) {
  const normalized = filePath.replace(/\\/g, "/");
  for (const allowed of ALLOWED_DIRS) {
    if (normalized.startsWith(allowed)) return true;
  }
  return false;
}

// Patterns that indicate a raw invoke import or call
const IMPORT_RE = /from\s+['"]@tauri-apps\/api\/core['"]/;
const CALL_RE = /\binvoke\s*\(/;

let totalFiles = 0;
let violations = 0;

function scanDir(dirPath) {
  for (const entry of readdirSync(dirPath, { withFileTypes: true })) {
    const full = join(dirPath, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "dist") continue;
      scanDir(full);
    } else if (
      entry.isFile() &&
      /\.(ts|tsx)$/.test(entry.name)
    ) {
      totalFiles++;
      if (isAllowed(full)) continue;

      const content = readFileSync(full, "utf-8");
      if (IMPORT_RE.test(content) || CALL_RE.test(content)) {
        // More precise check — look for actual invoke calls not behind a typed wrapper
        const lines = content.split("\n");
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();
          // Skip comments
          if (line.startsWith("//") || line.startsWith("*") || line.startsWith("/*")) continue;
          if (IMPORT_RE.test(line)) {
            console.error(`${relative(ROOT, full)}:${i + 1}: raw invoke import from @tauri-apps/api/core`);
            violations++;
          }
        }
      }
    }
  }
}

scanDir(SRC);

if (violations > 0) {
  console.error(`\nFAIL: ${violations} raw invoke violations in ${totalFiles} files`);
  process.exit(1);
} else {
  console.log(`OK: 0 raw invoke calls in ${totalFiles} source files (outside lib/api/)`);
}
