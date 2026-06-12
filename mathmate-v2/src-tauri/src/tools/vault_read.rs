use super::{FunctionDef, ToolDefinition};
use std::path::PathBuf;

/// OpenAI-compatible tool definition for `vault_read`.
pub fn definition() -> ToolDefinition {
    ToolDefinition {
        tool_type: "function".to_string(),
        function: FunctionDef {
            name: "vault_read".to_string(),
            description: "Read the full content of a specific markdown file from the vault by \
                          its relative path (e.g. \"PROGRESS.md\", \"Chapters/Ch01/README.md\"). \
                          Use vault_list first to discover available file paths, then vault_read \
                          to load the content before updating it with vault_write."
                .to_string(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Relative path within the vault (e.g. \"PROGRESS.md\")"
                    }
                },
                "required": ["path"]
            }),
        },
    }
}

/// Execute the `vault_read` tool.
pub fn execute(
    args: &serde_json::Value,
    vault_path: Option<&str>,
) -> Result<serde_json::Value, String> {
    let rel_path = args["path"]
        .as_str()
        .ok_or("Missing required parameter: path")?
        .trim();

    if rel_path.is_empty() {
        return Err("path is empty".to_string());
    }

    let vault_root = vault_path.ok_or(
        "No vault path configured for this project. Set a vault path in project settings.",
    )?;

    let root = PathBuf::from(vault_root);

    // Reject path traversal
    let norm = rel_path.replace('\\', "/");
    for component in norm.split('/') {
        if component == ".." {
            return Err(format!("Path traversal not allowed: '{}'", rel_path));
        }
    }

    let target = root.join(&norm);

    // Verify the target stays inside the vault
    let canon_root = root
        .canonicalize()
        .map_err(|e| format!("Cannot resolve vault root: {}", e))?;
    let canon_target = target
        .canonicalize()
        .map_err(|_| format!("File not found: '{}'", rel_path))?;

    if !canon_target.starts_with(&canon_root) {
        return Err(format!("Path '{}' is outside the vault", rel_path));
    }

    let content = std::fs::read_to_string(&canon_target)
        .map_err(|e| format!("Failed to read '{}': {}", rel_path, e))?;

    Ok(serde_json::json!({
        "path": rel_path,
        "content": content,
        "bytes": content.len()
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_no_vault_path() {
        let result = execute(&serde_json::json!({ "path": "note.md" }), None);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("No vault path"));
    }

    #[test]
    fn test_missing_path_param() {
        let result = execute(&serde_json::json!({}), Some("/tmp"));
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("path"));
    }

    #[test]
    fn test_traversal_rejected() {
        let result = execute(
            &serde_json::json!({ "path": "../../etc/passwd" }),
            Some("/tmp"),
        );
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("traversal"));
    }

    #[test]
    fn test_missing_file() {
        let result = execute(
            &serde_json::json!({ "path": "nonexistent_xyz.md" }),
            Some("/tmp"),
        );
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("not found"));
    }
}
