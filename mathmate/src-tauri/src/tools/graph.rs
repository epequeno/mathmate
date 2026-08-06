use super::{FunctionDef, ToolDefinition};

const DEFAULT_XMIN: f64 = -10.0;
const DEFAULT_XMAX: f64 = 10.0;
const DEFAULT_STEPS: usize = 200;
const MIN_STEPS: usize = 32;
const MAX_STEPS: usize = 1000;
const MAX_EXPRESSION_LENGTH: usize = 500;

/// OpenAI-compatible tool definition for `graph`.
pub fn definition() -> ToolDefinition {
    ToolDefinition {
        tool_type: "function".to_string(),
        function: FunctionDef {
            name: "graph".to_string(),
            description: "Generate 2D function plot points for y=f(x). Returns an array of [x, y] coordinate pairs suitable for plotting. Supports standard math functions (sin, cos, tan, log, sqrt, abs, etc.) and constants (pi, e).".to_string(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "expression": {
                        "type": "string",
                        "description": "Mathematical expression in terms of x, e.g. 'sin(x)', 'x^2 - 3*x + 1', 'exp(-x^2)'"
                    },
                    "xmin": {
                        "type": "number",
                        "description": "Minimum x value (default: -10)",
                        "default": DEFAULT_XMIN
                    },
                    "xmax": {
                        "type": "number",
                        "description": "Maximum x value (default: 10)",
                        "default": DEFAULT_XMAX
                    },
                    "steps": {
                        "type": "integer",
                        "description": "Number of sample points (default: 200, min: 32, max: 1000)",
                        "default": DEFAULT_STEPS,
                        "minimum": MIN_STEPS,
                        "maximum": MAX_STEPS
                    }
                },
                "required": ["expression"]
            }),
        },
    }
}

/// Execute the `graph` tool.
///
/// Evaluates y=f(x) at `steps` evenly-spaced points from xmin to xmax.
/// Returns `{ "type": "function_2d", "expression": ..., "points": [[x,y],...], "meta": {...} }`.
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

    let xmin = args["xmin"].as_f64().unwrap_or(DEFAULT_XMIN);
    let xmax = args["xmax"].as_f64().unwrap_or(DEFAULT_XMAX);

    if xmin >= xmax {
        return Err(format!("xmin ({}) must be less than xmax ({})", xmin, xmax));
    }

    let steps = args["steps"]
        .as_u64()
        .map(|s| s as usize)
        .unwrap_or(DEFAULT_STEPS)
        .clamp(MIN_STEPS, MAX_STEPS);

    // Compile the expression with meval
    use std::str::FromStr;
    let expr = meval::Expr::from_str(expression)
        .map_err(|e| format!("Failed to parse expression: {}", e))?;

    // Create a function context with `x` as the variable
    let func = expr
        .bind("x")
        .map_err(|e| format!("Failed to bind variable x: {}", e))?;

    // Sample points
    let dx = (xmax - xmin) / (steps as f64 - 1.0);
    let mut points: Vec<Vec<f64>> = Vec::with_capacity(steps);

    for i in 0..steps {
        let x = xmin + dx * i as f64;
        let y = func(x);
        if y.is_finite() {
            points.push(vec![round_f64(x, 6), round_f64(y, 6)]);
        }
        // Skip non-finite points (NaN, Inf) — they create gaps in the plot
    }

    Ok(serde_json::json!({
        "type": "function_2d",
        "expression": expression,
        "points": points,
        "meta": {
            "xmin": xmin,
            "xmax": xmax,
            "steps": steps,
            "plottable_points": points.len()
        }
    }))
}

/// Round a float to `digits` decimal places for cleaner JSON output.
fn round_f64(val: f64, digits: u32) -> f64 {
    let factor = 10f64.powi(digits as i32);
    (val * factor).round() / factor
}

// ─── Tests ──────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn call(args: serde_json::Value) -> serde_json::Value {
        execute(&args).unwrap()
    }

    fn call_err(args: serde_json::Value) -> String {
        execute(&args).unwrap_err()
    }

    #[test]
    fn test_basic_parabola() {
        let result = call(serde_json::json!({
            "expression": "x^2",
            "xmin": -2.0,
            "xmax": 2.0,
            "steps": 200
        }));
        assert_eq!(result["type"], "function_2d");
        assert_eq!(result["expression"], "x^2");
        let points = result["points"].as_array().unwrap();
        assert_eq!(points.len(), 200);
        // x≈0 -> y≈0 (middle of -2..2 range)
        let mid = points.len() / 2;
        assert!((points[mid][1].as_f64().unwrap()).abs() < 0.02);
    }

    #[test]
    fn test_sine_wave() {
        let result = call(serde_json::json!({
            "expression": "sin(x)",
            "xmin": 0.0,
            "xmax": 6.283185,
            "steps": 100
        }));
        let points = result["points"].as_array().unwrap();
        assert!(points.len() >= 90); // Most points should be finite
                                     // sin(0) ≈ 0
        assert!((points[0][1].as_f64().unwrap()).abs() < 0.01);
    }

    #[test]
    fn test_default_parameters() {
        let result = call(serde_json::json!({
            "expression": "x"
        }));
        let meta = &result["meta"];
        assert_eq!(meta["xmin"], DEFAULT_XMIN);
        assert_eq!(meta["xmax"], DEFAULT_XMAX);
        assert_eq!(meta["steps"], DEFAULT_STEPS);
    }

    #[test]
    fn test_steps_clamped() {
        let result = call(serde_json::json!({
            "expression": "x",
            "steps": 5
        }));
        assert_eq!(result["meta"]["steps"], MIN_STEPS); // Clamped to min
    }

    #[test]
    fn test_invalid_expression() {
        let err = call_err(serde_json::json!({
            "expression": "foo(x)"
        }));
        assert!(err.contains("parse") || err.contains("bind"));
    }

    #[test]
    fn test_xmin_gte_xmax() {
        let err = call_err(serde_json::json!({
            "expression": "x",
            "xmin": 10,
            "xmax": 0
        }));
        assert!(err.contains("less than"));
    }

    #[test]
    fn test_missing_expression() {
        let err = call_err(serde_json::json!({}));
        assert!(err.contains("Missing"));
    }

    #[test]
    fn test_discontinuity_filtered() {
        // 1/x at x=0: meval evaluates as Inf which is filtered out
        let result = call(serde_json::json!({
            "expression": "1/x",
            "xmin": -1.0,
            "xmax": 1.0,
            "steps": 200
        }));
        let points = result["points"].as_array().unwrap();
        // All returned points should have finite y values
        for p in points {
            let y = p[1].as_f64().unwrap();
            assert!(y.is_finite(), "y should be finite, got {}", y);
        }
    }
}
