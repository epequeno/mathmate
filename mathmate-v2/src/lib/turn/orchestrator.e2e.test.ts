/**
 * Phase 15D — Turn orchestrator E2E contract tests
 *
 * Deterministic fixtures using mocked `streamChat` generators.
 * No live network — asserts event sequences, dependency calls, and
 * thrown-behavior paths against the current `runTurn()` contract.
 */

import { describe, it, expect, vi } from "vitest";
import { runTurn } from "./orchestrator";
import type { TurnEvent, TurnInput, TurnDeps } from "./types";
import type { StreamChunk, MessageSegment } from "../types";

// ─── Helpers ──────────────────────────────────────────────────────────

let uidCounter = 0;
function uid() {
  uidCounter++;
  return `uid-${uidCounter}`;
}

function makeSegment(fields: Partial<MessageSegment> & { type: string }): MessageSegment {
  return { id: uid(), ts: new Date().toISOString(), ...fields } as MessageSegment;
}

/** Create a simple StreamChunk async generator from an array of chunks. */
async function* chunks(items: StreamChunk[]): AsyncGenerator<StreamChunk> {
  for (const chunk of items) {
    yield chunk;
  }
}

/** Standard text-only stream chunks. */
function textChunks(text: string): StreamChunk[] {
  return [
    { text: text },
    { done: true },
  ];
}

/** Tool-call delta chunk. */
function toolCallChunk(index: number, id: string, name: string, argsPart: string): StreamChunk {
  const delta = { index, call_id_part: id, tool_name_part: name, arguments_part: argsPart };
  return {
    tool_call_delta: delta,
    tool_call_deltas: [delta],
  };
}

/** Collect all events from an async generator until completion. */
async function collect<T>(gen: AsyncGenerator<T>): Promise<T[]> {
  const results: T[] = [];
  for await (const event of gen) {
    results.push(event);
  }
  return results;
}

/** Collect events or catch the thrown error. */
async function collectOrThrow<T>(gen: AsyncGenerator<T>): Promise<{ events: T[]; threw: boolean; error?: any }> {
  const events: T[] = [];
  try {
    for await (const event of gen) {
      events.push(event);
    }
    return { events, threw: false };
  } catch (err) {
    return { events, threw: true, error: err };
  }
}

// ─── Mock dependency builder ──────────────────────────────────────────

interface MockDepsOptions {
  streamChatImpl?: (...args: any[]) => AsyncGenerator<StreamChunk>;
  executeToolImpl?: (callId: string, toolName: string, args: unknown, projectId?: string) => Promise<{ call_id: string; result: unknown; is_error: boolean }>;
  assembleResult?: any;
}

function makeDeps(opts: MockDepsOptions = {}): TurnDeps {
  const deps: any = {
    streamChat: vi.fn(opts.streamChatImpl || (async function* () {})),
    appendMessage: vi.fn(async (_sid: any, msg: any) => msg),
    loadSession: vi.fn(async (_sid: any) => ({ header: { id: _sid }, messages: [] })),
    executeTool: vi.fn(opts.executeToolImpl || (async (callId: any, toolName: any) => ({
      call_id: callId,
      result: `executed ${toolName}`,
      is_error: false,
    }))),
    buildPayload: vi.fn((messages: any) => messages),
    buildToolPayload: vi.fn((messages: any, tools: any) => ({ messages, tools })),
    assembleToolCalls: vi.fn(opts.assembleResult || (() => [])),
    makeMessage: vi.fn((role: any, text: any) => ({ role, content: text, segments: [] })),
    makeSegment: vi.fn(makeSegment),
    uid: vi.fn(uid),
    projectId: "proj-1",
  };
  return deps as TurnDeps;
}

function makeInput(overrides: Partial<TurnInput> = {}): TurnInput {
  return {
    sessionId: "sess-1",
    messagesWithSystem: [
      { role: "system", content: "You are a math tutor." },
      { role: "user", content: "What is 2+2?" },
    ],
    model: "claude-sonnet",
    provider: { name: "anthropic", base_url: "https://api.anthropic.com" } as any,
    toolDefinitions: [],
    signal: new AbortController().signal,
    ...overrides,
  };
}

// ─── Fixture 1: Text-only success ─────────────────────────────────────

describe("runTurn — Fixture 1: text-only success", () => {
  it("yields correct event sequence for a simple text response", async () => {
    const deps = makeDeps({
      streamChatImpl: () => chunks([...textChunks("The answer is 4.")]),
    });
    const input = makeInput();

    const events = await collect(runTurn(input, deps));

    const kinds = events.map((e) => e.kind);
    expect(kinds).toEqual([
      "status",
      "tool-round-started",
      "status",
      "segments-changed",
      "tool-round-finished",
      "status",
      "turn-finished",
    ]);

    // First status: streaming=true, empty text
    expect(events[0]).toMatchObject({ kind: "status", streaming: true, text: "", thinking: "" });
    // Second-to-last: streaming=false status
    expect(events[events.length - 2]).toMatchObject({ kind: "status", streaming: false });
    expect(deps.streamChat).toHaveBeenCalledOnce();
    expect(deps.appendMessage).toHaveBeenCalledTimes(1);
    const appendCall = vi.mocked(deps.appendMessage).mock.calls[0];
    expect(appendCall[1].role).toBe("assistant");
    expect(appendCall[1].content).toBe("The answer is 4.");
  });
});

// ─── Fixture 2: Single-tool round trip ────────────────────────────────

describe("runTurn — Fixture 2: single-tool round trip", () => {
  it("executes tool call and completes", async () => {
    let callCount = 0;
    const deps = makeDeps({
      streamChatImpl: () => {
        callCount++;
        if (callCount === 1) {
          // Round 0: tool call
          return chunks([
            { thinking: "Searching..." },
            toolCallChunk(0, "call-1", "search", '{"query":"pi"}'),
            { done: true },
          ]);
        }
        // Round 1: text response
        return chunks([...textChunks("Found relevant info.")]);
      },
      assembleResult: (deltas: any) => {
        if (!Array.isArray(deltas) || deltas.length === 0) return [];
        return [{
          call_id: "call-1",
          tool_name: "search",
          arguments: { query: "pi" },
        }];
      },
    });
    const input = makeInput({ toolDefinitions: [{ type: "function", function: { name: "search" } }] });

    const events = await collect(runTurn(input, deps));
    const kinds = events.map((e) => e.kind);

    expect(kinds).toContain("tool-round-started");
    expect(kinds).toContain("tool-round-finished");
    expect(kinds).toContain("turn-finished");
    expect(deps.executeTool).toHaveBeenCalledTimes(1);
    expect(vi.mocked(deps.executeTool).mock.calls[0][1]).toBe("search");
    expect(deps.loadSession).toHaveBeenCalledOnce();
    // assembleToolCalls called in each round (0 and 1); only round 0 has deltas
    expect(deps.assembleToolCalls).toHaveBeenCalledTimes(2);
  });
});

// ─── Fixture 3: Multi-tool sequence across rounds ─────────────────────

describe("runTurn — Fixture 3: multi-tool sequence across rounds", () => {
  it("completes two tool rounds then a text-only final", async () => {
    let callCount = 0;
    const deps = makeDeps({
      streamChatImpl: () => {
        callCount++;
        if (callCount === 1) {
          return chunks([
            toolCallChunk(0, "c1", "tool_a", "{}"),
            { done: true },
          ]);
        }
        if (callCount === 2) {
          return chunks([
            toolCallChunk(0, "c2", "tool_b", "{}"),
            { done: true },
          ]);
        }
        // Third call: text-only final (round runs toolRound<=3 but no tools)
        return chunks([...textChunks("Final answer")]);
      },
      assembleResult: (deltas: any) => {
        const assembled = [];
        for (let i = 0; i < (deltas as any[]).length; i++) {
          const tc = (deltas as any)[i];
          assembled.push({
            call_id: tc.call_id_part || `c${i}`,
            tool_name: tc.tool_name_part || "unknown",
            arguments: {},
          });
        }
        return assembled;
      },
    });
    const input = makeInput({
      toolDefinitions: [{ type: "function", function: { name: "tool_a" } }],
    });

    const events = await collect(runTurn(input, deps));
    const kinds = events.map((e) => e.kind);

    // streamChat called: 2 tool rounds + 1 text-only final = 3
    expect(vi.mocked(deps.streamChat).mock.calls.length).toBe(3);
    // executeTool called: 2 tool calls
    expect(vi.mocked(deps.executeTool).mock.calls.length).toBe(2);
    expect(kinds).toContain("turn-finished");

    // Check that appendMessage was called: 2 assistant-with-tools + 2 tool-result + 1 final = 5
    expect(vi.mocked(deps.appendMessage).mock.calls.length).toBeGreaterThanOrEqual(5);
  });
});

// ─── Fixture 4: Abort pre-stream ──────────────────────────────────────

describe("runTurn — Fixture 4: abort pre-stream", () => {
  it("throws AbortError when signal is already aborted", async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    const deps = makeDeps({
      streamChatImpl: () => chunks([{ text: "never called" }]),
    });
    const input = makeInput({ signal: ctrl.signal });

    const result = await collectOrThrow(runTurn(input, deps));

    expect(result.threw).toBe(true);
    expect(String(result.error?.name || result.error?.message || result.error)).toMatch(/abort|Abort/i);
    expect(deps.streamChat).not.toHaveBeenCalled();
  });
});

// ─── Fixture 5: Abort mid-stream ──────────────────────────────────────

describe("runTurn — Fixture 5: abort mid-stream", () => {
  it("throws when streamChat throws during streaming", async () => {
    const deps = makeDeps({
      streamChatImpl: async function* () {
        yield { text: "Partial answer..." };
        throw { kind: "cancelled", message: "Request cancelled" };
      },
    });
    const input = makeInput();

    const result = await collectOrThrow(runTurn(input, deps));

    expect(result.threw).toBe(true);
    // Events yielded before the throw
    expect(result.events.length).toBeGreaterThanOrEqual(2);
    expect(result.events[0]).toMatchObject({ kind: "status", streaming: true });
    expect(deps.streamChat).toHaveBeenCalledOnce();
  });
});

// ─── Fixture 6: Error pre-stream ──────────────────────────────────────

describe("runTurn — Fixture 6: error pre-stream", () => {
  it("throws when streamChat rejects immediately (not yet called)", async () => {
    const deps = makeDeps({
      streamChatImpl: () => {
        throw { kind: "network", message: "Failed to connect" };
      },
    });
    const input = makeInput();

    const result = await collectOrThrow(runTurn(input, deps));

    expect(result.threw).toBe(true);
    expect(result.error?.message).toMatch(/connect/i);
    expect(deps.streamChat).toHaveBeenCalledOnce();
    expect(deps.appendMessage).not.toHaveBeenCalled();
  });
});

// ─── Fixture 7: Error mid-stream ──────────────────────────────────────

describe("runTurn — Fixture 7: error mid-stream", () => {
  it("throws after partial text output (no message appended)", async () => {
    const deps = makeDeps({
      streamChatImpl: async function* () {
        yield { text: "Starting..." };
        yield { text: " more..." };
        throw { kind: "server", status: 502, message: "Server crashed" };
      },
    });
    const input = makeInput();

    const result = await collectOrThrow(runTurn(input, deps));

    expect(result.threw).toBe(true);
    expect(result.events.length).toBeGreaterThanOrEqual(2);
    expect(result.events[0]).toMatchObject({ kind: "status" });
    expect(deps.streamChat).toHaveBeenCalledOnce();
    expect(deps.appendMessage).not.toHaveBeenCalled();
  });
});

// ─── Fixture 8: Max-tool-round cap ────────────────────────────────────

describe("runTurn — Fixture 8: max-tool-round cap", () => {
  it("appends 'Stopped after 3 tool rounds' after 4 tool rounds", async () => {
    // MAX_TOOL_ROUNDS = 3 → loop runs while toolRound <= 3
    // toolRound starts at 0, increments after each tool-call round
    // Rounds 0, 1, 2, 3 all produce tool calls → toolRound becomes 4
    // Round 4: while check 4 <= 3 is false → loop exits
    // toolRound > MAX_TOOL_ROUNDS → 4 > 3 → append stopper message

    const deps = makeDeps({
      streamChatImpl: () => chunks([
        toolCallChunk(0, "call-x", "search", "{}"),
        { done: true },
      ]),
      assembleResult: () => [{ call_id: "call-x", tool_name: "search", arguments: {} }],
    });
    const input = makeInput({
      toolDefinitions: [{ type: "function", function: { name: "search" } }],
    });

    const events = await collect(runTurn(input, deps));

    const kinds = events.map((e) => e.kind);
    const started = kinds.filter((k) => k === "tool-round-started").length;
    const finished = kinds.filter((k) => k === "tool-round-finished").length;

    // 4 tool rounds (0, 1, 2, 3)
    expect(started).toBe(4);
    expect(finished).toBe(4);

    function expectAtLeast(actual: number, min: number, label: string) {
      expect(actual, `${label} should be >= ${min}`).toBeGreaterThanOrEqual(min);
    }

    expectAtLeast(vi.mocked(deps.streamChat).mock.calls.length, 4, "streamChat calls");
    expectAtLeast(vi.mocked(deps.executeTool).mock.calls.length, 4, "executeTool calls");

    // Last appended message should be the stopper
    const appendCalls = vi.mocked(deps.appendMessage).mock.calls;
    const lastMsg = appendCalls[appendCalls.length - 1][1];
    expect(lastMsg.content).toContain("Stopped after 3 tool rounds");
  });
});
