# Implementation Plan — Phase 15C: Anthropic Wire-Protocol Support

## Objective

Make `src/lib/providers.ts` correctly support **native Anthropic streaming** end-to-end (request format + SSE parsing), while preserving existing OpenAI/OpenRouter behavior.

## Current Pain

Today the code does two incompatible things at once:
- routes Anthropic providers to `/v1/messages` with Anthropic headers,
- but parses stream chunks with OpenAI `choices[0].delta` assumptions.

So native Anthropic calls can connect but are parsed incorrectly (or dropped), especially for thinking and tool-use blocks.

## Proposed Design

### C.1 Canonical wire-variant detection (provider-based, not model-name-based)

```ts
export type WireVariant = "openai_compatible" | "anthropic_native";

function detectWireVariant(provider: ProviderConfig): WireVariant {
  const name = provider.name.toLowerCase();
  const base = provider.base_url.toLowerCase();

  // OpenRouter remains OpenAI-compatible wire format even for Claude models.
  if (name.includes("openrouter") || base.includes("openrouter.ai")) {
    return "openai_compatible";
  }

  if (name.includes("anthropic") || base.includes("api.anthropic.com")) {
    return "anthropic_native";
  }

  return "openai_compatible";
}
```

**Rule:** never infer Anthropic-native mode from model ID alone (prevents misclassifying OpenRouter Claude models).

### C.2 Split request building by wire variant

`streamChat()` should delegate to:
- `buildOpenAIRequest(...)`
- `buildAnthropicRequest(...)`

Anthropic-native builder requirements:
- endpoint: `/v1/messages`
- headers: `x-api-key`, `anthropic-version`, `content-type`
- body shape:
  - `model`, `max_tokens`, `stream: true`
  - `system` extracted from system messages
  - `messages` converted to Anthropic content blocks
  - `tools` converted from OpenAI-style tool definitions:
    - `{ name, description, input_schema }`

Message conversion requirements:
- user/assistant text → `{ type: "text", text }`
- image parts → Anthropic image block (`source.type = "base64"`)
- assistant tool calls → `tool_use` content blocks (stable `id`, `name`, `input`)
- tool result messages (`role: "tool"`) → Anthropic `user` message with `tool_result` block referencing `tool_use_id`

### C.3 Parse SSE by full frame, not single-line JSON assumptions

Add a shared frame reader that parses SSE blocks (supports `event:` + multi-line `data:`):

```ts
for await (const frame of readSSEFrames(reader)) {
  // frame.event, frame.data
}
```

This prevents malformed handling when providers emit multi-line data or include event names.

### C.4 Anthropic event-to-`StreamChunk` adapter (stable tool-call IDs)

Create `parseAnthropicFrame(frame, state): StreamChunk | null` where `state` tracks per-`index` tool-call assembly.

Support at least:
- `content_block_start`
  - text/thinking blocks: initialize index state
  - tool_use block: emit `tool_call_delta` with `call_id_part` + `tool_name_part`
- `content_block_delta`
  - `text_delta` → `chunk.text`
  - `thinking_delta` → `chunk.thinking`
  - `input_json_delta` (or equivalent partial-json type) → emit `arguments_part`
- `content_block_stop`
  - finalize index state (no random IDs)
- `message_delta`
  - usage/stop metadata if present
- `message_stop`
  - emit `{ done: true }`
- `error`
  - map to `AppError` path

Important compatibility constraint:
- Emit tool chunks in the **existing** `StreamChunk.tool_call_delta(s)` format so `assembleToolCalls()` continues to work unchanged.

### C.5 OpenAI/OpenRouter parser extraction (no behavior change)

Move current OpenAI delta logic into `parseOpenAIFrame(...)` with behavioral parity.
OpenRouter should continue through this parser.

### C.6 Compatibility/validation matrix

| Provider path | Wire variant | Parser |
|---|---|---|
| OpenAI-compatible | `openai_compatible` | OpenAI parser |
| OpenRouter (including Claude models) | `openai_compatible` | OpenAI parser |
| Native Anthropic | `anthropic_native` | Anthropic parser |

## Task Checklist

- [ ] Add `WireVariant` + `detectWireVariant(provider)`
- [ ] Split request builders: OpenAI-compatible vs Anthropic-native
- [ ] Add message/tool conversion helpers for Anthropic request payloads
- [ ] Add shared SSE frame reader (`readSSEFrames`)
- [ ] Add `parseOpenAIFrame` (extracted current behavior)
- [ ] Add `parseAnthropicFrame` with per-index tool-call assembly state
- [ ] Preserve `StreamChunk` output contract used by orchestrator
- [ ] Update `streamChat()` to route by wire variant
- [ ] Add tests: `src/lib/providers.anthropic.test.ts`
  - text-only stream
  - thinking + text stream
  - tool-use with partial JSON args
  - mixed thinking/text/tool-use
  - error event
  - message_stop done event
- [ ] Add parity tests: `src/lib/providers.openai-compat.test.ts`
  - assert OpenRouter Claude model still uses OpenAI parser path

## Validation

- `npm run build` ✅
- `npm test` ✅ (includes new provider parser tests)
- `cargo test` ✅
- Manual smoke:
  1. Native Anthropic provider + Claude model: normal text response
  2. Anthropic thinking model: thinking trace appears as plain text
  3. Anthropic tool-use turn: tool executes and result is incorporated
  4. OpenRouter Claude model still streams normally (no regression)
  5. Abort mid-stream works for both variants

## Acceptance Criteria

- Native Anthropic streaming works for text, thinking, and tool-use flows
- Tool-call IDs remain stable across partial deltas (no UUID-per-delta bug)
- OpenRouter Claude models are not misrouted to Anthropic-native parser
- Existing OpenAI/OpenRouter behavior remains unchanged
- Errors surface through existing `AppError` handling path

## Risks

- **Anthropic event schema drift**: mitigate with fixture-driven parser tests and narrow adapters.
- **Request conversion bugs**: mitigate with explicit unit tests for message/tool conversion.
- **Cross-provider regressions**: mitigate with parity tests for existing OpenAI-compatible fixtures.

## Out of Scope

- Non-streaming request mode
- Prompt-quality tuning specific to Claude
- Provider-catalog redesign (this plan only implements correct wire handling)
