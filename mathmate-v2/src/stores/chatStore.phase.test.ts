/**
 * Phase 15B — chatStore turn FSM tests
 *
 * Tests the `phase: TurnPhase` discriminated union and its selectors.
 * Does NOT test the actual streaming (network I/O) — those are covered
 * by the orchestrator contract fixtures (Phase 15D).
 */

import { describe, it, expect } from "vitest";
import {
  type TurnPhase,
  IDLE,
  latestText,
  latestThinking,
  currentSegments,
  isTurnActive,
  isStreaming,
  currentAbortController,
  currentTurnError,
  isAborted,
  isTurnErrored,
} from "../lib/turn/phase";
import type { MessageSegment } from "../lib/types";

// ─── Helpers ──────────────────────────────────────────────────────────

function makeSegment(type: "content" | "thinking", partial: Record<string, unknown>): MessageSegment {
  return {
    id: "seg-1",
    ts: "2026-01-01T00:00:00Z",
    type,
    ...partial,
  } as MessageSegment;
}

function makeContent(text: string): MessageSegment {
  return makeSegment("content", { text });
}

function makeThinking(content: string): MessageSegment {
  return makeSegment("thinking", { content });
}

// ─── Selectors ────────────────────────────────────────────────────────

describe("phase selectors", () => {
  describe("isTurnActive", () => {
    it("idle: false", () => expect(isTurnActive(IDLE)).toBe(false));
    it("preparing: true", () =>
      expect(isTurnActive({ kind: "preparing", sessionId: "s1", capturedInput: "q" })).toBe(true));
    it("streaming: true", () =>
      expect(isTurnActive({ kind: "streaming", sessionId: "s1", round: 0, streamSegments: [], abortController: new AbortController() })).toBe(true));
    it("finishing: true", () =>
      expect(isTurnActive({ kind: "finishing", sessionId: "s1", streamSegments: [] })).toBe(true));
    it("aborted: false", () =>
      expect(isTurnActive({ kind: "aborted", sessionId: "s1", partialSegments: [], partialText: "", partialThinking: "" })).toBe(false));
    it("errored: false", () =>
      expect(isTurnActive({ kind: "errored", sessionId: "s1", partialSegments: [], error: { kind: "internal", message: "" } })).toBe(false));
  });

  describe("isStreaming", () => {
    it("idle: false", () => expect(isStreaming(IDLE)).toBe(false));
    it("preparing: false", () =>
      expect(isStreaming({ kind: "preparing", sessionId: "s1", capturedInput: "q" })).toBe(false));
    it("streaming: true", () =>
      expect(isStreaming({ kind: "streaming", sessionId: "s1", round: 0, streamSegments: [], abortController: new AbortController() })).toBe(true));
    it("finishing: false", () =>
      expect(isStreaming({ kind: "finishing", sessionId: "s1", streamSegments: [] })).toBe(false));
    it("aborted: false", () =>
      expect(isStreaming({ kind: "aborted", sessionId: "s1", partialSegments: [], partialText: "", partialThinking: "" })).toBe(false));
    it("errored: false", () =>
      expect(isStreaming({ kind: "errored", sessionId: "s1", partialSegments: [], error: { kind: "internal", message: "" } })).toBe(false));
  });

  describe("latestText", () => {
    it("idle: empty", () => expect(latestText(IDLE)).toBe(""));
    it("preparing: empty", () =>
      expect(latestText({ kind: "preparing", sessionId: "s1", capturedInput: "q" })).toBe(""));
    it("streaming: extracts content segments", () =>
      expect(latestText({
        kind: "streaming",
        sessionId: "s1",
        round: 0,
        streamSegments: [makeContent("Hello "), makeContent("world")],
        abortController: new AbortController(),
      })).toBe("Hello world"));
    it("finishing: extracts content segments", () =>
      expect(latestText({
        kind: "finishing",
        sessionId: "s1",
        streamSegments: [makeContent("Done")],
      })).toBe("Done"));
    it("aborted: extracts from partialSegments", () =>
      expect(latestText({
        kind: "aborted",
        sessionId: "s1",
        partialSegments: [makeContent("Partial")],
        partialText: "Partial",
        partialThinking: "",
      })).toBe("Partial"));
    it("errored: empty (no content)", () =>
      expect(latestText({
        kind: "errored",
        sessionId: "s1",
        partialSegments: [],
        error: { kind: "network", message: "Failed" },
      })).toBe(""));
  });

  describe("latestThinking", () => {
    it("idle: empty", () => expect(latestThinking(IDLE)).toBe(""));
    it("streaming: extracts thinking segments", () =>
      expect(latestThinking({
        kind: "streaming",
        sessionId: "s1",
        round: 0,
        streamSegments: [makeThinking("Let me solve..."), makeContent("The answer is 42.")],
        abortController: new AbortController(),
      })).toBe("Let me solve..."));
    it("finishing: extracts thinking segments", () =>
      expect(latestThinking({
        kind: "finishing",
        sessionId: "s1",
        streamSegments: [makeThinking("Checked")],
      })).toBe("Checked"));
    it("aborted: extracts from partialThinking", () =>
      expect(latestThinking({
        kind: "aborted",
        sessionId: "s1",
        partialSegments: [],
        partialText: "",
        partialThinking: "WIP",
      })).toBe("WIP"));
  });

  describe("currentSegments", () => {
    const segs = [makeContent("Hi")];
    it("idle: empty array", () => expect(currentSegments(IDLE)).toEqual([]));
    it("preparing: empty array", () =>
      expect(currentSegments({ kind: "preparing", sessionId: "s1", capturedInput: "q" })).toEqual([]));
    it("streaming: returns segments", () =>
      expect(currentSegments({
        kind: "streaming",
        sessionId: "s1",
        round: 0,
        streamSegments: segs,
        abortController: new AbortController(),
      })).toBe(segs));
    it("finishing: returns segments", () =>
      expect(currentSegments({ kind: "finishing", sessionId: "s1", streamSegments: segs })).toBe(segs));
    it("aborted: returns partialSegments", () =>
      expect(currentSegments({
        kind: "aborted",
        sessionId: "s1",
        partialSegments: segs,
        partialText: "",
        partialThinking: "",
      })).toBe(segs));
    it("errored: empty (errored has no segments field)", () =>
      expect(currentSegments({
        kind: "errored",
        sessionId: "s1",
        partialSegments: [],
        error: { kind: "internal", message: "" },
      })).toEqual([]));
  });

  describe("currentAbortController", () => {
    it("idle: null", () => expect(currentAbortController(IDLE)).toBeNull());
    it("preparing: null (controller not yet created)", () =>
      expect(currentAbortController({ kind: "preparing", sessionId: "s1", capturedInput: "q" })).toBeNull());
    it("streaming: returns the controller", () => {
      const ctrl = new AbortController();
      const phase: TurnPhase = {
        kind: "streaming",
        sessionId: "s1",
        round: 0,
        streamSegments: [],
        abortController: ctrl,
      };
      expect(currentAbortController(phase)).toBe(ctrl);
    });
    it("finishing: null", () =>
      expect(currentAbortController({ kind: "finishing", sessionId: "s1", streamSegments: [] })).toBeNull());
    it("aborted: null", () =>
      expect(currentAbortController({ kind: "aborted", sessionId: "s1", partialSegments: [], partialText: "", partialThinking: "" })).toBeNull());
  });

  describe("currentTurnError", () => {
    it("idle: null", () => expect(currentTurnError(IDLE)).toBeNull());
    it("preparing: null", () =>
      expect(currentTurnError({ kind: "preparing", sessionId: "s1", capturedInput: "q" })).toBeNull());
    it("streaming: null", () =>
      expect(currentTurnError({ kind: "streaming", sessionId: "s1", round: 0, streamSegments: [], abortController: new AbortController() })).toBeNull());
    it("errored: returns the error", () => {
      const err = { kind: "network", message: "Failed to reach server" } as const;
      expect(currentTurnError({ kind: "errored", sessionId: "s1", partialSegments: [], error: err })).toEqual(err);
    });
    it("aborted: null", () =>
      expect(currentTurnError({ kind: "aborted", sessionId: "s1", partialSegments: [], partialText: "", partialThinking: "" })).toBeNull());
  });

  describe("isAborted", () => {
    it("aborted: true", () =>
      expect(isAborted({ kind: "aborted", sessionId: "s1", partialSegments: [], partialText: "", partialThinking: "" })).toBe(true));
    it("errored: false", () =>
      expect(isAborted({ kind: "errored", sessionId: "s1", partialSegments: [], error: { kind: "internal", message: "" } })).toBe(false));
    it("streaming: false", () =>
      expect(isAborted({ kind: "streaming", sessionId: "s1", round: 0, streamSegments: [], abortController: new AbortController() })).toBe(false));
  });

  describe("isTurnErrored", () => {
    it("errored: true", () =>
      expect(isTurnErrored({ kind: "errored", sessionId: "s1", partialSegments: [], error: { kind: "internal", message: "" } })).toBe(true));
    it("aborted: false", () =>
      expect(isTurnErrored({ kind: "aborted", sessionId: "s1", partialSegments: [], partialText: "", partialThinking: "" })).toBe(false));
    it("streaming: false", () =>
      expect(isTurnErrored({ kind: "streaming", sessionId: "s1", round: 0, streamSegments: [], abortController: new AbortController() })).toBe(false));
  });
});

// ─── Phase shape invariants ───────────────────────────────────────────

describe("TurnPhase discriminated union invariants", () => {
  it("idle has no extra fields", () => {
    const idle = IDLE;
    expect(Object.keys(idle)).toEqual(["kind"]);
  });

  it("preparing carries sessionId and capturedInput", () => {
    const phase = { kind: "preparing" as const, sessionId: "s1", capturedInput: "What is 2+2?" };
    expect(phase.kind).toBe("preparing");
    expect(phase.sessionId).toBe("s1");
    expect(phase.capturedInput).toBe("What is 2+2?");
  });

  it("streaming has abortController only in that variant", () => {
    const ctrl = new AbortController();
    const phase = { kind: "streaming" as const, sessionId: "s1", round: 0, streamSegments: [], abortController: ctrl };
    expect("abortController" in phase).toBe(true);
    expect("abortController" in IDLE).toBe(false);
  });

  it("errored carries AppError with kind+message", () => {
    const phase = {
      kind: "errored" as const,
      sessionId: "s1",
      partialSegments: [],
      error: { kind: "auth" as const, message: "Invalid API key" },
    };
    expect(phase.error.kind).toBe("auth");
    expect(phase.error.message).toBe("Invalid API key");
  });

  it("aborted carries partial text and thinking", () => {
    const phase = {
      kind: "aborted" as const,
      sessionId: "s1",
      partialSegments: [makeContent("Part 1")],
      partialText: "Part 1",
      partialThinking: "Thinking...",
    };
    expect(phase.partialText).toBe("Part 1");
    expect(phase.partialThinking).toBe("Thinking...");
  });

  it("finishing has streamSegments (not partialSegments)", () => {
    const phase = {
      kind: "finishing" as const,
      sessionId: "s1",
      streamSegments: [makeContent("Final answer")],
    };
    expect("streamSegments" in phase).toBe(true);
    expect("partialSegments" in phase).toBe(false);
  });
});

// ─── Text derivation invariants ────────────────────────────────────────

describe("text derivation from segments", () => {
  it("ignores thinking segments in latestText", () =>
    expect(latestText({
      kind: "streaming",
      sessionId: "s1",
      round: 0,
      streamSegments: [makeThinking("Working..."), makeContent("42")],
      abortController: new AbortController(),
    })).toBe("42"));

  it("ignores non-content/non-thinking segments in latestText", () =>
    expect(latestText({
      kind: "streaming",
      sessionId: "s1",
      round: 0,
      streamSegments: [
        makeContent("A"),
        { id: "x", ts: "1", type: "tool_call" as const, tool_name: "foo", arguments: {}, call_id: "1", status: "running" },
        makeContent("B"),
      ],
      abortController: new AbortController(),
    })).toBe("AB"));

  it("latestThinking ignores content segments", () =>
    expect(latestThinking({
      kind: "streaming",
      sessionId: "s1",
      round: 0,
      streamSegments: [makeContent("Answer"), makeThinking("Reasoning")],
      abortController: new AbortController(),
    })).toBe("Reasoning"));
});

// ─── IDLE singleton ────────────────────────────────────────────────────

describe("IDLE", () => {
  it("has kind 'idle'", () => expect(IDLE.kind).toBe("idle"));
  it("is falsy for all transition predicates", () => {
    expect(isTurnActive(IDLE)).toBe(false);
    expect(isStreaming(IDLE)).toBe(false);
    expect(isAborted(IDLE)).toBe(false);
    expect(isTurnErrored(IDLE)).toBe(false);
    expect(currentAbortController(IDLE)).toBeNull();
    expect(currentTurnError(IDLE)).toBeNull();
    expect(latestText(IDLE)).toBe("");
    expect(latestThinking(IDLE)).toBe("");
    expect(currentSegments(IDLE)).toEqual([]);
  });
});
