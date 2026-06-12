# Implementation Plan: Tool Registry & Execution

## 1) Goal

Implement first-class tool execution in the Rust backend so the model can call trusted first-party tools during chat, and MathMate can display the full call/result timeline.

---

## 2) Scope (v1)

### In scope
- Tool registry with OpenAI-compatible function definitions.
- Rust executors for three tools:
  - `calculate` (numeric expression evaluation only),
  - `graph` (2D function plot point generation only),
  - `vault_search` (bounded vault retrieval).
- Multi-round tool loop in `chatStore` with strict safety limits.
- Tool call/result timeline segments.

### Out of scope (v1)
- Symbolic CAS features (derivatives/integrals as exact symbolic manipulation).
- Parametric/surface/scatter graph types.
- User-configurable policy UI (allow/ask/block).
- MCP / third-party tool ecosystems.

---

## 3) Protocol Contract (must be explicit)

Use OpenAI-compatible message protocol exactly:

1. Assistant emits `tool_calls`.
2. Client executes each call.
3. Client sends one `tool` role message per call:

```json
{
  "role": "tool",
  "tool_call_id": "call_123",
  "content": "{\"value\":4}"
}
```

4. Model continues with another assistant turn.

Requirements:
- Preserve original `tool_call_id` exactly.
- Support multiple tool calls in one assistant turn.
- Preserve call order.
- Cap loop with `MAX_TOOL_ROUNDS` (e.g. 3).

---

## 4) Tool Definitions

Each definition:

```rust
pub struct ToolDefinition {
    pub name: String,
    pub description: String,
    pub parameters: serde_json::Value,
}
```

### `calculate` (v1 restricted)

```json
{
  "name": "calculate",
  "description": "Evaluate a numeric mathematical expression safely.",
  "parameters": {
    "type": "object",
    "properties": {
      "expression": { "type": "string", "description": "Numeric expression, e.g. '2 + 3 * 4' or 'sin(pi/2)'" }
    },
    "required": ["expression"]
  }
}
```

Executor notes:
- Use `meval`.
- No shelling to frontend.
- Validate expression length and allowed symbol set.
- Return structured JSON: `{ "value": number }` or `{ "error": string }`.

### `graph` (v1 restricted)

```json
{
  "name": "graph",
  "description": "Generate 2D function plot points for y=f(x).",
  "parameters": {
    "type": "object",
    "properties": {
      "expression": { "type": "string" },
      "xmin": { "type": "number", "default": -10 },
      "xmax": { "type": "number", "default": 10 },
      "steps": { "type": "integer", "default": 200, "minimum": 32, "maximum": 1000 }
    },
    "required": ["expression"]
  }
}
```

Returns:

```json
{
  "type": "function_2d",
  "expression": "sin(x)",
  "points": [[0,0],[0.1,0.0998]],
  "meta": { "xmin": -10, "xmax": 10, "steps": 200 }
}
```

### `vault_search`

```json
{
  "name": "vault_search",
  "description": "Search MathMate vault notes for relevant snippets.",
  "parameters": {
    "type": "object",
    "properties": {
      "query": { "type": "string" },
      "max_results": { "type": "integer", "default": 5, "minimum": 1, "maximum": 10 }
    },
    "required": ["query"]
  }
}
```

Return bounded result snippets with source path metadata.

---

## 5) Streaming + Dispatch Architecture

## 5.1 Provider normalization (required)

`providers.ts` must normalize fragmented `delta.tool_calls` events:
- accumulate per `index`,
- stitch partial `function.name`, `id`, and `function.arguments`,
- parse arguments JSON only when complete,
- emit `tool_call_complete` chunks.

This prevents dropped/broken calls across providers.

## 5.2 Multi-round loop (`chatStore.ts`)

Flow:
1. Send user turn.
2. Stream assistant turn with tools enabled.
3. Accumulate timeline segments.
4. If tool calls exist:
   - mark call segment `running`,
   - invoke `execute_tool`,
   - append tool result segment,
   - append protocol `tool` messages,
   - continue loop.
5. Stop when no tool calls or round limit reached.

Safety limits:
- `MAX_TOOL_ROUNDS = 3`
- per-tool timeout (e.g. 8s)
- max result payload size (e.g. 32KB)
- dedupe/reject malformed repeated `tool_call_id`

---

## 6) Rust API Surface

```rust
#[tauri::command]
fn get_tool_definitions() -> Result<Vec<ToolDefinition>, String>;

#[tauri::command]
fn execute_tool(tool_name: String, arguments: serde_json::Value) -> Result<serde_json::Value, String>;
```

Design rules:
- `arguments` and return values are JSON values, not JSON strings.
- Dispatch unknown tool names as structured errors.
- Tool result errors are represented in timeline + model feedback.

---

## 7) Security & Stability Guardrails

- No arbitrary code execution.
- Strict argument validation per tool schema.
- Expression size/function allowlist for `calculate` and `graph`.
- Bounded vault result count + snippet length.
- Tool execution timeout and result-size truncation.
- Multi-round hard cap to prevent infinite loops.

---

## 8) Test Plan

### Rust
- `test_calculate_basic`
- `test_calculate_invalid_expression`
- `test_graph_function_points`
- `test_graph_steps_clamped`
- `test_vault_search_bounded`
- `test_execute_unknown_tool`
- `test_execute_tool_timeout`

### TypeScript / integration
- `parse_fragmented_tool_calls`
- `multi_tool_calls_single_turn`
- `tool_protocol_messages_shape`
- `loop_stops_at_max_rounds`
- `tool_error_propagates_to_segment_and_next_round`

---

## 9) Files & Modules

### New
- `mathmate-v2/src-tauri/src/tools/mod.rs`
- `mathmate-v2/src-tauri/src/tools/calculate.rs`
- `mathmate-v2/src-tauri/src/tools/graph.rs`
- `mathmate-v2/src-tauri/src/tools/vault_search.rs`

### Modified
- `mathmate-v2/src-tauri/Cargo.toml` (`meval`)
- `mathmate-v2/src-tauri/src/lib.rs` (Tauri commands)
- `mathmate-v2/src/lib/providers.ts` (tool delta normalization + request tool definitions)
- `mathmate-v2/src/lib/types.ts` (tool and stream types)
- `mathmate-v2/src/stores/chatStore.ts` (multi-round dispatch loop)

---

## 10) Rollout Order

1. Land protocol contract + types.
2. Implement parser normalization for fragmented tool deltas.
3. Implement Rust registry + `calculate` only.
4. Integrate loop with hard limits.
5. Add `graph` (2D function v1).
6. Add `vault_search`.
7. Run integration tests with OpenRouter function-calling model.
8. Update changelog + dev log.
