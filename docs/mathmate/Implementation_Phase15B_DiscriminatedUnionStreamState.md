# Implementation Plan — Phase 15B: Discriminated-Union Stream State

## Objective

Replace the eight loosely-coupled streaming fields in `useChatStore` with a single `phase: TurnPhase` discriminated union. The store becomes a clear finite-state machine: `Idle | WaitingForTurn | Streaming(stream) | Finished | Aborted | Error(err)`. This eliminates the possibility of inconsistent intermediate states (e.g., `streaming = true` but `error` also set).

## Current Pain

`useChatStore` holds these streaming fields as independent booleans/strings:

```ts
// Current (problematic)
streaming: boolean;           // true during any active turn
abortController: AbortController | null;
streamedText: string;
streamedThinking: string;
streamSegments: MessageSegment[];
error: AppError | null;
visionWarning: string | null;
inputText: string;            // also used as non-streaming input
```

Problems:
- **`streaming` is a catch-all flag.** `streaming: true` with `error: AppError(...)` is a contradictory state that the UI must disambiguate.
- **`streamedText` + `streamedThinking` are redundant.** After Phase 14B, the orchestrator yields events; the store already has `streamSegments`. The accumulated text/thinking strings are derived from `streamSegments` and duplicated state.
- **`inputText` conflates two roles.** It's used both as the pre-send draft input AND as the captured input for auto-store-memory. These should be separate.
- **Reset logic is scattered.** Each exit path (abort, error, turn-finished, network-error) must zero out 5+ fields. Missed fields cause ghost UI states.
- **Vision warning is ad-hoc.** Set as a side-effect inside `sendMessage` before streaming starts. It should be a distinct phase event.

## Proposed Design

### B.1 Define the `TurnPhase` union

```ts
// src/lib/turn/phase.ts

export type TurnPhase =
  | { phase: "idle" }
  | { phase: "waiting-for-turn"; inputText: string }
  | {
      phase: "streaming";
      streamSegments: MessageSegment[];
      /** Derived from streamSegments — no separate accumulation */
      streamedText: string;
      streamedThinking: string;
      abortController: AbortController;
      round: number;
    }
  | { phase: "finishing"; sessionId: string }
  | { phase: "finished"; sessionId: string; error: null }
  | { phase: "aborted"; sessionId: string; partialText: string; partialThinking: string }
  | { phase: "errored"; error: AppError };
```

Key design decisions:
- `idle` means no active turn and no draft
- `waiting-for-turn` means the message was committed but the orchestrator hasn't started yet — a draft is held
- `streaming` consolidates all live-stream state; `streamedText`/`streamedThinking` are derived via `useMemo` from `streamSegments` in the store's computed helpers
- `finishing` is the in-progress phase between the last orchestrator yield and the message being saved
- `finished | aborted | errored` are terminal — subscription handlers transition back to `idle` after their side-effects complete

### B.2 Computed helpers on the store

```ts
// Inside useChatStore (as helpers, not additional state):

const isStreaming = (s: ChatState) => s.phase.phase === "streaming";
const isIdle = (s: ChatState) => s.phase.phase === "idle";
const currentError = (s: ChatState) =>
  s.phase.phase === "errored" ? s.phase.error : null;
const currentAbortController = (s: ChatState) =>
  s.phase.phase === "streaming" ? s.phase.abortController : null;
const latestText = (s: ChatState) =>
  s.phase.phase === "streaming" ? s.phase.streamedText
  : s.phase.phase === "aborted"  ? s.phase.partialText
  : s.phase.phase === "finished"  ? ""
  : "";
```

### B.3 Phase transition map

```
idle
  └─→ waiting-for-turn  (on sendMessage called, draft captured)

waiting-for-turn
  └─→ streaming         (orchestrator yields first event)
  └─→ errored           (setup error: model unavailable, no session, etc.)

streaming
  ├─→ streaming         (next round continues)
  ├─→ finishing         (orchestrator yields turn-finished)
  ├─→ aborted           (abortController triggered mid-stream)
  └─→ errored           (orchestrator throws)

finishing
  └─→ idle              (after storeMemory + appendMessage side-effects)

finished
  └─→ idle              (after side-effects)

aborted
  └─→ idle               (after message append)

errored
  └─→ idle               (after error-display + clearError)
```

### B.4 The orchestrator integration stays the same

`runTurn()` yields the same `TurnEvent` stream as Phase 14B. The only change is that the `chatStore` subscriber switches on `event.kind` and sets `phase` directly, rather than maintaining parallel fields.

### B.5 `inputText` becomes dedicated

Split `inputText` into:
- `draftText: string` — the chat input draft (cleared on send or idle)
- `capturedInput: string` — captured at turn-start for `auto-store-memory` in the `finished` handler

## Task Checklist

- [ ] Add `src/lib/turn/phase.ts` with `TurnPhase` discriminated union
- [ ] Add `phase: TurnPhase` to `ChatState` interface (replaces `streaming`, `abortController`, `streamedText`, `streamedThinking`, `streamSegments`, `visionWarning`)
- [ ] Keep `error: AppError | null` — the phase covers the flow, `error` is for non-stream UI errors
- [ ] Add computed helpers: `isStreaming`, `isIdle`, `currentError`, `currentAbortController`, `latestText`, `latestThinking`
- [ ] Update `sendMessage` phase transitions:
  - On call: `idle → waiting-for-turn`
  - On first orchestrator event: `waiting-for-turn → streaming`
  - On `turn-finished`: `streaming → finishing → idle`
  - On `turn-aborted`: `streaming → aborted → idle`
  - On `turn-error`: `* → errored → idle` (via `clearError`)
- [ ] Update `abortTurn`: derive abort controller from `phase` instead of separate field
- [ ] Update `clearError`: transition from `errored → idle`
- [ ] Update `ChatInput.tsx`: derive `disabled` from `isStreaming(state)` helper instead of `streaming` field
- [ ] Update `ChatMessage.tsx`: derive `isStreaming` from `state.phase.phase === "streaming"` instead of `isStreaming` prop
- [ ] Update `processTurnEvents` subscriber: set `phase` instead of individual fields
- [ ] Verify `visionWarning` is now an `ERR` variant in `phase` instead of a separate field
- [ ] Verify all 8 old fields are removed from the store interface
- [ ] Add `src/stores/chatStore.phase.test.ts`: assert phase transitions for text-only, tool-round, abort, error

## Validation

- `npm run build` ✅
- `npm test` ✅
- `cargo test` ✅ (no Rust change)
- Manual smoke:
  1. Type message → phase should be `idle`
  2. Press send → phase should be `waiting-for-turn` briefly
  3. Streaming starts → phase should be `streaming`
  4. Message arrives → phase should transition to `idle`
  5. Abort mid-stream → phase should be `aborted` then `idle`
  6. Network error → phase should be `errored` → click dismiss → `idle`
- Verify no ghost text after abort (partial text shouldn't linger)

## Acceptance Criteria

- `useChatStore` interface has exactly 2 fields fewer (replaces 8 streaming fields with `phase: TurnPhase`)
- All transitions are explicit in the phase map above
- No state where `phase.phase === "streaming"` AND `phase.phase === "errored"` simultaneously
- No separate `visionWarning` field — it's folded into the phase or handled as a toast notification
- All existing tests pass without modification (the store shape change is backward-compatible for tests that only call actions)

## Risks

- **`phase` is an object, not a flat string.** Zustand serialization (if any) may need updating. Mitigation: ensure the phase object is plain JSON-serializable.
- **UI components subscribe to `streaming`, `streamedText`, etc. directly.** This plan removes those fields. Mitigation: add adapter helpers `isStreaming(s)` that read from `phase.phase`, then update all subscribers in one pass.
- **`AbortController` in the phase.** `AbortController` is not serializable — keep it in `phase` but don't persist the store to disk.

## Out of Scope

- **Change to `runTurn()` API.** The orchestrator is already pure (Phase 14B). This plan only refactors the store subscriber.
- **New UI for phase visualization.** Debug indicator (`state.phase`) may be useful but is not required.
- **Multi-turn concurrency.** The current single-turn constraint is preserved.
