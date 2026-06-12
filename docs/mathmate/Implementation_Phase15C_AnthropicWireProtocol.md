# Implementation Plan — Phase 15C: Anthropic Wire-Protocol Support

## Objective

Fix `lib/providers.ts` to correctly implement the Anthropic API wire protocol for streaming responses. The current implementation has partial Anthropic support (adds the right HTTP headers) but the delta parser reads the OpenAI `choice.delta` shape, which Anthropic does not use. The fix replaces the OpenAI-only `_parseDelta` with a provider-specific delta parser.

## Current Pain

In `lib/providers.ts`:

```ts
// Current — wrong for Anthropic
function _parseDelta(delta: unknown, model: string): ParsedDelta {
  const d = delta as Record<string, unknown>;
  if (d.type === "thinking") return { thinking: d.text as string };
  if (d.type === "content_block") {
    if (d.content_type === "text") return { text: d.text as string };
    if (d.content_type === "input_json") return { toolCall: parseToolCall(d); }
  }
  return {};
}
```

Problems:
- **`choice.delta` is OpenAI terminology.** Anthropic uses `content_block_delta` events. No `choice` wrapper exists in the Anthropic SSE stream.
- **Anthropic streaming format is completely different:**
  - OpenAI: `data: {"choices":[{"delta":{"content":"..."}}]}\n\n`
  - Anthropic: `data: {"type":"content_block_delta","index":0,"delta":{"type":"text","text":"..."}}\n\n`
- **`type: "thinking"` vs `type: "content_block"`**: Anthropic sends thinking as `{"type":"content_block","content_type":"thinking","text":"..."}` NOT `{"type":"thinking"}`.
- **Tool calls differ in shape**: Anthropic uses `content_block` with `content_type: "tool_use"` and `input_json`; the `function_call` object is nested differently than OpenAI's `delta.function_call`.
- **The `model` string-match for "anthropic" / "claude" exists in the header logic but may not cover all model IDs** (e.g. `claude-opus-4-5`, `claude-sonnet-4-0`, `anthropic.claude-3-5-sonnet-20241022-v2`).

## Proposed Design

### C.1 Provider detection

Define a `ProviderVariant` enum:

```ts
// src/lib/providers.ts

export type ProviderVariant = "openai" | "anthropic" | "openrouter";

function detectVariant(provider: string, model: string): ProviderVariant {
  const key = `${provider}:${model}`.toLowerCase();
  if (
    key.includes("anthropic") ||
    key.includes("claude") ||
    provider === "anthropic"
  ) return "anthropic";
  if (provider === "openrouter") return "openrouter";
  return "openai";
}
```

### C.2 Split the stream parser

```ts
// src/lib/providers.ts

function parseSSE_OpenAI(line: string): DeltaEvent | null;
function parseSSE_Anthropic(line: string): DeltaEvent | null;

function* parseSSEStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  variant: ProviderVariant,
): Generator<ParsedDelta> {
  const parser = variant === "anthropic"
    ? parseSSE_Anthropic
    : parseSSE_OpenAI;

  // yield from parser(lines)
}
```

### C.3 Anthropic delta parser

```ts
function parseSSE_Anthropic(line: string): DeltaEvent | null {
  if (!line.startsWith("data:")) return null;
  const json = JSON.parse(line.slice(5));
  const type = json.type as string;

  switch (type) {
    case "content_block_delta": {
      const delta = json.delta as Record<string, unknown>;
      const deltaType = delta.type as string;
      if (deltaType === "text") return { text: delta.text as string };
      if (deltaType === "thinking_delta") return { thinking: delta.thinking as string };
      if (deltaType === "input_json_block") {
        // Tool call block — format as tool call
        return { toolCall: parseAnthropicToolCall(json) };
      }
      break;
    }
    case "content_block_start": {
      const block = json.content_block as Record<string, unknown>;
      if (block.content_type === "thinking") return { thinkingBlockStart: true };
      if (block.content_type === "tool_use") return { toolCallStart: true };
      break;
    }
    case "message_delta": {
      // Final message with stop_reason
      const stopReason = json.delta?.stop_reason as string | undefined;
      return { stopReason };
    }
    case "error": {
      return { error: json.error as string };
    }
    case "[DONE]":
      return { done: true };
  }
  return null;
}

function parseAnthropicToolCall(json: AnthropicContentBlock): ToolCallDelta {
  const delta = json.delta as Record<string, unknown>;
  return {
    callId: crypto.randomUUID(),
    toolName: delta.name as string ?? "",
    arguments: parseInputJson(delta as Record<string, unknown>),
  };
}
```

### C.4 OpenAI parser (extract, no behavior change)

```ts
function parseSSE_OpenAI(line: string): DeltaEvent | null {
  if (!line.startsWith("data:")) return null;
  const obj = JSON.parse(line.slice(5));
  if (obj.error) return { error: obj.error.message ?? String(obj.error) };
  const choice = (obj.choices ?? [])[0] as Record<string, unknown> | undefined;
  if (!choice) return null;
  const delta = choice.delta as Record<string, unknown> | undefined;
  if (!delta) return null;
  // Existing logic unchanged...
}
```

### C.5 `content_type: "tool_result"` handling

Anthropic sends tool results as `content_block_delta` with `input_json` containing the result. This is the tool-result data sent back to the model, not the tool-call output from the model. The tool-result data is handled in `assembleToolCalls` — this part already works correctly.

## Task Checklist

- [ ] Add `ProviderVariant` type + `detectVariant()` function
- [ ] Add `parseSSE_Anthropic()` function with all event types: `content_block_delta`, `content_block_start`, `content_block_stop`, `message_delta`, `message_stop`, `error`, `[DONE]`
- [ ] Add `parseAnthropicToolCall()` helper (converts Anthropic `input_json_block` delta to internal `ToolCallDelta`)
- [ ] Add `parseSSE_OpenAI()` function (extract existing logic from `_parseDelta`)
- [ ] Add `parseSSEStream()` generator that takes `variant: ProviderVariant`
- [ ] Update `streamChat()` to call `parseSSEStream(reader, detectVariant(provider, model))`
- [ ] Add `src/lib/providers.anthropic.test.ts`:
  - SSE fixture: text-only message
  - SSE fixture: thinking block followed by text
  - SSE fixture: tool-use block
  - SSE fixture: mixed (thinking → text → tool_use)
  - SSE fixture: error event
  - Assert parsed `ParsedDelta[]` for each fixture
- [ ] Add `src/lib/providers.e2e.test.ts` (if mock server available) or document manual test steps

## Validation

- `npm run build` ✅
- `npm test` ✅ (includes new Anthropic parser tests)
- `cargo test` ✅
- Manual smoke:
  1. Set a Claude model (e.g. `claude-sonnet-4-20250514`) in settings
  2. Send a text message — assert full response renders
  3. Send a math problem requiring `calculate` tool — assert tool is called and result is rendered
  4. Send a textbook search query — assert tool is called and results displayed
  5. Click abort mid-stream — assert stream stops cleanly

## Acceptance Criteria

- A streaming turn with a Claude model produces the same rendered output as with an OpenAI model
- Thinking blocks are rendered as expandable thinking traces (same as OpenAI thinking/thinking delta)
- Tool calls are extracted correctly from Anthropic's `content_block_delta` events
- The abort button stops the stream without errors
- The `error` event type surfaces as an `AppError` in the UI via the existing error path

## Risks

- **Anthropic API may change their SSE format.** Mitigation: version the parser and add a compatibility layer if the format changes significantly.
- **Model detection relies on string matching.** Mitigation: use a config field `providerVariant` in the model catalog or app config rather than guessing from model name.
- **Thinking blocks vs `content_block`** are rendered differently by the UI. The existing `streamSegments` renderer treats `thinking` segments specially. Ensure Anthropic thinking maps to the same segment type.

## Out of Scope

- **Non-streaming Anthropic requests.** The current code only streams. A non-streaming path is not needed.
- **Anthropic system prompt format.** Anthropic recommends a specific system prompt structure. The current system prompt works but may not be optimal. Deferred to a separate prompt-engineering task.
- **Claude 3.5 / Opus / Sonnet differences.** The streaming format is consistent across Claude models. No per-model special-casing needed.
