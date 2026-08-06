# Book Tab PDF Streaming — Implementation Plan

**Feature:** Stream project textbook PDFs to pdf.js through a loopback HTTP range server, eliminating the base64 round-trip and whole-file load on first Book-tab visit.  
**Status:** Proposed (revised after transport review)  
**Phase:** 11 (Hardening & Refinement)  
**Linked roadmap item:** Phase 11 — Book Tab PDF Streaming  
**Target platforms:** macOS first (v1); Windows/Linux to follow after macOS validation.

---

## 1) Motivation

### Current behaviour

On the **first** visit to the Book tab for a project, `BookPage.tsx` calls `read_project_textbook(project_id)`. The Rust handler (`src-tauri/src/lib.rs`) does:

```rust
let data = std::fs::read(&target)?;          // whole PDF into memory
Ok(base64::engine::general_purpose::STANDARD.encode(&data))  // +33% size
```

The frontend then synchronously decodes the entire PDF on the renderer thread:

```js
const binaryStr = atob(base64);
const bytes = new Uint8Array(binaryStr.length);
for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
const blob = new Blob([bytes], { type: "application/pdf" });
const url = URL.createObjectURL(blob);
```

and passes the blob URL to:

```ts
getDocument({ url: pdfUrl })
```

### Why it's slow for large textbooks

For a 1000-page PDF, often 20–80 MB, first load is dominated by:

1. **Whole-file Rust read + base64 encode + IPC transfer** (+33% payload).
2. **Renderer-thread `atob` + per-byte JS loop**, blocking UI in proportion to file size.
3. **Blob URL source**, which prevents pdf.js from using its native HTTP Range loading path.

### Why subsequent visits are fast

Two process-lifetime caches hide the problem after the first Book-tab visit in a single app session:

- `pdfUrlCache` in `BookPage.tsx` — skips Rust read + base64 decode.
- `pdfDocumentCache` in `usePdfRenderer.ts` — skips pdf.js document parse.

A fresh app launch still pays the full first-load cost.

### Goal

Make the first Book-tab visit feel close to instant for large textbooks by letting pdf.js fetch only the byte ranges it needs for page 1 and document structure, using its built-in HTTP range support.

---

## 2) Transport Decision

### Chosen approach: loopback HTTP range server

Use a local HTTP server bound to `127.0.0.1` on an app-owned port. The frontend gives pdf.js a normal HTTP URL:

```txt
http://127.0.0.1:<port>/book/<project-id>?v=<textbook-revision>
```

pdf.js recognizes `http:` / `https:` URLs as range-capable and will issue `Range: bytes=...` requests when the server advertises:

```txt
Accept-Ranges: bytes
Content-Length: <file-size>
```

### Why not `book://` custom protocol?

The earlier proposal used Tauri's `book://localhost/<project-id>` custom protocol. That has two blockers:

1. **pdf.js only enables network Range requests for `http:` / `https:` URLs.** On macOS/Linux, Tauri custom protocols are exposed as `<scheme>://localhost/...`, e.g. `book://localhost/...`, which pdf.js treats as non-HTTP. It will not set `Range` headers for those URLs.
2. **Tauri custom protocol responses are byte-buffer responses, not true streaming bodies.** The async protocol API allows responding later from another thread, but the body ultimately becomes `Cow<'static, [u8]>`. A no-Range initial response may still require materializing the full PDF before the webview receives headers.

Therefore, the revised plan uses a loopback HTTP server for v1.

---

## 3) Non-Goals

- **Cross-platform runtime verification in v1.** The implementation should avoid macOS-specific assumptions where practical, but only macOS must be manually validated initially.
- **Changing the PDF viewer UI.** `PdfViewer` and `usePdfRenderer` remain the rendering path; the source URL changes.
- **Changing capture/navigate behaviour.** Drag-to-capture → Chat flow is untouched.
- **Removing `pdfDocumentCache`.** It remains useful for instant return visits.
- **Per-page Rust extraction/rendering.** Out of scope. pdf.js remains the renderer.
- **Using Tauri `asset:` protocol.** Rejected because its static scope would either not cover user-selected textbook paths or require broad filesystem exposure.

---

## 4) Threat Model

| Threat | Mitigation |
|---|---|
| Frontend or another local process fetches arbitrary filesystem paths | URL carries only a **project id**. Rust resolves the textbook path from the project record and runs `PathScope::guard` on every request. No raw path is accepted from the URL. |
| Path traversal via crafted URL | Only the first project-id path segment is used. Query parameters are ignored for path resolution. |
| Accessing another project's textbook | Requests require a per-app unguessable token and still resolve/guard using the requested project id. The guard receives `Some(project_id)`. |
| Another local process guesses the endpoint | Server binds only to `127.0.0.1`; every request must include an app-generated random token. Token is never persisted and changes each app launch. |
| Range header abuse | Only a single `bytes=` range is supported. Malformed/unsupported/unsatisfiable ranges return `400` or `416` with no path disclosure. |
| Directory listing | No directory endpoints exist. Handler only serves the single guarded textbook file for a project. |
| Serving non-PDF files | Preserve current `.pdf` extension validation before serving. |
| Stale authorization/path resolution | Do **not** cache resolved paths in v1. Load project + run `PathScope::guard` on every request. |

This preserves the existing path-security design: `PathScope` remains the single filesystem access control point.

---

## 5) System Design

### 5.1 Local HTTP server lifecycle

At app startup, create a `BookStreamServer` service that:

1. Generates a random per-process token.
2. Binds an HTTP server to `127.0.0.1` on an ephemeral port (`127.0.0.1:0`) or a selected available local port.
3. Stores `{ port, token }` in Tauri-managed state.
4. Shuts down when the Tauri app exits.

Preferred implementation: **Tokio + Hyper/Axum** if feasible.

- `tokio` should be declared explicitly if used directly, even if Tauri pulls it transitively.
- `axum` is acceptable if it keeps handler code cleaner.
- If dependency or runtime integration becomes awkward, stop and discuss before switching to another server library.

Suggested dependencies if using Axum:

```toml
tokio = { version = "1", features = ["rt-multi-thread", "macros", "fs", "io-util", "net", "sync"] }
axum = "0.7"
tower-http = { version = "0.6", features = ["cors"] } # optional; hand-written CORS is also fine
rand = "0.8" # already present in this repo
```

Implementation note: if Axum `0.8` is current/compatible in the lockfile environment, use that instead of forcing `0.7`. Prefer the smallest working dependency set.

### 5.2 URL contract

Frontend URL shape:

```txt
http://127.0.0.1:<port>/book/<project-id>?token=<token>&v=<revision>
```

Where:

- `<project-id>` is the only route path parameter.
- `token` authorizes access to the local endpoint.
- `v` is a cache-busting revision derived from the textbook path or project textbook metadata. The server does **not** trust it for path resolution.

The revision is necessary because `usePdfRenderer` caches by URL. If the same project changes textbooks and the URL remains unchanged, `pdfDocumentCache` may return the old PDF. Use a deterministic, non-secret revision such as a short hash of `projectId + textbook_path` or `encodeURIComponent(textbook_path)` if acceptable for local-only URLs. Prefer a hash to avoid exposing local paths in DevTools/network logs.

### 5.3 Tauri command for stream info

Add a lightweight command that returns the local server URL metadata:

```rust
#[derive(serde::Serialize)]
struct BookStreamInfo {
    origin: String, // e.g. "http://127.0.0.1:49152"
    token: String,
}

#[tauri::command]
fn get_book_stream_info(svc: State<AppServices>) -> Result<BookStreamInfo, AppError> {
    Ok(svc.book_stream.info())
}
```

Exact placement may differ depending on whether `BookStreamServer` lives inside `AppServices` or separate Tauri state. Keep the frontend API narrow: it only needs enough to construct the URL.

### 5.4 Request handling

Endpoint:

```txt
GET  /book/:project_id?token=...
HEAD /book/:project_id?token=...
OPTIONS /book/:project_id
```

Handler flow for `GET`/`HEAD`:

1. Validate token using constant-time comparison if convenient. At minimum, avoid logging the token.
2. Parse project id from the route. Reject missing/empty/multi-segment weirdness with `400`.
3. Load project from `svc.projects.load(project_id)`.
4. Read `project.textbook_path`; if absent, return `404`.
5. Run `svc.path.guard(&path, Some(project_id), false)` on **every request**.
6. Validate target extension is `.pdf`.
7. `metadata()` target; reject directories/non-files.
8. Determine total length and modified time.
9. Parse Range header if present.
10. Respond:
    - no Range: `200 OK` with full-file stream;
    - valid single range: `206 Partial Content` with byte-range stream;
    - unsatisfiable range: `416 Range Not Satisfiable` with `Content-Range: bytes */<total>`;
    - malformed/unsupported range: `400 Bad Request` or `416` per helper decision.

### 5.5 HTTP headers

All successful `GET`/`HEAD` responses should include:

```txt
Content-Type: application/pdf
Accept-Ranges: bytes
Content-Length: <length of response body>
Access-Control-Allow-Origin: *
Access-Control-Expose-Headers: Accept-Ranges, Content-Length, Content-Range
Cache-Control: no-store
X-Content-Type-Options: nosniff
```

For `206` responses additionally include:

```txt
Content-Range: bytes <start>-<end>/<total>
```

For `416` responses include:

```txt
Content-Range: bytes */<total>
Content-Length: 0
```

For `OPTIONS` responses include:

```txt
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, HEAD, OPTIONS
Access-Control-Allow-Headers: Range
Access-Control-Max-Age: 600
Content-Length: 0
```

Notes:

- `Access-Control-Expose-Headers` is important so pdf.js can read `Accept-Ranges`, `Content-Length`, and `Content-Range` from cross-origin responses.
- `Cache-Control: no-store` avoids stale browser/webview caching. `pdfDocumentCache` remains the app-level cache.
- Do not include `Content-Range` on normal `200` responses.

### 5.6 Range parsing helper

Support exactly one byte range:

```rust
fn parse_range(header: Option<&HeaderValue>, total: u64) -> RangeDecision
```

Forms to support:

- `bytes=START-END`
- `bytes=START-`
- `bytes=-SUFFIX`

Rules:

- `end` is inclusive and clamped to `total - 1`.
- Empty files are invalid for normal textbook PDFs; if encountered, return `416` or validation error.
- `bytes=-0` is unsatisfiable.
- `start >= total` is unsatisfiable.
- `end < start` is unsatisfiable.
- Multiple ranges (`bytes=0-1,2-3`) are unsupported in v1; return `416` or `400` consistently.
- Guard against integer overflow during parsing.
- Ignore `If-Range` for v1, or treat it as absent. pdf.js does not require conditional range validation here.

Unit test this helper thoroughly.

### 5.7 Streaming implementation with Tokio

For `206`, stream only the requested range from disk.

Implementation options, in preferred order:

1. `tokio::fs::File` + `AsyncSeekExt` + `take(length)` + `ReaderStream` / body adapter supported by the selected HTTP stack.
2. If the body adapter is awkward, read the requested range into a `Vec<u8>` for `206` responses only. Ranges are typically small (pdf.js default chunk size is 64 KiB). Keep `200` responses streaming.
3. If full-file `200` streaming is not practical with chosen dependencies, stop and discuss before accepting a full-buffer fallback.

The server must allow pdf.js's initial full request to be aborted after headers. With a real HTTP server and streaming body, this avoids reading the whole PDF when pdf.js switches to range requests.

### 5.8 Frontend URL builder

Add to `src/lib/api/textbook.ts`:

```ts
export interface BookStreamInfo {
  origin: string;
  token: string;
}

export async function getBookStreamInfo(): Promise<BookStreamInfo> {
  return invoke<BookStreamInfo>("get_book_stream_info");
}

export function projectTextbookStreamUrl(
  info: BookStreamInfo,
  projectId: string,
  revision: string,
): string {
  const url = new URL(`/book/${encodeURIComponent(projectId)}`, info.origin);
  url.searchParams.set("token", info.token);
  url.searchParams.set("v", revision);
  return url.toString();
}
```

Add a small revision helper. Prefer hashing if a suitable frontend helper already exists; otherwise a deterministic encoded value is acceptable for v1 but a hash is preferred.

### 5.9 BookPage.tsx changes

Replace the `readProjectTextbook` + base64 decode + blob URL effect with an effect that:

1. Checks `currentProject?.textbook_path`.
2. Fetches `getBookStreamInfo()` once or uses a cached promise/module-level value.
3. Builds `pdfUrl` with `projectTextbookStreamUrl(info, currentProject.id, revision)`.
4. Sets `textbookId` via existing `Textbook.deriveId(currentProject.textbook_path)`.
5. Lets `PdfViewer` / `usePdfRenderer` own loading/error state.

Remove:

- `pdfUrlCache` map,
- `CachedPdf` type,
- `prunePdfCache`,
- `cacheKeyForProject`,
- `Textbook.readProjectTextbook` call,
- `atob` / byte loop,
- Blob URL creation.

Keep:

- `textbookId` derivation,
- all capture UI,
- error display logic, adapted to renderer errors if needed.

Important: because the URL includes a revision tied to `textbook_path`, changing a project's textbook must trigger a new `pdfUrl` and avoid stale `pdfDocumentCache` hits.

### 5.10 PdfViewer / usePdfRenderer

No functional change should be required for basic rendering:

```ts
getDocument({ url: pdfUrl })
```

pdf.js should choose its HTTP network stream for `http://127.0.0.1:<port>/...` and issue Range requests after seeing the correct headers.

However, verify:

- range requests are visible in DevTools;
- no CSP violations;
- errors from `usePdfRenderer` are visible in the Book tab;
- stale cached documents are not reused after textbook changes.

### 5.11 Textbook indexing interaction

`useTextbookIndexer` currently auto-starts indexing after a document loads. For an unindexed 1000-page textbook, this can quickly force many page fetches and obscure first-load performance measurements.

For v1 implementation, choose one of:

1. **Recommended:** defer auto-indexing for streamed PDFs until after first page render and an idle delay, or make indexing explicit/opt-in.
2. Keep current auto-indexing but update testing instructions to measure first page render before indexing begins and expect later network activity.

Do not claim total transferred bytes stays small during a full indexing run; indexing needs page text extraction and may naturally touch much of the PDF.

### 5.12 CSP update

Update `src-tauri/tauri.conf.json` `security.csp`:

```txt
connect-src 'self' blob: ipc: https://ipc.localhost http://127.0.0.1:* https://openrouter.ai https://api.openai.com https://api.anthropic.com;
```

Do **not** add `book:` for this implementation.

If WebView/CSP rejects wildcard ports in practice, switch to a fixed local port range or expose the chosen origin through a more precise CSP strategy. Test early.

### 5.13 Keep `read_project_textbook`?

Keep the Rust command and TS wrapper initially, but mark deprecated in code comments. After implementation, grep for callers:

- if zero callers and tests do not need it, remove the command and `generate_handler!` entry;
- otherwise keep as fallback/deprecated.

---

## 6) File-by-File Tickets

### B0 — Spike: prove pdf.js range behavior

Before full implementation:

- Start a minimal loopback HTTP handler for one fixed PDF or temporary test endpoint.
- Point `getDocument({ url })` at `http://127.0.0.1:<port>/...`.
- Verify DevTools shows `Range` requests and `206 Partial Content` responses.
- Verify the initial full GET is aborted/not fully transferred.

Do this before refactoring BookPage heavily.

### B1 — Rust: Book stream server service

**Files:** likely new module(s):

- `mathmate/src-tauri/src/services/book_stream.rs` or `src-tauri/src/book_stream.rs`
- `mathmate/src-tauri/src/services/mod.rs`
- `mathmate/src-tauri/src/lib.rs`

Tasks:

- Add `BookStreamServer` / `BookStreamState`.
- Generate per-app token.
- Bind `127.0.0.1:0`.
- Spawn Tokio HTTP server.
- Store port/token in managed service/state.
- Provide `info()` for `get_book_stream_info` command.
- Ensure graceful shutdown if practical.

### B2 — Rust: HTTP handlers and range parser

**Files:** same as B1 or submodule.

Tasks:

- Implement `GET`, `HEAD`, `OPTIONS /book/:project_id`.
- Validate token.
- Load project + guard path every request.
- Validate `.pdf` and regular file.
- Implement single-range parser.
- Stream `200` and `206` bodies with Tokio where possible.
- Add CORS/exposed headers.
- Add unit tests for range parser and route path parsing.

### B3 — Rust: dependencies

**File:** `mathmate/src-tauri/Cargo.toml`

Likely add explicit dependencies for the chosen HTTP stack, e.g.:

```toml
tokio = { version = "1", features = ["rt-multi-thread", "macros", "fs", "io-util", "net", "sync"] }
axum = "0.7" # or compatible current version
tokio-util = { version = "0.7", features = ["io"] }
```

Only add what is actually used.

### B4 — Rust: Tauri command

**File:** `mathmate/src-tauri/src/lib.rs`

- Add `get_book_stream_info` command.
- Register it in `tauri::generate_handler!`.
- Ensure stream service is initialized before frontend can call the command.

### B5 — Frontend API wrapper

**File:** `mathmate/src/lib/api/textbook.ts`

- Add `BookStreamInfo` type.
- Add `getBookStreamInfo()`.
- Add `projectTextbookStreamUrl(...)`.
- Add/defer revision helper.
- Mark `readProjectTextbook` as `@deprecated`.

### B6 — Frontend BookPage refactor

**File:** `mathmate/src/pages/BookPage.tsx`

- Remove blob/base64 load path.
- Remove `pdfUrlCache` and helpers.
- Build local HTTP stream URL.
- Preserve `textbookId` derivation.
- Ensure loading/error UX still makes sense when errors come from `PdfViewer` / `usePdfRenderer`.
- Ensure changing `textbook_path` changes the URL revision.

### B7 — PdfViewer / usePdfRenderer verification

**Files:**

- `mathmate/src/hooks/usePdfRenderer.ts`
- `mathmate/src/components/PdfViewer/PdfViewer.tsx`

No planned rendering change, but verify:

- pdf.js sends `Range` for the loopback URL;
- `Content-Length` and exposed headers are visible;
- `pdfDocumentCache` key includes the revisioned URL;
- no stale document after project textbook change.

### B8 — Textbook indexing decision

**File:** `mathmate/src/hooks/useTextbookIndexer.ts`

Decide before final acceptance:

- defer/disable auto-indexing for streamed PDFs, or
- leave as-is and update performance test expectations.

If changing behavior, document it in dev log/changelog.

### B9 — CSP config

**File:** `mathmate/src-tauri/tauri.conf.json`

- Add `http://127.0.0.1:*` to `connect-src`.
- Do not add `book:`.

### B10 — Docs

**Files:**

- `docs/mathmate/03_Dev_Logs/YYYY-MM-DD.md`
- `docs/mathmate/CHANGELOG.md`

Document:

- local loopback HTTP range server,
- removal of base64/Blob first-load path,
- CSP update,
- any indexing behavior change,
- Rust recompile required.

---

## 7) Testing Plan

### Manual macOS

1. **Spike first.** Confirm pdf.js sends `Range` to loopback HTTP and receives `206`.
2. **Large textbook, cold launch.** Set a 1000+ page PDF as a project textbook. Cold-launch app, open Book tab. Target: first page render in ~1s or clearly faster than baseline.
3. **Network verification.** DevTools should show:
   - initial `200` GET headers followed by abort or small transfer, depending on pdf.js behavior;
   - subsequent `206 Partial Content` requests;
   - `Range: bytes=...` request headers;
   - `Accept-Ranges`, `Content-Length`, `Content-Range` response headers.
4. **Small textbook regression.** Normal small PDFs render.
5. **No textbook set.** Empty state still shows.
6. **Bad project id.** Direct fetch to `/book/nonexistent?token=...` returns `404`/`400`, not a crash.
7. **Bad/missing token.** Direct fetch without token or with a bad token returns `401`/`403`.
8. **Path outside roots.** Manually set a project's `textbook_path` outside allowed roots; opening Book tab fails with access denied and does not serve bytes.
9. **Non-PDF path.** Project textbook path with non-`.pdf` extension is rejected.
10. **Textbook changed for same project.** Change project textbook; Book tab must show the new PDF, not a stale cached document.
11. **Capture flow.** Drag-to-capture still attaches an image and navigates to Chat.
12. **Return visit.** Close/reopen Book tab; should be instant via `pdfDocumentCache`.
13. **CSP/CORS.** No CSP or CORS violations in console.
14. **Indexing interaction.** If auto-indexing remains enabled, distinguish first-render timing from subsequent indexing network activity.

### Rust unit tests

- Range parser:
  - absent range,
  - full range,
  - open-ended,
  - suffix,
  - suffix zero,
  - start > total,
  - start == total,
  - end < start,
  - malformed unit,
  - malformed numbers,
  - multiple ranges,
  - overflow-sized numbers,
  - empty file.
- Project-id path parsing.
- Token validation helper if factored separately.

### Build gates

Run from `mathmate/` unless noted:

```bash
npm run build
```

Run from `mathmate/src-tauri/`:

```bash
cargo check
cargo test
```

Also run:

```bash
npm run tauri dev
```

for macOS smoke testing.

---

## 8) Acceptance Criteria

- [ ] First Book-tab visit for a 1000+ page textbook renders page 1 substantially faster than the base64/Blob baseline, targeting under ~1s on macOS.
- [ ] DevTools shows `Range: bytes=...` requests and `206 Partial Content` responses from `http://127.0.0.1:<port>/book/<project-id>...`.
- [ ] Server responses include `Accept-Ranges`, correct `Content-Length`, and `Content-Range` on `206`.
- [ ] `Access-Control-Expose-Headers` exposes range-relevant headers to pdf.js.
- [ ] `read_project_textbook` is either removed or marked deprecated after confirming callers.
- [ ] `atob`/byte loop, Blob creation, and `pdfUrlCache` are removed from `BookPage.tsx`.
- [ ] `PathScope::guard` runs on every stream server request with the correct `project_id`.
- [ ] Missing/bad token cannot access PDFs.
- [ ] Changing a project's textbook changes the pdf.js URL and does not reuse a stale cached document.
- [ ] No CSP/CORS violations in console.
- [ ] Capture flow still works.
- [ ] `pdfDocumentCache` retained.
- [ ] `cargo check`, `cargo test`, and `npm run build` pass.
- [ ] Dev log and CHANGELOG updated.

---

## 9) Risks

| Risk | Likelihood | Mitigation |
|---|---:|---|
| Tokio/Axum integration with Tauri startup is awkward | Medium | Spike B0 first. If awkward, discuss before switching libraries. |
| CSP rejects wildcard loopback port | Medium | Test early. If needed, use a stable configured port or update CSP strategy. |
| CORS hides `Accept-Ranges`/`Content-Range` from pdf.js | Medium | Include `Access-Control-Expose-Headers`. Add explicit manual check. |
| Local endpoint accessible by other local processes | Medium | Bind only to `127.0.0.1`; require unguessable per-app token. |
| Token appears in DevTools/network logs | Low | Local-only and per-session. Avoid logging it from Rust. Consider header-based token later if needed. |
| Initial full GET still transfers too much | Low–Medium | Use true streaming for `200`; verify pdf.js aborts after headers and switches to ranges. |
| Auto-indexing makes network traffic look like full-document load | High for unindexed large PDFs | Defer indexing or account for it in testing. |
| Port conflict | Low if binding `127.0.0.1:0` | Let OS choose ephemeral port. |
| Firewall/privacy prompt | Low on macOS when binding loopback only | Confirm manually. Avoid binding external interfaces. |
| Stale PDF after textbook change | Medium if URL lacks revision | Include textbook-path-derived revision in URL. |

---

## 10) Alternatives Considered

### Option A — Loopback HTTP Range server

**Chosen.** It matches pdf.js's native HTTP range path and supports true streaming bodies.

### Option B — Tauri custom protocol (`book://`)

Rejected. On macOS/Linux, Tauri custom protocols use `<scheme>://localhost/...`; pdf.js does not treat non-HTTP schemes as range-capable and will not send `Range` headers. Tauri custom protocol bodies are also byte-buffer based rather than true stream bodies.

### Option C — Custom pdf.js `PDFDataRangeTransport`

Possible fallback if local HTTP is unacceptable. Rust would expose metadata/range-read commands; the frontend would implement a pdf.js range transport. This avoids a local server but requires deeper pdf.js integration and careful binary IPC handling.

### Option D — Stream raw bytes over Tauri Channel / IPC without ranges

Partial fix only. Removes base64 and the JS `atob` loop but still gives pdf.js a Blob/complete byte source, leaving the dominant first-load parse/fetch cost for large PDFs.

### Option E — Tauri `asset:` protocol via `convertFileSrc`

Rejected. `assetProtocol.scope` is static. Covering arbitrary user-selected textbook paths would require broad filesystem scope, bypassing centralized `PathScope` checks.

### Option F — Per-page Rust extraction/rendering via `lopdf`

Rejected. pdf.js needs a coherent full PDF document; implementing a separate renderer/viewer is out of scope.

---

## 11) Open Questions for Review

1. **HTTP stack:** Prefer Axum + Tokio for implementation, or use lower-level Hyper directly to minimize dependencies?
2. **Token placement:** Query param is simplest for pdf.js URL loading. Header-based auth is cleaner but may require passing `httpHeaders` to pdf.js and can trigger CORS preflight. For v1, query param is proposed.
3. **Indexing behavior:** Should auto-indexing be deferred/disabled for streamed PDFs, or left as-is with updated performance expectations?
4. **`read_project_textbook`:** Keep deprecated as fallback for one release, or remove once grep confirms zero callers?
5. **CSP wildcard port:** Is `http://127.0.0.1:*` accepted in the Tauri/WebView CSP in our target environment? Test during B0.
