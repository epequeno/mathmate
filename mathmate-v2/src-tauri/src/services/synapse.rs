//! SynapseService — owns the McpClient lifecycle.
//!
//! Replaces `AppState::mcp_client` with an injectable, testable service.
//! 6 commands: start, stop, status, call, get_tool_definitions, execute_tool
//!
//! get_tool_definitions and execute_tool are cross-cutting: they consult
//! Synapse tools first, then fall back to legacy vault tools when Synapse
//! isn't running.

use std::sync::Mutex;

use crate::error::AppError;
use crate::mcp_client::McpClient;
use crate::tools::{self, ToolCall, ToolDefinition, ToolResult};

// ─── Types ───────────────────────────────────────────────────────────────

#[derive(serde::Serialize)]
pub struct SynapseStatus {
    pub running: bool,
    pub vault_path: Option<String>,
    pub tool_count: usize,
}

// ─── Service ─────────────────────────────────────────────────────────────

pub struct SynapseService {
    client: Mutex<Option<McpClient>>,
}

impl SynapseService {
    pub fn new() -> Self {
        Self {
            client: Mutex::new(None),
        }
    }

    // ── Lifecycle ─────────────────────────────────────────────────────

    pub fn start(&self, vault_path: &str) -> Result<(), AppError> {
        let mut guard = self
            .client
            .lock()
            .map_err(|e| AppError::internal(format!("Lock error: {e}")))?;
        if let Some(ref mut client) = *guard {
            client.stop();
        }
        *guard = Some(
            McpClient::start(vault_path)
                .map_err(|e| AppError::internal(e))?,
        );
        Ok(())
    }

    pub fn stop(&self) -> Result<(), AppError> {
        let mut guard = self
            .client
            .lock()
            .map_err(|e| AppError::internal(format!("Lock error: {e}")))?;
        if let Some(ref mut client) = *guard {
            client.stop();
        }
        *guard = None;
        Ok(())
    }

    pub fn status(&self) -> Result<SynapseStatus, AppError> {
        let mut guard = self
            .client
            .lock()
            .map_err(|e| AppError::internal(format!("Lock error: {e}")))?;
        if let Some(ref mut client) = *guard {
            if let Ok(tools) = client.list_tools() {
                return Ok(SynapseStatus {
                    running: true,
                    vault_path: None,
                    tool_count: tools.len(),
                });
            }
        }
        Ok(SynapseStatus {
            running: false,
            vault_path: None,
            tool_count: 0,
        })
    }

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

        let mut guard = self
            .client
            .lock()
            .map_err(|e| AppError::internal(format!("Lock error: {e}")))?;
        if let Some(ref mut client) = *guard {
            if let Ok(synapse_tools) = client.list_tools() {
                defs.extend(synapse_tools);
                return Ok(defs);
            }
        }

        // Fallback: legacy vault tools
        defs.extend([
            tools::vault_list::definition(),
            tools::vault_read::definition(),
            tools::vault_search::definition(),
            tools::vault_write::definition(),
        ]);
        Ok(defs)
    }

    /// Execute a tool call, routing through Synapse if available and the tool is
    /// known to Synapse; otherwise fall back to the legacy tool executor.
    pub fn execute_tool(
        &self,
        call: ToolCall,
        vault_path: Option<&str>,
        project_id: Option<&str>,
    ) -> Result<ToolResult, AppError> {
        let mut guard = self
            .client
            .lock()
            .map_err(|e| AppError::internal(format!("Lock error: {e}")))?;
        if let Some(ref mut client) = *guard {
            if let Ok(current_tools) = client.list_tools() {
                if current_tools
                    .iter()
                    .any(|t| t.function.name == call.tool_name)
                {
                    return client
                        .call(&call.tool_name, call.arguments.clone())
                        .map(|r| ToolResult {
                            call_id: call.call_id.clone(),
                            result: r,
                            is_error: false,
                        })
                        .map_err(|e| AppError::internal(e));
                }
            }
        }
        drop(guard);

        Ok(tools::execute_tool(&call, vault_path, project_id))
    }

    /// Direct Synapse call (thin proxy for UI-driven operations).
    pub fn call(&self, tool: &str, args: serde_json::Value) -> Result<serde_json::Value, AppError> {
        let mut guard = self
            .client
            .lock()
            .map_err(|e| AppError::internal(format!("Lock error: {e}")))?;
        let client = guard
            .as_mut()
            .ok_or_else(|| AppError::internal("Synapse MCP not running"))?;
        client
            .call_unwrapped(tool, args)
            .map_err(|e| AppError::internal(e))
    }
}
