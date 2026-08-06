import { describe, it, expect, afterEach, vi } from "vitest";

// Mock the providers module
vi.mock("./providers", () => ({
  streamChat: vi.fn(),
  buildPayload: vi.fn((messages: any[]) => messages),
}));

import { generateHintLadder } from "./hintLadder";
import { streamChat } from "./providers";

function makeMockStream(...chunks: { text?: string; done?: boolean }[]) {
  return vi.mocked(streamChat).mockImplementationOnce(async function* () {
    for (const c of chunks) {
      yield c;
    }
  });
}

describe("hintLadder - JSON parsing", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  const mockProvider = {
    name: "test",
    enabled: true,
    base_url: "http://test",
    models: [] as string[],
    default_model: "test",
    fetch_models: false,
  };

  it("parses well-formed JSON hints", async () => {
    makeMockStream({
      text: JSON.stringify({
        h1: "Try small cases to spot a pattern.",
        h2: "Consider parity mod 2.",
        h3: "The invariant is the sum mod 2.",
        solution: "Full solution: check base case, induction step uses parity.",
      }),
      done: true,
    });

    const result = await generateHintLadder(
      "Prove n^2 + n is even for all integers n.",
      "I tried n=1, n=2, n=3 and it works but I don't know how to prove it.",
      "test-model",
      mockProvider,
    );

    expect(result.hints).toHaveLength(4);
    expect(result.hints[0]).toContain("small cases");
    expect(result.hints[1]).toContain("parity");
    expect(result.hints[2]).toContain("invariant");
    expect(result.hints[3]).toContain("Full solution");
  });

  it("parses JSON wrapped in markdown code block", async () => {
    makeMockStream({
      text: 'Here are the hints:\n```json\n{\n  "h1": "Try a simpler case first.",\n  "h2": "Look for symmetry.",\n  "h3": "The key is the pigeonhole principle.",\n  "solution": "Arrange the numbers into sets, then apply PHP."\n}\n```',
      done: true,
    });

    const result = await generateHintLadder(
      "test problem",
      "test attempt",
      "test-model",
      mockProvider,
    );

    expect(result.hints).toHaveLength(4);
    expect(result.hints[0]).toContain("simpler case");
    expect(result.hints[3]).toContain("PHP");
  });

  it("falls back gracefully when JSON is malformed", async () => {
    makeMockStream({
      text: "H1: Try this approach. H2: Consider that. H3: The trick is X. H4: Full solution here.",
      done: true,
    });

    const result = await generateHintLadder(
      "test problem", "test attempt",
      "test-model",
      mockProvider,
    );

    expect(result.hints.length).toBeGreaterThanOrEqual(1);
    expect(result.rawResponse).toBeTruthy();
  });

  it("throws on empty response", async () => {
    makeMockStream({ text: "", done: true });

    await expect(
      generateHintLadder("test", "test", "test-model", mockProvider)
    ).rejects.toThrow("Empty response");
  });

  it("throws on stream error", async () => {
    vi.mocked(streamChat).mockImplementationOnce(async function* () {
      throw new Error("API timeout");
    });

    await expect(
      generateHintLadder("test", "test", "test-model", mockProvider)
    ).rejects.toThrow("API timeout");
  });
});