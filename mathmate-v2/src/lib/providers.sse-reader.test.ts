/**
 * Phase 15C — SSE frame reader tests
 *
 * Tests `readSSEFrames` against standard SSE stream shapes including
 * multi-line data, event fields, and edge cases.
 */

import { describe, it, expect } from "vitest";
import { readSSEFrames, type SSEFrame } from "../lib/providers";

async function collectFrames(chunks: string[]): Promise<SSEFrame[]> {
  const encoder = new TextEncoder();
  let chunkIndex = 0;

  const reader: ReadableStreamDefaultReader<Uint8Array> = {
    read(): Promise<ReadableStreamReadResult<Uint8Array>> {
      if (chunkIndex < chunks.length) {
        const value = encoder.encode(chunks[chunkIndex++] ?? "");
        return Promise.resolve({ done: false, value });
      }
      return Promise.resolve({ done: true, value: undefined });
    },
    releaseLock() {},
    cancel() { return Promise.resolve(); },
    get closed() { return Promise.resolve(undefined as any); },
  };

  const results: SSEFrame[] = [];
  for await (const frame of readSSEFrames(reader)) {
    results.push(frame);
  }
  return results;
}

describe("readSSEFrames", () => {
  it("single-line data", async () => {
    const frames = await collectFrames(["data: hello\n\n"]);
    expect(frames).toEqual([{ event: "message", data: "hello" }]);
  });

  it("multi-line data", async () => {
    const frames = await collectFrames(["data: line1\ndata: line2\n\n"]);
    expect(frames).toEqual([{ event: "message", data: "line1\nline2" }]);
  });

  it("explicit event field", async () => {
    const frames = await collectFrames(["event: update\ndata: payload\n\n"]);
    expect(frames).toEqual([{ event: "update", data: "payload" }]);
  });

  it("multiple frames in one chunk", async () => {
    const frames = await collectFrames(["data: first\n\ndata: second\n\n"]);
    expect(frames).toEqual([
      { event: "message", data: "first" },
      { event: "message", data: "second" },
    ]);
  });

  it("split across chunks", async () => {
    const frames = await collectFrames(["data: part", "ial\n\n"]);
    expect(frames).toEqual([{ event: "message", data: "partial" }]);
  });

  it("data split across three chunks", async () => {
    const frames = await collectFrames(["da", "ta: value\n", "\n"]);
    expect(frames).toEqual([{ event: "message", data: "value" }]);
  });

  it("event + multi-line data split across chunks", async () => {
    const frames = await collectFrames([
      "event: update\ndata: line1\n",
      "data: line2\n\n",
    ]);
    expect(frames).toEqual([{ event: "update", data: "line1\nline2" }]);
  });

  it("comment lines are ignored", async () => {
    const frames = await collectFrames([": this is a comment\ndata: actual\n\n"]);
    expect(frames).toEqual([{ event: "message", data: "actual" }]);
  });

  it("ping frame", async () => {
    const frames = await collectFrames(["event: ping\ndata: {}\n\n"]);
    expect(frames).toEqual([{ event: "ping", data: "{}" }]);
  });

  it("frame without data is ignored", async () => {
    // event-only line with no data is not a valid SSE frame
    const frames = await collectFrames(["event: heartbeat\n\n"]);
    expect(frames).toEqual([]);
  });

  it("handles Anthropic SSE format", async () => {
    // This simulates a typical Anthropic stream delimiter pattern
    const frames = await collectFrames([
      "event: message_start\ndata: {\"type\":\"message_start\",\"message\":{\"id\":\"msg_1\"}}\n\n",
      "event: content_block_start\ndata: {\"type\":\"content_block_start\",\"index\":0,\"content_block\":{\"type\":\"text\",\"text\":\"Hello\"}}\n\n",
      "event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"text_delta\",\"text\":\" world\"}}\n\n",
      "event: message_stop\ndata: {\"type\":\"message_stop\"}\n\n",
    ]);

    expect(frames).toHaveLength(4);
    expect(frames[0].event).toBe("message_start");
    expect(frames[1].event).toBe("content_block_start");
    expect(frames[2].event).toBe("content_block_delta");
    expect(frames[3].event).toBe("message_stop");

    // Verify JSON parses
    for (const f of frames) {
      expect(() => JSON.parse(f.data)).not.toThrow();
    }
  });

  it("Anthropic split across small chunks", async () => {
    // Simulate reality where Uint8Array boundaries don't align with frame boundaries
    const frames = await collectFrames([
      "event: content_block_start\ndata: {\"type\":\"conten",
      "t_block_start\",\"index\":0,\"content_block\":{\"type\":",
      "\"text\",\"text\":\"Split\"}}\n\n",
    ]);

    expect(frames).toHaveLength(1);
    expect(frames[0].event).toBe("content_block_start");
    expect(() => JSON.parse(frames[0].data)).not.toThrow();
  });
});
