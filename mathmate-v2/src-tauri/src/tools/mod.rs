#![allow(dead_code)]
pub mod calculate;
pub mod current_date;
pub mod graph;
pub mod textbook_search;
pub mod vault_list;
pub mod vault_read;
pub mod vault_search;
pub mod vault_write;

use serde::{Deserialize, Serialize};
#[cfg(feature = "export-types")]
use ts_rs::TS;

// ─── Tool Definition (OpenAI-compatible) ────────────────────────────────────

/// OpenAI-compatible tool definition for function calling.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "export-types", derive(TS))]
#[cfg_attr(feature = "export-types", ts(export, export_to = "tool.ts"))]
pub struct ToolDefinition {
    #[serde(rename = "type")]
    pub tool_type: String,
    pub function: FunctionDef,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "export-types", derive(TS))]
#[cfg_attr(feature = "export-types", ts(export, export_to = "tool.ts"))]
pub struct FunctionDef {
    pub name: String,
    pub description: String,
    pub parameters: serde_json::Value,
}

// ─── Tool Call (from model) ─────────────────────────────────────────────────

/// A tool call emitted by the model during streaming.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "export-types", derive(TS))]
#[cfg_attr(feature = "export-types", ts(export, export_to = "tool.ts"))]
pub struct ToolCall {
    pub call_id: String,
    pub tool_name: String,
    pub arguments: serde_json::Value,
}

// ─── Tool Result ────────────────────────────────────────────────────────────

/// The result of executing a tool.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "export-types", derive(TS))]
#[cfg_attr(feature = "export-types", ts(export, export_to = "tool.ts"))]
pub struct ToolResult {
    pub call_id: String,
    pub result: serde_json::Value,
    pub is_error: bool,
}

// ─── Registry ───────────────────────────────────────────────────────────────

/// Get all available tool definitions (OpenAI-compatible format).
#[allow(dead_code)]
pub fn get_tool_definitions() -> Vec<ToolDefinition> {
    vec![
        calculate::definition(),
        current_date::definition(),
        graph::definition(),
        textbook_search::definition(),
        vault_list::definition(),
        vault_read::definition(),
        vault_search::definition(),
        vault_write::definition(),
    ]
}

/// Execute a tool call and return the result.
///
/// Dispatches to the appropriate executor based on tool_name.
/// Returns a structured error for unknown tools.
pub fn execute_tool(call: &ToolCall, vault_path: Option<&str>, project_id: Option<&str>) -> ToolResult {
    let result = match call.tool_name.as_str() {
        "calculate" => calculate::execute(&call.arguments),
        "get_current_date" => current_date::execute(),
        "graph" => graph::execute(&call.arguments),
        "search_textbook" => textbook_search::execute(&call.arguments, project_id),
        "vault_list" => vault_list::execute(vault_path),
        "vault_read" => vault_read::execute(&call.arguments, vault_path),
        "vault_search" => vault_search::execute(&call.arguments, vault_path),
        "vault_write" => vault_write::execute(&call.arguments, vault_path),
        _ => Err(format!("Unknown tool: {}", call.tool_name)),
    };

    match result {
        Ok(value) => ToolResult {
            call_id: call.call_id.clone(),
            result: value,
            is_error: false,
        },
        Err(err) => ToolResult {
            call_id: call.call_id.clone(),
            result: serde_json::json!({ "error": err }),
            is_error: true,
        },
    }
}

// ─── Tests ──────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_get_tool_definitions_count() {
        let defs = get_tool_definitions();
        assert_eq!(defs.len(), 8, "Should have 8 tool definitions");
        assert_eq!(defs[0].function.name, "calculate");
        assert_eq!(defs[1].function.name, "get_current_date");
        assert_eq!(defs[2].function.name, "graph");
        assert_eq!(defs[3].function.name, "search_textbook");
        assert_eq!(defs[4].function.name, "vault_list");
        assert_eq!(defs[5].function.name, "vault_read");
        assert_eq!(defs[6].function.name, "vault_search");
        assert_eq!(defs[7].function.name, "vault_write");
    }

    #[test]
    fn test_execute_unknown_tool() {
        let call = ToolCall {
            call_id: "call-1".to_string(),
            tool_name: "nonexistent".to_string(),
            arguments: serde_json::json!({}),
        };
        let result = execute_tool(&call, None, None);
        assert!(result.is_error);
        assert!(result.result["error"]
            .as_str()
            .unwrap()
            .contains("Unknown tool"));
    }

    #[test]
    fn test_tool_definitions_are_openai_compatible() {
        let defs = get_tool_definitions();
        for def in &defs {
            assert_eq!(def.tool_type, "function");
            assert!(!def.function.name.is_empty());
            assert!(!def.function.description.is_empty());
            // Parameters should be a valid JSON object with "type": "object"
            assert_eq!(def.function.parameters["type"], "object");
        }
    }
}
