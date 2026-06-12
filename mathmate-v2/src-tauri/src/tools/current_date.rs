use super::{FunctionDef, ToolDefinition};

/// OpenAI-compatible tool definition for `get_current_date`.
pub fn definition() -> ToolDefinition {
    ToolDefinition {
        tool_type: "function".to_string(),
        function: FunctionDef {
            name: "get_current_date".to_string(),
            description: "Get the current date and time. Use this ANY time you need today's date — for file names, study logs, progress entries, or answering time-sensitive questions. Do NOT guess or infer the date; always call this tool to get the exact current date."
                .to_string(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {}
            }),
        },
    }
}

/// Execute the `get_current_date` tool.
///
/// Returns the current local date and time in multiple formats:
/// - `date`: YYYY-MM-DD (for file names, study logs)
/// - `iso`: RFC 3339 full timestamp (for general use)
/// - `day_of_week`: Monday, Tuesday, etc.
/// - `year`, `month`, `day`: individual components
pub fn execute() -> Result<serde_json::Value, String> {
    let now = chrono::Local::now();
    Ok(serde_json::json!({
        "date": now.format("%Y-%m-%d").to_string(),
        "iso": now.to_rfc3339(),
        "day_of_week": now.format("%A").to_string(),
        "year": now.format("%Y").to_string(),
        "month": now.format("%m").to_string(),
        "day": now.format("%d").to_string(),
    }))
}

// ─── Tests ──────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_returns_valid_date() {
        let result = execute().unwrap();
        let date = result["date"].as_str().unwrap();
        assert_eq!(date.len(), 10, "Date should be YYYY-MM-DD");
        assert_eq!(date.chars().nth(4), Some('-'), "Missing first dash");
        assert_eq!(date.chars().nth(7), Some('-'), "Missing second dash");
    }

    #[test]
    fn test_iso_is_rfc3339() {
        let result = execute().unwrap();
        let iso = result["iso"].as_str().unwrap();
        assert!(iso.contains('T'), "ISO should contain time separator");
        assert!(iso.contains(':'), "ISO should contain time");
    }

    #[test]
    fn test_day_of_week_is_valid() {
        let result = execute().unwrap();
        let dow = result["day_of_week"].as_str().unwrap();
        let valid = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
        assert!(valid.contains(&dow), "Invalid day of week: {}", dow);
    }

    #[test]
    fn test_numeric_parts_are_parseable() {
        let result = execute().unwrap();
        let year: u32 = result["year"].as_str().unwrap().parse().unwrap();
        let month: u32 = result["month"].as_str().unwrap().parse().unwrap();
        let day: u32 = result["day"].as_str().unwrap().parse().unwrap();
        assert!(year >= 2025, "Year should be >= 2025");
        assert!((1..=12).contains(&month), "Month out of range");
        assert!((1..=31).contains(&day), "Day out of range");
    }
}
