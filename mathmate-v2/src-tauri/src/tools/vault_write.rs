use super::{FunctionDef, ToolDefinition};
use std::path::{Path, PathBuf};

/// OpenAI-compatible tool definition for `vault_write`.
pub fn definition() -> ToolDefinition {
    ToolDefinition {
        tool_type: "function".to_string(),
        function: FunctionDef {
            name: "vault_write".to_string(),
            description: "Create or overwrite a markdown note in the project vault. \
                          The path must be relative to the vault root (e.g. \"PROGRESS.md\" \
                          or \"MathMate/Study Logs/session.md\"). \
                          Parent directories are created automatically. \
                          Use this to save progress notes, study logs, or any structured content."
                .to_string(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Relative path within the vault (e.g. \"PROGRESS.md\", \"MathMate/Study Logs/2026-06-02.md\")"
                    },
                    "content": {
                        "type": "string",
                        "description": "Full markdown content to write to the file"
                    }
                },
                "required": ["path", "content"]
            }),
        },
    }
}

/// Execute the `vault_write` tool.
pub fn execute(
    args: &serde_json::Value,
    vault_path: Option<&str>,
) -> Result<serde_json::Value, String> {
    let rel_path = args["path"]
        .as_str()
        .ok_or("Missing required parameter: path")?
        .trim();
    let content = args["content"]
        .as_str()
        .ok_or("Missing required parameter: content")?;

    if rel_path.is_empty() {
        return Err("path is empty".to_string());
    }
    if content.len() > 1_000_000 {
        return Err(format!(
            "content too large ({} bytes, max 1MB)",
            content.len()
        ));
    }

    let vault_root = vault_path.ok_or(
        "No vault path configured for this project. Set a vault path in project settings.",
    )?;

    let vault_root = PathBuf::from(vault_root);

    // Security: normalise and confirm the resolved path stays inside the vault
    let target = resolve_and_check(&vault_root, rel_path)?;

    // Create parent directories if needed
    if let Some(parent) = target.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create directories for '{}': {}", rel_path, e))?;
    }

    let bytes = content.len() as u64;
    std::fs::write(&target, content)
        .map_err(|e| format!("Failed to write '{}': {}", rel_path, e))?;

    Ok(serde_json::json!({
        "path": target.to_string_lossy(),
        "relative_path": rel_path,
        "bytes_written": bytes,
        "created": true
    }))
}

/// Resolve `rel` against `root` and verify the canonical path stays inside `root`.
fn resolve_and_check(root: &Path, rel: &str) -> Result<PathBuf, String> {
    // Reject obvious traversal attempts before touching the filesystem
    let norm = rel.replace('\\', "/");
    for component in norm.split('/') {
        if component == ".." {
            return Err(format!("Path traversal not allowed: '{}'", rel));
        }
    }

    let joined = root.join(&norm);

    // Canonicalise the root (it must exist since the vault was already set up)
    let canon_root = root
        .canonicalize()
        .map_err(|e| format!("Cannot resolve vault root '{}': {}", root.display(), e))?;

    // For the target we can't canonicalise before it exists, so walk the
    // already-existing prefix and check that too.
    let existing_prefix = {
        let mut p = joined.clone();
        loop {
            if p.exists() {
                break p;
            }
            if !p.pop() {
                break joined.clone();
            }
        }
    };

    let canon_prefix = existing_prefix
        .canonicalize()
        .unwrap_or_else(|_| existing_prefix.clone());

    if !canon_prefix.starts_with(&canon_root) {
        return Err(format!("Path '{}' resolves outside the vault root", rel));
    }

    Ok(joined)
}

// ─── Tests ───────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_missing_path() {
        let result = execute(&serde_json::json!({ "content": "hi" }), Some("/tmp"));
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("path"));
    }

    #[test]
    fn test_missing_content() {
        let result = execute(&serde_json::json!({ "path": "note.md" }), Some("/tmp"));
        assert!(result.is_err());
    }

    #[test]
    fn test_no_vault_path() {
        let result = execute(
            &serde_json::json!({ "path": "note.md", "content": "hello" }),
            None,
        );
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("No vault path"));
    }

    #[test]
    fn test_traversal_rejected() {
        let result = execute(
            &serde_json::json!({ "path": "../../etc/passwd", "content": "bad" }),
            Some("/tmp"),
        );
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("traversal"));
    }
}
