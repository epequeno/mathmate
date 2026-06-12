use super::{FunctionDef, ToolDefinition};

const MAX_EXPRESSION_LENGTH: usize = 500;

/// OpenAI-compatible tool definition for `calculate`.
pub fn definition() -> ToolDefinition {
    ToolDefinition {
        tool_type: "function".to_string(),
        function: FunctionDef {
            name: "calculate".to_string(),
            description: "Evaluate a numeric mathematical expression safely. Supports basic arithmetic (+, -, *, /, ^), trigonometric functions (sin, cos, tan, asin, acos, atan), logarithms (log, ln, log2, log10), and constants (pi, e). Returns the numeric result.".to_string(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "expression": {
                        "type": "string",
                        "description": "Numeric expression to evaluate, e.g. '2 + 3 * 4', 'sin(pi/2)', 'sqrt(144)', '2^10'"
                    }
                },
                "required": ["expression"]
            }),
        },
    }
}

/// Execute the `calculate` tool.
///
/// Uses `meval` for safe numeric evaluation. No symbolic CAS, no code execution.
/// Returns `{ "value": number }` on success or `{ "error": string }` on failure.
pub fn execute(args: &serde_json::Value) -> Result<serde_json::Value, String> {
    let expression = args["expression"]
        .as_str()
        .ok_or("Missing required parameter: expression")?;

    if expression.is_empty() {
        return Err("Expression is empty".to_string());
    }

    if expression.len() > MAX_EXPRESSION_LENGTH {
        return Err(format!(
            "Expression too long ({} chars, max {})",
            expression.len(),
            MAX_EXPRESSION_LENGTH
        ));
    }

    // Evaluate using meval — safe numeric-only evaluation
    let result: f64 =
        meval::eval_str(expression).map_err(|e| format!("Evaluation error: {}", e))?;

    // Check for non-finite results
    if !result.is_finite() {
        return Ok(serde_json::json!({
            "value": if result.is_infinite() {
                if result.is_sign_positive() { "Infinity" } else { "-Infinity" }
            } else {
                "NaN"
            },
            "expression": expression
        }));
    }

    Ok(serde_json::json!({
        "value": result,
        "expression": expression
    }))
}

// ─── Tests ──────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn call(expr: &str) -> serde_json::Value {
        execute(&serde_json::json!({ "expression": expr })).unwrap()
    }

    fn call_err(expr: &str) -> String {
        execute(&serde_json::json!({ "expression": expr })).unwrap_err()
    }

    #[test]
    fn test_basic_arithmetic() {
        assert_eq!(call("2 + 3")["value"], 5.0);
        assert_eq!(call("10 - 4")["value"], 6.0);
        assert_eq!(call("3 * 7")["value"], 21.0);
        assert_eq!(call("15 / 3")["value"], 5.0);
        assert_eq!(call("2 ^ 10")["value"], 1024.0);
    }

    #[test]
    fn test_order_of_operations() {
        assert_eq!(call("2 + 3 * 4")["value"], 14.0);
        assert_eq!(call("(2 + 3) * 4")["value"], 20.0);
        assert_eq!(call("2 * 3 + 4 * 5")["value"], 26.0);
    }

    #[test]
    fn test_trig_functions() {
        let sin_half = call("sin(pi/2)")["value"].as_f64().unwrap();
        assert!((sin_half - 1.0).abs() < 1e-10);

        let cos_zero = call("cos(0)")["value"].as_f64().unwrap();
        assert!((cos_zero - 1.0).abs() < 1e-10);
    }

    #[test]
    fn test_logarithms() {
        let ln_e = call("ln(e)")["value"].as_f64().unwrap();
        assert!((ln_e - 1.0).abs() < 1e-10);

        // ln(1) = 0
        let ln_1 = call("ln(1)")["value"].as_f64().unwrap();
        assert!((ln_1).abs() < 1e-10);
    }

    #[test]
    fn test_sqrt_and_abs() {
        assert_eq!(call("sqrt(144)")["value"], 12.0);
        assert_eq!(call("abs(-42)")["value"], 42.0);
    }

    #[test]
    fn test_invalid_expression() {
        let err = call_err("foo(bar)");
        assert!(err.contains("Evaluation error"));
    }

    #[test]
    fn test_empty_expression() {
        let err = call_err("");
        assert!(err.contains("empty"));
    }

    #[test]
    fn test_missing_parameter() {
        let result = execute(&serde_json::json!({}));
        assert!(result.is_err());
    }

    #[test]
    fn test_expression_too_long() {
        let long_expr = "1+".repeat(300);
        let err = call_err(&long_expr);
        assert!(err.contains("too long"));
    }
}
