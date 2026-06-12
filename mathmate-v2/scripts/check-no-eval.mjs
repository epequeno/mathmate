/**
 * check-no-eval.mjs — CI guard against eval / new Function in source
 *
 * Recursively scans src/ for:
 *   - new Function(...)
 *   - eval(...)
 *
 * Exits non-zero with file:line on any match.
 * Prints summary on success.
 */

import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";

const ROOT = new URL("..", import.meta.url).pathname;
const SRC = join(ROOT, "src");

// Patterns to ban
const BANNED = [
  { re: /\bnew\s+Function\s*\(/g, label: "new Function(" },
  { re: /\beval\s*\(/g, label: "eval(" },
];

let totalFiles = 0;
let found = false;

function scanDir(dirPath) {
  for (const entry of readdirSync(dirPath, { withFileTypes: true })) {
    const fullPath = join(dirPath, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "dist") continue;
      scanDir(fullPath);
    } else if (
      entry.isFile() &&
      (entry.name.endsWith(".ts") ||
        entry.name.endsWith(".tsx") ||
        entry.name.endsWith(".js") ||
        entry.name.endsWith(".jsx") ||
        entry.name.endsWith(".mjs"))
    ) {
      totalFiles++;
      const content = readFileSync(fullPath, "utf-8");
      const lines = content.split("\n");
      for (const pattern of BANNED) {
        pattern.re.lastIndex = 0;
        for (let i = 0; i < lines.length; i++) {
          const trimmed = lines[i].trim();
          // Skip JSDoc / single-line comments
          if (trimmed.startsWith("*") || trimmed.startsWith("//")) continue;
          pattern.re.lastIndex = 0;
          if (pattern.re.test(lines[i])) {
            found = true;
            const rel = relative(ROOT, fullPath);
            console.error(
              `${rel}:${i + 1}:${pattern.label} detected`
            );
          }
        }
      }
    }
  }
}

scanDir(SRC);

if (found) {
  process.exit(1);
} else {
  console.log(`OK: 0 banned patterns in ${totalFiles} files`);
}
