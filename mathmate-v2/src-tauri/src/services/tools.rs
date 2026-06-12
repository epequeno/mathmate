// ─── Tool Service ────────────────────────────────────────────────────
//
// Exposes the tool registry (definitions) and execution engine.
// Stateless — delegates directly to `crate::tools` functions.
//
// See: Implementation_Phase14C_RustServiceLayer.md § C.6

pub use crate::tools::{ToolCall, ToolDefinition, ToolResult};

use crate::error::AppError;

pub struct ToolService;

impl ToolService {
    pub fn new() -> Self {
        Self
    }

    /// Return all available tool definitions (OpenAI-compatible format).
    #[allow(dead_code)] // wired when tool commands migrate with SynapseService
    pub fn definitions(&self) -> Vec<ToolDefinition> {
        crate::tools::get_tool_definitions()
    }

    /// Execute a tool call with optional vault + project context.
    #[allow(dead_code)]
    pub fn execute(
        &self,
        call: &ToolCall,
        vault_path: Option<&str>,
        project_id: Option<&str>,
    ) -> Result<ToolResult, AppError> {
        Ok(crate::tools::execute_tool(call, vault_path, project_id))
    }
}
