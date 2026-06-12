# Implementation Plan — Phase 15D: Turn Orchestrator E2E Tests

## Objective

Add high-fidelity integration tests for the complete turn flow — `runTurn()` + orchestrator events + `chatStore` subscriber — by scripting a `StreamChatFn` mock that replays realistic multi-round conversations. The goal is a suite of contract fixtures that lock in the behavior of text-only turns, tool round-trips, aborts, and errors, making future refactors safe.

## Current Pain

After Phase 14B, `runTurn()` is unit-tested (11 tests in `orchestrator.test.ts`). These tests mock `streamChat` with simple chunk arrays. But the real conversation flow has:

- **Multi-round tool sequences**: `search_textbook → read_note → calculate → write_note` — the orchestrator accumulates tool results and passes them back to the model for subsequent rounds
- **Variable timing**: Thinking segments arrive, pause, then content. Tokens arrive mid-chunk. These affect the UX even if the final output is correct
- **Abort mid-tool-call**: When the user clicks abort while a tool is executing (between rounds), the abort must stop both the stream and the pending tool execution
- **Hard errors after partial stream**: A stream that starts successfully but fails partway through (network drop, model error)
- **Max-tool-rounds cap**: The model keeps calling tools; when does the orchestrator give up and surface a "stopped after 3 rounds" message?

These scenarios are not covered by the unit tests.

## Proposed Design

### D.1 Test fixture format

Each fixture is a named object defining the inputs and the expected event sequence:

```ts
// src/lib/turn/orchestrator.e2e.test.ts

interface TurnE2EFixture {
  name: string;
  input: TurnInput;
  /** streamChat mock returns an async generator of chunks */
  streamChunks: AsyncGenerator<Chunk>[];
  /** Expected events (kind + key fields) */
  expectedEvents: ExpectedEvent[];
  /** Expected final message segments (for appendMessage call) */
  expectedSegments: string[]; // e.g. ["content", "tool_call", "content"]
}
```

### D.2 Pre-existing contract captures

Before writing new tests, run a single manual session through the live app and log the event stream. Use `runTurn(..., { onEvent: console.log })` locally to capture:
1. A text-only turn
2. A `calculate` tool turn
3. A `search_textbook` tool turn
4. A 3-round turn (reaching the max-rounds cap)
5. An abort during round 1

Save the event sequences as snapshots (`.snap` files via vitest's `--snapshot` flag).

### D.3 Fixture 1: Text-only turn

```ts
{
  name: "text-only-turn",
  streamChunks: [smartJoin([
    { type: "thinking", text: "The derivative of x² is 2x." },
    { type: "content", text: "The derivative of x² is **2x**." },
  ])],
  expectedEvents: [
    { kind: "status", text: "Thinking…" },
    { kind: "segments-changed" },
    { kind: "status", text: "Responding…" },
    { kind: "message-saved" },
    { kind: "turn-finished" },
  ],
}
```

### D.4 Fixture 2: Tool round-trip (calculate)

```ts
{
  name: "tool-round-calculate",
  // Round 0: model requests calculate
  streamChunks: [smartJoin([
    { type: "tool_call", toolName: "calculate", args: { expression: "2+2" } },
  ])],
  // Round 1: model receives result and responds
  streamChunks: [smartJoin([
    { type: "content", text: "2 + 2 = **4**." },
  ])],
  expectedEvents: [
    { kind: "tool-round-started" },
    { kind: "tool-call-started", toolName: "calculate" },
    { kind: "tool-call-finished", callId: ANY_STRING },
    { kind: "tool-round-finished" },
    { kind: "status", text: "Responding…" },
    { kind: "message-saved" },
    { kind: "turn-finished" },
  ],
}
```

### D.5 Fixture 3: Abort mid-stream

```ts
{
  name: "abort-mid-stream",
  streamChunks: [delayedChunks([
    { type: "content", text: "The answer is " },
    // simulate user abort here
    ABORT_SIGNAL,
    { type: "content", text: "flaky chunk" }, // should be ignored
  ])],
  expectedEvents: [
    { kind: "status", text: "Thinking…" },
    { kind: "segments-changed" },
    { kind: "turn-aborted" }, // partial text should be "The answer is "
  ],
}
```

### D.6 Fixture 4: Max-tool-rounds

```ts
{
  name: "max-tool-rounds",
  // Model keeps calling tools 4 times (exceeds MAX_TOOL_ROUNDS=3)
  streamChunks: [
    toolCallChunk("calculate", {}),    // round 0
    toolCallChunk("calculate", {}),     // round 1
    toolCallChunk("calculate", {}),     // round 2
    toolCallChunk("calculate", {}),     // round 3 — OVER limit
  ],
  expectedEvents: [
    { kind: "tool-round-started" }, // × 3
    { kind: "tool-call-started" },  // × 4
    { kind: "message-saved" },       // with "Stopped after 3 rounds" content
    { kind: "turn-finished" },
  ],
}
```

### D.7 Fixture 5: Hard error mid-stream

```ts
{
  name: "hard-error-mid-stream",
  streamChunks: [async function* () {
    yield { type: "content", text: "The integral of " };
    yield { type: "content", text: "sin(x) is -cos(x)." };
    throw new StreamError({ kind: "api_error", retryable: false, message: "Model rate limited" });
  }],
  expectedEvents: [
    { kind: "status" },
    { kind: "segments-changed" },
    { kind: "turn-error", errorKind: "api_error" },
  ],
}
```

## Task Checklist

- [ ] Write `src/lib/turn/orchestrator.e2e.test.ts`
- [ ] Add `smartJoin()` helper: combines a `ParsedDelta[]` into SSE-formatted chunks that mimic real tokenization
- [ ] Add `delayedChunks()` helper: yields chunks with delay to simulate real timing
- [ ] Add `toolCallChunk()` factory for generating tool-call SSE chunks
- [ ] Add `ANY_STRING` matcher for call IDs (UUIDs not predictable in tests)
- [ ] Implement Fixture 1: text-only turn
- [ ] Implement Fixture 2: tool round-trip (single tool)
- [ ] Implement Fixture 3: multi-tool sequence (search + read + write)
- [ ] Implement Fixture 4: abort mid-stream
- [ ] Implement Fixture 5: abort pre-stream (immediate)
- [ ] Implement Fixture 6: hard error pre-stream
- [ ] Implement Fixture 7: hard error mid-stream
- [ ] Implement Fixture 8: max-tool-rounds cap (3 rounds)
- [ ] Capture contract snapshots from live run (see D.2) and compare against fixture expectations
- [ ] Verify `appendMessage` is called with correct session + segments for each fixture
- [ ] Verify `executeTool` is called with correct args for each tool fixture
- [ ] Add to `npm test` CI suite

## Validation

- `npm run build` ✅
- `npm test` ✅ (all e2e fixtures pass)
- `cargo test` ✅
- Run the full e2e suite against the live app with a real model and verify event sequences match snapshots

## Acceptance Criteria

- 8 fixture scenarios covering: text-only, single tool, multi-tool, abort pre-stream, abort mid-stream, error pre-stream, error mid-stream, max-rounds
- Each fixture asserts:
  - `runTurn()` completes without throwing (except error/abort fixtures)
  - All expected `TurnEvent` kinds appear in order
  - `appendMessage` is called exactly once with the final message
  - `executeTool` is called the correct number of times with correct tool names
  - No unexpected events appear
- The test suite runs in < 5 seconds (no real API calls)
- A new engineer can add a fixture by adding one fixture object (no new test functions needed)

## Risks

- **Chunk timing is not deterministic.** `delayedChunks()` may cause flakiness in CI. Mitigation: test against pre-assembled chunks (already chunked), not real-time timing.
- **Tool argument parsing differs by provider.** The SSE chunks must match the exact shape the orchestrator expects. Mitigation: use `assembleToolCalls` to validate the parsed tool call structure.
- **The orchestrator internal state may change between phases.** The e2e tests are coupled to the internal event shape. Mitigation: pin the orchestrator's public API (events + deps) and test only through that contract.

## Out of Scope

- **End-to-end tests that hit a real API.** These would be integration tests, not unit tests. A separate `tests/` directory with Playwright or similar is better for that.
- **Visual regression testing.** The current test approach is behavioral, not visual. A snapshot of rendered HTML could be added later.
- **Multi-turn concurrency.** A single-turn-at-a-time constraint is preserved in these tests.
