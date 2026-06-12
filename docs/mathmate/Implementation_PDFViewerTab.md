# PDF Viewer Tab — Implementation Plan

**Feature:** In-app PDF viewer with drag-to-capture region selection  
**Status:** Complete  
**Phase:** 14 (Textbook Workflow)  
**Linked roadmap item:** Priority 4 — Textbook & PDF Pipeline

---

## Motivation

The current workflow for referencing a textbook requires: switching to an external PDF app, screenshotting a region with the OS tool, saving/copying the result, and dragging it into MathMate. This is 4–5 steps across two applications with significant context switching.

The goal is to reduce this to two steps — drag a selection in the Book tab, then type a question and send in Chat — all without leaving the app.

---

## User-Facing Behaviour

1. A new **Book** tab is shown in the main tab bar for project workspaces.
2. If the current project has a `textbook_path`, clicking the tab opens the PDF viewer at the last-viewed page for that project.
3. If the current project does not have a `textbook_path`, the Book tab shows an empty state with a direct action to open the Project Settings panel.
4. The user navigates to the target page using prev/next buttons or a page number input.
5. The user changes zoom with zoom in/out or Fit Width.
6. The user drags a selection rectangle over any region of the rendered page.
7. On pointer release, the cropped region is attached to the chat input as a pending image and the app navigates automatically to the Chat tab.
8. The user types their question and sends — the image is already attached.

**Tab visibility decision:** the Book tab should be visible even when no textbook is set. This makes the feature discoverable and gives the empty state a clear route into Project Settings.

---

## Architecture

### PDF Rendering

**Library:** `pdfjs-dist` (Mozilla PDF.js, pure JS + WASM)

Rationale:
- Renders arbitrary PDFs accurately (text, math notation, scanned images)
- Runs entirely in the frontend — no new Rust PDF rendering dependency
- Well-maintained, battle-tested in production browsers
- Renders to a `<canvas>` element we control, enabling pixel-level region capture

**Worker setup (Vite/Tauri):**
- Install `pdfjs-dist` via npm.
- Copy `node_modules/pdfjs-dist/build/pdf.worker.min.mjs` into `public/pdf.worker.min.mjs` so Vite serves it as a static asset.
- Set `GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'` once at module init in the PDF viewer module.
- Verify the worker loads in both `npm run dev` and `npm run tauri dev/build`.
- Keep Tauri CSP compatible with workers. The current `tauri.conf.json` already includes `worker-src 'self' blob:`, which should permit the static worker path.

**Asset caveat:** Some PDFs may require PDF.js cMaps/standard font assets for perfect rendering. v1 can defer explicit cMap/font asset bundling unless testing shows missing glyphs, but this should be re-evaluated if math textbooks render incorrectly.

### Loading the PDF into pdf.js

Tauri's webview restricts direct `file://` access. The solution is a project-scoped backend command:

1. The frontend invokes `read_project_textbook(project_id: String)`.
2. Rust loads the project by id and reads that project's saved `textbook_path`.
3. Rust validates the path is a real local PDF and is inside the project-scoped allowed roots.
4. Rust returns base64-encoded bytes.
5. The frontend decodes to `Uint8Array` and calls `pdfjsLib.getDocument({ data: bytes })`.

Do **not** expose a generic `read_project_file(path)` command for this feature. The frontend should not pass arbitrary filesystem paths. The project record is the source of truth.

Existing `read_file_as_base64(path, project_id)` already covers some path-scoped file reads, but a dedicated `read_project_textbook(project_id)` command is preferred because it prevents path substitution and makes the security boundary explicit.

### Large PDF Handling

The v1 base64 path loads the whole PDF into memory. This is acceptable for typical textbooks but can become expensive for very large/scanned PDFs because the data is duplicated as:

- Rust file bytes
- base64 string (~33% larger)
- decoded JS `Uint8Array`
- PDF.js internal structures

Mitigations for v1:
- Show a loading state while reading/decoding/parsing.
- Return a clear error if the file is missing, unreadable, not a PDF, or too large.
- Add a conservative warning/soft limit for very large PDFs (for example, warn above 100–150 MB; exact threshold can be tuned during implementation).
- Keep only the current rendered page canvas active.

Future improvement: replace base64 full-file loading with a Tauri custom protocol, asset URL, or range/stream-capable loader if large PDFs become common.

### Region Capture

Once a page is rendered to the main `<canvas>` by pdf.js:

1. A transparent `<div>` overlay is absolutely positioned over the canvas/display wrapper, with `cursor: crosshair` and pointer event capture.
2. A secondary `<canvas>` overlay or lightweight absolutely-positioned `<div>` draws the live selection rectangle as a dashed box with semi-transparent fill during drag.
3. On `pointerdown`, record the start point in CSS/display coordinates.
4. On `pointermove`, update a normalized rectangle so dragging works in any direction.
5. On `pointerup`:
   - Ignore selections smaller than 20×20 CSS pixels.
   - Map the CSS/display selection rect to the render canvas backing-store pixel coordinates.
   - Call `ctx.getImageData(x, y, w, h)` on the PDF render canvas.
   - Write to a temporary `<canvas>`.
   - Downscale/cap the output if needed.
   - Call `toBlob`, usually as `image/png` for math/line-art clarity.
   - Base64-encode the blob and strip any `data:*;base64,` prefix before storing.
   - Call `useChatStore.getState().attachImage(rawBase64, mime)`.
   - Call `navigate('/chat')`.
6. The selection overlay resets.

No Rust involvement in capture — it is pure canvas DOM operations.

#### Required Coordinate Mapping

The selection overlay usually operates in CSS pixels, while `getImageData` requires canvas backing-store pixels. Always map through the canvas bounding rect:

```ts
const bounds = canvas.getBoundingClientRect();
const scaleX = canvas.width / bounds.width;
const scaleY = canvas.height / bounds.height;

const x = Math.round((selection.left - bounds.left) * scaleX);
const y = Math.round((selection.top - bounds.top) * scaleY);
const w = Math.round(selection.width * scaleX);
const h = Math.round(selection.height * scaleY);
```

Clamp the computed rectangle to `[0, canvas.width] × [0, canvas.height]` before calling `getImageData`.

#### Output Size Limits

Captured images must be bounded before attachment:

- Cap the longest side, e.g. 2048–3072 px.
- Cap encoded size, e.g. 4–8 MB.
- Downscale before attaching when possible.
- If still too large, show a user-facing error and keep the user on the Book tab.

This prevents huge Zustand state entries, huge session JSON payloads, slow provider requests, and OpenRouter/OpenAI image limit failures.

### Render Lifecycle and Race Handling

PDF rendering is asynchronous. The renderer must handle rapid page/zoom changes safely:

- Cancel the previous PDF.js `RenderTask` before starting a new render.
- Track a monotonically increasing render token/request id and ignore stale completions.
- Disable drag capture while rendering or while the canvas is blank/partially rendered.
- Clean up `PDFDocumentProxy` and outstanding render tasks on unmount.
- Clamp page numbers to `[1, numPages]`.
- Show loading and error states for document load and page render failures.

### Fit Width and Resizing

Fit Width should use the available viewer width, not a fixed scale. Use a `ResizeObserver` on the scroll/viewer container and recompute the scale when:

- the app window resizes,
- the context/project side panel opens or closes,
- the sidebar/layout changes,
- the page changes,
- the user toggles Fit Width.

If the user manually zooms after Fit Width, switch out of fit-width mode until they press Fit Width again.

### Auto-navigate to Chat

After `attachImage` succeeds, `useNavigate('/chat')` fires immediately. The user lands on the Chat tab with the image thumbnail already visible in the input strip, ready to type.

If capture fails, do not navigate; show an inline/toast error in the Book tab.

### Vision Model UX

Captured textbook regions are image attachments. If the selected model/provider is not vision-capable, the provider path may reject the message. v1 should at minimum preserve the current provider error handling; preferably, Chat should show a non-blocking warning when pending images exist and the selected model is known not to support vision.

---

## Files

### New files

| Path | Responsibility |
|---|---|
| `src/pages/BookPage.tsx` | Page shell: reads `currentProject`, handles empty state, invokes `read_project_textbook`, decodes PDF bytes, renders `<PdfViewer>` |
| `src/components/PdfViewer.tsx` | Viewer UI: page nav controls, zoom/Fit Width, loading/error states, drag-select overlay, capture and navigate-on-capture |
| `src/hooks/usePdfRenderer.ts` | Manages `PDFDocumentProxy` lifecycle; render cancellation; re-renders when `pageNumber`, `scale`, or fit-width size changes; returns stable canvas ref + page metadata |
| `src/hooks/usePdfRegionSelect.ts` | Encapsulates drag state machine (idle → dragging → captured/error); coordinate mapping; size caps; `captureRegion()` callback |

### Modified files

| Path | Change |
|---|---|
| `src/components/TabBar.tsx` | Add always-visible `/book` entry with a book-page SVG icon |
| `src/App.tsx` | Add `<Route path="/book" element={<BookPage />} />` inside the `<Layout>` route group |
| `src-tauri/src/lib.rs` | Add `read_project_textbook` command; register in `invoke_handler` |
| `vite.config.ts` | Add any PDF.js worker/static-copy configuration needed for dev and Tauri builds |
| `package.json` | Add `pdfjs-dist`; optionally add a deterministic worker copy script or static-copy plugin |

---

## Rust: `read_project_textbook` command

Use a project-scoped command. The current `AppState` does **not** expose `project_roots()`, so use the existing `build_allowed_roots(Some(&project_id))` helper in `lib.rs`.

```rust
#[tauri::command]
fn read_project_textbook(project_id: String) -> Result<String, String> {
    use base64::Engine;

    let project = project::load_project(&project_id)
        .map_err(|e| format!("Failed to load project: {}", e))?;

    let path = project
        .textbook_path
        .ok_or_else(|| "No textbook set for this project".to_string())?;

    let target = pathscope::normalize_local_path(&path)
        .map_err(|_| format!("Invalid textbook path: '{}'", path))?;

    let is_pdf = target
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.eq_ignore_ascii_case("pdf"))
        .unwrap_or(false);
    if !is_pdf {
        return Err("Project textbook is not a PDF".to_string());
    }

    let roots = build_allowed_roots(Some(&project_id));
    if !pathscope::canonical_inside_any(&roots, &target) {
        return Err("Textbook path is outside allowed project roots".to_string());
    }

    let data = std::fs::read(&target)
        .map_err(|e| format!("Failed to read textbook file: {}", e))?;

    Ok(base64::engine::general_purpose::STANDARD.encode(&data))
}
```

Security notes:
- Do not fall back to “any existing `.pdf` file.”
- Do not accept an arbitrary `path` from the frontend for this feature.
- Keep symlink/path traversal protection via `pathscope::canonical_inside_any`.
- Register the command in `tauri::generate_handler![...]`.

---

## State & Persistence

- Last-viewed page number per project is stored in `localStorage` under the key `mathmate-book-page-{projectId}`.
- Zoom level is stored under `mathmate-book-zoom-{projectId}`.
- Fit-width/manual zoom mode can be stored under `mathmate-book-zoom-mode-{projectId}` if needed.
- Clamp persisted page number to the loaded document's `numPages`.
- No Rust/DB involvement needed for viewer UI state.

---

## pdf.js Vite Configuration

In `vite.config.ts`, the pdf.js worker should be served as a static asset. One acceptable approach:

```ts
// vite.config.ts
export default defineConfig({
  plugins: [
    react(),
    // Optional: vite-plugin-static-copy entry for pdf.worker.min.mjs
  ],
  optimizeDeps: {
    exclude: ["pdfjs-dist"],
  },
});
```

The worker copy step must be deterministic. Use one of:

1. `vite-plugin-static-copy` configured to copy `node_modules/pdfjs-dist/build/pdf.worker.min.mjs` to the build root/public output.
2. A `postinstall` or `prepare` script that copies the worker into `public/pdf.worker.min.mjs`.
3. A checked-in documented copy script run before build.

Avoid relying on manual local copying that CI/fresh installs will miss.

---

## UI Design Notes

**Book tab toolbar (top of BookPage/PdfViewer):**

```txt
[‹]  [Page 42 / 891]  [›]    [− Zoom]  [Fit Width]  [+ Zoom]
```

**Viewer states:**
- Loading PDF
- Rendering page
- Load/render error with retry
- No textbook empty state
- Capture error/too-large warning

**Selection UX:**
- Minimum selection size: 20×20 CSS px (ignore accidental micro-drags)
- Visual: dashed blue border + 10% blue fill while dragging
- Escape key cancels an in-progress selection
- Selection disabled while the page is rendering
- After successful capture: brief flash of the selection rect before clearing/navigating

**Empty state (no `textbook_path`):**

```txt
No textbook set for this project.
[Open Project Settings →]
```

Implementation detail: `BookPage` should use `useOutletContext` to call the `openProjectSettings` function exposed by `Layout`, rather than navigating to app-wide `/settings`.

---

## Dependency Changes

```bash
npm install pdfjs-dist
```

Optional, depending on worker-copy approach:

```bash
npm install -D vite-plugin-static-copy
```

No new Rust crates required.

---

## Out of Scope (v1)

- Text selection / copy from PDF
- Search within PDF
- Annotations / highlights
- Multiple PDFs per project
- Thumbnail sidebar / TOC navigation in the viewer (the existing vault import already handles TOC)
- Persistent PDF annotations/highlights
- Backend/range-streamed PDF loading
- Perfect cMap/font handling unless testing shows it is required for target textbooks

---

## Risks & Mitigations

| Risk | Likelihood | Mitigation |
|---|---:|---|
| pdf.js worker path wrong in Tauri build | Medium | Use deterministic worker copy; verify with `npm run dev`, `npm run build`, and `npm run tauri dev`; show clear load errors |
| Large PDFs causing memory pressure due to full-file base64 load | Medium | Loading state; size warning/soft limit; clear errors; future custom protocol/range loading |
| Generic file-read command could read arbitrary PDFs | Medium | Use `read_project_textbook(project_id)`; backend loads project `textbook_path`; no arbitrary path arg |
| Path-scope bypass via symlink | Low | Use `pathscope::canonical_inside_any` with `build_allowed_roots(Some(&project_id))` |
| Selection captures wrong pixels at zoom/fit/high-DPI | Medium | Required bounding-rect-to-canvas coordinate mapping; clamp rect; test multiple zoom levels and Retina/high-DPI |
| Stale async renders draw wrong page after rapid nav/zoom | Medium | Cancel previous `RenderTask`; use render tokens; disable capture while rendering |
| Captured image payload too large for store/session/provider | Medium | Longest-side and byte-size caps; downscale or error before `attachImage` |
| Tauri CSP blocks worker | Low/Medium | Current CSP has `worker-src 'self' blob:`; verify in Tauri dev/build |
| pdf.js render quality for dense math notation | Low | pdf.js renders vector PDF data at arbitrary scale; add asset/cMap handling if glyph issues appear |
| Canvas `getImageData` fails on cross-origin canvas | Low | The canvas is local data loaded from Rust; do not draw external resources into it |
| Model selected does not support images | Medium | Preserve provider error; preferably warn when pending images exist and model is known non-vision |

---

## Acceptance Criteria

- [ ] `npm install` with `pdfjs-dist` passes; `npm run build` succeeds
- [ ] `cargo check` passes (new Rust command compiles)
- [ ] `read_project_textbook(project_id)` is registered and reads only the saved textbook for that project
- [ ] Backend rejects missing project, missing textbook, non-PDF textbook, unreadable file, and out-of-scope path with clear errors
- [ ] Book tab is visible in the tab bar for project workspaces
- [ ] Empty state appears when no `textbook_path` is set and opens the actual Project Settings panel
- [ ] Clicking Book loads the current project PDF and shows loading/error states appropriately
- [ ] Page navigation (prev/next/jump) works and clamps to valid page bounds
- [ ] Zoom in/out and Fit Width work; Fit Width responds to window/panel resize
- [ ] Render cancellation prevents stale pages from appearing after rapid page/zoom changes
- [ ] Drag-select is disabled while a page is rendering
- [ ] Drag-select captures the correct pixel region at 100%, zoomed in/out, Fit Width, and high-DPI display settings
- [ ] Accidental micro-drags under 20×20 CSS px are ignored
- [ ] Captured image output is size-bounded; oversized captures are downscaled or rejected with a useful message
- [ ] After successful capture, app navigates to Chat tab
- [ ] Captured image appears as a thumbnail in the chat input
- [ ] If capture fails, the app stays on Book and shows an actionable error
- [ ] Last page and zoom level persist across tab switches/app reloads for the same project
- [ ] No regression on Chat, Vault, or Overview tabs
- [ ] Existing reasoning trace and markdown/KaTeX rendering behavior are unaffected
