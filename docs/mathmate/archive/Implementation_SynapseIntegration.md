# Synapse MCP Integration — Master Overview

> **Status:** Planned — Phase 13  
> **Replaces:** Old Swift/SwiftUI integration doc (pre-Tauri)  
> **Sub-plans:**
> - [Phase 1 — MCP Subprocess Client](Implementation_Synapse_Phase1_McpSubprocess.md)
> - [Phase 2 — Vault UI Redesign](Implementation_Synapse_Phase2_VaultUI.md)
> - [Phase 3 — Context Panel & Chat Integration](Implementation_Synapse_Phase3_ContextIntegration.md)

---

## Why

MathMate currently has four hand-rolled vault tools (`vault_search`, `vault_write`, `vault_list`, `vault_read`) implemented directly in Rust. They use a simple keyword scan with no index and have significant gaps: no update-without-overwrite, no backlinks, no pagination, no semantic search. The agent has already hallucinated writes and looped on search failures because of these limitations.

Synapse is a purpose-built, Rust-powered knowledge base with an MCP server. It already provides everything MathMate needs:

| Capability | MathMate today | Synapse |
|---|---|---|
| Note list | Walk directory, return paths | `note_list` — titles + pagination |
| Note read | `fs::read_to_string` | `note_read` — frontmatter parsed |
| Note write | Create or overwrite | `note_create` / `note_update` — preserves frontmatter |
| Search | Keyword scan (no index) | `note_search` — FTS5 with snippets |
| Backlinks | ✗ | `note_backlinks` — forward + back + broken |
| Vault info | ✗ | `vault_info` — note count, name, path |
| Semantic search | ✗ | Hybrid FTS+embeddings (planned) |

The MathMate README already states: *"Synapse is the knowledge base backend for MathMate."* This integration is the promised follow-through.

---

## Architecture

```
MathMate (Tauri)
  │
  ├── chatStore.sendMessage()
  │     └── execute_tool("note_read", ...) ──────────────────────────┐
  │                                                                    ▼
  ├── src-tauri/src/mcp_client.rs                           McpClient::call()
  │     ├── Child process: synapse mcp start --vault <path>     │
  │     ├── stdin  ◄── JSON-RPC requests                        │
  │     └── stdout ──► JSON-RPC responses ◄─────────────────────┘
  │
  └── VaultPage / ContextPanel
        └── invoke("synapse_call", { tool, args }) ──► McpClient
```

**Transport:** stdio. The Synapse process is spawned once per vault session and killed when the project changes or the app closes. No port, no daemon, no network — identical to how Claude Desktop handles local MCP servers.

---

## Phase Overview

### Phase 1 — MCP Subprocess Client (Rust)
*Estimated: 2–3 days*

New Rust module `mcp_client.rs` that manages the Synapse child process, speaks JSON-RPC over stdin/stdout, and exposes Tauri commands. Tool routing updated so `note_*` calls are proxied through this client instead of the hand-rolled tools.

→ See [Implementation_Synapse_Phase1_McpSubprocess.md](Implementation_Synapse_Phase1_McpSubprocess.md)

### Phase 2 — Vault UI Redesign
*Estimated: 1–2 days*

VaultPage rebuilt on top of the Synapse API: paginated note list with real titles, FTS search bar, rendered preview with edit mode (note_update), backlinks panel, new note button.

→ See [Implementation_Synapse_Phase2_VaultUI.md](Implementation_Synapse_Phase2_VaultUI.md)

### Phase 3 — Context Panel & Chat Integration
*Estimated: 1 day*

Related Notes section in the context panel (background note_search on conversation topic). Note citation chips after the agent writes to the vault. Quick-save button on assistant messages.

→ See [Implementation_Synapse_Phase3_ContextIntegration.md](Implementation_Synapse_Phase3_ContextIntegration.md)

---

## What We Keep From Current Tools

| Current tool | Fate |
|---|---|
| `vault_search` | **Remove** once Phase 1 ships — `note_search` is strictly better |
| `vault_write` | **Remove** — replaced by `note_create` + `note_update` |
| `vault_list` | **Remove** — replaced by `note_list` |
| `vault_read` | **Remove** — replaced by `note_read` |
| `init_vault` | **Keep** — Synapse has no scaffold command |
| `calculate`, `graph` | **Keep** — unrelated to Synapse |

During Phase 1, both the old tools and the new Synapse tools will coexist. The old tools are removed in a follow-up clean-up PR once the agent is confirmed working on the Synapse API.

---

## Synapse Binary

The `synapse` binary lives at `~/code/synapse`. During development, MathMate resolves the binary at:

1. `SYNAPSE_BIN` environment variable (override)
2. `~/.cargo/bin/synapse` (installed via `cargo install`)
3. `<workspace-root>/../synapse/target/release/synapse` (dev fallback)

For production distribution, `synapse` will be bundled as a Tauri sidecar alongside the MathMate app bundle.

---

## Success Metrics

- Agent can `note_list` → `note_read` → `note_update` in a single tool loop without errors
- No hallucinated writes (agent sees the real file list before writing)
- Vault page shows real note titles and allows in-app editing
- Related notes surface in the context panel during chat
- Zero regressions on existing `calculate` and `graph` tools
