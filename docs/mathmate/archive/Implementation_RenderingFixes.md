# Implementation Plan: Rendering Architecture Fixes

**Phase**: TRND  
**Status**: Planned  
**Source**: 2026-05-28 rendering audit — `docs/mathmate/03_Dev_Logs/2026-05-28-rendering-audit.md`

---

## Background & Root Cause Summary

The current rendering pipeline has three independent problems identified in a
2026-05-28 audit. They share a common root cause: a multi-pass string-munging
approach that pre-processes text **before** Marked has tokenised it into an AST,
making it impossible to reliably distinguish math from code, inline content
from block content, or already-formatted expressions from plain text.

### Pipeline overview (current)

```
Model stream → accumulatedText
  → extractInteractiveSegments()           split on <mathmate-*> tags
    → renderMarkdown(seg.html)             one call per "html" segment
      → normalizeMathDelimiters()          \[..\] → $$..$$, \(..\) → $..$
        → normalizeEscapedDollarMath()     line-by-line heuristics
          → normalizeCommonMathText()      line-by-line operator wrapping  ← bugs live here
            → marked.parse()              markdown + marked-katex-extension
              → dangerouslySetInnerHTML
```

---

## TRND-1 — Fix `normalizeCommonMathText` Code-Block Safety + `!=` Guard

**Priority**: High  
**Effort**: ~1 hour  
**Risk**: Low (targeted code changes, no dependency changes)

### Problem A — `!=` (and operator rewrites) applied inside fenced code blocks

The guard at the top of `normalizeCommonMathText`'s per-line map only skips
lines that **contain** the triple-backtick delimiter:

```ts
if (line.includes("```") || line.trimStart().startsWith("    ")) return line;
```

Lines *inside* a fenced block never contain ` ``` `, so they pass through.
A model response like:

````markdown
```python
if length != 0:
    return x
```
````

results in the `length != 0` line being rewritten to `$length \ne 0$`,
breaking the code block display.

### Problem B — The `$`-guard is backwards

```ts
// If the line already has explicit math delimiters, keep structure as-is.
if (out.includes("$")) return out;
// Then later:
out = out.replace(/\b([a-zA-Z][a-zA-Z0-9]*)\s*!=\s*([^\s,.;:]+)/g, ...)
```

This skips `!=` → `\ne` conversion on lines that **already have math**, but the
most common failure is exactly a line that mixes math and operators:

```
Given $f(x)$ where f != g in all cases
```

The `f != g` part is left as raw ASCII `!=` even though it would benefit from KaTeX.

### Implementation

**File**: `mathmate/src/lib/renderMarkdown.ts`

1. Add a stateful `insideFence` tracker to the line-map loop so that all lines
   between opening and closing ` ``` ` are skipped entirely:

```ts
function normalizeCommonMathText(text: string): string {
  const lines = text.split("\n");
  let insideFence = false;
  
  const processed = lines.map((line) => {
    // Track fenced code block boundaries
    if (line.trimStart().startsWith("```")) {
      insideFence = !insideFence;
      return line; // never touch the fence line itself
    }
    // Skip all lines inside a fenced code block
    if (insideFence) return line;
    // Skip indented code blocks (4-space)
    if (line.trimStart().startsWith("    ") && !insideFence) return line;

    // ... rest of existing transforms ...
  });
  
  return processed.join("\n");
}
```

2. Remove the `if (out.includes("$")) return out;` early-return guard. Instead,
   apply the `!=` regex regardless — it only matches `word != value` patterns,
   so it's safe alongside existing math delimiters. The single risk is wrapping
   something already inside `$...$`, but the regex can't match that because `$`
   is neither `\w` nor part of the operator pattern.

3. Extend the `!=` regex to also handle numeric LHS (currently `[a-zA-Z]` only):

```ts
// Before
/\b([a-zA-Z][a-zA-Z0-9]*)\s*!=\s*([^\s,.;:]+)/g

// After — allow digit-led identifiers like "0 != x"
/\b([a-zA-Z0-9][a-zA-Z0-9_]*)\s*!=\s*([^\s,.;:]+)/g
```

4. Guard the `sqrt` / `√` rewrites with the same `insideFence` check (they
   already have no fence-awareness and would corrupt ` ```bash\nsqrt(n)``` `).

### Checklist
- [ ] Add `insideFence` state tracker to `normalizeCommonMathText`
- [ ] Remove the `if (out.includes("$")) return out;` guard
- [ ] Extend `!=` regex to accept digit-led LHS tokens
- [ ] Apply the same `insideFence` guard to the `√`/`sqrt` rewrite block
- [ ] Manual test: code block with `!=` renders as code, not KaTeX
- [ ] Manual test: `f != g` on a line with `$...$` math now renders as KaTeX
- [ ] Run `npm run build`

---

## TRND-2 — Strengthen System Prompt Anti-Repetition Rule

**Priority**: Medium  
**Effort**: ~15 minutes  
**Risk**: Negligible (prompt text only)

### Problem

The system prompt in `chatStore.ts` has a note buried in the middle of the
formatting section:

```
- Avoid duplicate mixed notation for the same equation (don't show both
  plain-text and LaTeX versions). Use the LaTeX version only.
```

This is too low-signal for most models — it gets drowned out by surrounding
bullet points and is often ignored in multi-step explanations, producing output
like:

```
The formula is: $$x = \frac{-b \pm \sqrt{b^2-4ac}}{2a}$$

Or in plain text: x = (-b ± sqrt(b²-4ac)) / 2a
```

### Implementation

**File**: `mathmate/src/stores/chatStore.ts`

Promote the instruction to a numbered **Hard Rules** block at the very top of
`SYSTEM_INSTRUCTIONS`, before the formatting section. Models consistently follow
rules placed early in the system prompt more reliably than buried bullets.

```ts
const SYSTEM_INSTRUCTIONS = `
Answer as a clear math tutor.

## Hard rules (always follow)
1. NEVER show the same equation or expression twice — not once as LaTeX and
   again as plain text, ASCII math, or Unicode symbols. Choose LaTeX and use
   it exclusively.
2. NEVER use \\(...\\) or \\[...\\] delimiters. Always use $...$ for inline
   math and $$...$$ for display math.
3. Do NOT wrap equations in backticks or code blocks unless the content is
   literally source code.

## Math formatting (KaTeX-compatible)
...rest of existing section...
`;
```

Also remove the now-redundant bullet from the formatting section bullet list.

### Checklist
- [ ] Add `## Hard rules` block at the top of `SYSTEM_INSTRUCTIONS`
- [ ] Move rule #2 (delimiter choice) from the bullet list into Hard Rules
- [ ] Remove the now-duplicated bullet from the formatting section
- [ ] Test: ask a question that previously triggered plain-text repetition and
      verify the model stays LaTeX-only (spot-check with 2–3 models)
- [ ] Run `npm run build`

---

## TRND-3 — Remove `nonStandard: true` Redundancy

**Priority**: Low  
**Effort**: 5 minutes  
**Risk**: None

### Problem

`renderMarkdown.ts` configures `marked-katex-extension` with `nonStandard: true`,
which enables the extension's own `\[...\]` and `\(...\)` parsing. However,
`normalizeMathDelimiters` already converts those same delimiters to `$$...$$`
and `$...$` before `marked` ever sees the text. The `nonStandard` pass is therefore
redundant and — depending on parse ordering — could process the delimiters before
our normalizer runs (e.g. during a future refactor), causing the same expression
to be rendered twice.

### Implementation

**File**: `mathmate/src/lib/renderMarkdown.ts`

```ts
// Before
const marked = new Marked(
  markedKatex({
    throwOnError: false,
    errorColor: "currentColor",
    nonStandard: true,   // ← remove
  })
);

// After
const marked = new Marked(
  markedKatex({
    throwOnError: false,
    errorColor: "currentColor",
  })
);
```

### Checklist
- [ ] Remove `nonStandard: true` from `markedKatex` config
- [ ] Run `npm run build`
- [ ] Verify math still renders correctly in a few test messages

---

## TRND-4 — Migrate to `react-markdown` + `remark-math` + `rehype-katex`

**Priority**: High (architectural)  
**Effort**: ~3–4 hours  
**Risk**: Medium (replaces core rendering path; requires visual regression testing)

This is the proper long-term fix. It eliminates all pre-processor bugs by
replacing the heuristic string-munging pipeline with an AST-based one where
code nodes are structurally isolated from math nodes — no regex can confuse them.

### Why this fixes all the TRND-1 issues permanently

| Current problem | Why it goes away |
|---|---|
| `!=` inside code blocks converted to KaTeX | `remark-math` only annotates math AST nodes; code nodes are never touched |
| `!=` skipped on lines with `$` | No heuristic pre-processor at all |
| `nonStandard` + manual conversion = redundant | Single, consistent `remark-math` pass |
| `html` field name for raw markdown | Field renamed to `markdown` — no ambiguity |
| Fragile `√`/superscript rewrites | KaTeX handles these natively in rendered expressions |
| Repeated `dangerouslySetInnerHTML` with no sanitization\* | `react-markdown` renders via React (no raw HTML injection); math uses `rehype-katex` with `allowDangerousHtml: false` |

\* Sanitization still covered by THQ-3 if needed for edge cases.

### New dependency set

```
npm install react-markdown remark-math rehype-katex
```

`katex` is already installed. `react-markdown`, `remark-math`, and `rehype-katex`
are small and well-maintained (used by every major React + math project).

### Step-by-step implementation

#### Step 1 — Install packages

```bash
cd mathmate
npm install react-markdown remark-math rehype-katex
```

#### Step 2 — Create `MarkdownRenderer` component

Create `mathmate/src/components/MarkdownRenderer.tsx`:

```tsx
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import type { Components } from "react-markdown";

// Custom code renderer — ensures code blocks keep their monospace style
// and are never confused with math expressions.
const components: Components = {
  code({ className, children, ...props }) {
    const isBlock = className?.startsWith("language-");
    return isBlock ? (
      <pre>
        <code className={className} {...props}>
          {children}
        </code>
      </pre>
    ) : (
      <code
        style={{
          fontFamily: "'SF Mono', Menlo, monospace",
          fontSize: "0.9em",
          padding: "1px 4px",
          borderRadius: 3,
          background: "var(--color-surface)",
        }}
        {...props}
      >
        {children}
      </code>
    );
  },
};

interface Props {
  content: string;
  className?: string;
}

export function MarkdownRenderer({ content, className }: Props) {
  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
```

#### Step 3 — Simplify `renderMarkdown.ts`

Keep `normalizeMathDelimiters` (it handles `\[..\]` → `$$..$$` which the model
still outputs despite system prompt instructions), but delete `normalizeEscapedDollarMath`,
`normalizeCommonMathText`, and the `marked` singleton entirely.

Rename the file to `mathmate/src/lib/normalizeMarkdown.ts` (the function no
longer renders — it only normalizes):

```ts
/**
 * Normalize model-emitted math delimiters so remark-math can parse them.
 * Converts \[..\] → $$..$$  and  \(..\) → $..$
 * Does NOT render — call MarkdownRenderer to render.
 */
export function normalizeMarkdown(text: string): string {
  if (!text) return "";
  return text
    .replace(/\\\[([\s\S]*?)\\\]/g, (_m, expr) => `$$${expr}$$`)
    .replace(/\\\(([\s\S]*?)\\\)/g, (_m, expr) => `$${expr}$`);
}
```

#### Step 4 — Update `ChatMessage.tsx`

Replace the `dangerouslySetInnerHTML` + `renderMarkdown` call with
`<MarkdownRenderer>`:

```tsx
// Add import
import { MarkdownRenderer } from "./MarkdownRenderer";
import { normalizeMarkdown } from "../lib/normalizeMarkdown";

// Update the segment renderer inside the message bubble:
{segments.map((seg, i) => {
  if (seg.type === "html") {
    return (
      <MarkdownRenderer
        key={i}
        content={normalizeMarkdown(seg.markdown)}  // rename field — see Step 6
        className="markdown-body"
      />
    );
  }
  // ... viz and quiz cases unchanged ...
})}
```

#### Step 5 — Update `ChatPage.tsx` streaming footer

The streaming footer in `ChatPage.tsx` has its own `renderMarkdown` +
`dangerouslySetInnerHTML` call:

```tsx
// Before
<div
  className="markdown-body"
  dangerouslySetInnerHTML={{ __html: renderMarkdown(streamingContent) }}
/>

// After
<MarkdownRenderer
  content={normalizeMarkdown(streamingContent)}
  className="markdown-body"
/>
```

#### Step 6 — Rename `html` field to `markdown` in `interactiveSegments.ts`

The `{ type: "html"; html: string }` field stores raw markdown, not HTML.
Rename it to avoid future confusion:

```ts
// interactiveSegments.ts
export type InteractiveSegment =
  | { type: "html"; markdown: string }   // ← renamed from html
  | VizSegment
  | QuizSegment;

// Update all push sites:
segments.push({ type: "html", markdown: text.slice(lastIndex, match.index) });
// ...
segments.push({ type: "html", markdown: text.slice(lastIndex) });
segments.push({ type: "html", markdown: text });
```

#### Step 7 — Delete old files / remove dead dependencies

1. Delete `mathmate/src/lib/renderMarkdown.ts`
2. Remove unused imports of `renderMarkdown` from `ChatMessage.tsx` and `ChatPage.tsx`
3. `marked` and `marked-katex-extension` can be removed from `package.json`
   once all call sites are migrated:
   ```bash
   npm uninstall marked marked-katex-extension
   ```
   (Keep `katex` — it is still used by `renderMath.ts` for the MathComposer preview.)

#### Step 8 — CSS verification

`rehype-katex` injects the same `katex.min.css` classes as `marked-katex-extension`.
The existing dark mode override in `theme.css` targets `.katex` and `.katex-display`
— these are identical in both stacks, so no CSS changes are needed.

#### Step 9 — Visual regression testing

Test the following scenarios manually before shipping:

| Test case | Expected |
|---|---|
| Simple inline math: `$x^2 + y^2 = r^2$` | KaTeX inline render |
| Display math block: `$$\int_0^\infty$$` | KaTeX display block, centered |
| Mixed markdown + math paragraph | Text and math interleaved correctly |
| Fenced code block with `!=` inside | Rendered as code, no KaTeX |
| Inline code: `` `x != 0` `` | Rendered as inline code, no KaTeX |
| Model-emitted `\[...\]` delimiters | Normalized to `$$..$$` and rendered |
| Model-emitted `\(...\)` delimiters | Normalized to `$...$` and rendered |
| `√(x+1)` in a paragraph | Plain text or KaTeX depending on context |
| Numbered list with inline math | List structure preserved, math rendered |
| Markdown table | Table renders correctly |
| Bold/italic alongside math | Formatting preserved |

### Checklist

**Dependencies**
- [ ] `npm install react-markdown remark-math rehype-katex`

**New component**
- [ ] Create `src/components/MarkdownRenderer.tsx`

**Simplify normalizer**
- [ ] Rename `renderMarkdown.ts` → `normalizeMarkdown.ts`
- [ ] Strip down to delimiter-normalization only (delete `normalizeEscapedDollarMath`,
      `normalizeCommonMathText`, `escapeHtml`, and the `marked` singleton)
- [ ] Export `normalizeMarkdown(text: string): string`

**Update call sites**
- [ ] `ChatMessage.tsx`: import `MarkdownRenderer` + `normalizeMarkdown`,
      replace `dangerouslySetInnerHTML` block
- [ ] `ChatPage.tsx`: same replacement in streaming footer `<div>`
- [ ] `interactiveSegments.ts`: rename `html` field to `markdown` on the
      `InteractiveSegment` union type and all three push sites

**Cleanup**
- [ ] Remove `renderMarkdown` import from all files
- [ ] `npm uninstall marked marked-katex-extension`
- [ ] Verify `katex` is still present (needed by `renderMath.ts`)
- [ ] Run `npm run build` — zero TypeScript errors

**Testing**
- [ ] All 11 visual regression scenarios pass (table above)
- [ ] Streaming still works (content updates smoothly as tokens arrive)
- [ ] Dark mode: KaTeX colors still correct
- [ ] Code blocks: `!=` not converted to KaTeX inside fences

---

## Recommended Execution Order

| # | Item | When | Why |
|---|---|---|---|
| 1 | TRND-3 (remove `nonStandard`) | Immediately | 5-min zero-risk fix; eliminates one double-processing vector |
| 2 | TRND-2 (system prompt) | Same session | 15-min; reduces model-side repetition right away |
| 3 | TRND-1 (fix code-block safety) | Next session | 1-hour targeted fix; unblocks code blocks with operators |
| 4 | TRND-4 (remark/rehype migration) | Dedicated session | Proper architectural fix; replaces all heuristics |

TRND-1 through TRND-3 are independent fixes that are worth shipping even if
TRND-4 is deferred. TRND-4 supersedes TRND-1 and TRND-3 — once the migration
is complete those patches can be removed.

---

*Created: 2026-05-28*
