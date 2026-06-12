#!/usr/bin/env node
/**
 * Copies the pdf.js worker script from node_modules to public/ after install.
 * This ensures the worker is always available in both dev and build modes.
 */
import { copyFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const src = join(root, "node_modules", "pdfjs-dist", "build", "pdf.worker.min.mjs");
const destDir = join(root, "public");
const dest = join(destDir, "pdf.worker.min.mjs");

if (!existsSync(src)) {
  // pdfjs-dist may not be installed yet (e.g., first `npm i`), that's okay
  console.warn("[copy-pdf-worker] pdfjs-dist not found, skipping worker copy");
  process.exit(0);
}

if (!existsSync(destDir)) {
  mkdirSync(destDir, { recursive: true });
}

try {
  copyFileSync(src, dest);
  console.log("[copy-pdf-worker] ✓ pdf.worker.min.mjs copied to public/");
} catch (err) {
  console.error("[copy-pdf-worker] Failed to copy worker:", err);
  process.exit(1);
}