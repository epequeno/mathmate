# MathMate architecture

A desktop app: a React/TypeScript UI in a Tauri webview, and a Rust backend reached through Tauri commands. This document describes the code as it is, including the places where it is mid-migration. Paths are relative to `mathmate/` (the app directory) unless noted.

## Components

```
                     Tauri webview (React + TypeScript)
  ┌──────────────────────────────────────────────────────────────────┐
  │ components/, pages/      UI, KaTeX + DOMPurify rendering          │
  │ stores/ (Zustand)        chatStore, projectStore, configStore...  │
  │ lib/turn/orchestrator    one chat turn: stream → tools → persist  │
  │ lib/providers.ts         builds the request, parses the SSE stream│
  │ lib/memorySafety.ts      memory write scan + retrieval wrapper    │
  └───────────┬───────────────────────────────────────┬──────────────┘
              │ invoke() (Tauri IPC)                  │ fetch() (HTTPS, CSP-restricted)
  ┌───────────▼───────────────────────────┐   ┌───────▼──────────────────────┐
  │ Rust backend (src-tauri/src)          │   │ Model providers              │
  │  lib.rs        command registration   │   │ OpenRouter / OpenAI /        │
  │  services/     config, session,       │   │ Anthropic                    │
  │                project, memory, vault,│   └──────────────────────────────┘
  │                textbook, synapse, ... │
  │  tools/        tool definitions+exec  │   ┌──────────────────────────────┐
  │  pathscope.rs  path containment       │──▶│ synapse (external binary,    │
  │  audit.rs      security event log     │   │ MCP over stdio, optional)    │
  └───────────┬───────────────────────────┘   └──────────────────────────────┘
              │
   ~/.mathmate/  models.json · sessions/*.jsonl · projects/*.json
                 memory.db (SQLite + FTS5) · audit.log
```

The webview calls model providers **directly** with `fetch`. The Rust side does not proxy model traffic. It owns persistence, the filesystem, tools and the vault.

## One turn, end to end

1. **Send** (`stores/chatStore.ts`). The store moves its turn state machine from `idle` to `preparing` (`lib/turn/phase.ts`; a discriminated union that also holds the `AbortController`).
2. **Assemble the prompt.** The store calls the pure `buildSystemPrompt` (`lib/turn/prompt.ts`, unit-tested) with the user's system prompt, the project's tutor style, the retrieved memories and whether the project has a textbook. Memories come from a query to `memory.db` (the first 200 characters of the input, up to 8 results). `buildSystemPrompt` wraps them with `wrapRetrievedMemories` into a delimited, size-capped block, with low-trust items in a separate block. In the olympiad tutor style the coach prompt replaces the user prompt and the memory blocks; only the textbook note is still appended.
3. **Run the turn** (`lib/turn/orchestrator.ts`). A generator yields `TurnEvent`s that the store applies to UI state:
   - stream the response through `providers.streamChat` (30 s connection and 120 s total timeouts, an abort signal, and a 1 MB cap on accumulated text);
   - if the model requested tools, execute them through the backend (`executeTool` → Tauri → `tools::execute_tool`, 8 s timeout each), append the results, and stream again, for at most 3 tool rounds;
   - save each message through the backend (`appendMessage`), which writes it to the session's JSONL file.
4. **Finish or fail.** The state machine moves through `finishing` or `aborted` or `errored` and returns to `idle`. The orchestrator throws on error or abort and leaves retry to the store.

All I/O the orchestrator uses is passed in as `TurnDeps` (stream, append, load, execute tool, id generation), so the loop is unit-tested with mocks and end-to-end against fakes (`orchestrator.test.ts`, `orchestrator.e2e.test.ts`).

## Tools

The set offered to the model is built in `src-tauri/src/services/synapse.rs`:

- **Always:** `calculate`, `get_current_date`, `graph` and `search_textbook` (project-scoped; it returns a clear error when the project has no indexed textbook).
- **Vault tools:** if the external **`synapse`** binary can be started, its MCP tools (note list/read/create/search/backlinks) are added. `mcp_client.rs` spawns it as a child process and speaks newline-delimited JSON-RPC over stdio, with a 10 s timeout per call. If it can't be started, the app falls back to the built-in `vault_list`, `vault_read`, `vault_search` and `vault_write`.
- Execution follows the same rule: try Synapse for tools it knows, otherwise use the built-in executor in `tools/mod.rs`.

Synapse is a separate project and is **optional**. Without it, the vault features use the built-in fallback tools.

## Data

Everything is under `~/.mathmate/`:

| Path | Contents |
|---|---|
| `models.json` | Providers, models, and optionally a stored API key per provider |
| `sessions/<id>.jsonl` | One session per file, one message per line (legacy `.json` files migrate on read) |
| `projects/*.json` | Project records: vault path, textbook, default model, tutor style |
| `memory.db` | SQLite with an FTS5 index: memories with scores, and a learner profile |
| `audit.log` | Security events, rotated at 1 MB |

## Security model

See [`mathmate/SECURITY.md`](mathmate/SECURITY.md) for the CSP and threat model. The pieces in the code:

- **Untrusted model output is rendered in a webview that can call `invoke()`**, so rendering is the main risk. Output passes through `marked` and DOMPurify, with a URL allowlist. A strict CSP blocks remote scripts, remote images and form posts, and limits `connect-src` to IPC and the three provider hosts.
- **Filesystem access is path-scoped** (`pathscope.rs`): paths are canonicalized and compared with `Path::starts_with`, not string prefixes, to block `..` traversal and symlink escapes.
- **Memory is treated as untrusted input.** Writes are scanned for injection and exfiltration patterns (reject or redact) in TypeScript for immediate feedback, and again in Rust as the authoritative check. Retrieval is delimited, size-capped and trust-sorted.
- **API keys are resolved in the webview.** A key comes from `models.json`, or from the environment through a Tauri command, and is sent in the request header by `providers.ts`. This is why the CSP `connect-src` list matters. Storing keys in the OS keychain is a documented, deferred item, so keys currently sit in `models.json` if you save them there.

## Design decisions

- **Orchestrator out of the store.** The turn loop used to live inside `chatStore.sendMessage`. It was extracted so the loop could be tested without React or Tauri, and the turn-progress fields were collapsed into the single `TurnPhase` union.
- **A small, fixed tool budget** (3 rounds, 8 s per tool, 1 MB per stream) bounds cost and latency, and keeps a misbehaving model from looping.
- **Services behind thin commands.** `lib.rs` commands extract state and call a service in `services/`, which owns its state and can be tested without Tauri.
- **Hints before answers.** The system prompt makes the tutor ask for an attempt first and prefer next-step hints to full solutions, informed by the research in the README. A separate generator (`lib/hintLadder.ts`) produces four escalating hints for olympiad practice problems.

## Known rough edges

These are real and are listed so a reader does not have to find them:

- **An unfinished migration to the service layer.** `src-tauri/src/` holds the older flat modules (`session.rs`, `project.rs`, `wrapup.rs`, `memory.rs`, `vault.rs`, ...) next to the newer `services/` equivalents. `session` and `config` services own their logic, while `memory`, `models`, `vault`, `wrapup` and `textbook` are services that delegate to the legacy module. Five project commands in `lib.rs` and two tools still call legacy code directly, three legacy modules (`config`, `images`, `problem_bank`) appear to be dead, and the two layers use different path handling (a fixed `~/.mathmate` against an injected base directory). The plan is in [`mathmate/Implementation_ServiceLayerCompletion.md`](mathmate/Implementation_ServiceLayerCompletion.md).
- **The graph instructions are not in the live prompt.** `GRAPH_INSTRUCTIONS` in `lib/turn/prompt.ts` describes how to embed a function graph inline with `<mathmate-viz>`. The live prompt has never included it, so the model is not told that syntax. Appending it enables inline graphs.
- **Olympiad mode drops memories and the user's system prompt.** It is covered by a test so the behaviour is explicit, but it may not be what you want.
- **API keys are not in the OS keychain** (see above).
- **No CI.** Tests run locally: `npm run test` (Vitest) and `cargo test`.
