# Implementation Plan: Chat View — Tool Formatting Utilities

## 1) Goal

Provide two deterministic utility functions that translate raw tool call data into human-readable strings for the Process Block UI, plus a per-tool output renderer that shows structured results instead of raw JSON wherever possible.

These utilities are the single source of truth for all tool presentation in the chat view. Because MathMate controls the full tool set, every known tool gets an exact, contextual formatter. Unknown tools (e.g. future MCP tools) fall back gracefully.

---

## 2) `formatToolCall(name, args)` — humanized action label

Returns a short present-tense sentence describing what the tool did. Used in the collapsed tool row label.

### Signature

```ts
export function formatToolCall(
  name: string,
  args: Record<string, unknown>
): string
```

### Mapping

| `name`             | Output                                               |
|--------------------|------------------------------------------------------|
| `vault_search`     | `Searched notes for "${args.query}"`                 |
| `vault_read`       | `Read "${args.path}"`                                |
| `vault_write`      | `Wrote "${args.path}"`                               |
| `vault_list`       | `Listed vault`                                       |
| `calculate`        | `Calculated ${args.expression}`                      |
| `graph`            | `Graphed ${args.expression}`                         |
| `get_current_date` | `Got current date`                                   |
| *(fallback)*       | `name` — raw function name, no transformation        |

### Notes
- String values are quoted with `"…"` in the output (visual emphasis, not code quotes).
- `args.expression` for `calculate` and `graph` may be long — truncate at 60 chars with `…` if needed.
- `args.path` for `vault_write` should show just the filename if the path has a directory component, e.g. `"Study Logs/2026-06-05.md"` → `"Study Logs/2026-06-05.md"` (keep as-is, it's meaningful).

---

## 3) `formatToolResult(name, result, isError)` — collapsed result summary

Returns a short string for the right-aligned result summary in the collapsed tool row. Must be immediately scannable at 11px.

### Signature

```ts
export function formatToolResult(
  name: string,
  result: unknown,
  isError: boolean
): string
```

### Mapping

| `name`             | Condition                    | Output                          |
|--------------------|------------------------------|---------------------------------|
| *(any)*            | `isError === true`           | `"error"`                       |
| `vault_search`     | —                            | `"${r.results.length} results"` |
| `vault_read`       | —                            | `"${r.content.length} chars"`   |
| `vault_write`      | `r.updated === true`         | `"updated"`                     |
| `vault_write`      | otherwise                    | `"created"`                     |
| `vault_list`       | —                            | `"${r.files.length} files"`     |
| `calculate`        | —                            | `String(r.value)`               |
| `graph`            | —                            | `"${r.points.length} pts"`      |
| `get_current_date` | —                            | `r.date`                        |
| *(fallback)*       | —                            | `""` (empty string)             |

### Notes
- Always parse `result` defensively — wrap in try/catch, fall back to `""` on any parse failure.
- `r` refers to `result` cast as `any` after validation.
- `"0 results"` is a valid and intentional output — don't hide zero counts.

---

## 4) `renderToolOutput(name, result, isError)` — expanded detail output panel

Returns a React node for the OUTPUT section of an expanded tool row. Used inside `ToolRow` when the user clicks to expand.

### Signature

```ts
export function renderToolOutput(
  name: string,
  result: unknown,
  isError: boolean
): React.ReactNode
```

### Per-tool renderers

#### `vault_search`
- Show up to 5 result tiles, each with:
  - File icon + **filename** (bold, 11px)
  - Excerpt snippet below (12px, muted, single line)
- If `results.length > 5`, show `"+ N more results"` caption below.
- Zero results: show muted `"No matches found"` placeholder.

#### `vault_read`
- File header row: file icon + **path** + `"N chars · M lines"` right-aligned.
- Thin divider.
- Scrollable `<pre>` showing first ~10 lines of `result.content` in Fira Code 10px.
- Max height: 120px with overflow scroll.

#### `vault_write`
- Single confirmation row: ✓ icon + **path** + `"Created · N bytes"` or `"Updated · N bytes"`.

#### `vault_list`
- `"N notes"` bold count.
- Directory summary: group files by top-level folder, show `"📁 FolderName/ · N files"` per group.
- Bare root files shown as `"📄 filename.md"`.
- Cap display at 6 entries; show `"+ N more…"` if over.

#### `calculate`
- Large numeric result: Fira Code 22px bold, `#1A1714`.
- `"(numeric)"` label in muted 11px beside it.

#### `graph`
- Icon (small curve SVG) + `"N points · rendered below"` in 11px.
- No data preview — the chart is already rendered in the ContentSegment.

#### `get_current_date`
- Date in Fira Code 18px bold: `result.date` (YYYY-MM-DD).
- Day of week below in muted 10px: `result.day_of_week`.

#### Error fallback (any tool, `isError === true`)
- Red `"error"` label.
- Red-tinted `<pre>` block with `result.error` string or full JSON.

#### Unknown tool fallback
- `"Output (raw JSON)"` label.
- Scrollable `<pre>` with `JSON.stringify(result, null, 2)` in Fira Code 10px.
- Max height: 160px.

---

## 5) `formatToolInput(name, args)` — function-call style input string

Returns the function-call display string for the INPUT section of an expanded tool row.

### Signature

```ts
export function formatToolInput(
  name: string,
  args: Record<string, unknown>
): string
```

### Rules

- Format: `name({ key: "value", key2: value2 })`
- String values are double-quoted.
- Numeric/boolean values are unquoted.
- Long string values (> 80 chars) are truncated to 80 chars with `…` inside the quotes.
- If `args` is empty (e.g. `vault_list`, `get_current_date`): `name()` with no argument object.
- Multiline is never used — always a single line.

### Examples

```
vault_search({ query: "integration" })
vault_read({ path: "integration-by-parts.md" })
vault_write({ path: "Study Logs/2026-06-05.md", content: "…" })
vault_list()
calculate({ expression: "sin(pi/6)^2 + cos(pi/6)^2" })
graph({ expression: "x^2 - 3*x + 1", xmin: -2, xmax: 5 })
get_current_date()
mcp__memory__recall({ topic: "calculus" })
```

---

## 6) File Location

All four functions live in a single file:

```
mathmate/src/lib/toolFormat.ts
```

All exports are pure functions — no React imports, no store access. `renderToolOutput` is the one exception (returns `React.ReactNode`) and may import React.

---

## 7) Test Plan

Tests live in `mathmate/src/lib/__tests__/toolFormat.test.ts`.

### `formatToolCall`
- `vault_search` with query → correct quoted label
- `calculate` with long expression → truncated at 60 chars
- `get_current_date` no args → `"Got current date"`
- unknown tool name → returns raw name unchanged

### `formatToolResult`
- `isError: true` → always returns `"error"` regardless of tool
- `vault_search` with 4 results → `"4 results"`
- `vault_search` with 0 results → `"0 results"`
- `vault_write` with `updated: true` → `"updated"`
- `vault_write` without `updated` → `"created"`
- `calculate` with `value: 1` → `"1"`
- `get_current_date` with `date: "2026-06-05"` → `"2026-06-05"`
- malformed result (non-JSON object) → `""` without throwing
- unknown tool → `""`

### `formatToolInput`
- args with strings → double-quoted values
- args with numbers → unquoted values
- empty args → `name()` format
- long string value → truncated with `…` inside quotes

### `renderToolOutput`
- `vault_search` with 2 results → renders 2 tiles
- `vault_search` with 0 results → renders placeholder
- `vault_search` with 7 results → renders 5 + "2 more" caption
- `vault_write` created → shows "Created · N bytes"
- `vault_write` updated → shows "Updated · N bytes"
- `calculate` → large number rendered
- error state → red styling
- unknown tool → raw JSON block rendered

---

## 8) Rollout Order

1. Create `src/lib/toolFormat.ts` with all four functions.
2. Add unit tests — all passing before any UI wiring.
3. Wire into `ProcessBlock` (`ToolRow` component).
4. Verify against Paper mockup designs.
5. Update changelog and dev log.
