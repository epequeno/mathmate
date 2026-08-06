/**
 * Phase 15C — Anthropic wire-protocol parser tests
 *
 * Tests `parseAnthropicFrame` against real Anthropic SSE event shapes.
 * No live network — all tests use JSON event fixtures.
 */

import { describe, it, expect } from "vitest";
import {
  parseAnthropicFrame,
  convertMessagesToAnthropicBlocks,
  convertToolsToAnthropicSchema,
} from "../lib/providers";
import type { AnthropicParseState } from "../lib/providers";

// ─── Helpers ──────────────────────────────────────────────────────────

function freshState(): AnthropicParseState {
  return {
    toolArgsByIndex: new Map(),
    toolNameByIndex: new Map(),
    callIdByIndex: new Map(),
  };
}

// ─── convertMessagesToAnthropicBlocks ─────────────────────────────────

describe("convertMessagesToAnthropicBlocks", () => {
  it("converts simple user message", () => {
    const result = convertMessagesToAnthropicBlocks([
      { role: "user", content: "Hello" },
    ]);
    expect(result.system).toEqual([]);
    expect(result.messages).toEqual([{ role: "user", content: "Hello" }]);
  });

  it("extracts system messages to top-level system array", () => {
    const result = convertMessagesToAnthropicBlocks([
      { role: "system", content: "You are a math tutor." },
      { role: "user", content: "What is 2+2?" },
    ]);
    expect(result.system).toEqual([{ type: "text", text: "You are a math tutor." }]);
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]).toEqual({ role: "user", content: "What is 2+2?" });
  });

  it("converts user message with image parts", () => {
    const result = convertMessagesToAnthropicBlocks([
      {
        role: "user",
        content: [
          { type: "text", text: "Solve this" },
          { type: "image_url", image_url: { url: "data:image/jpeg;base64,/9j/4AAQ==" } },
        ],
      },
    ]);
    expect(result.messages[0].role).toBe("user");
    const content = result.messages[0].content as Record<string, unknown>[];
    expect(content).toHaveLength(2);
    expect(content[0]).toEqual({ type: "text", text: "Solve this" });
    expect(content[1].type).toBe("image");
    expect((content[1] as any).source.type).toBe("base64");
    expect((content[1] as any).source.media_type).toBe("image/jpeg");
  });

  it("converts assistant tool calls to tool_use blocks", () => {
    const result = convertMessagesToAnthropicBlocks([
      { role: "user", content: "Search for pi" },
      {
        role: "assistant",
        content: "",
        tool_calls: [
          {
            id: "call_1",
            type: "function",
            function: {
              name: "search_textbook",
              arguments: JSON.stringify({ query: "pi" }),
            },
          },
        ],
      },
    ]);
    const last = result.messages[1] as any;
    expect(last.role).toBe("assistant");
    const blocks = last.content as Record<string, unknown>[];
    expect(blocks[0].type).toBe("tool_use");
    expect(blocks[0].name).toBe("search_textbook");
    expect(blocks[0].id).toBe("call_1");
    expect(blocks[0].input).toEqual({ query: "pi" });
  });

  it("converts tool result to user message with tool_result block", () => {
    const result = convertMessagesToAnthropicBlocks([
      { role: "user", content: "Search" },
      {
        role: "tool",
        content: JSON.stringify({ result: "Found chapter 3" }),
        tool_call_id: "call_1",
      },
    ]);
    const last = result.messages[1] as any;
    expect(last.role).toBe("user");
    const blocks = last.content as Record<string, unknown>[];
    expect(blocks[0].type).toBe("tool_result");
    expect(blocks[0].tool_use_id).toBe("call_1");
  });
});

// ─── convertToolsToAnthropicSchema ────────────────────────────────────

describe("convertToolsToAnthropicSchema", () => {
  it("converts OpenAI tool definitions", () => {
    const result = convertToolsToAnthropicSchema([
      {
        type: "function",
        function: {
          name: "search_textbook",
          description: "Search the textbook",
          parameters: { type: "object", properties: { query: { type: "string" } } },
        },
      },
    ]);
    expect(result[0]).toEqual({
      name: "search_textbook",
      description: "Search the textbook",
      input_schema: { type: "object", properties: { query: { type: "string" } } },
    });
  });
});

// ─── parseAnthropicFrame — text-only ──────────────────────────────────

describe("parseAnthropicFrame — text stream", () => {
  it("message_start with usage", () => {
    const chunk = parseAnthropicFrame("message", JSON.stringify({
      type: "message_start",
      message: { id: "msg_1", model: "claude-3-opus", usage: { input_tokens: 42, output_tokens: 0 } },
    }), freshState());
    expect(chunk?.usage).toEqual({ prompt_tokens: 42, completion_tokens: 0 });
  });

  it("content_block_start text", () => {
    const chunk = parseAnthropicFrame("content_block_start", JSON.stringify({
      type: "content_block_start",
      index: 0,
      content_block: { type: "text", text: "I think the answer is " },
    }), freshState());
    expect(chunk).toEqual({ text: "I think the answer is " });
  });

  it("content_block_delta text", () => {
    const chunk = parseAnthropicFrame("content_block_delta", JSON.stringify({
      type: "content_block_delta",
      index: 0,
      delta: { type: "text_delta", text: "42" },
    }), freshState());
    expect(chunk).toEqual({ text: "42" });
  });

  it("content_block_stop (no delta emitted)", () => {
    const chunk = parseAnthropicFrame("content_block_stop", JSON.stringify({
      type: "content_block_stop",
      index: 0,
    }), freshState());
    expect(chunk).toBeNull();
  });

  it("message_delta with stop_reason end_turn", () => {
    const chunk = parseAnthropicFrame("message_delta", JSON.stringify({
      type: "message_delta",
      delta: { stop_reason: "end_turn" },
      usage: { output_tokens: 50 },
    }), freshState());
    expect(chunk?.done).toBe(true);
    expect(chunk?.usage).toEqual({ prompt_tokens: 0, completion_tokens: 50 });
  });

  it("message_stop", () => {
    const chunk = parseAnthropicFrame("message_stop", JSON.stringify({
      type: "message_stop",
    }), freshState());
    expect(chunk).toEqual({ done: true });
  });

  it("ping (ignored)", () => {
    const chunk = parseAnthropicFrame("ping", JSON.stringify({
      type: "ping",
    }), freshState());
    expect(chunk).toBeNull();
  });
});

// ─── parseAnthropicFrame — thinking stream ────────────────────────────

describe("parseAnthropicFrame — thinking stream", () => {
  it("content_block_start thinking", () => {
    const chunk = parseAnthropicFrame("content_block_start", JSON.stringify({
      type: "content_block_start",
      index: 0,
      content_block: { type: "thinking", thinking: "Let me reason step by step" },
    }), freshState());
    expect(chunk).toEqual({ thinking: "Let me reason step by step" });
  });

  it("content_block_delta thinking", () => {
    const chunk = parseAnthropicFrame("content_block_delta", JSON.stringify({
      type: "content_block_delta",
      index: 0,
      delta: { type: "thinking_delta", thinking: "...continuing..." },
    }), freshState());
    expect(chunk).toEqual({ thinking: "...continuing..." });
  });

  it("thinking + text interleaved", () => {
    const state = freshState();

    const t1 = parseAnthropicFrame("content_block_start", JSON.stringify({
      type: "content_block_start", index: 0,
      content_block: { type: "thinking", thinking: "Hmm" },
    }), state);
    expect(t1?.thinking).toBe("Hmm");

    const t2 = parseAnthropicFrame("content_block_delta", JSON.stringify({
      type: "content_block_delta", index: 0,
      delta: { type: "thinking_delta", thinking: "..." },
    }), state);
    expect(t2?.thinking).toBe("...");

    // content_block_stop for thinking block
    expect(parseAnthropicFrame("content_block_stop", JSON.stringify({
      type: "content_block_stop", index: 0,
    }), state)).toBeNull();

    // text block starts
    const t3 = parseAnthropicFrame("content_block_start", JSON.stringify({
      type: "content_block_start", index: 1,
      content_block: { type: "text", text: "Answer:" },
    }), state);
    expect(t3).toEqual({ text: "Answer:" });
  });
});

// ─── parseAnthropicFrame — tool use ───────────────────────────────────

describe("parseAnthropicFrame — tool use", () => {
  it("content_block_start tool_use emits tool_call_delta with identity", () => {
    const chunk = parseAnthropicFrame("content_block_start", JSON.stringify({
      type: "content_block_start",
      index: 1,
      content_block: { type: "tool_use", id: "toolu_abc123", name: "search_textbook" },
    }), freshState());
    expect(chunk?.tool_call_delta).toEqual({
      index: 1,
      call_id_part: "toolu_abc123",
      tool_name_part: "search_textbook",
    });
    expect(chunk?.tool_call_deltas).toHaveLength(1);
  });

  it("stores tool identity in state for stable IDs", () => {
    const state = freshState();
    parseAnthropicFrame("content_block_start", JSON.stringify({
      type: "content_block_start",
      index: 2,
      content_block: { type: "tool_use", id: "toolu_stable", name: "calculator" },
    }), state);

    expect(state.callIdByIndex.get(2)).toBe("toolu_stable");
    expect(state.toolNameByIndex.get(2)).toBe("calculator");
    expect(state.toolArgsByIndex.get(2)).toBe("");
  });

  it("input_json_delta accumulates partial JSON in state", () => {
    const state = freshState();
    parseAnthropicFrame("content_block_start", JSON.stringify({
      type: "content_block_start", index: 0,
      content_block: { type: "tool_use", id: "t1", name: "calc" },
    }), state);

    const c1 = parseAnthropicFrame("content_block_delta", JSON.stringify({
      type: "content_block_delta", index: 0,
      delta: { type: "input_json_delta", partial_json: '{"expr' },
    }), state);
    expect(c1?.tool_call_delta?.arguments_part).toBe("{\"expr");
    expect(state.toolArgsByIndex.get(0)).toBe("{\"expr");

    const c2 = parseAnthropicFrame("content_block_delta", JSON.stringify({
      type: "content_block_delta", index: 0,
      delta: { type: "input_json_delta", partial_json: '": "2+2"}' },
    }), state);
    expect(c2?.tool_call_delta?.arguments_part).toBe("\": \"2+2\"}");
    expect(state.toolArgsByIndex.get(0)).toBe("{\"expr\": \"2+2\"}");
  });

  it("full tool use sequence: start → JSON deltas → stop", () => {
    const state = freshState();

    // block_start
    const start = parseAnthropicFrame("content_block_start", JSON.stringify({
      type: "content_block_start", index: 0,
      content_block: { type: "tool_use", id: "toolu_full", name: "compute" },
    }), state);
    expect(start?.tool_call_delta?.call_id_part).toBe("toolu_full");

    // delta 1
    parseAnthropicFrame("content_block_delta", JSON.stringify({
      type: "content_block_delta", index: 0,
      delta: { type: "input_json_delta", partial_json: '{"a":' },
    }), state);

    // delta 2
    const delta2 = parseAnthropicFrame("content_block_delta", JSON.stringify({
      type: "content_block_delta", index: 0,
      delta: { type: "input_json_delta", partial_json: " 1}" },
    }), state);
    expect(delta2?.tool_call_delta?.arguments_part).toBe(" 1}");

    // block_stop — no delta
    const stop = parseAnthropicFrame("content_block_stop", JSON.stringify({
      type: "content_block_stop", index: 0,
    }), state);
    expect(stop).toBeNull();

    // State was preserved
    expect(state.toolArgsByIndex.get(0)).toBe("{\"a\": 1}");
    expect(state.callIdByIndex.get(0)).toBe("toolu_full");
  });
});

// ─── parseAnthropicFrame — error ──────────────────────────────────────

describe("parseAnthropicFrame — error", () => {
  it("throws AppError on error event", () => {
    expect(() => {
      parseAnthropicFrame("error", JSON.stringify({
        type: "error",
        error: { type: "authentication_error", message: "Invalid API key", status_code: 401 },
      }), freshState());
    }).toThrow();
  });

  it("skips malformed JSON without error event", () => {
    const chunk = parseAnthropicFrame("message", "not valid json {{{", freshState());
    expect(chunk).toBeNull();
  });
});

// ─── Mixed interleaved stream ─────────────────────────────────────────

describe("parseAnthropicFrame — mixed thinking/text/tool", () => {
  it("handles a typical Claude extended thinking + tool use sequence", () => {
    const state = freshState();
    const results: string[] = [];

    // thinking block
    const t1 = parseAnthropicFrame("content_block_start", JSON.stringify({
      type: "content_block_start", index: 0,
      content_block: { type: "thinking", thinking: "Need to search" },
    }), state);
    if (t1?.thinking) results.push(`thinking:${t1.thinking}`);

    parseAnthropicFrame("content_block_stop", JSON.stringify({
      type: "content_block_stop", index: 0,
    }), state);

    // tool_use block
    const t2 = parseAnthropicFrame("content_block_start", JSON.stringify({
      type: "content_block_start", index: 1,
      content_block: { type: "tool_use", id: "tc_search", name: "search_textbook" },
    }), state);
    if (t2?.tool_call_delta) results.push("tool_call:" + t2.tool_call_delta.tool_name_part);

    parseAnthropicFrame("content_block_delta", JSON.stringify({
      type: "content_block_delta", index: 1,
      delta: { type: "input_json_delta", partial_json: '{"query": "integration"}' },
    }), state);

    parseAnthropicFrame("content_block_stop", JSON.stringify({
      type: "content_block_stop", index: 1,
    }), state);

    // text block
    const t3 = parseAnthropicFrame("content_block_start", JSON.stringify({
      type: "content_block_start", index: 2,
      content_block: { type: "text", text: "Based on results, the answer is" },
    }), state);
    if (t3?.text) results.push(`text:${t3.text}`);

    const t4 = parseAnthropicFrame("content_block_delta", JSON.stringify({
      type: "content_block_delta", index: 2,
      delta: { type: "text_delta", text: " 42." },
    }), state);
    if (t4?.text) results.push(`text:${t4.text}`);

    expect(results).toEqual([
      "thinking:Need to search",
      "tool_call:search_textbook",
      "text:Based on results, the answer is",
      "text: 42.",
    ]);
  });
});
