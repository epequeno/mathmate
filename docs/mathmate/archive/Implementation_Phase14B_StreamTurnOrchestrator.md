# Implementation Plan — Phase 14B: Stream Turn Orchestrator

## Objective

Extract a `StreamTurnOrchestrator` (vanilla function or class) from `chatStore.sendMessage` that takes the inputs to a single turn and emits a stream of `TurnEvent`s. The store becomes a thin subscriber that turns events into `set()` calls. This makes the streaming/turn flow testable and decouples the cross-store reads from the store's mutation surface.

This is a **controlled behavior refactor**: parity is the goal, but we explicitly allow tightly-scoped fixes for existing race conditions documented in this plan.

## Current Pain

`chatStore.sendMessage` is a single ~470-line `async` function that does:

1. Slash-command routing
2. Session creation vs. reuse
3. Image-attach handling
4. Synapse memory retrieval
5. System-prompt assembly (with textbook/memory injection)
6. Vision-capability check
7. Tool definition fetching
8. The streaming + multi-round tool loop
9. Segment accumulation
10. Auto-store memory
11. Retry / abort / error rendering

Concrete consequences:

- **Untestable.** No test exercises the streaming flow, the abort logic, the retry logic, the tool-call assembly, or the system-prompt construction. The single test-adjacent helper (`assembleToolCalls`) is buried inside the action.
- **Cross-store coupling.** `sendMessage` reads from `useConfigStore`, `useProjectStore`, and dynamically imports `@tauri-apps/api/core` for one inner call.
- **Streaming state is 8 loosely-coupled fields** (`streamedText`, `streamedThinking`, `streamSegments`, `_toolCallDeltas`, `streaming`, `abortController`, `error`, `visionWarning`). Some get reset mid-turn in ways that have race conditions (see 14B.4 below).
- **The retry loop and the tool loop are different concepts** but share the same `try/catch`, so an abort during the second tool round hits the wrong error path.

## Proposed Design

### B.1 The event stream

Define a discriminated union of turn events:

```ts
// src/lib/turn/types.ts
export type TurnEvent =
  | { kind: "user-message-committed"; sessionId: string; message: Message }
  | { kind: "vision-warning"; model: string; message: string }
  | { kind: "round-started"; round: number }
  | { kind: "segment-appended"; segment: MessageSegment }
  | { kind: "tool-call-started"; callId: string; toolName: string; args: Record<string, unknown> }
  | { kind: "tool-call-finished"; callId: string; result: unknown; isError: boolean }
  | { kind: "round-finished"; round: number }
  | { kind: "memory-stored"; id: string }
  | { kind: "turn-finished"; sessionId: string }
  | { kind: "turn-aborted"; partialText: string; partialThinking: string }
  | { kind: "turn-error"; error: AppError };
```

### B.2 The orchestrator

```ts
// src/lib/turn/orchestrator.ts
export interface TurnInput {
  sessionId: string;
  userMessage: Message;
  systemPrompt: string;
  toolDefinitions: ToolDefinition[];
  signal: AbortSignal;
}

export interface TurnDeps {
  configStore: ConfigStoreSnapshot;
  projectStore: ProjectStoreSnapshot;
  api: TypedApiClient;          // from 14A
  buildPayload: (messages: MessagePayload[]) => MessagePayload[];
  buildToolPayload: (messages: MessagePayload[], tools: ToolDefinition[]) => ToolPayload;
  streamChat: StreamChatFn;
  onEvent: (event: TurnEvent) => void;
}

export async function* runTurn(
  input: TurnInput,
  deps: TurnDeps,
): AsyncGenerator<TurnEvent> {
  // ... the full state machine described in B.3
}
```

The orchestrator is a pure async generator: no Zustand, no React, no globals. It takes a snapshot of the world (`configStore`, `projectStore`) and a way to report events (`onEvent`). This is testable in isolation.

### B.3 The state machine

The orchestrator runs the following state machine, expressed as a generator:

```
INIT
  └─→ ROUND[round=0]
        ├─→ SEGMENT_APPENDED(thinking, accumulated_so_far)  (incremental)
        ├─→ SEGMENT_APPENDED(content, accumulated_so_far)   (incremental)
        ├─→ TOOL_CALL_STARTED                                  (per tool call)
        ├─→ TOOL_CALL_FINISHED                                 (per tool call)
        └─→ ROUND_FINISHED
              └─→ if no tool calls: FINISH
              └─→ else: ROUND[round+1] (capped at MAX_TOOL_ROUNDS)
ANY state
  └─→ on signal.abort: ABORTED
  └─→ on thrown error: TURN_ERROR (then EXIT)
```

The retry loop is **inside** `streamChat`, not here. The orchestrator's job is to coordinate the round-by-round protocol; the network retry policy is a property of the transport.

### B.4 Race conditions to fix in the move

- `set({ streamedText: "", streamedThinking: "" })` mid-tool-round currently clears text/thinking but keeps `streamSegments`. The UI briefly shows an empty message with a populated ProcessBlock. The new orchestrator should re-derive `streamingText` and `streamingThinking` from the latest `SEGMENT_APPENDED` events, not maintain them as parallel state.
- `retrievedMemories` is cleared in the success path but not the error path. Fix: clear on every `TURN_FINISHED` / `TURN_ERROR` / `TURN_ABORTED` exit in the subscriber.
- `visionWarning` is set inside the orchestrator's input check; the orchestrator should emit a `VISION_WARNING` event instead so the store has a single place to handle UI flags.

### B.5 Where system-prompt assembly goes

Extract the 60-line system-prompt literal from `sendMessage` into `buildSystemPrompt({ userSystemPrompt, retrievedMemories, project, appConfig }) → string`. This function is pure, takes a snapshot, and is testable in isolation. The orchestrator calls it before round 0.

## Task Checklist

- [ ] Add `src/lib/turn/types.ts` with `TurnEvent` union.
- [ ] Add `src/lib/turn/prompt.ts` with `buildSystemPrompt(...)`.
- [ ] Add `src/lib/turn/orchestrator.ts` with `runTurn(...)` (the generator).
- [ ] Refactor `chatStore.sendMessage` to call `runTurn` and subscribe to events. Net deletion: ~350 lines from `chatStore.ts`.
- [ ] Add `src/lib/turn/orchestrator.test.ts`:
  - Text-only round produces a `CONTENT` segment and a `TURN_FINISHED` event.
  - Single tool round (calculate) produces `TOOL_CALL_STARTED`, `TOOL_CALL_FINISHED`, a second round with a `CONTENT` segment, and a `TURN_FINISHED`.
  - Abort during round 0 emits `TURN_ABORTED` with partial text.
  - Max-tool-rounds reached emits a final assistant message segment and `TURN_FINISHED`.
  - Network error (mocked `streamChat` that throws `StreamError { retryable: false }`) emits `TURN_ERROR`.
  - Vision warning emitted when model catalog entry lacks `supports_vision` and user message has image parts.
- [ ] Add `src/lib/turn/orchestrator.contract.test.ts` with scripted `streamChat` fixtures to assert event ordering for: text-only, tool round-trip, abort, and hard error. Capture these traces before refactor and replay after refactor for parity checks.
- [ ] Add a `snapshotStores()` helper that produces a serializable snapshot of `useConfigStore` and `useProjectStore` so the orchestrator does not read live state inside the stream loop.
- [ ] Move "auto-store session memory" out of the orchestrator and into a Zustand subscription (`useChatStore.subscribe(state => state.currentSession, ...)`).
- [ ] Document the public API of the orchestrator in `src/lib/turn/README.md`.

## Validation

- `npm run build` ✅
- `npm test` ✅ (new tests must pass)
- `cargo test` ✅ (no Rust change)
- Manual smoke: a single text turn, a tool round-trip (calculate, search_textbook), an interrupted stream, a vision-capable-model image attach, a model without vision.

## Acceptance Criteria

- `chatStore.sendMessage` is ≤ 80 lines.
- The orchestrator is fully unit-testable (no live store, no live API, no live `streamChat` in tests).
- The retry loop and the tool loop are distinct — abort during round 1 takes the abort path, not the retry path.
- `retrievedMemories`, `visionWarning`, and the segment/stream state are all reset on every exit path.
- The behavior of the chat (segment timeline, retry, abort, vision warning, tool round, memory injection, slash commands) is parity-equivalent to today, except for explicitly documented bug fixes in this plan (race-condition resets and malformed tool-argument handling).

## Risks

- **Behavioral regression in the streaming UI.** The most likely source of bugs is the event ordering. Mitigation: keep the legacy `sendMessage` behind a `useConfigStore` feature flag for one release; default the new path on only after contract fixtures pass on CI.
- **`streamSegments` ↔ `effectiveSegments` interaction in `ChatMessage.tsx`.** The component currently falls back to `adaptLegacyMessage(message)` when `streamSegments` is empty. The new orchestrator should ensure `streamSegments` is always populated during a turn. Mitigation: add a regression test that asserts `streamSegments.length > 0` after round 0 starts.

## Out of scope (deferred)

- **Discriminated-union stream state in the store.** This is a Phase 15+ refactor; the store can still hold the 8 fields, just with a tighter contract.
- **A "regenerate last response" UI.** The orchestrator's pure-function design makes this trivial to add later, but it is not part of 14B.
- **Concurrent turns.** The current code prevents concurrent turns with the `streaming` flag. The orchestrator does not change that.
