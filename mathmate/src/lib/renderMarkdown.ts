import { Marked } from "marked";
import markedKatex from "marked-katex-extension";
import "katex/dist/katex.min.css";

// Keep default marked rendering so inline token renderers (including KaTeX)
// are preserved. Custom token flattening can strip inline math rendering.
const marked = new Marked(
  markedKatex({
    throwOnError: false,
    // Keep failed fragments readable but avoid loud red error text in chat UI.
    errorColor: "currentColor",
    nonStandard: true,
  })
);

/**
 * Convert markdown with LaTeX to HTML.
 */
export function renderMarkdown(text: string): string {
  if (!text) return "";
  try {
    const withWikilinks = convertWikilinks(text);
    const normalized = normalizeMathDelimiters(withWikilinks);
    return marked.parse(normalized, { async: false }) as string;
  } catch (e) {
    console.error("[renderMarkdown] error:", e);
    return `<p>${escapeHtml(text)}</p>`;
  }
}

function normalizeMathDelimiters(text: string): string {
  // Convert TeX delimiters commonly emitted by models into $/$$ so
  // marked-katex-extension consistently parses them.
  let result = text
    .replace(/\\\[([\s\S]*?)\\\]/g, (_m, expr) => `$$${expr}$$`)
    .replace(/\\\(([\s\S]*?)\\\)/g, (_m, expr) => `$${expr}$`);

  // Fix standalone $$ fence lines so marked's block tokenizer fires correctly:
  //   - Strip trailing whitespace from $$ fence lines (trailing spaces break
  //     the block rule's \1(?:\n|$) match).
  //   - Ensure a blank line BEFORE the opening fence (if preceded by content).
  //   - Ensure a blank line AFTER the closing fence (if followed by content).
  result = isolateDisplayMathFences(result);

  const unescaped = normalizeEscapedDollarMath(result);
  return normalizeCommonMathText(unescaped);
}

/**
 * Process text line-by-line, tracking display math blocks.
 * For each standalone $$ fence line:
 *   - Strip trailing whitespace (required for block rule regex).
 *   - Insert a blank line before the opening fence when needed.
 *   - Insert a blank line after the closing fence when needed.
 * Also: never mutate content lines inside a $$ block.
 */
function isolateDisplayMathFences(text: string): string {
  const lines = text.split("\n");
  const out: string[] = [];
  let insideBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed === "$$") {
      if (!insideBlock) {
        // Opening fence: ensure blank line before it
        if (out.length > 0 && out[out.length - 1].trim() !== "") {
          out.push("");
        }
        out.push("$$");
        insideBlock = true;
      } else {
        // Closing fence: just output it clean
        out.push("$$");
        insideBlock = false;
        // Ensure blank line after the closing fence when followed by content
        const next = lines[i + 1];
        if (next !== undefined && next.trim() !== "") {
          out.push("");
        }
      }
    } else {
      out.push(line);
    }
  }

  return out.join("\n");
}

function normalizeEscapedDollarMath(text: string): string {
  return text
    .split("\n")
    .map((line) => {
      const looksLikeLatexMath = /\\(frac|sqrt|Delta|alpha|beta|gamma|pm|cdot|times|left|right|neq|ne|ge|le)/.test(line);
      if (!looksLikeLatexMath) return line;

      let out = line.replace(/\\\$/g, "$");
      // Common model slip: "$Delta" instead of "$\\Delta"
      out = out.replace(/\$Delta\b/g, "$\\Delta").replace(/\bDelta\$/g, "\\Delta$");
      return out;
    })
    .join("\n");
}

function normalizeCommonMathText(text: string): string {
  const superscriptMap: Record<string, string> = {
    "⁰": "^0",
    "¹": "^1",
    "²": "^2",
    "³": "^3",
    "⁴": "^4",
    "⁵": "^5",
    "⁶": "^6",
    "⁷": "^7",
    "⁸": "^8",
    "⁹": "^9",
  };

  let insideDisplayBlock = false;

  return text
    .split("\n")
    .map((line) => {
      // Track $$ block boundaries so we never mutate content inside display math.
      // A standalone $$ line marks a fence open/close (already clean after
      // isolateDisplayMathFences ran, so no trailing whitespace to worry about).
      if (line.trim() === "$$") {
        insideDisplayBlock = !insideDisplayBlock;
        return line;
      }
      // Never touch lines inside a display math block.
      if (insideDisplayBlock) return line;

      // Avoid touching existing markdown code fences/inline code lines.
      if (line.includes("```") || line.trimStart().startsWith("    ")) return line;

      let out = line.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]/g, (ch) => superscriptMap[ch] ?? ch);

      // Normalize common radical notations into LaTeX.
      out = out
        .replace(/√\(([^()\n]+)\)/g, (_m, expr) => `\\sqrt{${expr}}`)
        .replace(/\bsqrt\(([^()\n]+)\)/gi, (_m, expr) => `\\sqrt{${expr}}`);

      // If the line already has explicit math delimiters, keep structure as-is.
      if (out.includes("$")) return out;

      // Wrap very common relation snippets so KaTeX renders symbols consistently.
      out = out
        .replace(/\b([a-zA-Z][a-zA-Z0-9]*)\s*!=\s*([^\s,.;:]+)/g, (_m, lhs, rhs) => `$${lhs} \\ne ${rhs}$`)
        .replace(/\b([a-zA-Z][a-zA-Z0-9]*)\s*≠\s*([^\s,.;:]+)/g, (_m, lhs, rhs) => `$${lhs} \\ne ${rhs}$`)
        .replace(/\b([a-zA-Z][a-zA-Z0-9]*)\s*>=\s*([^\s,.;:]+)/g, (_m, lhs, rhs) => `$${lhs} \\ge ${rhs}$`)
        .replace(/\b([a-zA-Z][a-zA-Z0-9]*)\s*<=\s*([^\s,.;:]+)/g, (_m, lhs, rhs) => `$${lhs} \\le ${rhs}$`);

      // Wrap assignment lines containing advanced math tokens (sqrt, ±, powers).
      out = out.replace(
        /\b([a-zA-Z][a-zA-Z0-9]*)\s*=\s*([^,.;:]*?(?:\\sqrt|\^|±)[^,.;:]*)/g,
        (_m, lhs, rhs) => `$${lhs} = ${rhs.trim()}$`
      );

      return out;
    })
    .join("\n");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Convert Obsidian-style [[wikilinks]] to clickable HTML links.
 *
 * Pattern:
 *   [[Page Name]]          → links to "Page Name.md"
 *   [[Page Name|alias]]    → displays "alias", links to "Page Name.md"
 *   [[path/to/Note]]       → links to "path/to/Note.md"
 *   [[path/to/Note.md]]    → links to "path/to/Note.md" (explicit extension)
 *
 * Output: <a href="#" data-note-path="...md" class="wikilink">text</a>
 * The click handler is registered by the preview container in VaultPage.
 */
function convertWikilinks(text: string): string {
  // Match [[target|alias]] or [[target]]
  // Preserve the original match for KaTeX inline math delimiters ($...$)
  // by skipping wikilinks that look like KaTeX (no $ inside).
  return text.replace(/\[\[([^\][\[\]\n]+?)\]\]/g, (_match, content) => {
    let target = content.trim();
    let display = target;

    // Handle alias: [[target|display name]]
    const pipeIdx = target.indexOf("|");
    if (pipeIdx !== -1) {
      display = target.slice(pipeIdx + 1).trim();
      target = target.slice(0, pipeIdx).trim();
    }

    // Ensure .md extension
    let notePath = target;
    if (!notePath.toLowerCase().endsWith(".md")) {
      notePath += ".md";
    }

    // Strip display name of .md for cleaner rendering
    const displayClean = display.replace(/\.md$/i, "");

    return `<a href="#" data-note-path="${escapeAttr(notePath)}" class="wikilink">${escapeHtml(displayClean)}</a>`;
  });
}

/** Escape a value for use in an HTML attribute. */
function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
