# Tauri v2 Migration — Phase 1: Core Chat Engine

**Goal**: Replace the entire SwiftUI chat experience with a pure-web chat. Streaming, KaTeX rendering, message history, and model API calls all work in-browser. The Rust backend handles session persistence and config.

**Estimated effort**: 4–5 days

**Depends on**: Phase 0 (scaffold, KaTeX, routing, Rust skeleton)

---

## Deliverables

### D1.1 — Session persistence (Rust)
- [ ] `src-tauri/src/session.rs`:
  - `SessionHeader` / `Message` / `ContentPart` / `ResponseUnit` types (mirroring Swift models)
  - `create_session`, `load_session` (file-based JSON under `~/.mathmate/sessions/`)
  - `append_message`, `load_messages`, `update_header` Tauri commands
  - `list_sessions` (for sidebar)
- [ ] JSON serialization format **identical** to the current Swift decoder so existing sessions are readable (backward compat)
- [ ] Tauri commands:
  ```rust
  #[tauri::command]
  fn load_session(session_id: String) -> Result<Session, String>
  
  #[tauri::command]
  fn list_sessions(project_id: String) -> Result<Vec<SessionHeader>, String>
  
  #[tauri::command]
  fn append_message(session_id: String, message: Message) -> Result<(), String>
  ```

### D1.2 — Chat message list (frontend)
- [ ] `src/pages/Chat.tsx` — main chat view matching `ChatView.swift`
- [ ] `src/components/ChatMessage.tsx` — single message bubble:
  - Left-aligned for assistant, right-aligned for user
  - Flaggable per message/unit
  - Image thumbnails in user messages
  - Markdown + KaTeX rendering via `src/lib/renderMarkdown.ts`
  - **No height-bridging**: the DOM knows exactly how tall each element is
- [ ] `src/components/ChatInput.tsx` — input bar with:
  - Text area with placeholder "Ask a math question... (/help for commands)"
  - Send button (↩) / Stop button (Esc while streaming)
  - Paperclip image attach button + file picker
  - LaTeX palette trigger (ƒx) — opens snippet popover
  - Drag-and-drop image support
- [ ] Auto-scroll to bottom on new messages
- [ ] Scroll-to-bottom button when scrolled up

### D1.3 — Streaming API integration (frontend)
- [ ] `src/lib/providers.ts` — API client calling OpenAI-compatible or Anthropic endpoints:
  ```typescript
  interface StreamChunk {
    text?: string;
    thinking?: string;
    usage?: TokenUsage;
  }
  
  async function* streamChat(
    messages: MessagePayload[],
    model: string,
    provider: ProviderConfig
  ): AsyncGenerator<StreamChunk>
  ```
- [ ] Streaming via `fetch()` with `ReadableStream` — **no WKWebView, no `evaluateJavaScript`**
- [ ] Reasoning trace extraction: inspect delta for `reasoning_content` / `thinking` keys
- [ ] Token usage parsing from final stream chunk
- [ ] Provider routing: Anthropic (messages API) vs OpenAI-compatible (chat/completions)

### D1.4 — Config loading (frontend + Rust)
- [ ] On app launch, call `get_config` Tauri command to load `~/.mathmate/models.json`
- [ ] `src/stores/configStore.ts` — React state for providers and current model
- [ ] Model selector dropdown/popover in toolbar (matching `ModelSelectorView.swift`)
- [ ] `ModelVisionRegistry` equivalent: detect model vision support from ID fragments

### D1.5 — Streaming UI
- [ ] While streaming:
  - Assistant message shows content incrementally (append tokens to `textNode`)
  - No debounce, no `evaluateJavaScript` dance — just `setState(text)`
  - KaTeX re-renders on content change (fast path: `katex.renderToString` is synchronous)
- [ ] Thinking section: collapsible `<details>` or disclosure toggle
- [ ] Cancel button (Esc or stop button) terminates the fetch

### D1.6 — Slash commands
- [ ] Detect `/` prefix in input → show popup with matching commands
- [ ] Implement: `/help`, `/compact`, `/compact restore`
- [ ] `src/stores/commandStore.ts` command registry matching `SlashCommandRegistry`

### D1.7 — Session restore on launch
- [ ] Restore last-opened session from `~/.mathmate/last_session.json`
- [ ] Load full message history into chat store
- [ ] Re-render all messages via DOM (no snapshot pipeline needed)

### D1.8 — Build & verify
- [ ] Send a message → streaming response appears in chat
- [ ] KaTeX math renders inline and in display mode
- [ ] Thinking trace visible in collapsible section
- [ ] Session persists across app restarts
- [ ] Message history loads on re-open
- [ ] `/help` shows command list
- [ ] Cancel generation works
- [ ] `swift build` / `swift test` not needed anymore — validation is `cargo tauri dev` + manual testing

---

## What Goes Away (from Swift)

| File | Lines | Replaced by |
|---|---|---|
| `ChatViewModel.swift` | ~1,575 | `src/pages/Chat.tsx` + `src/stores/chatStore.ts` |
| `ChatView.swift` + `MessageRow.swift` | ~520 | `src/components/ChatMessage.tsx` + `ChatInput.tsx` |
| `ModelProvider.swift` | ~400 | `src/lib/providers.ts` |
| `StreamCoordinator.swift` | ~86 | Inline streaming loop in `chatStore.ts` |
| `PromptAssemblyService.swift` | ~70 | `src/lib/promptAssembly.ts` |
| `WrapUpService.swift` | ~268 | `src/lib/wrapUp.ts` (Phase 2 or 3) |
| `LaTeXInsertionEngine.swift` | ~50 | `src/lib/latexInsertion.ts` |
| `LaTeXSnippetRepository.swift` | ~30 | Static JSON import |
| `SlashCommandPopup.swift` | ~80 | `src/components/SlashCommandPopup.tsx` |
| `MathComposerView.swift` | ~80 | `src/components/MathComposer.tsx` |
| **~3,200 lines** | 🗑️ | |

## What Stays
- Project management, vault scanning, memory engine — Phase 2
- Settings pages, vault browser, overview — Phase 3
- Polish like error handling, retry, keyboard shortcuts — Phase 4

## Key Architecture Decisions

### Why stream from the frontend (not proxied through Rust)?
- Simpler: chat/completions is a standard HTTP call, not a Tauri plugin contract
- Model providers already have CORS headers that browsers respect
- Rust proxy adds latency and complexity with no benefit for direct API calls
- Exception: if we add a "managed API" layer later, that would proxy through Rust

### Why `marked` instead of `react-markdown`?
- `react-markdown` is fine but `marked` is faster for streaming (no React reconciliation per token)
- Strategy: use `marked` for raw HTML conversion, set via `dangerouslySetInnerHTML` on a container div (after sanitizing with DOMPurify)

### State management
- `src/stores/` uses Zustand (lightweight, no boilerplate)
- One store per domain: `chatStore`, `configStore`, `sessionStore`, `vaultStore`
- No Redux — Zustand + React hooks is sufficient

## Acceptance Criteria
- [ ] Send a math question → streaming answer with KaTeX renders in milliseconds
- [ ] No WKWebViews running (verify via Activity Monitor)
- [ ] Session survives app restart with full history
- [ ] `/help` shows available commands
- [ ] Image attachment works (picker + drag-and-drop)
- [ ] Cancel stops streaming mid-response
- [ ] Model selector switches between configured providers