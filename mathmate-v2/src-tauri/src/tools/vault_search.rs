use super::{FunctionDef, ToolDefinition};

const MAX_RESULTS: usize = 10;
const DEFAULT_MAX_RESULTS: usize = 5;
const MAX_SNIPPET_LENGTH: usize = 500;
const MAX_QUERY_LENGTH: usize = 200;

/// OpenAI-compatible tool definition for `vault_search`.
pub fn definition() -> ToolDefinition {
    ToolDefinition {
        tool_type: "function".to_string(),
        function: FunctionDef {
            name: "vault_search".to_string(),
            description: "Search MathMate vault notes for relevant snippets. Returns matching note excerpts with source file paths. Useful for finding definitions, theorems, worked examples, or student notes.".to_string(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Search query (keywords or phrase), e.g. 'quadratic formula', 'integration by parts'"
                    },
                    "max_results": {
                        "type": "integer",
                        "description": "Maximum number of results to return (default: 5, max: 10)",
                        "default": DEFAULT_MAX_RESULTS,
                        "minimum": 1,
                        "maximum": MAX_RESULTS
                    }
                },
                "required": ["query"]
            }),
        },
    }
}

/// Execute the `vault_search` tool.
///
/// Performs a simple case-insensitive keyword search across vault notes.
/// Returns `{ "results": [...], "query": ..., "total_notes_scanned": ... }`.
pub fn execute(
    args: &serde_json::Value,
    vault_path: Option<&str>,
) -> Result<serde_json::Value, String> {
    let query = args["query"]
        .as_str()
        .ok_or("Missing required parameter: query")?;

    if query.is_empty() {
        return Err("Query is empty".to_string());
    }

    if query.len() > MAX_QUERY_LENGTH {
        return Err(format!(
            "Query too long ({} chars, max {})",
            query.len(),
            MAX_QUERY_LENGTH
        ));
    }

    let vault_path = vault_path.ok_or(
        "No vault path configured for this project. Set a vault path in project settings.",
    )?;

    let max_results = args["max_results"]
        .as_u64()
        .map(|n| n as usize)
        .unwrap_or(DEFAULT_MAX_RESULTS)
        .min(MAX_RESULTS);

    // Scan vault for notes
    let notes =
        crate::vault::scan_vault(vault_path).map_err(|e| format!("Failed to scan vault: {}", e))?;

    let total_notes = notes.len();

    // Simple keyword search: split query into terms, score by matches
    let query_terms: Vec<String> = query
        .to_lowercase()
        .split_whitespace()
        .map(|s| s.to_string())
        .collect();

    let mut scored: Vec<(f64, &crate::vault::VaultNote, String)> = Vec::new();

    for note in &notes {
        // Read note content
        let content = match crate::vault::read_note(&note.path) {
            Ok(c) => c,
            Err(_) => continue, // Skip unreadable notes
        };

        let content_lower = content.to_lowercase();
        let title_lower = note.title.to_lowercase();

        // Score: each query term match in title or content
        let mut score: f64 = 0.0;
        let mut matched = true;

        for term in &query_terms {
            if title_lower.contains(term) {
                score += 3.0; // Title match is worth more
            } else if content_lower.contains(term) {
                score += 1.0;
            } else {
                matched = false;
                break;
            }
        }

        if !matched || score == 0.0 {
            continue;
        }

        // Extract a snippet around the first match
        let snippet = extract_snippet(&content, &query_terms, MAX_SNIPPET_LENGTH);

        scored.push((score, note, snippet));
    }

    // Sort by score descending
    scored.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));

    // Take top results
    let results: Vec<serde_json::Value> = scored
        .iter()
        .take(max_results)
        .map(|(score, note, snippet)| {
            serde_json::json!({
                "path": note.path,
                "title": note.title,
                "score": score,
                "snippet": snippet,
                "tags": note.tags
            })
        })
        .collect();

    Ok(serde_json::json!({
        "results": results,
        "query": query,
        "total_notes_scanned": total_notes,
        "matches_found": scored.len()
    }))
}

/// Extract a text snippet around the first occurrence of any query term.
fn extract_snippet(content: &str, terms: &[String], max_len: usize) -> String {
    let content_lower = content.to_lowercase();

    // Find the position of the first match
    let mut best_pos: Option<usize> = None;
    for term in terms {
        if let Some(pos) = content_lower.find(term) {
            match best_pos {
                None => best_pos = Some(pos),
                Some(existing) if pos < existing => best_pos = Some(pos),
                _ => {}
            }
        }
    }

    let start = match best_pos {
        Some(pos) => {
            // Start a bit before the match for context
            let context_before = 80;
            if pos > context_before {
                // Find a word boundary
                let rough_start = pos - context_before;
                content[rough_start..]
                    .char_indices()
                    .nth(1)
                    .map(|(i, _)| rough_start + i)
                    .unwrap_or(rough_start)
            } else {
                0
            }
        }
        None => 0,
    };

    let snippet: String = content.chars().skip(start).take(max_len).collect();

    // Clean up: trim to last complete sentence if possible
    if snippet.len() == max_len {
        if let Some(last_period) = snippet.rfind(". ") {
            snippet[..last_period + 1].to_string()
        } else {
            snippet + "..."
        }
    } else {
        snippet
    }
}

// ─── Tests ──────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_missing_query() {
        let result = execute(&serde_json::json!({}), Some("/tmp/vault"));
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Missing"));
    }

    #[test]
    fn test_empty_query() {
        let result = execute(&serde_json::json!({ "query": "" }), Some("/tmp/vault"));
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("empty"));
    }

    #[test]
    fn test_no_vault_path() {
        let result = execute(&serde_json::json!({ "query": "test" }), None);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("No vault path"));
    }

    #[test]
    fn test_query_too_long() {
        let long_query = "a".repeat(300);
        let result = execute(
            &serde_json::json!({ "query": long_query }),
            Some("/tmp/vault"),
        );
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("too long"));
    }

    #[test]
    fn test_extract_snippet_basic() {
        let content = "This is a test document about quadratic equations and integration by parts.";
        let terms = vec!["quadratic".to_string()];
        let snippet = extract_snippet(content, &terms, 50);
        assert!(snippet.to_lowercase().contains("quadratic"));
    }
}
