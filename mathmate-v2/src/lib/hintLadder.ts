/**
 * hintLadder.ts
 *
 * Generates a sequence of 4 hints (meta-strategy → structural → key insight → 
 * solution sketch) for an olympiad problem via the configured LLM provider.
 *
 * Uses the existing streaming chat infrastructure but collects the full 
 * response synchronously (non-streaming UX for the hint ladder).
 */

import { streamChat, buildPayload } from "./providers";
import type { ProviderConfig } from "../stores/configStore";

// ─── Prompt template ──────────────────────────────────────────────────

/**
 * One-shot system prompt: the model generates all 4 hints in a single call,
 * structured as JSON. The hints are revealed one at a time in the UI.
 */
const HINT_GENERATION_PROMPT = `You are an expert olympiad math coach generating a structured hint ladder.

Given a problem and a student's attempt, produce exactly 4 hints of strictly
increasing explicitness. Return ONLY valid JSON with no markdown wrapping.

{
  "h1": "Meta-strategy hint — broad direction, no specifics. The student should still need to do most of the work.",
  "h2": "Structural observation — point out a pattern, invariant, or transformation to consider.",
  "h3": "Key insight — the critical idea that cracks the problem open.",
  "solution": "Full solution sketch — outline of the proof or construction, not necessarily every detail."
}

Rules:
- h1 must be answerable without knowing the solution
- Each hint must be strictly more revealing than the previous
- Do NOT mention the next hint in any hint
- solution should be a sketch, not a complete formal proof
- Keep all hints concise (2-5 sentences each)
- Use proper LaTeX notation within $...$ delimiters where appropriate`;

// ─── Hint generation function ─────────────────────────────────────────

export interface HintGenerationResult {
  hints: string[];  // [h1, h2, h3, solution]
  rawResponse: string;
}

/**
 * Generate a complete hint ladder for a problem + attempt.
 *
 * Calls the configured provider with a one-shot prompt and parses the
 * JSON response.  Returns the 4 hints or throws an error.
 */
export async function generateHintLadder(
  problem: string,
  attempt: string,
  model: string,
  provider: ProviderConfig,
  signal?: AbortSignal,
): Promise<HintGenerationResult> {
  const userMessage = [
    { type: "text" as const, text: `Problem:\n${problem}\n\nMy attempt so far:\n${attempt}` },
  ];

  const payload = buildPayload([
    {
      role: "system",
      content: [{ type: "text", text: HINT_GENERATION_PROMPT }],
    },
    {
      role: "user",
      content: userMessage,
    },
  ]);

  let rawResponse = "";

  try {
    for await (const chunk of streamChat(payload, model, provider, signal)) {
      if (chunk.text) {
        rawResponse += chunk.text;
      }
      if (chunk.done) break;
    }
  } catch (err) {
    throw new Error(`Failed to generate hints: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (!rawResponse.trim()) {
    throw new Error("Empty response from model — no hints generated.");
  }

  const hints = parseHintsFromResponse(rawResponse);

  if (hints.length !== 4) {
    // Fallback: split by some heuristic if JSON parsing failed
    return {
      hints: [
        hints[0] || `Try approaching the problem from a different angle.`,
        hints[1] || `Consider what invariants or constraints might apply.`,
        hints[2] || `Think about what the key transformation or construction is.`,
        hints[3] || `Full solution: ${rawResponse.slice(0, 300)}${rawResponse.length > 300 ? "…" : ""}`,
      ],
      rawResponse,
    };
  }

  return { hints, rawResponse };
}

// ─── JSON response parser ─────────────────────────────────────────────

/**
 * Parse the model's response to extract the 4 hints.
 *
 * Handles:
 * - Strict JSON ({"h1": "...", "h2": "...", "h3": "...", "solution": "..."})
 * - JSON wrapped in markdown code blocks (```json ... ```)
 * - Partial JSON with extra text before/after
 * - JSON with extra fields
 */
function parseHintsFromResponse(raw: string): string[] {
  // Try to extract JSON from code blocks first
  const jsonBlockMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonStr = jsonBlockMatch ? jsonBlockMatch[1].trim() : raw.trim();

  // Try to find JSON object boundaries
  let parsed: Record<string, string> | null = null;

  // Attempt 1: Direct parse
  try {
    const obj = JSON.parse(jsonStr);
    if (obj && typeof obj === "object") {
      parsed = obj as Record<string, string>;
    }
  } catch {
    // Not valid JSON — try finding the first { and last }
    const start = jsonStr.indexOf("{");
    const end = jsonStr.lastIndexOf("}");
    if (start !== -1 && end > start) {
      try {
        const obj = JSON.parse(jsonStr.slice(start, end + 1));
        if (obj && typeof obj === "object") {
          parsed = obj as Record<string, string>;
        }
      } catch {
        // Give up
      }
    }
  }

  if (parsed) {
    const h1 = extractStringValue(parsed, "h1", "hint_1", "meta_strategy", "meta");
    const h2 = extractStringValue(parsed, "h2", "hint_2", "structural", "structure");
    const h3 = extractStringValue(parsed, "h3", "hint_3", "key_insight", "insight");
    const solution = extractStringValue(parsed, "solution", "h4", "hint_4", "sketch", "full_solution");

    const result: string[] = [];
    if (h1) result.push(h1);
    if (h2) result.push(h2);
    if (h3) result.push(h3);
    if (solution) result.push(solution);

    return result;
  }

  // Attempt 3: Split by numbered sections
  return splitByNumberedSections(raw);
}

function extractStringValue(obj: Record<string, string>, ...keys: string[]): string | null {
  for (const key of keys) {
    const val = obj[key];
    if (typeof val === "string" && val.trim()) return val.trim();
  }
  return null;
}

function splitByNumberedSections(text: string): string[] {
  const lines = text.split("\n");
  const sections: string[] = [];
  let currentSection = "";

  for (const line of lines) {
    const headerMatch = line.match(/^(?:[hH][1-4]|\*\*[hH][1-4]\*\*|[1-4][.\)])\s*[:\-]?\s*(.*)/);
    if (headerMatch) {
      if (currentSection) sections.push(currentSection.trim());
      currentSection = headerMatch[1] || "";
    } else if (line.trim()) {
      currentSection += (currentSection ? " " : "") + line.trim();
    }
  }
  if (currentSection) sections.push(currentSection.trim());

  return sections;
}