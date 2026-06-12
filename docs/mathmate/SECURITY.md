# MathMate Security

## Threat Model

MathMate processes output from remote LLM providers (OpenRouter, OpenAI, Anthropic) and renders it in a Tauri webview. The primary risk is **prompt injection**: a model response that contains malicious HTML/JS that slips past the renderer's sanitizer (`DOMPurify`) and executes in the webview context.

A successful XSS in the renderer has access to the **Tauri IPC bridge** (`invoke()`), which exposes commands like `read_file_as_base64` and `open_path`. This makes CSP a critical defense-in-depth layer — even if the sanitizer has a bypass, the CSP prevents the attacker from exfiltrating data or loading remote payloads.

## Content-Security-Policy

The production build ships with the following CSP in `tauri.conf.json`:

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
manifest-src 'self'
```

### Directive rationale

| Directive | Notes |
|---|---|
| `script-src 'self'` | No inline scripts. No remote scripts. Vite bundles are served from the Tauri asset protocol. |
| `style-src 'self' 'unsafe-inline'` | KaTeX and `marked-katex-extension` emit inline `style` attributes on rendered math. This is the only `'unsafe-inline'` exception. |
| `img-src 'self' data: asset:` | `data:` for base64-encoded image attachments. `asset:` for Tauri's asset protocol. `https:` is intentionally excluded — this blocks `<img src="https://attacker/exfil">` |
| `connect-src` | IPC + model provider API hosts. Adding a new provider with a custom `base_url` requires updating this list. |
| `form-action 'none'` | Prevents injected forms from submitting to attacker origins. |
| `frame-src 'none'` | No iframes. |

### Dev mode

In development (`npm run dev`), the CSP in `tauri.conf.json` does not apply to content served via `devUrl` (Vite dev server). The dev environment relies on Vite's own CSP-like protections (CORS, HMR origin checks). This is a local-only gap — production builds always carry the CSP.

## Reporting a Vulnerability

If you discover a security issue in MathMate:

1. **Do not** open a public GitHub issue.
2. Send details to [your-reporting-email-or-security-advisory-link-here].
3. If you need a PGP key, request one in your initial message.

We aim to acknowledge reports within 48 hours and ship a fix within 7 days for critical issues.

## Related Security Plans

- [No `eval`/`new Function` on Model Output](Implementation_Security_NoEvalOnModelOutput.md) — ✅ Completed
- [OS Keychain for API Keys](Implementation_Security_KeychainKeyStorage.md) — Deferred
- [Path Scoping for `read_file_as_base64`](Implementation_Security_PathScopeGuard.md) — ✅ Completed
- [Path Scoping for `open_path`](Implementation_Security_PathScopeGuard.md) — ✅ Completed
- [Sanitizer URL Allowlist](Implementation_Security_SanitizerHardening.md) — ✅ Completed
- [Memory → Prompt Isolation](Implementation_Security_MemoryPromptIsolation.md) — ✅ Completed
- [Study-Log Path Containment](Implementation_Security_StudyLogPathContainment.md) — ✅ Completed