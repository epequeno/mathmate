use super::{FunctionDef, ToolDefinition};
use crate::textbook_index;
use crate::project;

/// Definition for the `search_textbook` tool (OpenAI-compatible).
pub fn definition() -> ToolDefinition {
    ToolDefinition {
        tool_type: "function".into(),
        function: FunctionDef {
            name: "search_textbook".into(),
            description: "Search the current project's textbook for relevant content. \
                         Use this when the user asks about specific topics, sections, \
                         exercises, or page numbers from their textbook. \
                         Returns page numbers and text snippets that match the query. \
                         Only available when a textbook has been set and indexed for this project."
                .into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "What to search for — topic, section number, exercise number, or any text to find in the textbook."
                    },
                    "max_results": {
                        "type": "number",
                        "description": "Maximum number of page results to return (default 5, max 10)",
                        "default": 5
                    }
                },
                "required": ["query"]
            }),
        },
    }
}

/// Execute the `search_textbook` tool.
///
/// Resolves the project → textbook path → index → search → return matches.
pub fn execute(
    arguments: &serde_json::Value,
    project_id: Option<&str>,
) -> Result<serde_json::Value, String> {
    // 1. Validate project_id
    let pid = project_id.ok_or_else(|| {
        "No project selected — cannot search textbook. Please open or create a project first."
            .to_string()
    })?;

    // 2. Load project to get textbook path
    let project = project::load_project(pid)?;
    let pdf_path = project.textbook_path.ok_or_else(|| {
        "No textbook is set for this project. Set a textbook path in Project Settings or download one from the Free Textbook Catalog."
            .to_string()
    })?;

    // 3. Derive textbook ID
    let textbook_id = textbook_index::derive_textbook_id(&pdf_path);

    // 4. Check index exists
    if !textbook_index::is_indexed(&textbook_id) {
        // Check if index is in progress
        match textbook_index::load_meta(&textbook_id) {
            Ok(meta) => {
                return Err(format!(
                    "Textbook is currently being indexed ({}/{} pages). \
                     Try again once indexing completes. \
                     Open the Book tab to start or continue indexing.",
                    meta.indexed_pages, meta.total_pages
                ));
            }
            Err(_) => {
                return Err(
                    "This textbook hasn't been indexed for search yet. \
                     Open it in the Book tab to start indexing, then try searching again."
                        .to_string(),
                );
            }
        }
    }

    // 5. Load index
    let index = textbook_index::load_index(&textbook_id)?;

    // 6. Parse arguments
    let query_str = arguments
        .get("query")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "Missing 'query' parameter — specify what to search for.".to_string())?;

    let max_results = arguments
        .get("max_results")
        .and_then(|v| v.as_u64())
        .map(|n| (n as usize).min(10))
        .unwrap_or(5);

    // 7. Search
    let query = textbook_index::SearchQuery {
        query: query_str.to_string(),
        max_results: Some(max_results),
    };

    let results = textbook_index::search_index(&index, &query);

    // 8. Format results
    if results.is_empty() {
        return Ok(serde_json::json!({
            "found": 0,
            "message": format!(
                "No matches found for '{}' in the current textbook. Try different keywords.",
                query_str
            ),
            "results": []
        }));
    }

    let formatted: Vec<serde_json::Value> = results
        .iter()
        .map(|r| {
            serde_json::json!({
                "page": r.page,
                "snippet": r.snippet,
                "relevance_score": (r.score * 100.0).round() / 100.0
            })
        })
        .collect();

    Ok(serde_json::json!({
        "found": formatted.len(),
        "query": query_str,
        "results": formatted,
        "message": format!("Found {} page{} matching '{}'.", formatted.len(), if formatted.len() == 1 { "" } else { "s" }, query_str)
    }))
}