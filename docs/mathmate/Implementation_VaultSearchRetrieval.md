# Implementation Plan: Vault Search + Contextual Retrieval

## 1) Goal
Enable fast note discovery inside the active project vault and allow users (or runtime policy) to inject relevant note snippets into chat context.

This delivers two outcomes:
- Better UX in the Vault tab (search/filter/snippet preview)
- Better tutoring relevance (grounded note context in prompts)

---

## 2) Scope

### In scope
- Indexed vault note search (title/path/body text)
- Search UI with query + filters + snippet highlighting
- "Insert into Chat" action for selected notes/snippets
- Optional auto-retrieval of top-k notes per user turn
- Prompt budget guardrails for inserted note context

### Out of scope (Phase 1)
- Semantic/vector retrieval
- Cross-project search
- Full Obsidian graph metadata parsing

---

## 3) Architecture

## 3.1 New components
- `VaultIndexStore` (new, local SQLite) for searchable note chunks
- `VaultIndexer` (new, incremental scanner/chunker)
- `VaultSearchService` (new, query API + ranking)

## 3.2 Existing integration points
- `VaultViewModel` → delegates indexing + search requests
- `ChatViewModel.sendMessage()` → optional top-k retrieval before provider call
- `MainView` / `VaultView` → search bar + result list + insertion actions

---

## 4) Data Model (SQLite)

Database path:
- `~/.mathmate/vault-index/<projectId>.sqlite`

Tables:
1. `notes`
   - `id TEXT PRIMARY KEY` (relative path)
   - `title TEXT NOT NULL`
   - `relative_path TEXT NOT NULL`
   - `modified_at TEXT NOT NULL`
   - `checksum TEXT NOT NULL`

2. `note_chunks`
   - `id TEXT PRIMARY KEY` (UUID)
   - `note_id TEXT NOT NULL`
   - `chunk_index INTEGER NOT NULL`
   - `heading_path TEXT`
   - `content TEXT NOT NULL`
   - `token_estimate INTEGER NOT NULL`

3. FTS table `note_chunks_fts(content, heading_path, note_id)`

Indexes:
- `notes(modified_at DESC)`
- `note_chunks(note_id, chunk_index)`

---

## 5) Retrieval Policy

For each query (manual search or chat auto-retrieval):
1. Query FTS for matches in chunks.
2. Score = weighted sum of:
   - text match quality (FTS rank)
   - title/path boosts
   - recency boost from note modified time
3. Deduplicate by note + heading path.
4. Cap results by token budget and count.

Default caps:
- Manual insert preview: max 20 results
- Chat auto-retrieval: top 3 chunks, total <= 900 estimated tokens

---

## 6) Prompt Injection Format

Injected before recent history:

```text
[Vault Context]
Source: <relative_path> :: <heading>
- <snippet>
- <snippet>
```

Rules:
- Always include source path for provenance.
- Hard cap on total inserted characters/tokens.
- If no relevant chunks, inject nothing.

---

## 7) UX Plan

## 7.1 Vault tab
- Add search field and optional filters:
  - file path contains
  - modified in last N days
- Results show:
  - note title + relative path
  - snippet with bolded matched terms
  - actions: `Open in Obsidian`, `Insert into Chat`

## 7.2 Chat composer integration
- Optional "Attach note context" popover from paperclip/menu
- Show attached snippets as removable chips before send

## 7.3 Auto mode
- Toggle in Settings → Chat: `Auto-retrieve vault context`
- If enabled, show small "Retrieved 2 notes" row in context panel/tooling area

---

## 8) File-by-File Tickets

### Ticket V1 — Index schema + bootstrap
**New files:**
- `Sources/MathMate/VaultIndex/VaultIndexStore.swift`
- `Sources/MathMate/VaultIndex/VaultIndexModels.swift`

**Tasks:**
- Initialize per-project SQLite DB
- Create `notes`, `note_chunks`, FTS table
- Add migrations table and runner

### Ticket V2 — Incremental indexing
**New files:**
- `Sources/MathMate/VaultIndex/VaultIndexer.swift`

**Tasks:**
- Scan markdown notes from active project vault
- Chunk by heading + paragraph size (~300-700 chars)
- Upsert changed notes by checksum/modified date
- Delete removed-note chunks

### Ticket V3 — Search API
**New files:**
- `Sources/MathMate/VaultIndex/VaultSearchService.swift`

**Tasks:**
- Implement query + ranking + snippet extraction
- Return typed `VaultSearchResult`
- Add token estimate per result

### Ticket V4 — Vault UI
**Modify:**
- `Sources/MathMate/ViewModels/VaultViewModel.swift`
- `Sources/MathMate/Views/MainView.swift` (Vault section)

**Tasks:**
- Add search state and query handling
- Add results list + snippet row + insert action

### Ticket V5 — Chat injection
**Modify:**
- `Sources/MathMate/ViewModels/ChatViewModel.swift`
- `Sources/MathMate/ViewModels/SettingsViewModel.swift`
- `Sources/MathMate/Views/Settings/SettingsChatView.swift`

**Tasks:**
- Add manual snippet attachment to outgoing request
- Add optional auto-retrieval before send
- Enforce prompt budget caps

### Ticket V6 — Tests
**New tests:**
- `Tests/MathMateTests/VaultIndexTests.swift`
- `Tests/MathMateTests/VaultSearchRetrievalTests.swift`

**Coverage:**
- indexing idempotency
- chunk deletion on file removal
- search ranking determinism
- prompt budget truncation

---

## 9) Acceptance Criteria
- Searching vault notes is fast and project-scoped.
- User can insert specific snippets into chat with source attribution.
- Optional auto-retrieval improves relevance without bloating context.
- `swift build` and `swift test` pass.

---

## 10) Rollout
1. V1-V3 backend only (no UI change)
2. V4 manual search UI
3. V5 chat integration behind settings toggle
4. V6 hardening + performance profiling
