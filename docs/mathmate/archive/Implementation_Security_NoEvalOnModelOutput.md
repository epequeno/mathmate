# Implementation Plan: Security — No `eval` / `new Function` on Model or User Output

## 1) Goal

Eliminate the only code-execution sink in the renderer that is reachable from model output or user input.

Both `src/components/Quiz/FreeResponse.tsx` and `src/components/Visualization/FunctionGraph.tsx` currently build a JavaScript function body via string concatenation and evaluate it with `new Function(...)`. The "sanitization" is a regex replace that only handles `sin/cos/tan/sqrt/pi/^/e` and does **not** prevent identifier access, property access, autoboxing, or unicode escapes. Inside the Tauri webview, that function body has access to `window`, `document`, `fetch`, `localStorage`, and the Tauri `invoke()` IPC bridge. A model that emits `1).constructor.constructor('return invoke')()` (or simpler gadgets) can read arbitrary files via `read_file_as_base64` and exfiltrate them via an `<img src>` URL.

**This plan ships a safe arithmetic parser used in every place that currently calls `new Function`, and forbids `eval`/`new Function`/`Function(...)` in the renderer.**

---

## 2) Threat Model (Practical)

- Adversary: a prompt-injected response from a remote model, OR a malicious note in the user's Obsidian vault that the model regurgitates.
- Capability sought: arbitrary code execution in the renderer → Tauri IPC → `read_file_as_base64` → exfil over `<img src>`.
- Surface: any place the renderer evaluates a string as code where the string came from outside the app's own source.
- Out of scope: native-side Rust code (no `eval` equivalent there); CSP hardening (see `Implementation_Security_ContentSecurityPolicy.md`).

---

## 3) Scope

### In scope
- Replace `new Function(...)` calls in `FreeResponse.tsx:188` and `FunctionGraph.tsx:145` with a safe parser.
- Add a centralized `safeMath` module used by every numeric comparison / function-graph evaluation.
- Add ESLint / grep guard so the pattern cannot reappear.
- Add unit tests covering the malicious payload classes.

### Out of scope
- Native-side code execution paths (none exist in `src-tauri/` that build code from user input).
- CSP (separate plan).
- Replacing `marked` (markdown parser) — `marked` does not call `eval`; its output is HTML and is already sanitized by DOMPurify (see `Implementation_Security_SanitizerHardening.md`).

---

## 4) System Design

### 4.1 Approach choice

**Option A — `mathjs` with restricted context.** Pull in `mathjs`, parse with `math.parse(expr)`, then `evaluate` against a frozen scope that exposes only `Math.*` constants/functions and the variable `x`. ~150 KB gzipped, well-tested, supports common math notation. Downside: a bit larger than a hand-rolled parser.

**Option B — Hand-rolled recursive-descent parser.** ~300 LOC, no dependency, only the operators we need (`+ - * / ^`, parentheses, numbers, single-letter variable names, allowlist of `Math.*` calls). Downside: we own the bug surface; less robust on edge cases.

**Recommendation: Option A (mathjs).** MathMate is already a math app — the dependency is thematically appropriate, and the parser has been fuzzed extensively.

### 4.2 Where `safeMath` lives

- New file: `mathmate-v2/src/lib/safeMath.ts`
- Exports:
  - `safeEvalNumber(expr: string, scope?: Record<string, number>): number` — returns `NaN` on parse/runtime error
  - `safeEvalBool(expr: string): boolean` — convenience for quiz numeric comparisons
  - `tryParse(expr: string): ParseResult` — for UI to show "couldn't parse" hints
- Scope is frozen (`Object.freeze`) before evaluation; `mathjs` is configured with `predictable: true` and a custom function map of allowed `Math.*`.

### 4.3 Banned patterns

Add to a new `mathmate-v2/scripts/check-no-eval.mjs` CI script (run in `npm run build` via a `prebuild` hook):
- Regex: `/\bnew\s+Function\s*\(|\beval\s*\(/`
- Exits non-zero with file:line if matched under `src/`.

---

## 5) File-by-File Tickets

### S1E1 — Add `safeMath` module
**New:**
- `mathmate-v2/src/lib/safeMath.ts`
- `mathmate-v2/src/lib/safeMath.test.ts`

**Tasks:**
- Add `mathjs` dependency (`npm install mathjs`).
- Implement `safeEvalNumber` by parsing to an AST (`math.parse`) and validating node types before evaluation.
- Allowlist operators/functions/constants only: `+ - * / ^`, numeric literals, parentheses, `x`, and `sin, cos, tan, asin, acos, atan, sinh, cosh, tanh, sqrt, abs, log, log2, log10, exp, floor, ceil, round, sign, pow, min, max, pi, e`.
- Reject all symbol/member access outside allowlist (e.g., `globalThis`, `constructor`, `import`, assignment/function definitions).
- Evaluate only validated AST against a frozen scope.
- Return `NaN` on any parse/eval error; never throw.
- Unit tests:
  - `safeEvalNumber('2 + 3 * 4')` → `14`
  - `safeEvalNumber('sin(pi/2)', {x: 0})` → `1`
  - `safeEvalNumber('1).constructor.constructor("alert(1)")()')` → `NaN` (no throw)
  - `safeEvalNumber('globalThis.fetch("https://x")')` → `NaN`
  - `safeEvalNumber('x.constructor.constructor("alert(1)")()')` → `NaN`
  - `safeEvalNumber('"\\u0065val(1)"')` → `NaN`
  - `safeEvalNumber('(function(){return invoke})()')` → `NaN`

### S1E2 — Replace `new Function` in quiz free-response
**Modify:**
- `mathmate-v2/src/components/Quiz/FreeResponse.tsx`

**Tasks:**
- Remove `safeEval` function (lines 180–189).
- Import `safeEvalNumber` from `safeMath.ts`.
- Update numeric-equivalence check (lines 162–175) to use `safeEvalNumber`.
- Update snapshot tests.

### S1E3 — Replace `new Function` in function graph
**Modify:**
- `mathmate-v2/src/components/Visualization/FunctionGraph.tsx`

**Tasks:**
- Remove `evaluateExpression` function (lines 128–149).
- Import `safeEvalNumber` from `safeMath.ts`.
- Map `x` to the input value at each plot step; pass via scope.
- Return `NaN` for any out-of-range or unparseable expression; chart gracefully skips NaN y-values.

### S1E4 — CI guard
**New:**
- `mathmate-v2/scripts/check-no-eval.mjs`

**Modify:**
- `mathmate-v2/package.json` — add `"prebuild": "node scripts/check-no-eval.mjs"` and a new `"lint:no-eval": "node scripts/check-no-eval.mjs"` script.

**Tasks:**
- Recursively scan `src/` for the regex `/\bnew\s+Function\s*\(|\beval\s*\(/` (excluding `node_modules` and `dist/`).
- Exit non-zero with file:line on any match.
- Print a one-line summary ("OK: 0 matches in 124 files") on success.

### S1E5 — Docs
**Modify:**
- `docs/mathmate/CHANGELOG.md` — add a "Fixed (Security)" entry under today's date.
- `docs/mathmate/03_Dev_Logs/2026-05-31.md` — note the change.

---

## 6) Testing Plan

### Unit tests
- `safeMath.test.ts` (new) — covers the cases in S1E1 above, plus boundary cases: empty string, only whitespace, deeply nested parens, scientific notation, `Infinity`/`-Infinity` literals, hex literals.
- Update `FreeResponse.test.tsx` (if exists) or add one — verify two equivalent-by-value expressions are accepted and that an injection attempt is not executed.
- Update `FunctionGraph.test.tsx` (if exists) — verify `f(x) = sin(x)` plots correctly; verify `f(x) = alert(1)` returns NaN and renders a placeholder.

### Manual / E2E
- Open a session where the model emitted math in a quiz free-response. Confirm numeric comparison still works for legitimate answers.
- Open a function-graph widget with a complex but legitimate expression. Confirm the chart renders.
- Paste `1).constructor.constructor('return invoke')()` into a quiz free-response. Confirm it does not run; the field shows a "couldn't parse" hint and the answer is marked wrong rather than throwing.
- Inspect the JS console — no `eval` or `Function` entries in the call stack.

### CI
- `npm run lint:no-eval` passes.
- `npm run build` runs the guard as `prebuild` and passes.
- `npm run build` itself passes.
- `cargo check` passes (no Rust changes, but verify nothing else broke).

---

## 7) Acceptance Criteria

- [ ] `new Function`, `eval`, and `Function(` do not appear anywhere under `mathmate-v2/src/`. Verified by `npm run lint:no-eval`.
- [ ] `safeMath.ts` exists, has unit tests, validates AST node types/symbols before evaluation, and is the only numeric-evaluation path used by quiz free-response and function-graph components.
- [ ] Adversarial test cases (constructor chain, `globalThis`, unicode-escape eval, Tauri `invoke` access) all return `NaN` without throwing or executing user code.
- [ ] No regression in legitimate quiz answers or function graphs.
- [ ] `npm run build` and `cargo check` pass.
- [ ] CHANGELOG and dev log updated.

---

## 8) Rollout Plan

1. Land `safeMath` module + tests behind the existing components (no UI change).
2. Swap `FreeResponse.tsx` and `FunctionGraph.tsx` to use `safeMath`. Existing tests should still pass.
3. Add `lint:no-eval` script and wire into `prebuild`. Confirm CI fails on a planted test violation before merging.
4. Run a focused security dogfood on the next dev build: paste a constructor-chain payload into a quiz free-response, confirm no execution.
5. CHANGELOG entry: "Fixed (Security): quiz free-response and function-graph widgets no longer evaluate model/user output with `new Function`. Replaced with `safeMath` parser."
