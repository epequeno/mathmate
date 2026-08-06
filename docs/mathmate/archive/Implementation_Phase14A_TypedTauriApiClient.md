# Implementation Plan — Phase 14A: Typed Tauri API Client

## Objective

Replace every hand-written `invoke<T>("command_name", { argKey: value })` call with a typed wrapper module so the frontend ↔ Rust contract is checked at compile time and camelCase / snake_case coercion is centralized.

## Current Pain

The frontend makes **at least 25 `invoke` calls** across `chatStore`, `vaultStore`, `projectStore`, `configStore`, `memoryStore`, and various components (exact count must come from a generated inventory, not a static doc number). Each call:

- Hand-writes argument keys in camelCase, relying on Tauri's auto-coercion to translate to the snake_case names on the Rust side. If the Rust parameter is renamed, the call fails silently at runtime (the parameter becomes `None` or `""`).
- Casts the return type with a generic `<T>`. There is no validation that `T` matches the Rust `Serialize` shape.
- Cannot be cross-referenced with the Rust source — there is no codegen, no schema, and no test that the contract is intact.

Concrete examples already in the codebase:

```ts
// chatStore.ts:557
invoke("execute_tool", { callId, toolName, arguments, projectId })
// Rust expects: call_id, tool_name, arguments, project_id — works by Tauri magic
```

```ts
// projectStore.ts:30
invoke<MathProject[]>("list_projects")
// Correct by coincidence — no args to mistype
```

## Proposed Design

Create `src/lib/api/` with one module per Rust domain, each exporting a typed object:

```
src/lib/api/
  sessions.ts        // SessionService Tauri commands
  projects.ts        // ProjectService Tauri commands
  config.ts          // ConfigService Tauri commands
  memory.ts          // MemoryService Tauri commands
  tools.ts           // ToolService Tauri commands
  vault.ts           // VaultService Tauri commands (Synapse + legacy)
  files.ts           // File utility commands (read_file_as_base64, open_path, etc.)
  textbook.ts        // Textbook/PDF commands
  models.ts          // Model catalog commands
  index.ts           // Re-exports + `api = { sessions, projects, ... }` facade
```

Each module exports a typed object whose methods correspond 1:1 with a Rust service (or, in Phase 14A, the existing Tauri command names). Example:

```ts
// src/lib/api/sessions.ts
import { invoke } from "../tauri";
import type { Message, Session, SessionHeader } from "../types";

export const Sessions = {
  load: (sessionId: string) =>
    invoke<Session>("load_session", { sessionId }),

  list: (projectId: string | null) =>
    invoke<SessionHeader[]>("list_sessions", { projectId }),

  create: (header: SessionHeader, initialMessage: Message | null) =>
    invoke<Session>("create_session", { header, initialMessage }),

  append: (sessionId: string, message: Message) =>
    invoke<Session>("append_message", { sessionId, message }),

  rename: (sessionId: string, title: string) =>
    invoke<Session>("rename_session", { sessionId, title }),

  delete: (sessionId: string) =>
    invoke<void>("delete_session", { sessionId }),

  archive: (sessionId: string) =>
    invoke<void>("archive_session", { sessionId }),

  unarchive: (sessionId: string) =>
    invoke<void>("unarchive_session", { sessionId }),

  listArchived: (projectId: string | null) =>
    invoke<SessionHeader[]>("list_archived_sessions", { projectId }),

  purge: (sessionId: string) =>
    invoke<void>("purge_session", { sessionId }),

  saveLast: (sessionId: string) =>
    invoke<void>("save_last_session", { sessionId }),

  getLast: () => invoke<string | null>("get_last_session"),
} as const;
```

Then `src/lib/api/index.ts`:

```ts
export { Sessions } from "./sessions";
export { Projects } from "./projects";
// ... etc
import { Sessions } from "./sessions";
// ... etc
export const api = { Sessions, Projects /* , ... */ };
```

### Argument name policy

The wrapper enforces the **camelCase TS-side names**. The Tauri command names and their parameter names are documented in a `// @command: load_session` JSDoc comment above each method. A later phase (14H) can introduce codegen that validates these comments against the Rust side.

### Dynamic-import pattern (current)

`chatStore.ts:737` does:

```ts
const { invoke: tauriInvoke } = await import("@tauri-apps/api/core");
const now = new Date().toISOString();
await tauriInvoke("store_memory_with_safety", { ... });
```

This dynamic import is for *no* good reason — the `@tauri-apps/api/core` module is statically importable in both Tauri and `npm run dev` modes. After 14A, this becomes `api.Memory.storeWithSafety(...)` and the import goes away.

## Task Checklist

- [ ] Inventory every `invoke` call site in `src/` via script. Document command name + argument shape + return type and commit the generated inventory artifact.
- [ ] Create `src/lib/api/` with the 9 module files above.
- [ ] Migrate `chatStore.ts` (largest surface).
- [ ] Migrate `vaultStore.ts`.
- [ ] Migrate `projectStore.ts`, `configStore.ts`, `memoryStore.ts`.
- [ ] Migrate components (`PdfViewer.tsx`, `TextbookDetailsPanel.tsx`, `TextbookCatalog.tsx`, `Layout.tsx`/`App.tsx` for the menu event listener, plus `ChatPage.tsx` and `VaultPage.tsx` `open_path` call-sites).
- [ ] Add an ESLint rule (or a custom check) banning raw `invoke` imports outside `lib/api/` and `lib/tauri.ts`.
- [ ] Add a JSDoc `@command:` annotation to each method. Validate that every existing Tauri command in `lib.rs` is wrapped (small script that diffs `invoke_handler!` against `api/*`).
- [ ] Update `prebuild` to run the wrapper-coverage diff-check and fail on drift.

## Validation

- `npm run build` ✅
- `npm test` ✅
- `cargo test` ✅ (no Rust change)
- Grep: zero hits for `invoke(` outside `src/lib/api/` and `src/lib/tauri.ts`.
- Manual smoke: full chat turn, vault CRUD, settings save/load, project create/delete.

## Acceptance Criteria

- Every Tauri command has exactly one typed wrapper.
- The wrappers use camelCase argument names; the diff script confirms 1:1 coverage of `invoke_handler!`.
- The dynamic `await import("@tauri-apps/api/core")` in `chatStore.sendMessage` is removed.
- `open_path` wrapper explicitly models the current confirmation contract (`confirmed`) until 14G.2 resolves the policy.
- No behavior change: same commands called, same arguments, same return types.

## Risks

- **Missed call sites.** Mitigation: the diff script catches unwrapped commands; the ESLint rule catches unwrapped `invoke` calls.
- **Argument-name drift during migration.** Mitigation: do the migration in store-by-store PRs; run the manual smoke test on each.
