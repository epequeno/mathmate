// ─── Stream Turn Orchestrator Tests ────────────────────────────────────
//
// Unit tests for the async generator `runTurn`.  All I/O is mocked via
// TurnDeps; no live stores, no network, no Tauri.
//
// See: Implementation_Phase14B_StreamTurnOrchestrator.md

import { describe, it, expect, vi } from "vitest";
import { runTurn } from "./orchestrator";
import type { TurnInput, TurnDeps, TurnEvent } from "./types";

// ─── Helpers ──────────────────────────────────────────────────────────

/** Collect all events from a generator into an array. */
async function collectEvents(
  gen: AsyncGenerator<TurnEvent>,
): Promise<TurnEvent[]> {
  const events: TurnEvent[] = [];
  for await (const event of gen) {
    events.push(event);
  }
  return events;
}

/** Create a mock async generator from an array of chunks. */
async function* mockStream(...chunks: any[]): AsyncGenerator<any> {
  for (const chunk of chunks) {
    yield chunk;
  }
}

/** Minimal TurnInput for tests. */
function makeInput(overrides?: Partial<TurnInput>): TurnInput {
  return {
    sessionId: "s1",
    messagesWithSystem: [
      { role: "system", content: "You are helpful." },
      { role: "user", content: "Hello" },
    ],
    model: "test-model",
    provider: {
      name: "test",
      enabled: true,
      base_url: "http://localhost",
      models: ["test-model"],
      default_model: "test-model",
      fetch_models: false,
    },
    toolDefinitions: [],
    memoryEnabled: false,
    userInputText: "Hello",
    signal: new AbortController().signal,
    ...overrides,
  };
}

/** Minimal TurnDeps with overridable mocks. */
function makeDeps(overrides?: Partial<TurnDeps>): TurnDeps {
  return {
    streamChat: vi.fn().mockImplementation(() => mockStream()),
    appendMessage: vi.fn().mockResolvedValue(undefined),
    loadSession: vi.fn().mockResolvedValue(undefined),
    executeTool: vi.fn().mockResolvedValue({
      call_id: "c1",
      result: { value: 42 },
      is_error: false,
    }),
    storeMemory: vi.fn().mockResolvedValue(undefined),
    buildPayload: vi.fn((msgs: any[]) => msgs),
    buildToolPayload: vi.fn((msgs: any[], tools: any[]) => ({
      messages: msgs,
      tools,
    })),
    assembleToolCalls: vi.fn().mockReturnValue([]),
    makeMessage: vi.fn((role: string, text: string) => ({
      role,
      content: [{ type: "text", text }],
      segments: [],
    })),
    makeSegment: vi.fn((kind: any) => ({
      ...kind,
      id: "seg-1",
      ts: new Date().toISOString(),
    })),
    uid: vi.fn(() => "uid-1"),
    projectId: undefined,
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────

describe("runTurn — text-only turn", () => {
  it("yields status updates and finishes", async () => {
    const deps = makeDeps({
      streamChat: vi.fn().mockImplementation(() =>
        mockStream(
          { text: "Hello" },
          { thinking: "thinking..." },
          { text: " world" },
          { done: true },
        ),
      ),
    });

    const input = makeInput();
    const events = await collectEvents(runTurn(input, deps));

    // Should start streaming
    expect(events[0]).toMatchObject({
      kind: "status",
      streaming: true,
      text: "",
    });

    // Should have a status with accumulated "Hello"
    const textEvents = events.filter(
      (e) => e.kind === "status" && e.text.includes("Hello"),
    );
    expect(textEvents.length).toBeGreaterThan(0);

    // Should finish
    const finishEvents = events.filter((e) => e.kind === "turn-finished");
    expect(finishEvents.length).toBe(1);

    // appendMessage should have been called with the final message
    expect(deps.appendMessage).toHaveBeenCalled();
    const call = (deps.appendMessage as any).mock.calls[0];
    expect(call[0]).toBe("s1");
    expect(call[1].role).toBe("assistant");
  });

  it("accumulates text across multiple chunks", async () => {
    const deps = makeDeps({
      streamChat: vi.fn().mockImplementation(() =>
        mockStream(
          { text: "Part " },
          { text: "One" },
          { text: "." },
          { done: true },
        ),
      ),
    });

    const input = makeInput();
    const events = await collectEvents(runTurn(input, deps));

    // Last status event before finish should contain accumulated text
    const statusEvents = events.filter((e) => e.kind === "status");
    const lastStatus = statusEvents[statusEvents.length - 2]; // before finish status
    expect(lastStatus.text).toContain("Part One.");
  });
});

describe("runTurn — tool round", () => {
  it("executes a single tool round and returns to text", async () => {
    // Use a call counter to return different streams for each round.
    let callCount = 0;
    const deps = makeDeps({
      streamChat: vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return mockStream(
            { text: "Let me calculate" },
            {
              tool_call_deltas: [
                {
                  index: 0,
                  call_id_part: "call-1",
                  tool_name_part: "calculate",
                  arguments_part: '{"expr":"2+2"}',
                },
              ],
            },
            { done: true },
          );
        }
        // Second round: model responds after tool result
        return mockStream(
          { text: "The answer is 4" },
          { done: true },
        );
      }),
      assembleToolCalls: vi.fn().mockImplementation((deltas: any[]) => {
        // Only return tool calls if deltas actually contain tool_call info.
        if (deltas.length > 0 && deltas[0]?.tool_name_part) {
          return [
            {
              call_id: "call-1",
              tool_name: "calculate",
              arguments: { expr: "2+2" },
            },
          ];
        }
        return [];
      }),
      executeTool: vi.fn().mockResolvedValue({
        call_id: "call-1",
        result: { value: 4 },
        is_error: false,
      }),
    });

    const input = makeInput({
      toolDefinitions: [
        {
          type: "function",
          function: {
            name: "calculate",
            description: "Evaluate math",
            parameters: {},
          },
        },
      ],
    });

    const events = await collectEvents(runTurn(input, deps));

    // Should have two rounds
    const roundStarted = events.filter((e) => e.kind === "tool-round-started");
    expect(roundStarted.length).toBeGreaterThanOrEqual(1);

    // Should have executed the tool
    expect(deps.executeTool).toHaveBeenCalledWith(
      "call-1",
      "calculate",
      { expr: "2+2" },
      undefined,
    );

    // Should finish with the final text
    const statusEvents = events.filter((e) => e.kind === "status");
    const texts = statusEvents.map((e) => e.text).join("");
    expect(texts).toContain("The answer is 4");

    // Should finish
    expect(events.some((e) => e.kind === "turn-finished")).toBe(true);

    // Both streamChat calls should have happened
    expect(deps.streamChat).toHaveBeenCalledTimes(2);
  });

  it("handles tool execution timeout gracefully", async () => {
    let callCount = 0;
    const deps = makeDeps({
      streamChat: vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return mockStream(
            {
              tool_call_deltas: [
                {
                  index: 0,
                  call_id_part: "call-1",
                  tool_name_part: "calculate",
                  arguments_part: "{}",
                },
              ],
            },
            { done: true },
          );
        }
        return mockStream(
          { text: "Retrying after timeout" },
          { done: true },
        );
      }),
      assembleToolCalls: vi.fn().mockImplementation((deltas: any[]) => {
        if (deltas.length > 0 && deltas[0]?.tool_name_part) {
          return [
            {
              call_id: "call-1",
              tool_name: "calculate",
              arguments: {},
            },
          ];
        }
        return [];
      }),
      executeTool: vi.fn().mockRejectedValue(
        new Error("Tool execution timed out"),
      ),
    });

    const input = makeInput({
      toolDefinitions: [
        {
          type: "function",
          function: {
            name: "calculate",
            description: "Evaluate",
            parameters: {},
          },
        },
      ],
    });

    const events = await collectEvents(runTurn(input, deps));

    // Should still finish (tool timeout is non-fatal)
    expect(events.some((e) => e.kind === "turn-finished")).toBe(true);
    expect(deps.streamChat).toHaveBeenCalledTimes(2);
  });

  it("caps at max tool rounds", async () => {
    // Each round returns tool calls, up to MAX_TOOL_ROUNDS=3
    const toolStream = () =>
      mockStream(
        {
          tool_call_deltas: [
            {
              index: 0,
              call_id_part: "call-1",
              tool_name_part: "calculate",
              arguments_part: "{}",
            },
          ],
        },
        { done: true },
      );

    const deps = makeDeps({
      streamChat: vi.fn().mockImplementation(toolStream),
      assembleToolCalls: vi.fn().mockReturnValue([
        {
          call_id: "call-1",
          tool_name: "calculate",
          arguments: {},
        },
      ]),
      executeTool: vi.fn().mockResolvedValue({
        call_id: "call-1",
        result: { value: 0 },
        is_error: false,
      }),
    });

    const input = makeInput({
      toolDefinitions: [
        {
          type: "function",
          function: {
            name: "calculate",
            description: "Eval",
            parameters: {},
          },
        },
      ],
    });

    const events = await collectEvents(runTurn(input, deps));

    // Should have 3+1 rounds (MAX_TOOL_ROUNDS + initial)
    const roundStarted = events.filter((e) => e.kind === "tool-round-started");
    // Round 0 (no tool calls yet), then rounds 1, 2, 3 (each with tool calls) = 4 rounds
    expect(roundStarted.length).toBe(4); // rounds 0, 1, 2, 3

    // appendMessage should have been called for the "stopped after max rounds" message
    const lastAppendCalls = (deps.appendMessage as any).mock.calls;
    const lastMsg = lastAppendCalls[lastAppendCalls.length - 1]?.[1];
    expect(lastMsg?.content?.[0]?.text).toContain("Stopped after");
  });
});

describe("runTurn — abort", () => {
  it("throws on aborted signal before streaming starts", async () => {
    const controller = new AbortController();
    controller.abort();

    const input = makeInput({ signal: controller.signal });
    const deps = makeDeps();

    await expect(collectEvents(runTurn(input, deps))).rejects.toThrow(
      "Aborted",
    );
  });

  it("throws on signal aborted mid-stream", async () => {
    const controller = new AbortController();

    const deps = makeDeps({
      streamChat: vi.fn().mockImplementation(async function* () {
        yield { text: "Hello" };
        controller.abort(); // Signal abort mid-stream
        // The orchestrator checks signal.aborted after each chunk
        yield { text: " world" };
      }),
    });

    const input = makeInput({ signal: controller.signal });

    await expect(collectEvents(runTurn(input, deps))).rejects.toThrow(
      "Aborted",
    );
  });
});

describe("runTurn — errors", () => {
  it("throws on streamChat error", async () => {
    const deps = makeDeps({
      streamChat: vi.fn().mockImplementation(async function* () {
        yield { text: "Hello" };
        throw new Error("Network failure");
      }),
    });

    const input = makeInput();

    await expect(collectEvents(runTurn(input, deps))).rejects.toThrow(
      "Network failure",
    );
  });

  it("throws on 1 MB text overflow", async () => {
    const hugeText = "x".repeat(1_100_000); // > 1 MB

    const deps = makeDeps({
      streamChat: vi.fn().mockImplementation(async function* () {
        yield { text: hugeText };
        yield { done: true };
      }),
    });

    const input = makeInput();

    await expect(collectEvents(runTurn(input, deps))).rejects.toThrow(
      "Response exceeded 1 MB limit",
    );
  });

  it("throws on 1 MB thinking overflow", async () => {
    const hugeThinking = "y".repeat(1_100_000);

    const deps = makeDeps({
      streamChat: vi.fn().mockImplementation(async function* () {
        yield { thinking: hugeThinking };
        yield { done: true };
      }),
    });

    const input = makeInput();

    await expect(collectEvents(runTurn(input, deps))).rejects.toThrow(
      "Thinking trace exceeded 1 MB limit",
    );
  });
});

describe("runTurn — memory storage", () => {
  it("calls storeMemory when memoryEnabled is true", async () => {
    const deps = makeDeps({
      streamChat: vi.fn().mockImplementation(() =>
        mockStream({ text: "Hello" }, { done: true }),
      ),
    });

    const input = makeInput({
      memoryEnabled: true,
      userInputText: "Original user question",
    });

    const events = await collectEvents(runTurn(input, deps));

    expect(deps.storeMemory).toHaveBeenCalledWith(
      "Original user question",
      "s1",
    );
  });

  it("does not call storeMemory when memoryEnabled is false", async () => {
    const deps = makeDeps({
      streamChat: vi.fn().mockImplementation(() =>
        mockStream({ text: "Hello" }, { done: true }),
      ),
    });

    const input = makeInput({ memoryEnabled: false });

    const events = await collectEvents(runTurn(input, deps));

    expect(deps.storeMemory).not.toHaveBeenCalled();
  });
});

describe("runTurn — segment accumulation", () => {
  it("creates thinking and content segments from chunks", async () => {
    const deps = makeDeps({
      streamChat: vi.fn().mockImplementation(() =>
        mockStream(
          { thinking: "Let me think..." },
          { text: "Here is my answer" },
          { done: true },
        ),
      ),
    });

    const input = makeInput();
    const events = await collectEvents(runTurn(input, deps));

    // Should have status events with segments
    const statusWithSegments = events.filter(
      (e) => e.kind === "status" && (e as any).segments?.length > 0,
    ) as { kind: "status"; streaming: boolean; text: string; thinking: string; segments: any[] }[];
    expect(statusWithSegments.length).toBeGreaterThan(0);

    // Last meaningful status should have both thinking and content
    const lastStatusWithBoth = statusWithSegments.find(
      (e) =>
        e.segments.some((s: any) => s.type === "thinking") &&
        e.segments.some((s: any) => s.type === "content"),
    );
    expect(lastStatusWithBoth).toBeDefined();
  });
});
