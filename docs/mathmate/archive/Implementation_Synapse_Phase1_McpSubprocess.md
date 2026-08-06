# Synapse Phase 1 — MCP Subprocess Client

> **Phase:** 13A  
> **Depends on:** Nothing (greenfield Rust module)  
> **Estimated effort:** 2–3 days  
> **Unlocks:** Phases 13B, 13C

---

## Goal

Replace MathMate's hand-rolled vault tools with proxied calls to the Synapse MCP server running as a managed child process. After this phase:

- The AI agent has access to all 8 Synapse tools (`vault_info`, `note_list`, `note_read`, `note_create`, `note_update`, `note_delete`, `note_search`, `note_backlinks`)
- The Synapse process starts automatically when a project with a vault path is opened
- MathMate's old `vault_search` / `vault_write` / `vault_list` / `vault_read` tools are deprecated (kept as fallback until Phase 13B is confirmed working)

---

## New File: `src-tauri/src/mcp_client.rs`

### Data types

```rust
/// A running Synapse MCP subprocess.
pub struct McpClient {
    child: std::process::Child,
    stdin: std::io::BufWriter<std::process::ChildStdin>,
    stdout: std::io::BufReader<std::process::ChildStdout>,
    next_id: u64,
}
```

### Core methods

```rust
impl McpClient {
    /// Spawn `synapse mcp start --vault <path>` and perform the MCP
    /// initialize handshake.
    pub fn start(vault_path: &str) -> Result<Self, String>;

    /// Send a JSON-RPC `tools/call` request and return the result value.
    pub fn call(&mut self, tool: &str, args: serde_json::Value)
        -> Result<serde_json::Value, String>;

    /// Fetch the server's tool list via `tools/list`.
    pub fn list_tools(&mut self) -> Result<Vec<ToolDefinition>, String>;

    /// Kill the child process.
    pub fn stop(&mut self);
}
```

### JSON-RPC framing

MCP over stdio uses newline-delimited JSON. Each request:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "note_read",
    "arguments": { "path": "PROGRESS.md" }
  }
}
```

Write one line to stdin, read one line from stdout. No length prefix. Timeout: 10s per call.

### Initialize handshake

On `start()`, send the MCP `initialize` request and wait for `initialized`:

```json
{ "jsonrpc":"2.0","id":0,"method":"initialize",
  "params":{ "protocolVersion":"2024-11-05",
             "clientInfo":{ "name":"mathmate","version":"0.1.0" },
             "capabilities":{} } }
```

Then send the `notifications/initialized` notification (no response expected).

---

## AppState Changes (`src-tauri/src/lib.rs`)

```rust
pub struct AppState {
    pub models_config: Mutex<Option<ModelsConfig>>,
    pub app_config:    Mutex<Option<AppConfig>>,
    pub db:            Mutex<Option<Connection>>,
    pub mcp_client:    Mutex<Option<mcp_client::McpClient>>,  // NEW
}
```

Initialize with `mcp_client: Mutex::new(None)`.

---

## New Tauri Commands

### `start_synapse_mcp`

```rust
#[tauri::command]
fn start_synapse_mcp(
    state: State<AppState>,
    vault_path: String,
) -> Result<(), String>
```

1. Resolve the `synapse` binary path (env var → `~/.cargo/bin/synapse` → dev fallback)
2. Kill any existing `McpClient`
3. Call `McpClient::start(&vault_path)`
4. Store in `state.mcp_client`

### `stop_synapse_mcp`

```rust
#[tauri::command]
fn stop_synapse_mcp(state: State<AppState>) -> Result<(), String>
```

Calls `client.stop()`, sets to `None`.

### `synapse_mcp_status`

```rust
#[tauri::command]
fn synapse_mcp_status(state: State<AppState>) -> SynapseStatus
// Returns: { running: bool, vault_path: Option<String>, tool_count: usize }
```

Used by the frontend to show a status indicator in the Vault page toolbar.

---

## Tool Routing Changes

### `get_tool_definitions`

```rust
fn get_tool_definitions(state: State<AppState>) -> Vec<ToolDefinition> {
    let mut defs = vec![calculate::definition(), graph::definition()];

    // Add Synapse tools when client is running
    if let Ok(mut guard) = state.mcp_client.lock() {
        if let Some(ref mut client) = *guard {
            if let Ok(synapse_tools) = client.list_tools() {
                defs.extend(synapse_tools);
            }
        }
    }

    // Fallback: include old vault tools only when Synapse is NOT running
    if state.mcp_client.lock().map(|g| g.is_none()).unwrap_or(true) {
        defs.extend([vault_list::definition(), vault_read::definition(),
                     vault_search::definition(), vault_write::definition()]);
    }

    defs
}
```

### `execute_tool`

Add a routing arm before the existing match:

```rust
// Try Synapse MCP client first for note_* and vault_info tools
let synapse_tools = ["vault_info","note_list","note_read","note_create",
                     "note_update","note_delete","note_search","note_backlinks"];
if synapse_tools.contains(&call.tool_name.as_str()) {
    if let Ok(mut guard) = state.mcp_client.lock() {
        if let Some(ref mut client) = *guard {
            return client.call(&call.tool_name, call.arguments.clone())
                .map(|r| ToolResult { call_id: call.call_id.clone(),
                                      result: r, is_error: false })
                .unwrap_or_else(|e| ToolResult { call_id: call.call_id.clone(),
                                                 result: json!({"error": e}),
                                                 is_error: true });
        }
    }
}
```

---

## Frontend: Auto-Start on Project Load

In `projectStore.ts`, after `setCurrentProject`:

```typescript
// Auto-start Synapse MCP when switching to a project with a vault
if (project?.vault_path) {
  invoke("start_synapse_mcp", { vaultPath: project.vault_path })
    .catch((err) => console.warn("[synapse] Failed to start MCP:", err));
}
```

Add a `synapseRunning` boolean to the store (polled via `synapse_mcp_status`) so the UI can show a "Synapse active" indicator.

---

## Binary Resolution

```rust
fn resolve_synapse_binary() -> Result<PathBuf, String> {
    // 1. Explicit override
    if let Ok(path) = std::env::var("SYNAPSE_BIN") {
        let p = PathBuf::from(path);
        if p.exists() { return Ok(p); }
    }
    // 2. Installed via cargo
    if let Some(home) = dirs_next::home_dir() {
        let p = home.join(".cargo").join("bin").join("synapse");
        if p.exists() { return Ok(p); }
    }
    // 3. Dev workspace sibling
    let dev = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent().unwrap()   // mathmate-v2/src-tauri
        .parent().unwrap()   // mathmate-v2
        .parent().unwrap()   // mathmate (workspace root)
        .parent().unwrap()   // code/
        .join("synapse").join("target").join("release").join("synapse");
    if dev.exists() { return Ok(dev); }

    Err("synapse binary not found. Install with `cargo install --path ~/code/synapse/crates/cli` \
         or set SYNAPSE_BIN".to_string())
}
```

---

## Error Handling & Fallback

- If `start_synapse_mcp` fails (binary not found, vault doesn't exist), log the error and leave `mcp_client` as `None` — the old vault tools remain available
- If a call times out (10s), return an error result to the agent and log; do NOT crash the process
- If the child process dies unexpectedly, detect it on the next `call()` (write will fail), attempt one restart, then return error

---

## Testing

- Unit test `McpClient::start` + `call` against a real `synapse mcp start` process (integration test, gated behind `#[ignore]` for CI)
- Unit test binary resolution with temp env var override
- Verify `get_tool_definitions` returns Synapse tools when client is running and falls back cleanly when it is not
