# Tauri v2 Migration — Phase 2: Backend & Data Layer

**Goal**: Migrate the remaining Rust backend — project management, vault scanning, memory engine, image handling, and wrap-up service. By the end of Phase 2, the app has feature parity with the Swift backend for all data operations.

**Estimated effort**: 3–4 days

**Depends on**: Phase 1 (chat engine, session persistence, config)

---

## Deliverables

### D2.1 — Project management (Rust)
- [ ] `src-tauri/src/project.rs`:
  - `MathProject` struct (id, name, vaultPath, textbookPath, defaultModel, createdAt)
  - `create_project`, `update_project`, `delete_project`, `list_projects`
  - JSON file per project under `~/.mathmate/projects/{uuid}.json`
- [ ] Tauri commands:
  ```rust
  #[tauri::command]
  fn create_project(name: String, vault_path: Option<String>) -> Result<MathProject, String>
  
  #[tauri::command]
  fn update_project(project: MathProject) -> Result<(), String>
  
  #[tauri::command]
  fn delete_project(project_id: String) -> Result<(), String>
  
  #[tauri::command]
  fn list_projects() -> Result<Vec<MathProject>, String>
  ```
- [ ] **Backward compat**: read existing `~/.mathmate/projects.json` format or migrate to per-file format

### D2.2 — Vault scanning (Rust)
- [ ] `src-tauri/src/vault.rs`:
  - Scan directory for markdown files (recursive)
  - Parse frontmatter (title, tags, date)
  - Return structured note list
  - Support `obsidian://` URL generation (for opening in Obsidian)
- [ ] Tauri commands:
  ```rust
  #[tauri::command]
  fn scan_vault(path: String) -> Result<Vec<VaultNote>, String>
  
  #[tauri::command]
  fn read_note(path: String) -> Result<String, String>
  ```
- [ ] Use `walkdir` crate for recursive directory traversal
- [ ] Performance: cache scan results, invalidate on re-scan

### D2.3 — Image handling (Rust)
- [ ] `src-tauri/src/images.rs`:
  - `save_image(session_id, image_data)` — saves base64 image to disk
  - `load_image(image_id)` — returns image data as base64
  - `evict_session_images(session_id)` — clean up on session delete
- [ ] Storage: `~/.mathmate/sessions/{sessionId}/images/{uuid}.{ext}`
- [ ] Tauri commands mirrored from current `ImageDiskCache.swift` behavior:
  - Save attached images to disk on send
  - Load images on demand (not all at once in memory)

### D2.4 — Memory engine (Rust + SQLite)
- [ ] `src-tauri/src/memory.rs` using `rusqlite`:
  - **Schema** (matching current SQLite schema):
    ```sql
    CREATE TABLE memories (
      id TEXT PRIMARY KEY,
      session_id TEXT,
      source_type TEXT,       -- 'conversation', 'wrapup', 'manual'
      unit_type TEXT,         -- 'explanation', 'quiz', etc.
      content TEXT,
      score REAL DEFAULT 0.0,
      created_at TEXT DEFAULT (datetime('now')),
      tags TEXT DEFAULT '[]',
      provenance TEXT         -- session context JSON
    );
    CREATE TABLE learner_profile (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TEXT
    );
    ```
  - CRUD: `store_memory`, `query_memories(topic, limit)`, `forget_memory(id)`
  - Scoring: FTS5 full-text search + score ranking
- [ ] Tauri commands:
  ```rust
  #[tauri::command]
  fn query_memories(query: String, limit: usize) -> Result<Vec<MemoryItem>, String>
  
  #[tauri::command]
  fn store_memory(memory: MemoryItem) -> Result<(), String>
  
  #[tauri::command]
  fn forget_memory(id: String) -> Result<(), String>
  ```
- [ ] `rusqlite` bundled in Cargo.toml (no external SQLite dependency)
- [ ] Database path: `~/.mathmate/memory.db`

### D2.5 — Wrap-up service (Rust)
- [ ] `src-tauri/src/wrapup.rs`:
  - `generate_wrap_up(session_id)` — collects session metadata + messages
  - Assembles wrap-up prompt, sends to model (or uses a simpler template-based approach)
  - Returns structured study log markdown
- [ ] `save_wrap_up(project_id, vault_path, content)` — writes to vault study log path
- [ ] Tauri commands:
  ```rust
  #[tauri::command]
  async fn generate_wrap_up(session_id: String) -> Result<String, String>
  
  #[tauri::command]
  fn save_wrap_up(project_id: String, content: String) -> Result<String, String>
  ```

### D2.6 — Textbook PDF metadata (Rust)
- [ ] Read PDF metadata (file size, page count, title)
- [ ] Store in project config
- [ ] Tauri commands for setting textbook path in project settings
- [ ] Actual PDF viewing deferred to Phase 5

### D2.7 — Build & verify
- [ ] Create project in UI → persists to disk → survives restart
- [ ] Scan vault path → notes appear in vault browser
- [ ] Attach image → saved to disk → loads on session restore
- [ ] Store a memory → query returns it
- [ ] Wrap-up generates and saves to vault
- [ ] Backward compat: existing `~/.mathmate/sessions/` files load correctly

---

## What Goes Away

| File | Lines | Replaced by |
|---|---|---|
| `ProjectStore.swift` | ~100 | `src-tauri/src/project.rs` |
| `ProjectViewModel.swift` | ~150 | `src/stores/projectStore.ts` (Zustand) |
| `VaultViewModel.swift` | ~200 | `src-tauri/src/vault.rs` + `src/stores/vaultStore.ts` |
| `ImageDiskCache.swift` | ~120 | `src-tauri/src/images.rs` |
| `MemoryEngine.swift` | ~140 | `src-tauri/src/memory.rs` |
| `MemoryStore.swift` | ~100 | (SQLite managed in Rust) |
| `MemoryModels.swift` | ~80 | Rust structs + TypeScript types |
| `MemoryViewModel.swift` | ~100 | `src/stores/memoryStore.ts` |
| `WrapUpService.swift` | ~268 | `src-tauri/src/wrapup.rs` + `src/lib/wrapUp.ts` |
| **~1,258 lines** | 🗑️ | |

## Key Decisions

### Why SQLite in Rust (rusqlite) vs SQL.js in the browser?
- The memory database persists on the user's machine — it's a backend concern
- `rusqlite` has zero-copy bindings, no WebAssembly overhead
- SQLite already on macOS / Linux / Windows — no bundled binary cost

### Why wrap-up in Rust?
- Wrap-up needs access to full session history (read from disk), vault path, and model API
- Generating the wrap-up prompt + sending it to the model can be a Tauri command
- But we could also do this entirely in the frontend (JS calls model API directly) — TBD during implementation

### Vault scanning
- Use `walkdir` crate with `.md` filter
- Skip `.obsidian/` directory
- Read first 100 bytes for frontmatter parsing
- No git/ignore awareness needed for initial version

## Acceptance Criteria
- [ ] Create, update, delete projects works with persistence
- [ ] Vault scan returns markdown files with proper frontmatter
- [ ] Image attachments save/load correctly across sessions
- [ ] Memory store + query returns relevant results
- [ ] Wrap-up generates and saves to vault path
- [ ] All Tauri commands return proper errors on failure
- [ ] Backward compatible with existing session files