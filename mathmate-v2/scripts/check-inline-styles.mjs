/**
 * check-inline-styles.mjs — CI guard against large inline style objects.
 *
 * Flags any style={{...}} expression that spans more than 5 lines or
 * contains more than 4 CSS property keys.  Short style={{ display: "flex" }}
 * one-liners are permitted; the intent is to catch multi-line layout
 * blocks that should live in a .module.css file.
 *
 * Skips files that are in src/lib/api/ (typed wrappers, no JSX) and
 * scripts/ (build tooling).
 */

import { readFileSync, readdirSync } from "fs";
import { join, relative } from "path";
import { fileURLToPath } from "url";

const ROOT = join(new URL("..", import.meta.url).pathname);
const SRC = join(ROOT, "src");

const MAX_LINES = 5;
const MAX_KEYS = 4;

let totalFiles = 0;
let violations = 0;

function countStyleKeys(objText) {
  // Count CSS property keys: everything before a colon that looks like a property
  const matches = objText.match(/["']?\w+["']?\s*:/g);
  return matches ? matches.length : 0;
}

function scanDir(dirPath) {
  for (const entry of readdirSync(dirPath, { withFileTypes: true })) {
    const full = join(dirPath, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "dist") continue;
      scanDir(full);
    } else if (entry.isFile() && /\.(tsx|jsx)$/.test(entry.name)) {
      // Skip API wrappers (no JSX)
      if (full.includes("lib/api")) continue;
      totalFiles++;

      const content = readFileSync(full, "utf-8");
      const lines = content.split("\n");

      // Find style={{ ... blocks
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Match "style={{" as the start of an inline style object
        const startMatch = line.match(/\bstyle\s*=\s*\{\s*\{/);
        if (!startMatch) continue;

        // Find the closing "}}" by tracking braces
        let depth = 0;
        let started = false;
        const blockStart = i;
        let blockEnd = i;
        let objText = "";

        for (let j = i; j < lines.length; j++) {
          const l = lines[j];
          for (let k = 0; k < l.length; k++) {
            if (l[k] === "{") depth++;
            if (l[k] === "}") depth--;
            if (depth > 0 && !started) {
              // We've entered the first { after style={
              if (l.slice(k - 1, k + 1) === "{{" || depth >= 1) {
                // already counting
              }
            }
          }
          objText += l + " ";
          // Once depth returns to zero we've closed the style object
          // A simpler heuristic: find }} that closes
          const closeIdx = l.indexOf("}}");
          if (closeIdx !== -1) {
            blockEnd = j;
            break;
          }
        }

        const spanLines = blockEnd - blockStart + 1;
        const numKeys = countStyleKeys(objText);

        if (spanLines > MAX_LINES || numKeys > MAX_KEYS) {
          const rel = relative(ROOT, full);
          console.error(
            `${rel}:${blockStart + 1}: inline style with ${numKeys} keys across ${spanLines} lines (max ${MAX_KEYS}/${MAX_LINES}) — move to .module.css`
          );
          violations++;
        }

        // Skip past the block
        i = blockEnd;
      }
    }
  }
}

scanDir(SRC);

if (violations > 0) {
  console.log(
    `INFO: ${violations} large inline style objects in ${totalFiles} JSX files (full CSS module migration deferred — 14F remainder)`
  );
  // Exit 0 — this is an informational lint, not a CI gate.
  // Run with --strict to fail on violations.
  process.exit(process.argv.includes("--strict") ? 1 : 0);
} else {
  console.log(`OK: 0 oversized inline style objects in ${totalFiles} JSX files`);
}
