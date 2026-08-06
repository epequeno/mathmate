# Implementation Plan — Phase 15D: Turn Orchestrator E2E Tests

## Objective

Add high-fidelity contract tests for `runTurn()` using scripted `streamChat` generators so multi-round tool turns, aborts, and failures are covered by deterministic fixtures.

These are **in-process integration tests** (orchestrator + mocked deps), not live API tests.

## Contract Clarification (must match current code)

Current `runTurn()` contract:
- yields events of kinds:
  - `status`
  - `segments-changed`
  - `tool-round-started`
  - `tool-round-finished`
  - `turn-finished`
- on abort/error, it throws (it does **not** currently yield `turn-aborted` / `turn-error`)

Tests in this phase must assert against that real contract.

## Current Gaps

Existing unit tests cover happy-path fragments but not full fixture-style scenarios for:
- multi-round tool loops,
- max-tool-round cap behavior,
- abort before first chunk vs mid-stream,
- failures after partial output,
- deterministic ordering of event sequences across rounds.

## Proposed Design

### D.1 Fixture format

```ts
interface TurnFixture {
  name: string;
  input: TurnInput;
  rounds: Array<() => AsyncGenerator<StreamChunk>>; // one generator per streamChat call

  expectedEventKinds: TurnEvent["kind"][];

  // for abort/error scenarios
  expectedThrow?: {
    type: "abort" | "error";
    messageIncludes?: string;
  };

  expected: {
    streamChatCalls: number;
    executeToolCalls?: Array<{ toolName: string }>;
    appendMessageMinCalls: number;
    finalAssistantTextIncludes?: string;
  };
}
```

### D.2 Helper utilities

- `chunks(...items)` → async generator emitting `StreamChunk`s
- `delayedChunks(items, delayMs)` → deterministic timing helper (fake timers in tests)
- `toolCallDeltaChunk({ index, id, name, argsPart })` → standard tool-call delta chunk
- `collect(gen)` → captures yielded events until completion/throw

### D.3 Scenario suite (8 fixtures)

1. text-only success
2. single-tool round trip
3. multi-tool sequence across rounds
4. abort pre-stream (signal already aborted)
5. abort mid-stream
6. error pre-stream (`streamChat` throws immediately)
7. error mid-stream (after partial text)
8. max-tool-round cap (`MAX_TOOL_ROUNDS` reached)

## Task Checklist

- [ ] Create `src/lib/turn/orchestrator.e2e.test.ts`
- [ ] Add fixture runner (`runFixture`) and shared helpers
- [ ] Implement 8 fixtures above
- [ ] Assert event-kind order for each fixture
- [ ] Assert thrown behavior for abort/error fixtures
- [ ] Assert dependency calls (`streamChat`, `executeTool`, `appendMessage`)
- [ ] Assert max-round fixture appends "Stopped after 3 tool rounds..."
- [ ] Add to default `npm test` suite

## Validation

- `npm run build` ✅
- `npm test` ✅
- `cargo test` ✅
- Test runtime target: < 5s on CI

## Acceptance Criteria

- 8 deterministic fixtures pass with no network calls
- Event sequences are asserted against current orchestrator contract
- Abort/error scenarios validate thrown-path behavior explicitly
- Tool scenarios validate `executeTool` call count + names
- Max-round scenario validates final fallback assistant message

## Risks

- **Flaky timing assertions**: mitigate via fake timers or zero-delay helpers.
- **Contract drift**: if orchestrator event kinds change, fixture baseline must be updated in same PR.
- **Over-asserting internals**: assert public events/dependency calls, not private local variables.

## Out of Scope

- Live API integration/snapshot tests
- UI visual regression testing
- Multi-turn parallel execution semantics
