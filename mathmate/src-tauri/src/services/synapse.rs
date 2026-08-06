//! SynapseService — channel-based McpClient lifecycle.
//!
//! The McpClient (process spawn + JSON-RPC I/O) lives on a dedicated
//! background thread.  Tauri commands send messages to the worker via
//! an mpsc channel and block on a response channel.  This moves all
//! blocking I/O off the main Tauri thread and eliminates the Mutex.
//!
//! Commands: start, stop, status, call, get_tool_definitions, execute_tool
//!
//! get_tool_definitions and execute_tool are cross-cutting: they consult
//! Synapse tools first, then fall back to legacy vault tools when Synapse
//! isn't running.

use std::sync::mpsc;

use crate::error::AppError;
use crate::mcp_client::McpClient;
use crate::tools::{self, ToolCall, ToolDefinition, ToolResult};
pub use crate::tools::{ToolDefinition as ToolDef, FunctionDef, ToolCall as ToolCallType, ToolResult as ToolResultType};

// ─── Types ───────────────────────────────────────────────────────────────

#[derive(serde::Serialize)]
pub struct SynapseStatus {
    pub running: bool,
    pub vault_path: Option<String>,
    pub tool_count: usize,
}

// ─── Commands sent to the background worker ──────────────────────────────

enum SynapseCommand {
    Start {
        vault_path: String,
        response: mpsc::Sender<Result<(), AppError>>,
    },
    Stop {
        response: mpsc::Sender<Result<(), AppError>>,
    },
    Status {
        response: mpsc::Sender<Result<SynapseStatus, AppError>>,
    },
    ListTools {
        response: mpsc::Sender<Result<Vec<ToolDefinition>, AppError>>,
    },
    ExecuteTool {
        tool_name: String,
        args: serde_json::Value,
        response: mpsc::Sender<Result<serde_json::Value, AppError>>,
    },
    Call {
        tool: String,
        args: serde_json::Value,
        response: mpsc::Sender<Result<serde_json::Value, AppError>>,
    },
}

// ─── Background worker ───────────────────────────────────────────────────

/// Runs on a dedicated OS thread.  Owns the McpClient and processes
/// commands sequentially.  Exits when the channel is closed (i.e. the
/// SynapseService is dropped).
fn run_worker(rx: mpsc::Receiver<SynapseCommand>) {
    let mut client: Option<McpClient> = None;

    while let Ok(cmd) = rx.recv() {
        match cmd {
            SynapseCommand::Start {
                vault_path,
                response,
            } => {
                let result = (|| {
                    if let Some(ref mut c) = client {
                        c.stop();
                    }
                    client = Some(
                        McpClient::start(&vault_path)
                            .map_err(|e| AppError::internal(e))?,
                    );
                    Ok(())
                })();
                let _ = response.send(result);
            }
            SynapseCommand::Stop { response } => {
                if let Some(ref mut c) = client {
                    c.stop();
                }
                client = None;
                let _ = response.send(Ok(()));
            }
            SynapseCommand::Status { response } => {
                let status = match &mut client {
                    Some(c) => match c.list_tools() {
                        Ok(tools) => SynapseStatus {
                            running: true,
                            vault_path: None,
                            tool_count: tools.len(),
                        },
                        Err(_) => SynapseStatus {
                            running: true,
                            vault_path: None,
                            tool_count: 0,
                        },
                    },
                    None => SynapseStatus {
                        running: false,
                        vault_path: None,
                        tool_count: 0,
                    },
                };
                let _ = response.send(Ok(status));
            }
            SynapseCommand::ListTools { response } => {
                let result = match &mut client {
                    Some(c) => c.list_tools().map_err(|e| AppError::internal(e)),
                    None => Err(AppError::internal("Synapse MCP not running")),
                };
                let _ = response.send(result);
            }
            SynapseCommand::ExecuteTool {
                tool_name,
                args,
                response,
            } => {
                let result = match &mut client {
                    Some(c) => c
                        .call(&tool_name, args)
                        .map_err(|e| AppError::internal(e)),
                    None => Err(AppError::internal("Synapse MCP not running")),
                };
                let _ = response.send(result);
            }
            SynapseCommand::Call {
                tool,
                args,
                response,
            } => {
                let result = match &mut client {
                    Some(c) => c
                        .call_unwrapped(&tool, args)
                        .map_err(|e| AppError::internal(e)),
                    None => Err(AppError::internal("Synapse MCP not running")),
                };
                let _ = response.send(result);
            }
        }
    }

    // Channel closed → clean shutdown.
    if let Some(ref mut c) = client {
        c.stop();
    }
}

// ─── Service ─────────────────────────────────────────────────────────────

pub struct SynapseService {
    cmd_tx: mpsc::Sender<SynapseCommand>,
    _handle: Option<std::thread::JoinHandle<()>>,
}

impl SynapseService {
    /// Create a new SynapseService with a background worker thread.
    /// The worker starts immediately (idle, no MCP process running).
    pub fn new() -> Self {
        let (cmd_tx, cmd_rx) = mpsc::channel();
        let handle = std::thread::spawn(move || run_worker(cmd_rx));
        Self {
            cmd_tx,
            _handle: Some(handle),
        }
    }

    // ── Lifecycle ─────────────────────────────────────────────────────

    pub fn start(&self, vault_path: &str) -> Result<(), AppError> {
        let (tx, rx) = mpsc::channel();
        self.cmd_tx
            .send(SynapseCommand::Start {
                vault_path: vault_path.to_string(),
                response: tx,
            })
            .map_err(|_| AppError::internal("Synapse worker disconnected"))?;
        rx.recv()
            .map_err(|_| AppError::internal("Synapse worker disconnected"))?
    }

    pub fn stop(&self) -> Result<(), AppError> {
        let (tx, rx) = mpsc::channel();
        self.cmd_tx
            .send(SynapseCommand::Stop { response: tx })
            .map_err(|_| AppError::internal("Synapse worker disconnected"))?;
        rx.recv()
            .map_err(|_| AppError::internal("Synapse worker disconnected"))?
    }

    pub fn status(&self) -> Result<SynapseStatus, AppError> {
        let (tx, rx) = mpsc::channel();
        self.cmd_tx
            .send(SynapseCommand::Status { response: tx })
            .map_err(|_| AppError::internal("Synapse worker disconnected"))?;
        rx.recv()
            .map_err(|_| AppError::internal("Synapse worker disconnected"))?
    }

    /// Check whether the `synapse` binary is available on the system.
    /// This is a fast, non-blocking static check — no channel needed.
    pub fn is_available(&self) -> bool {
        crate::mcp_client::is_synapse_available()
    }

    // ── Tool execution ────────────────────────────────────────────────

    /// Get tool definitions: Synapse tools if running, else legacy vault fallback.
    pub fn get_tool_definitions(&self) -> Result<Vec<ToolDefinition>, AppError> {
        let mut defs = vec![
            tools::calculate::definition(),
            tools::current_date::definition(),
            tools::graph::definition(),
        ];

        // Try to get Synapse tools via the background worker.
        let (tx, rx) = mpsc::channel();
        if self
            .cmd_tx
            .send(SynapseCommand::ListTools { response: tx })
            .is_ok()
        {
            if let Ok(Ok(synapse_tools)) = rx.recv() {
                defs.extend(synapse_tools);
                return Ok(defs);
            }
        }

        // Fallback: legacy vault tools.
        defs.extend([
            tools::vault_list::definition(),
            tools::vault_read::definition(),
            tools::vault_search::definition(),
            tools::vault_write::definition(),
        ]);
        Ok(defs)
    }

    /// Execute a tool call, routing through Synapse if available and the tool
    /// is known to Synapse; otherwise fall back to the legacy tool executor.
    pub fn execute_tool(
        &self,
        call: ToolCall,
        vault_path: Option<&str>,
        project_id: Option<&str>,
    ) -> Result<ToolResult, AppError> {
        // Try Synapse execution via the background worker.
        let (tx, rx) = mpsc::channel();
        if self
            .cmd_tx
            .send(SynapseCommand::ExecuteTool {
                tool_name: call.tool_name.clone(),
                args: call.arguments.clone(),
                response: tx,
            })
            .is_ok()
        {
            if let Ok(Ok(result)) = rx.recv() {
                return Ok(ToolResult {
                    call_id: call.call_id.clone(),
                    result,
                    is_error: false,
                });
            }
        }

        // Synapse unavailable or tool not synapse-known — fall back to legacy.
        Ok(tools::execute_tool(&call, vault_path, project_id))
    }

    /// Direct Synapse call (thin proxy for UI-driven operations like
    /// vault_info, note_read, etc.).
    pub fn call(&self, tool: &str, args: serde_json::Value) -> Result<serde_json::Value, AppError> {
        let (tx, rx) = mpsc::channel();
        self.cmd_tx
            .send(SynapseCommand::Call {
                tool: tool.to_string(),
                args,
                response: tx,
            })
            .map_err(|_| AppError::internal("Synapse worker disconnected"))?;
        rx.recv()
            .map_err(|_| AppError::internal("Synapse worker disconnected"))?
    }
}

impl Drop for SynapseService {
    fn drop(&mut self) {
        // Dropping the sender closes the channel, causing the worker
        // thread to exit its recv loop and clean up the McpClient.
        // We don't join the thread here to avoid blocking the main thread
        // during shutdown — the OS will clean up.
    }
}
