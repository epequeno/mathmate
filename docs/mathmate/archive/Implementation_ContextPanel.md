# Implementation Plan: Context Management & Visualization

## 1. Overview

A slide-in drawer (triggered by a toolbar button) that surfaces per-message and
session-level token usage, a visual context breakdown bar, and a scrollable
raw-message list — modelled on OpenCode's Context panel.

---

## 2. Data Layer Changes

### 2a. `TokenUsage` struct (new, in `ModelProvider.swift`)
```swift
struct TokenUsage: Codable {
    var promptTokens: Int        // input tokens for this turn
    var completionTokens: Int    // output tokens
    var reasoningTokens: Int     // reasoning/thinking tokens (subset of completion)
    var cacheReadTokens: Int     // OpenRouter prompt-cache read hits
    var cacheWriteTokens: Int    // OpenRouter prompt-cache writes
}
```

### 2b. `StreamToken` — add usage field
```swift
struct StreamToken {
    let thinking: String?
    let text: String?
    let usage: TokenUsage?   // non-nil only in the final chunk
}
```

### 2c. `Message` — add token tracking
```swift
struct Message: Identifiable, Codable {
    // existing fields ...
    var tokenUsage: TokenUsage?   // populated when streaming finishes
    var timestamp: Date           // for "Last Activity" display
}
```

### 2d. Provider changes — capture the `usage` chunk

Both `OpenAIProvider` and `AnthropicProvider` stream parsers must detect the
final SSE chunk containing the `usage` object and yield a `StreamToken(usage:)`.

OpenAI/OpenRouter final chunk shape:
```json
{ "usage": { "prompt_tokens": 102, "completion_tokens": 2,
             "prompt_tokens_details": { "cached_tokens": 27392 } } }
```

Anthropic final chunk shape:
```json
{ "type": "message_delta",
  "usage": { "input_tokens": 102, "output_tokens": 2 } }
```

### 2e. `ChatViewModel` — fix conversation history + persist usage

- Build the full `messages` array (all prior turns) when calling the provider,
  not just the latest user message. This makes token counts accurate and
  improves model response quality.
- After the stream finishes, attach the received `TokenUsage` to the assistant
  `Message`.
- Add computed session-level properties:
  - `sessionName` — first user message content, truncated to ~40 chars
  - `sessionStart` — timestamp of first message
  - `lastActivity` — timestamp of most recent message
  - `totalTokens`, `totalInputTokens`, `totalOutputTokens`, `totalReasoningTokens`
  - `totalCacheReadTokens`, `totalCacheWriteTokens`
  - `contextLimit` — read from model config / hardcoded per known model
  - `estimatedCost` — computed from token counts × per-model pricing

---

## 3. UI Layer

### 3a. Toolbar button
Add a "context" toolbar button (e.g. `chart.bar.doc.horizontal` SF Symbol) to
`ChatView`'s `chatToolbar`. Tapping toggles `showContextDrawer: Bool` state.

### 3b. `ContextDrawerView` (new file: `Views/ContextDrawerView.swift`)

Structured in three sections, matching the OpenCode reference:

**Section 1 — Session Metadata Grid (2-column)**
| Left | Right |
|---|---|
| Session | Messages |
| Provider | Model |
| Context Limit | Total Tokens |
| Usage % | Input Tokens |
| Output Tokens | Reasoning Tokens |
| Cache (read / write) | User Messages |
| Assistant Messages | Total Cost |
| Session Created | Last Activity |

**Section 2 — Context Breakdown Bar**
- Segmented `GeometryReader`-based bar
- Segments: System Prompt (grey) · User (green) · Assistant (orange) · Reasoning (purple)
- Token counts and percentages as a legend below the bar

**Section 3 — Per-Message List**
- `List` of all messages, showing: role · timestamp · token count for that turn
- Each row is a `DisclosureGroup` — expanded to reveal the raw text content
- User messages show prompt tokens; assistant messages show completion + reasoning tokens

### 3c. Layout integration
Use a `HStack` at the `ContentView` level (or inside `ChatView`):
```
[ Chat area ] [ ContextDrawerView (width ~320pt, conditional) ]
```
Animate in/out with `.transition(.move(edge: .trailing))`.

---

## 4. Model Pricing (for cost estimation)

Hardcode a lookup table of known OpenRouter model prices (per-million tokens)
in a `ModelPricing.swift` file. Fall back to `$0.00` if the model is unknown.
This avoids needing a live API call for pricing.

Initial entries: `moonshotai/kimi-k2.6`, `openai/gpt-4o`,
`anthropic/claude-3-5-sonnet`, `deepseek/deepseek-r1`.

---

## 5. Implementation Order

1. Add `TokenUsage` struct and update `StreamToken` / `Message`.
2. Update `OpenAIProvider` to capture and yield the final `usage` chunk.
3. Update `AnthropicProvider` similarly.
4. Fix `ChatViewModel.sendMessage` to pass full conversation history.
5. Attach received `TokenUsage` to the completed assistant message.
6. Add session-level computed properties to `ChatViewModel`.
7. Create `ContextDrawerView.swift`.
8. Wire toolbar button + drawer toggle in `MainView.swift`.
9. Add `ModelPricing.swift` with initial pricing table.

---

## 6. Verification

- `swift build` must pass.
- `swift test` must pass.
- Confirm token counts match what OpenRouter's dashboard reports for the same session.
- Confirm drawer slides in/out without layout jank.
- Confirm cost shows `$0.00` gracefully for unknown models.
