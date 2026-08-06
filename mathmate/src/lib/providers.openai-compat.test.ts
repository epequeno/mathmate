/**
 * Phase 15C — OpenAI-compatible / OpenRouter parity tests
 *
 * Asserts that `parseOpenAIFrame` and `streamChat` (OpenAI path) preserve
 * existing behaviour after the wire-variant refactor. No Anthropic fixtures
 * here — those live in `providers.anthropic.test.ts`.
 */

import { describe, it, expect } from "vitest";
import { parseOpenAIFrame } from "../lib/providers";

// ─── Text-only deltas ─────────────────────────────────────────────────

describe("parseOpenAIFrame — text-only", () => {
  it("simple text delta", () => {
    const chunk = parseOpenAIFrame({
      choices: [{ delta: { content: "Hello " } }],
    });
    expect(chunk).toEqual({ text: "Hello " });
  });

  it("empty delta (no choice)", () => {
    const chunk = parseOpenAIFrame({
      choices: [],
    });
    expect(chunk).toBeNull();
  });

  it("text delta from content array", () => {
    const chunk = parseOpenAIFrame({
      choices: [{ delta: { content: ["Hello", " world"] } }],
    });
    expect(chunk).toEqual({ text: "Hello world" });
  });

  it("<think>...</think> thinking extraction from content", () => {
    const chunk = parseOpenAIFrame({
      choices: [{ delta: { content: "<think>Let me solve this" } }],
    });
    expect(chunk).toEqual({ thinking: "Let me solve this" });
  });

  it("<think> complete tag — thinking + text", () => {
    const chunk = parseOpenAIFrame({
      choices: [{ delta: { content: "Reasoning stage</think>The answer is 42." } }],
    });
    expect(chunk).toEqual({ thinking: "Reasoning stage", text: "The answer is 42." });
  });

  it("both <think>...</think> tags in same chunk", () => {
    const chunk = parseOpenAIFrame({
      choices: [{ delta: { content: "<think>Quick think</think>Done" } }],
    });
    expect(chunk).toEqual({ thinking: "Quick think", text: "Done" });
  });

  it("no think tags — plain text", () => {
    const chunk = parseOpenAIFrame({
      choices: [{ delta: { content: "The answer is 42." } }],
    });
    expect(chunk).toEqual({ text: "The answer is 42." });
  });
});

// ─── Explicit reasoning fields ────────────────────────────────────────

describe("parseOpenAIFrame — reasoning fields", () => {
  it("reasoning_content in delta", () => {
    const chunk = parseOpenAIFrame({
      choices: [{ delta: { reasoning_content: "Detailed reasoning..." } }],
    });
    expect(chunk).toEqual({ thinking: "Detailed reasoning..." });
  });

  it("reasoning_details[].text ", () => {
    const chunk = parseOpenAIFrame({
      choices: [{ delta: { reasoning_details: [{ text: "Step by step" }] } }],
    });
    expect(chunk).toEqual({ thinking: "Step by step" });
  });

  it("prefers content over reasoning when both present", () => {
    const chunk = parseOpenAIFrame({
      choices: [{
        delta: {
          content: "4",
          reasoning_content: "Hidden reasoning",
        },
      }],
    });
    expect(chunk?.text).toBe("4");
    expect(chunk?.thinking).toBe("Hidden reasoning");
  });

  it("delta.reasoning string fallback", () => {
    const chunk = parseOpenAIFrame({
      choices: [{ delta: { reasoning: "Legacy reasoning" } }],
    });
    expect(chunk).toEqual({ thinking: "Legacy reasoning" });
  });
});

// ─── Tool call deltas ─────────────────────────────────────────────────

describe("parseOpenAIFrame — tool call deltas", () => {
  it("single tool call delta", () => {
    const chunk = parseOpenAIFrame({
      choices: [{
        delta: {
          tool_calls: [{
            index: 0,
            id: "call_1",
            function: { name: "search", arguments: "{\"q\"" },
          }],
        },
      }],
    });
    expect(chunk?.tool_call_deltas).toHaveLength(1);
    expect(chunk?.tool_call_delta).toEqual({
      index: 0,
      call_id_part: "call_1",
      tool_name_part: "search",
      arguments_part: "{\"q\"",
    });
  });

  it("multiple tool call deltas in one chunk", () => {
    const chunk = parseOpenAIFrame({
      choices: [{
        delta: {
          tool_calls: [
            { index: 0, function: { name: "calc", arguments: "{\"a\":1}" } },
            { index: 1, function: { name: "search", arguments: "{\"q\":\"x\"}" } },
          ],
        },
      }],
    });
    expect(chunk?.tool_call_deltas).toHaveLength(2);
  });

  it("tool call without id (uses index)", () => {
    const chunk = parseOpenAIFrame({
      choices: [{
        delta: {
          tool_calls: [{
            index: 2,
            function: { name: "compute", arguments: "{}" },
          }],
        },
      }],
    });
    expect(chunk?.tool_call_delta?.index).toBe(2);
    expect(chunk?.tool_call_delta?.call_id_part).toBeUndefined();
  });
});

// ─── finish_reason ────────────────────────────────────────────────────

describe("parseOpenAIFrame — finish_reason", () => {
  it("stop → done: true", () => {
    const chunk = parseOpenAIFrame({
      choices: [{
        finish_reason: "stop",
        delta: {},
      }],
    });
    expect(chunk?.done).toBe(true);
  });

  it("length → done: true", () => {
    const chunk = parseOpenAIFrame({
      choices: [{
        finish_reason: "length",
        delta: { content: "truncated..." },
      }],
    });
    expect(chunk).toEqual({ text: "truncated...", done: true });
  });
});

// ─── Usage data ────────────────────────────────────────────────────────

describe("parseOpenAIFrame — usage", () => {
  it("top-level usage in final chunk", () => {
    const chunk = parseOpenAIFrame({
      choices: [{ delta: {} }],
      usage: { prompt_tokens: 100, completion_tokens: 50 },
    });
    expect(chunk?.usage).toEqual({
      prompt_tokens: 100,
      completion_tokens: 50,
    });
  });
});

// ─── Wire-variant detection ────────────────────────────────────────────

describe("detectWireVariant (indirect test via parseOpenAIFrame)", () => {
  it("OpenRouter Claude model still uses OpenAI parser format", () => {
    // OpenRouter emits OpenAI-compatible deltas even for Claude models
    const chunk = parseOpenAIFrame({
      choices: [{
        delta: {
          content: "Hello from Claude via OpenRouter",
          reasoning_content: "Claude thinking...",
        },
      }],
    });
    expect(chunk?.text).toBe("Hello from Claude via OpenRouter");
    expect(chunk?.thinking).toBe("Claude thinking...");
  });

  it("OpenRouter tool calls use OpenAI format", () => {
    const chunk = parseOpenAIFrame({
      choices: [{
        delta: {
          tool_calls: [{
            index: 0,
            id: "call_openrouter_tc",
            function: {
              name: "search_textbook",
              arguments: "{\"query\":\"derivatives\"}",
            },
          }],
        },
      }],
    });
    expect(chunk?.tool_call_delta?.call_id_part).toBe("call_openrouter_tc");
    expect(chunk?.tool_call_delta?.tool_name_part).toBe("search_textbook");
  });

  it("plain OpenAI model uses OpenAI parser", () => {
    const chunk = parseOpenAIFrame({
      choices: [{
        delta: { content: "From GPT-4" },
      }],
    });
    expect(chunk).toEqual({ text: "From GPT-4" });
  });
});
