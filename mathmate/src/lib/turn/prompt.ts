// ─── System Prompt Builder ─────────────────────────────────────────────
//
// Pure function: takes a snapshot of world state and returns the
// assembled system prompt string.  Extracted from chatStore.sendMessage
// for testability.
//
// See: Implementation_Phase14B_StreamTurnOrchestrator.md § B.5

export interface BuildSystemPromptInput {
  userSystemPrompt?: string;
  retrievedMemories: { content: string; trust_score?: number }[];
  hasTextbookAccess: boolean;
}

const SYSTEM_INSTRUCTIONS = `
Answer as a clear math tutor.

## Math formatting (KaTeX-compatible, required)
- Use LaTeX for mathematical notation whenever possible.
- Always use KaTeX-compatible delimiters:
  - Inline math: $...$
  - Display math: $$...$$
- Prefer symbolic forms (\\frac, exponents, roots, Greek letters) over plain ASCII math.
- Keep math syntax KaTeX-friendly:
  - avoid uncommon/unsupported LaTeX macros and environments,
  - avoid raw HTML for equations,
  - do not emit \\(...\\) or \\[...\\] delimiters,
  - do not wrap equations in backticks/code blocks.
- Avoid duplicate mixed notation for the same equation (don't show both plain-text and LaTeX versions). Use the LaTeX version only.

## Interactive components (strict)
- Do NOT include <mathmate-viz> or <mathmate-quiz> by default.
- Only use these tags if the user explicitly asks for a graph/visualization, quiz, or practice exercise.
- For normal explanation requests, return plain explanatory text + LaTeX only.

## Graphing functions
- When the user asks to see a graph or visualization of a function, embed it directly using:
  <mathmate-viz type="function" expr="sin(x)" xmin="-6.28" xmax="6.28" title="sin(x)" />
  Use standard math syntax: sin, cos, tan, log, sqrt, abs, pi, e, x^2, etc.
- You may also call the \`graph\` tool to compute exact points first, then ALWAYS follow up by
  embedding a <mathmate-viz> tag in your response so the graph appears inline.
- Place the <mathmate-viz> tag where you want the graph to appear in your explanation.
- For multiple functions (e.g. comparing sin and cos), emit one <mathmate-viz> tag per function.`;

const TEXTBOOK_INSTRUCTIONS = `
## Textbook Access
You have access to the textbook set for this project.
Use the \`search_textbook\` tool whenever the user asks about specific topics,
sections, exercises, or page numbers from their textbook.
Search the textbook to find relevant content before answering questions
about specific material. This is especially useful when the user references
section numbers (e.g., "Section 5.2"), exercise numbers, or specific topics
covered in the course.`;

/**
 * Build the combined system prompt from user config, retrieved memories,
 * and project context.  Pure — no side effects, no store reads.
 *
 * Memory injection uses a simple word-count-based safety check:
 * - Memories under 200 words are injected as "relevant context".
 * - Longer memories are truncated with a note.
 */
export function buildSystemPrompt(input: BuildSystemPromptInput): string {
  let combined = input.userSystemPrompt
    ? `${input.userSystemPrompt}\n\n${SYSTEM_INSTRUCTIONS}`
    : SYSTEM_INSTRUCTIONS;

  // Inject retrieved memory context.
  if (input.retrievedMemories.length > 0) {
    const memBlocks: string[] = [];
    for (const mem of input.retrievedMemories) {
      const words = mem.content.split(/\s+/);
      if (words.length > 200) {
        memBlocks.push(
          `[Relevant context (truncated — ${words.length} words total): ${words.slice(0, 200).join(" ")} ...]`,
        );
      } else {
        memBlocks.push(`[Relevant context: ${mem.content}]`);
      }
    }
    combined += "\n\n## Relevant Memories\n" + memBlocks.join("\n\n");
  }

  // Inject textbook instructions if the project has a textbook.
  if (input.hasTextbookAccess) {
    combined += `\n${TEXTBOOK_INSTRUCTIONS}`;
  }

  return combined;
}
