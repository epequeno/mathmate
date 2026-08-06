#!/usr/bin/env node
/**
 * Phase 15F — Auto-generate typed TS API wrappers from Rust Tauri commands
 *
 * Parses `src-tauri/src/lib.rs` for `#[tauri::command]` attrs, extracts
 * function signatures, and generates `src/lib/api/*.ts` wrapper modules.
 *
 * Usage: node scripts/gen-api-wrappers.mjs [--check]
 *
 * Without --check: writes the generated files.
 * With --check: exits non-zero if any generated file differs from disk
 *               (for CI / prebuild verification).
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const libRsPath = path.join(projectRoot, "src-tauri", "src", "lib.rs");
const apiDir = path.join(projectRoot, "src", "lib", "api");

const CHECK_MODE = process.argv.includes("--check");

// ─── Domain mapping ────────────────────────────────────────────────────

/** Which API module each command belongs to. */
const DOMAIN_MAP = {
  // Sessions
  load_session: "sessions",
  list_sessions: "sessions",
  create_session: "sessions",
  append_message: "sessions",
  rename_session: "sessions",
  update_session_hint_outcome: "sessions",
  delete_session: "sessions",
  archive_session: "sessions",
  unarchive_session: "sessions",
  list_archived_sessions: "sessions",
  purge_session: "sessions",
  save_last_session: "sessions",
  get_last_session: "sessions",

  // Projects
  create_project: "projects",
  update_project: "projects",
  delete_project: "projects",
  delete_project_cascade: "projects",
  archive_project: "projects",
  unarchive_project: "projects",
  list_archived_projects: "projects",
  list_projects: "projects",

  // Vault
  scan_vault: "vault",
  read_note: "vault",
  init_vault: "vault",
  set_active_vault: "projects",
  add_vault: "projects",
  remove_vault: "projects",
  rename_vault: "projects",
  update_project_vaults: "projects",

  // Config
  get_models_config: "config",
  get_app_config: "config",
  save_app_config: "config",
  set_provider_api_key: "config",
  get_config_path: "config",
  get_env_var: "config",

  // Memory
  store_memory: "memory",
  store_memory_with_safety: "memory",
  query_memories: "memory",
  forget_memory: "memory",
  get_profile: "memory",
  set_profile: "memory",

  // Tools
  execute_tool: "tools",
  get_tool_definitions: "tools",

  // Files / utilities
  read_file_as_base64: "files",
  read_user_selected_file: "files",
  list_recent_images: "files",
  open_path: "files",
  save_image: "files",
  load_image: "files",
  evict_session_images: "files",

  // Textbook / PDF
  read_textbook_metadata: "textbook",
  extract_pdf_toc: "textbook",
  import_pdf_toc: "textbook",
  read_project_textbook: "textbook",
  list_textbook_catalog: "textbook",
  get_textbook_license_info: "textbook",
  download_free_textbook: "textbook",
  index_textbook_pages: "textbook",
  get_textbook_index_status: "textbook",
  derive_textbook_id: "textbook",

  // Wrap-up
  generate_wrap_up: "wrapup",
  save_wrap_up: "wrapup",

  // Model catalog
  get_model_catalog: "models",
  get_provider_model_ids: "models",

  // Synapse
  start_synapse_mcp: "projects",
  stop_synapse_mcp: "projects",
  synapse_mcp_status: "projects",
  synapse_call: "tools",
  check_synapse_available: "tools",

  // Model catalog (AppServices-level)
  fetch_models: "models",
  get_cached_models: "models",

  // Problem bank (Phase 16B)
  list_problems: "problemBank",
  get_problem: "problemBank",
  random_problem: "problemBank",
  save_problem_attempt: "problemBank",
  list_problem_attempts: "problemBank",
  get_attempt_stats: "problemBank",
};

// ─── Type mapping ──────────────────────────────────────────────────────

/**
 * Map Rust types seen in command signatures to TS types.
 * This is a heuristic mapping — full type resolution is a ts-rs concern (Phase 14H).
 */
function rustTypeToTs(rustType) {
  // Normalise whitespace
  const t = rustType.replace(/\s+/g, " ").trim();

  if (t === "String") return "string";
  if (t === "bool" || t === "bool") return "boolean";
  if (t.startsWith("Option<") || t.startsWith("Option <")) {
    const inner = t.slice(7, -1).trim();
    return rustTypeToTs(inner) + " | null";
  }
  if (t.startsWith("Vec<") || t.startsWith("Vec <")) {
    const inner = t.slice(4, -1).trim();
    return rustTypeToTs(inner) + "[]";
  }
  if (t.startsWith("State<") || t.startsWith("State <")) return undefined; // injected

  // Known crate types
  if (t.includes("MathProject")) return "MathProject";
  if (t.includes("VaultRef")) return "VaultRef";
  if (t.includes("SessionHeader")) return "SessionHeader";
  if (t.includes("Message")) return "Message";
  if (t.includes("AppError")) return undefined; // return type is handled by Tauri

  // Fallback for unknown types — use `any` with a comment
  return "any /* TODO: type for " + t + " */";
}

// ─── Parser ────────────────────────────────────────────────────────────

/**
 * Extract command function signatures from lib.rs.
 * Returns an array of { name, args: [{ name, type, camelName }], returnType }.
 */
function parseLibRs(content) {
  const commands = [];

  // Find all #[tauri::command] blocks followed by function signatures
  const regex = /#\[tauri::command\]\s*\n\s*(?:pub\s+)?(?:async\s+)?fn\s+(\w+)\s*\(([^)]*)\)\s*(?:->\s*([^{]+?))?\s*\{/g;

  let match;
  while ((match = regex.exec(content)) !== null) {
    const name = match[1];
    const argsStr = match[2];
    const returnType = match[3]?.trim();

    const args = [];
    if (argsStr.trim()) {
      // Split by comma, respecting angle brackets
      const argParts = splitArgs(argsStr);
      for (const arg of argParts) {
        const trimmed = arg.trim();
        // Skip self, mut self, &self
        if (trimmed === "self" || trimmed === "&self" || trimmed === "&mut self" || trimmed === "mut self") continue;

        const colonIdx = trimmed.indexOf(":");
        if (colonIdx === -1) continue;

        const argName = trimmed.slice(0, colonIdx).trim();
        const argType = trimmed.slice(colonIdx + 1).trim();

        args.push({
          name: argName,
          type: argType,
          camelName: toCamelCase(argName),
        });
      }
    }

    commands.push({ name, args, returnType: returnType || "Result<_, _>" });
  }

  return commands;
}

/** Split parameter list respecting nested angle brackets. */
function splitArgs(str) {
  const parts = [];
  let depth = 0;
  let current = "";

  for (const ch of str) {
    if (ch === "<") depth++;
    else if (ch === ">") depth--;

    if (ch === "," && depth === 0) {
      parts.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) parts.push(current);

  return parts;
}

/** Convert snake_case to camelCase. */
function toCamelCase(str) {
  return str.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

// ─── Codegen ────────────────────────────────────────────────────────────

/** Generate a single API module file. */
function generateModule(moduleName, commands) {
  const lines = [];
  lines.push(`/**`);
  lines.push(` * Typed Tauri API wrapper for ${moduleName} commands.`);
  lines.push(` *`);
  lines.push(` * Auto-generated by scripts/gen-api-wrappers.mjs — do not edit manually.`);
  lines.push(` * Phase 15F.`);
  lines.push(` */`);
  lines.push("");
  lines.push(`import { invoke } from "@tauri-apps/api/core";`);
  lines.push("");

  // Collect needed type imports
  const neededTypes = new Set();
  for (const cmd of commands) {
    for (const arg of cmd.args) {
      const tsType = rustTypeToTs(arg.type);
      if (tsType && tsType !== "string" && tsType !== "boolean" && !tsType.startsWith("any ") && tsType !== "string | null" && tsType !== "boolean | null") {
        // Extract base type name (strip [] and | null)
        const base = tsType.replace("[]", "").replace(" | null", "").trim();
        neededTypes.add(base);
      }
    }
  }

  if (neededTypes.size > 0) {
    const typesStr = [...neededTypes].sort().join(", ");
    lines.push(`import type { ${typesStr} } from "../types";`);
    lines.push("");
  }

  const objName = moduleName.charAt(0).toUpperCase() + moduleName.slice(1);
  lines.push(`export const ${objName} = {`);

  for (const cmd of commands) {
    const argEntries = [];
    for (const arg of cmd.args) {
      const tsType = rustTypeToTs(arg.type);
      if (tsType === undefined) continue; // skip State<> injected args
      argEntries.push(`${arg.camelName}: ${tsType}`);
    }

    // Determine return type
    let returnType = "void";
    if (cmd.returnType) {
      const tsRet = rustTypeToTs(cmd.returnType);
      if (tsRet && tsRet !== "undefined" && tsRet !== "void") {
        returnType = tsRet;
      }
    }

    // Build invoke call
    const argObj = cmd.args.length > 0
      ? cmd.args.map(a => {
          const tsType = rustTypeToTs(a.type);
          return tsType !== undefined ? `\n        ${a.camelName},` : "";
        }).join("")
      : "";
    const invokeCall = cmd.args.length > 0
      ? `invoke<${returnType}>("${cmd.name}", {${argObj}\n      })`
      : `invoke<${returnType}>("${cmd.name}")`;

    lines.push(`  /** @command: ${cmd.name} */`);
    lines.push(`  ${toCamelCase(cmd.name)}: (${argEntries.join(", ")}) =>`);
    lines.push(`    ${invokeCall},`);
    lines.push("");
  }

  lines.push("} as const;");
  lines.push("");

  return lines.join("\n");
}

/** Generate the index.ts barrel file. */
function generateIndex(modules) {
  const lines = [];
  lines.push(`/**`);
  lines.push(` * Typed Tauri API facade.`);
  lines.push(` *`);
  lines.push(` * Auto-generated by scripts/gen-api-wrappers.mjs — do not edit manually.`);
  lines.push(` * Phase 15F.`);
  lines.push(` */`);
  lines.push("");

  const moduleNames = [...new Set(modules)].sort();

  for (const mod of moduleNames) {
    const name = mod.charAt(0).toUpperCase() + mod.slice(1);
    lines.push(`export { ${name} } from "./${mod}";`);
  }

  lines.push("");

  // Aggregate import for the convenience `api` object
  for (const mod of moduleNames) {
    const name = mod.charAt(0).toUpperCase() + mod.slice(1);
    lines.push(`import { ${name} } from "./${mod}";`);
  }
  lines.push("");
  lines.push("export const api = {");
  for (const mod of moduleNames) {
    const name = mod.charAt(0).toUpperCase() + mod.slice(1);
    lines.push(`  ${name},`);
  }
  lines.push("} as const;");
  lines.push("");

  return lines.join("\n");
}

// ─── Main ──────────────────────────────────────────────────────────────

function main() {
  const rustSource = fs.readFileSync(libRsPath, "utf-8");
  const commands = parseLibRs(rustSource);

  console.log(`Found ${commands.length} Tauri commands in lib.rs`);

  // Group by domain
  const byModule = new Map();
  for (const cmd of commands) {
    const mod = DOMAIN_MAP[cmd.name] || "unknown";
    if (!byModule.has(mod)) byModule.set(mod, []);
    byModule.get(mod).push(cmd);
  }

  // Ensure the output directory exists
  fs.mkdirSync(apiDir, { recursive: true });

  // Generate each module
  let allOk = true;
  for (const [mod, cmds] of byModule) {
    const generated = generateModule(mod, cmds);
    const filePath = path.join(apiDir, `${mod}.ts`);

    if (CHECK_MODE) {
      if (fs.existsSync(filePath)) {
        const existing = fs.readFileSync(filePath, "utf-8");
        if (existing !== generated) {
          console.error(`MISMATCH: ${mod}.ts differs from generated code. Run gen-api-wrappers.mjs to regenerate.`);
          allOk = false;
        }
      } else {
        console.error(`MISSING: ${mod}.ts not found. Run gen-api-wrappers.mjs to generate.`);
        allOk = false;
      }
    } else {
      fs.writeFileSync(filePath, generated, "utf-8");
      console.log(`Generated ${mod}.ts (${cmds.length} commands)`);
    }
  }

  // Generate index.ts
  const indexContent = generateIndex([...byModule.keys()]);
  const indexPath = path.join(apiDir, "index.ts");

  if (CHECK_MODE) {
    if (fs.existsSync(indexPath)) {
      const existing = fs.readFileSync(indexPath, "utf-8");
      if (existing !== indexContent) {
        console.error("MISMATCH: index.ts differs from generated code.");
        allOk = false;
      }
    } else {
      console.error("MISSING: index.ts not found.");
      allOk = false;
    }
  } else {
    fs.writeFileSync(indexPath, indexContent, "utf-8");
    console.log("Generated index.ts");
  }

  if (CHECK_MODE && !allOk) {
    process.exit(1);
  } else if (CHECK_MODE) {
    console.log("All API wrappers up-to-date.");
  }

  // Also generate an inventory
  const inventory = commands.map(c => {
    const mod = DOMAIN_MAP[c.name] || "unknown";
    const args = c.args.map(a => `${a.name}: ${a.type}`).join(", ");
    return `${c.name} → ${mod}.ts  (${args})`;
  }).join("\n");

  const invPath = path.join(projectRoot, "src", "lib", "api", "inventory.txt");
  fs.writeFileSync(invPath, inventory, "utf-8");

  console.log(`\nDone. Generated ${byModule.size} modules + index.ts + inventory.txt`);
}

main();
