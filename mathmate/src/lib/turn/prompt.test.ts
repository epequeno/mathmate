import { describe, it, expect } from "vitest";
import { buildSystemPrompt, SYSTEM_INSTRUCTIONS, GRAPH_INSTRUCTIONS } from "./prompt";

const mem = (content: string, trust_score?: number) => ({
  id: content, source_type: "manual", unit_type: "note", content, score: 1,
  created_at: "2026-01-01", tags: [] as string[], trust_score,
});
const base = { retrievedMemories: [], hasTextbookAccess: false };

describe("buildSystemPrompt", () => {
  it("is just the instructions when nothing else applies", () => {
    expect(buildSystemPrompt(base)).toBe(SYSTEM_INSTRUCTIONS);
  });

  it("tells the tutor to ask for an attempt and prefer hints over solutions", () => {
    const p = buildSystemPrompt(base);
    expect(p).toContain("You are a tutor, not a solver");
    expect(p).toContain("Prefer guiding questions and next-step hints");
  });

  it("puts the user's system prompt before the built-in instructions", () => {
    const p = buildSystemPrompt({ ...base, userSystemPrompt: "Be brief." });
    expect(p.startsWith("Be brief.\n\n")).toBe(true);
    expect(p.endsWith(SYSTEM_INSTRUCTIONS)).toBe(true);
  });

  it("appends retrieved memories after the instructions", () => {
    const p = buildSystemPrompt({ ...base, retrievedMemories: [mem("prefers worked examples")] });
    expect(p.startsWith(SYSTEM_INSTRUCTIONS)).toBe(true);
    expect(p).toContain("prefers worked examples");
  });

  it("appends the textbook note only when the project has a textbook", () => {
    expect(buildSystemPrompt(base)).not.toContain("search_textbook");
    expect(buildSystemPrompt({ ...base, hasTextbookAccess: true })).toContain("search_textbook");
  });

  it("olympiad style replaces the user prompt and memories (current behaviour)", () => {
    const p = buildSystemPrompt({
      userSystemPrompt: "Be brief.",
      retrievedMemories: [mem("prefers worked examples")],
      tutorStyle: "olympiad",
      hasTextbookAccess: true,
    });
    expect(p).toContain("olympiad math coach");
    expect(p).not.toContain("Be brief.");
    expect(p).not.toContain("prefers worked examples");
    expect(p).toContain("search_textbook"); // textbook note is still appended
  });

  it("does not include the graph instructions in the live prompt", () => {
    expect(buildSystemPrompt(base)).not.toContain("<mathmate-viz type=\"function\"");
    expect(GRAPH_INSTRUCTIONS).toContain("<mathmate-viz type=\"function\"");
  });
});
