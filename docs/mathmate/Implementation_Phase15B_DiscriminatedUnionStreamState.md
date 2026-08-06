# Implementation Plan — Phase 15B: Discriminated-Union Stream State

## Objective

Replace the loosely-coupled streaming fields in `useChatStore` with a single `phase: TurnPhase` discriminated union so turn state is explicit and impossible to represent inconsistently.

This is a store-shape refactor only: no behavior change to `runTurn()` and no new concurrency model.

## Current Pain

`chatStore` currently tracks turn progress with independent fields:

```ts
streaming: boolean;
abortController: AbortController | null;
streamedText: string;
streamedThinking: string;
streamSegments: MessageSegment[];
error: AppError | null;
```

Problems:
- contradictory states are representable (`streaming: true` + `error` set),
- reset logic is duplicated across success/abort/error branches,
- text/thinking are duplicated state that can drift from `streamSegments`,
- `cancelStream` and rendering logic must coordinate multiple fields manually.

## Proposed Design

### B.1 Define `TurnPhase`

```ts
// src/lib/turn/phase.ts

export type TurnPhase =
  | { kind: "idle" }
  | { kind: "preparing"; sessionId: string; capturedInput: string }
  | {
      kind: "streaming";
      sessionId: string;
      round: number;
      streamSegments: MessageSegment[];
      abortController: AbortController;
    }
  | {
      kind: "finishing";
      sessionId: string;
      streamSegments: MessageSegment[];
    }
  | {
      kind: "aborted";
      sessionId: string;
      partialSegments: MessageSegment[];
      partialText: string;
      partialThinking: string;
    }
  | {
      kind: "errored";
      sessionId: string;
      partialSegments: MessageSegment[];
      error: AppError;
    };
```

Design constraints:
- `streamedText`/`streamedThinking` are **derived** from segments (not stored separately).
- `AbortController` lives only in `phase.kind === "streaming"`.
- `visionWarning` remains a separate UI toast concern (not part of turn FSM).

### B.2 Selectors/helpers (single read surface for UI)

Add selectors in `chatStore` (or `src/lib/turn/phase.ts`) and move components to these selectors:

```ts
isTurnActive(s)          // preparing|streaming|finishing
isStreaming(s)           // streaming
currentAbortController(s)
currentSegments(s)
latestText(s)            // derived from segments
latestThinking(s)        // derived from segments
currentTurnError(s)      // phase.kind === "errored" ? error : null
```

### B.3 Transition map

```text
idle
  -> preparing          (sendMessage accepted)

preparing
  -> streaming          (first status event from runTurn)
  -> errored            (setup failure before stream begins)

streaming
  -> streaming          (status / segments updates)
  -> finishing          (runTurn yields turn-finished)
  -> aborted            (AbortError / cancelled)
  -> errored            (runTurn throws)

finishing
  -> idle               (post-save side effects complete)

aborted
  -> idle               (partial append + cleanup)

errored
  -> idle               (clearError / dismiss)
```

### B.4 Integration boundary with existing code

- Keep `runTurn()` API unchanged (Phase 14B contract).
- Update existing `sendMessage` event loop in `chatStore.ts` to set `phase` instead of mutating parallel fields.
- Keep synthetic `__streaming__` message flow in `ChatPage.tsx`; `ChatMessage` remains prop-driven for per-row streaming.

### B.5 Input capture split (fix conflation)

Keep `inputText` as the editable draft used by `ChatInput`.
At send start, capture `capturedInput` into `phase.preparing` for auto-memory side effects.

## Task Checklist

- [ ] Add `src/lib/turn/phase.ts` (`TurnPhase` + segment-to-text helpers)
- [ ] Replace streaming fields in `ChatState` with `phase: TurnPhase`
- [ ] Remove duplicated stream fields from state shape:
  - `streaming`, `abortController`, `streamedText`, `streamedThinking`, `streamSegments`
- [ ] Keep `visionWarning` as a separate field (unchanged semantics)
- [ ] Update `sendMessage` transitions to use `phase`
- [ ] Update `cancelStream` to read abort controller from `phase`
- [ ] Update `clearError` to clear `phase.kind === "errored"` back to `idle`
- [ ] Update `ChatInput.tsx` to use selector `isTurnActive` (instead of raw `streaming`)
- [ ] Update `ChatPage.tsx` to read `latestText/latestThinking/currentSegments` from selectors
- [ ] Keep `ChatMessage.tsx` streaming prop contract unchanged (driven by synthetic streaming row)
- [ ] Add tests: `src/stores/chatStore.phase.test.ts`
  - text-only success
  - tool round success
  - abort mid-stream
  - setup error and stream error
  - no ghost segments after cleanup

## Validation

- `npm run build` ✅
- `npm test` ✅
- `cargo test` ✅ (no Rust changes)
- Manual smoke:
  1. Send normal message → `idle -> preparing -> streaming -> finishing -> idle`
  2. Abort mid-stream → `streaming -> aborted -> idle`
  3. Force API error → `streaming/preparing -> errored`
  4. Dismiss error → `errored -> idle`

## Acceptance Criteria

- One authoritative turn state field: `phase`
- No representable state where active streaming and errored coexist
- Streaming text/thinking rendered from segment-derived selectors (no duplicate accumulation fields)
- `cancelStream` works via `phase`-owned controller
- Existing behavior and visuals remain unchanged

## Risks

- **Subscriber migration risk**: several UI sites currently select raw fields. Mitigation: add compatibility selectors first, then swap callsites.
- **AbortController non-serializable**: do not persist turn phase; keep store runtime-only.
- **Partial migration risk**: updating only half the callsites can cause stale UI. Mitigation: migrate `ChatInput`, `ChatPage`, and error banner together in one PR.

## Out of Scope

- Changing `runTurn()` event contract
- Multi-turn parallel streaming
- New UI affordances for phase debugging
