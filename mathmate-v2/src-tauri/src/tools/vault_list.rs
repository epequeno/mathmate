use super::{FunctionDef, ToolDefinition};
use std::path::PathBuf;

/// OpenAI-compatible tool definition for `vault_list`.
pub fn definition() -> ToolDefinition {
    ToolDefinition {
        tool_type: "function".to_string(),
        function: FunctionDef {
            name: "vault_list".to_string(),
            description: "List all markdown files in the project vault with their relative paths. \
                          Call this FIRST before vault_write so you know what files already exist \
                          and can update an existing file instead of creating a duplicate."
                .to_string(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {},
                "required": []
            }),
        },
    }
}

/// Execute the `vault_list` tool.
pub fn execute(vault_path: Option<&str>) -> Result<serde_json::Value, String> {
    let vault_root = vault_path.ok_or(
        "No vault path configured for this project. Set a vault path in project settings.",
    )?;

    let root = PathBuf::from(vault_root);
    if !root.exists() {
        return Err(format!("Vault directory does not exist: {}", vault_root));
    }

    let mut files: Vec<serde_json::Value> = Vec::new();
    collect_md_files(&root, &root, &mut files)?;

    // Sort by relative path for stable, readable output
    files.sort_by(|a, b| {
        let pa = a["relative_path"].as_str().unwrap_or("");
        let pb = b["relative_path"].as_str().unwrap_or("");
        pa.cmp(pb)
    });

    Ok(serde_json::json!({
        "files": files,
        "total": files.len(),
        "vault_root": vault_root
    }))
}

fn collect_md_files(
    root: &std::path::Path,
    dir: &std::path::Path,
    out: &mut Vec<serde_json::Value>,
) -> Result<(), String> {
    let entries = std::fs::read_dir(dir)
        .map_err(|e| format!("Cannot read directory '{}': {}", dir.display(), e))?;

    for entry in entries.flatten() {
        let path = entry.path();
        let name = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_string();

        // Skip hidden files/dirs
        if name.starts_with('.') {
            continue;
        }

        if path.is_dir() {
            collect_md_files(root, &path, out)?;
        } else if path.is_file() {
            let ext = path
                .extension()
                .and_then(|e| e.to_str())
                .map(|e| e.to_lowercase())
                .unwrap_or_default();
            if ext != "md" {
                continue;
            }
            let rel = path
                .strip_prefix(root)
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_else(|_| name.clone());
            let size = std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
            out.push(serde_json::json!({
                "relative_path": rel,
                "filename": name,
                "size_bytes": size
            }));
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_no_vault_path() {
        let result = execute(None);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("No vault path"));
    }

    #[test]
    fn test_nonexistent_vault() {
        let result = execute(Some("/tmp/mathmate_nonexistent_vault_xyz"));
        assert!(result.is_err());
    }
}
