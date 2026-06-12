/**
 * Parses model-generated markdown text into segments:
 * - HTML segments (normal markdown/LaTeX rendered via marked)
 * - Interactive segments (visualizations, quizzes, etc.)
 *
 * This allows React components to be interleaved with rendered markdown
 * without needing WKWebView-backed widget shells.
 *
 * Supported custom tags:
 *   <mathmate-viz type="function" expr="sin(x)" xmin="-5" xmax="5" />
 *   <mathmate-quiz type="multiple-choice" question="What is ∫ x² dx?">
 *     (1/3)x³ + C
 *     2x + C
 *     x³/3
 *     x² + C
 *   </mathmate-quiz>
 *   <mathmate-quiz type="free-response" answer="(1/3)x³ + C" />
 *   <mathmate-quiz type="progressive-hint" ... />
 */

export interface VizSegment {
  type: "viz";
  kind: "function" | "surface" | "parametric" | "scatter" | "bar" | "generic";
  attrs: Record<string, string>;
}

export interface QuizSegment {
  type: "quiz";
  kind: "multiple-choice" | "free-response" | "progressive-hint";
  attrs: Record<string, string>;
  body: string; // raw text between tags
}

export type InteractiveSegment =
  | { type: "html"; html: string }
  | VizSegment
  | QuizSegment;

// ─── Parser ─────────────────────────────────────

const VIZ_RE = /<mathmate-viz\s+([^>]*?)\/?\s*>/gi;
const QUIZ_OPEN_RE = /<mathmate-quiz\s+([^>]*)>/gi;
const QUIZ_CLOSE_RE = /<\/mathmate-quiz>/gi;

/**
 * Split text into segments. Non-interactive text becomes "html" segments,
 * interactive tags are parsed into their segment types.
 */
export function extractInteractiveSegments(text: string): InteractiveSegment[] {
  if (!text) return [{ type: "html", html: "" }];

  const segments: InteractiveSegment[] = [];
  let lastIndex = 0;

  // Combined regex to find any interactive tag
  const combinedRe = /<mathmate-(viz|quiz)\b([^>]*?)(?:\/>|>(.*?)<\/mathmate-\1>)/gsi;

  let match: RegExpExecArray | null;
  while ((match = combinedRe.exec(text)) !== null) {
    const fullMatch = match[0];
    const tagName = match[1]; // "viz" or "quiz"
    const attrsStr = match[2];
    const body = match[3] ?? ""; // for paired tags

    // Push preceding HTML segment
    if (match.index > lastIndex) {
      segments.push({ type: "html", html: text.slice(lastIndex, match.index) });
    }

    const attrs = parseAttrs(attrsStr);

    if (tagName === "viz") {
      const kind = (attrs.type || "function") as VizSegment["kind"];
      segments.push({ type: "viz", kind, attrs });
    } else if (tagName === "quiz") {
      const kind = (attrs.type || "multiple-choice") as QuizSegment["kind"];
      segments.push({ type: "quiz", kind, attrs, body: body.trim() });
    }

    lastIndex = match.index + fullMatch.length;
  }

  // Push remaining text
  if (lastIndex < text.length) {
    segments.push({ type: "html", html: text.slice(lastIndex) });
  }

  // If no interactive segments found, return the whole text as one html segment
  if (segments.length === 0) {
    segments.push({ type: "html", html: text });
  }

  return segments;
}

function parseAttrs(str: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const attrRe = /(\w+)\s*=\s*"([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = attrRe.exec(str)) !== null) {
    attrs[m[1]] = m[2];
  }
  return attrs;
}