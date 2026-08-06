// ─── MCP Subprocess Client ──────────────────────────────────────────────
//
// Spawns `synapse mcp start --vault <path>` as a managed child process and
// speaks JSON-RPC over stdin/stdout. Exposes Synapse vault tools (note_list,
// note_read, note_create, note_search, note_backlinks, vault_info) to the
// MathMate tool system.
//
// Transport: newline-delimited JSON on stdio (same as Claude Desktop MCP).
// Timeout: 10s per call.
// ────────────────────────────────────────────────────────────────────────

use crate::tools::ToolDefinition;
use serde_json::Value;
use std::io::{BufRead, BufReader, BufWriter, Write};
use std::path::PathBuf;
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};
use std::time::Duration;

/// A running Synapse MCP subprocess.
pub struct McpClient {
    child: Child,
    stdin: BufWriter<ChildStdin>,
    stdout: BufReader<ChildStdout>,
    next_id: u64,
}

/// MCP tool definition returned by `tools/list`.
#[derive(Debug, serde::Deserialize)]
struct McpToolDef {
    name: String,
    description: String,
    #[serde(rename = "inputSchema")]
    input_schema: Value,
}

/// JSON-RPC response envelope.
#[derive(Debug, serde::Deserialize)]
struct JsonRpcResponse {
    id: u64,
    result: Option<Value>,
    error: Option<JsonRpcError>,
}

#[derive(Debug, serde::Deserialize)]
struct JsonRpcError {
    message: String,
}

impl McpClient {
    /// Spawn `synapse mcp start --vault <path>` and perform the MCP
    /// initialize handshake.
    ///
    /// Also runs `synapse reindex build <vault>` to ensure the FTS5
    /// search index exists before the MCP server starts.
    pub fn start(vault_path: &str) -> Result<Self, String> {
        let binary = resolve_synapse_binary()?;

        // Validate vault path exists
        let vault = std::path::Path::new(vault_path);
        if !vault.is_dir() {
            return Err(format!(
                "Vault path does not exist or is not a directory: {}",
                vault_path
            ));
        }

        // Auto-build the FTS5 search index before starting the MCP server.
        // This is idempotent (no-op if index already exists), so it's safe
        // to run on every startup. We ignore the exit status — the MCP server
        // will serve tools regardless of whether search is available.
        let _ = Command::new(&binary)
            .args(["reindex", "build", vault_path])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .and_then(|mut c| c.wait());

        let mut child = Command::new(&binary)
            .args(["mcp", "start", "--vault", vault_path])
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null()) // suppress noisy stderr logs
            .spawn()
            .map_err(|e| format!("Failed to spawn synapse: {}", e))?;

        let stdin = child.stdin.take().ok_or("Failed to capture stdin")?;
        let stdout = child.stdout.take().ok_or("Failed to capture stdout")?;

        let mut client = McpClient {
            child,
            stdin: BufWriter::new(stdin),
            stdout: BufReader::new(stdout),
            next_id: 0,
        };

        // Perform MCP initialize handshake
        client.send_initialize()?;

        Ok(client)
    }

    /// Send the MCP `initialize` request and wait for the response.
    /// Then send the `notifications/initialized` notification (fire-and-forget).
    fn send_initialize(&mut self) -> Result<(), String> {
        let req = serde_json::json!({
            "jsonrpc": "2.0",
            "id": self.next_id,
            "method": "initialize",
            "params": {
                "protocolVersion": "2024-11-05",
                "clientInfo": { "name": "mathmate", "version": "2.0.0" },
                "capabilities": {}
            }
        });

        let id = self.next_id;
        self.next_id += 1;

        self.write_line(&req)?;
        let _resp = self.read_response(id)?;

        // Send initialized notification (no response expected)
        let notif = serde_json::json!({
            "jsonrpc": "2.0",
            "method": "notifications/initialized"
        });
        self.write_line(&notif)
    }

    /// Send a JSON-RPC `tools/call` request and return the result value.
    pub fn call(&mut self, tool: &str, args: Value) -> Result<Value, String> {
        let req = serde_json::json!({
            "jsonrpc": "2.0",
            "id": self.next_id,
            "method": "tools/call",
            "params": {
                "name": tool,
                "arguments": args
            }
        });

        let id = self.next_id;
        self.next_id += 1;

        self.write_line(&req)?;

        // Read line by line until we get a response matching our ID
        // (MCP servers may emit progress notifications or other messages)
        let deadline = std::time::Instant::now() + Duration::from_secs(10);
        let mut line = String::new();

        loop {
            if std::time::Instant::now() > deadline {
                return Err(format!("MCP call to '{}' timed out after 10s", tool));
            }

            line.clear();
            match self.stdout.read_line(&mut line) {
                Ok(0) => return Err("MCP subprocess closed stdin unexpectedly".to_string()),
                Ok(_) => {}
                Err(e) => return Err(format!("Failed to read MCP response: {}", e)),
            }

            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }

            let response: JsonRpcResponse = match serde_json::from_str(trimmed) {
                Ok(r) => r,
                Err(e) => {
                    // Skip non-JSON lines (diagnostic output, etc.)
                    eprintln!("[mcp_client] Skipping non-JSON line: {} ({})", trimmed, e);
                    continue;
                }
            };

            // Skip responses that don't match our request ID
            if response.id != id {
                continue;
            }

            if let Some(err) = response.error {
                return Err(format!("MCP error: {}", err.message));
            }

            return response
                .result
                .ok_or_else(|| "MCP returned no result field".to_string());
        }
    }

    /// Same as `call`, but unwraps the Synapse MCP `content[0].text` envelope.
    ///
    /// The Synapse MCP server returns structured JSON wrapped as:
    ///   `{ "content": [{ "type": "text", "text": "{...json...}" }] }`
    /// This method extracts and parses the inner JSON payload so callers
    /// receive the domain shape directly.
    pub fn call_unwrapped(&mut self, tool: &str, args: Value) -> Result<Value, String> {
        let result = self.call(tool, args)?;

        if let Some(content) = result.get("content").and_then(|c| c.as_array()) {
            if let Some(text_content) = content.first() {
                if let Some(text) = text_content.get("text").and_then(|t| t.as_str()) {
                    if let Ok(parsed) = serde_json::from_str::<Value>(text) {
                        return Ok(parsed);
                    }
                    // Non-JSON text (shouldn't happen with current Synapse,
                    // but keep as fallback)
                    return Ok(Value::String(text.to_string()));
                }
            }
        }

        Ok(result)
    }

    /// Fetch the server's tool list via `tools/list`.
    /// Converts MCP tool definitions to MathMate's ToolDefinition format.
    pub fn list_tools(&mut self) -> Result<Vec<ToolDefinition>, String> {
        let id = self.next_id;
        let req = serde_json::json!({
            "jsonrpc": "2.0",
            "id": id,
            "method": "tools/list",
            "params": {}
        });

        self.next_id += 1;

        self.write_line(&req)?;

        // Read line by line until we get a response matching our ID.
        // Skip log lines and non-matching messages (same pattern as call()).
        let deadline = std::time::Instant::now() + Duration::from_secs(10);
        let mut line = String::new();
        let response: Option<JsonRpcResponse>;

        loop {
            if std::time::Instant::now() > deadline {
                return Err("Timed out waiting for tools/list response".to_string());
            }

            line.clear();
            match self.stdout.read_line(&mut line) {
                Ok(0) => return Err("MCP subprocess closed stdin unexpectedly".to_string()),
                Ok(_) => {}
                Err(e) => return Err(format!("Failed to read MCP response: {}", e)),
            }

            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }

            match serde_json::from_str::<JsonRpcResponse>(trimmed) {
                Ok(r) => {
                    if r.id == id {
                        response = Some(r);
                        break;
                    }
                    // Skip responses for other IDs (e.g. pending tool calls)
                }
                Err(e) => {
                    // Skip non-JSON lines (log output, etc.)
                    eprintln!(
                        "[mcp_client] Skipping non-JSON line in list_tools: {} ({})",
                        trimmed, e
                    );
                }
            }
        }

        let response = response.ok_or_else(|| "No matching response for tools/list".to_string())?;

        if let Some(err) = response.error {
            return Err(format!("MCP error: {}", err.message));
        }

        let tools_value = response
            .result
            .ok_or_else(|| "No result in tools/list response".to_string())?;

        let mcp_tools: Vec<McpToolDef> = tools_value["tools"]
            .as_array()
            .ok_or_else(|| "Expected 'tools' array in response".to_string())?
            .iter()
            .map(|v| serde_json::from_value(v.clone()))
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("Failed to parse tool definitions: {}", e))?;

        Ok(mcp_tools
            .into_iter()
            .map(|t| ToolDefinition {
                tool_type: "function".to_string(),
                function: crate::tools::FunctionDef {
                    name: t.name,
                    description: t.description,
                    parameters: t.input_schema,
                },
            })
            .collect())
    }

    /// Kill the child process.
    pub fn stop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }

    /// Write a newline-delimited JSON line to stdin.
    fn write_line(&mut self, value: &Value) -> Result<(), String> {
        let json = serde_json::to_string(value)
            .map_err(|e| format!("Failed to serialize JSON-RPC request: {}", e))?;
        self.stdin
            .write_all(json.as_bytes())
            .map_err(|e| format!("Failed to write to MCP stdin: {}", e))?;
        self.stdin
            .write_all(b"\n")
            .map_err(|e| format!("Failed to write newline to MCP stdin: {}", e))?;
        self.stdin
            .flush()
            .map_err(|e| format!("Failed to flush MCP stdin: {}", e))?;
        Ok(())
    }

    /// Read a JSON-RPC response with a specific ID.
    fn read_response(&mut self, expected_id: u64) -> Result<Value, String> {
        let deadline = std::time::Instant::now() + Duration::from_secs(5);
        let mut line = String::new();

        loop {
            if std::time::Instant::now() > deadline {
                return Err("Timed out waiting for MCP initialize response".to_string());
            }

            line.clear();
            match self.stdout.read_line(&mut line) {
                Ok(0) => return Err("MCP subprocess closed stdin unexpectedly".to_string()),
                Ok(_) => {}
                Err(e) => return Err(format!("Failed to read MCP response: {}", e)),
            }

            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }

            let response: JsonRpcResponse = match serde_json::from_str(trimmed) {
                Ok(r) => r,
                Err(_) => continue,
            };

            if response.id != expected_id {
                continue;
            }

            if let Some(err) = response.error {
                return Err(format!("MCP initialize error: {}", err.message));
            }

            return Ok(response.result.unwrap_or_default());
        }
    }
}

// ─── Binary Resolution ──────────────────────────────────────────────────

/// Resolve the `synapse` binary path.
///
/// Priority:
/// 1. `SYNAPSE_BIN` environment variable
/// 2. `~/.cargo/bin/synapse` (installed via `cargo install`)
/// 3. `<workspace-root>/../synapse/target/release/synapse` (dev workspace sibling)
fn resolve_synapse_binary() -> Result<PathBuf, String> {
    // 1. Explicit override from env var
    if let Ok(path) = std::env::var("SYNAPSE_BIN") {
        let p = PathBuf::from(path);
        if p.exists() {
            return Ok(p);
        }
    }

    // 2. Installed via `cargo install --path ...`
    if let Some(home) = dirs_next::home_dir() {
        let p = home.join(".cargo").join("bin").join("synapse");
        if p.exists() {
            return Ok(p);
        }
    }

    // 3. Dev workspace sibling (mathmate/../synapse/target/release/synapse)
    let dev = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent() // mathmate/src-tauri → mathmate
        .and_then(|p| p.parent()) // mathmate → code/mathmate
        .and_then(|p| p.parent()) // code/mathmate → code
        .map(|p| {
            p.join("synapse")
                .join("target")
                .join("release")
                .join("synapse")
        });
    if let Some(p) = dev {
        if p.exists() {
            return Ok(p);
        }
    }

    Err(
        "synapse binary not found. Install with `cargo install --path ~/code/synapse/crates/cli` \
         or set SYNAPSE_BIN environment variable"
            .to_string(),
    )
}

/// Check whether the synapse binary is available (without spawning).
pub fn is_synapse_available() -> bool {
    resolve_synapse_binary().is_ok()
}

// ─── Tests ──────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_resolve_binary_env_override() {
        // Use the known-good dev path as the env var value
        let dev_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .and_then(|p| p.parent())
            .map(|p| {
                p.join("synapse")
                    .join("target")
                    .join("release")
                    .join("synapse")
            })
            .expect("Failed to compute dev path");

        if dev_path.exists() {
            std::env::set_var("SYNAPSE_BIN", dev_path.to_str().unwrap());
            let result = resolve_synapse_binary();
            assert!(
                result.is_ok(),
                "Should resolve binary from env var: {:?}",
                result.err()
            );
            std::env::remove_var("SYNAPSE_BIN");
        }
        // If binary doesn't exist at dev path, skip this test
    }

    #[test]
    fn test_resolve_binary_env_override_nonexistent_skips() {
        // Set env var to nonexistent path — should skip it and fall through
        std::env::set_var("SYNAPSE_BIN", "/nonexistent/synapse");
        // If ~/.cargo/bin/synapse exists, resolution succeeds (fallback)
        // If not, it tries dev path; we only assert it doesn't panic
        let result = resolve_synapse_binary();
        // The function either finds the binary at a fallback path or returns Err
        // either outcome is fine — this test just verifies it doesn't crash
        if result.is_err() {
            assert!(result.unwrap_err().contains("synapse binary not found"));
        }
        std::env::remove_var("SYNAPSE_BIN");
    }

    /// Integration test: requires `synapse` binary at dev path.
    /// Run with `cargo test -- --ignored --nocapture`.
    #[test]
    #[ignore]
    fn test_start_and_list_tools() {
        let dev_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .and_then(|p| p.parent())
            .map(|p| {
                p.join("synapse")
                    .join("target")
                    .join("release")
                    .join("synapse")
            })
            .expect("Failed to compute dev path");

        if !dev_path.exists() {
            eprintln!("Skipping integration test: synapse binary not found");
            return;
        }

        std::env::set_var("SYNAPSE_BIN", dev_path.to_str().unwrap());

        // Create a temp vault
        let tmp_dir = std::env::temp_dir().join("synapse_test_vault");
        let _ = std::fs::create_dir_all(&tmp_dir);
        std::fs::write(tmp_dir.join("test.md"), "# Test\nHello world").ok();

        let mut client = McpClient::start(tmp_dir.to_str().unwrap()).expect("Failed to start MCP");

        let tools = client.list_tools().expect("Failed to list tools");
        assert!(!tools.is_empty(), "Should have at least one tool");
        assert_eq!(tools[0].tool_type, "function");

        // Test note_list call
        let result = client
            .call("note_list", serde_json::json!({}))
            .expect("Failed to call note_list");
        assert!(
            result.is_array() || result["notes"].is_array() || result.is_string(),
            "note_list should return an array or notes field"
        );

        client.stop();
        let _ = std::fs::remove_dir_all(&tmp_dir);
        std::env::remove_var("SYNAPSE_BIN");
    }
}
