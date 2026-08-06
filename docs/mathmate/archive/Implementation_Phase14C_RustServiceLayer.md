# Implementation Plan — Phase 14C: Rust Service Layer

## Objective

Introduce a `services/` module in the Rust backend that owns business logic and is unit-testable without Tauri. The `#[tauri::command]` layer in `lib.rs` becomes a pure translation step (extract `State<T>`, call method, return `Result`). This decouples the API surface from the implementation, enables testing, and centralizes the path-scope guard.

## Current Pain

`lib.rs` is **1015 lines**, of which ~60 are `#[tauri::command]` functions. The actual logic lives in `session.rs`, `project.rs`, `config.rs`, `vault.rs`, `memory.rs`, `textbook*.rs`, `mcp_client.rs`, `tools/*`, `pdf_import.rs`, `wrapup.rs`, `images.rs` — which is good. But:

- **The path-scope guard is reimplemented inline four times** in `lib.rs` (`read_file_as_base64`, `read_user_selected_file` partially, `scan_vault`, `read_note`, `open_path`, `read_project_textbook`). Each version is a slightly different copy of `pathscope::normalize_local_path` + `pathscope::canonical_inside_any`. `pathscope.rs` is right there.
- **The Tauri command layer mixes** "routing to the right service" with "validating inputs" and "shaping errors." Concretely, `get_tool_definitions` and `execute_tool` are 70 lines of dispatch logic that string-literal-list the synapse tools and reimplement the JSON-RPC envelope unwrapping that belongs in `mcp_client.rs`.
- **`AppState` uses four `Mutex<Option<T>>` fields.** Three of them (`models_config`, `app_config`, `db`) have a "load on first read, cache forever" pattern copy-pasted. The `db` helper does the only sensible thing: a `get_db()` method. The other three inline the pattern.
- **`AppState::db` holds a single global `rusqlite::Connection`** behind a `Mutex`. Concurrent memory commands serialize on this lock; while a `query_memories` call is in flight, `store_memory_with_safety` cannot proceed. The `chatStore` *does* parallelize these (it kicks off `query_memories` inside the streaming loop while the user is still typing).
- **`synapse_call`'s JSON-RPC unwrap** lives in `lib.rs` (`if let Some(content) = result.get("content")...`). It belongs in `mcp_client.rs` as a `call_unwrapped` method.
- **The `mcp_client: Mutex<Option<McpClient>>`** is held during long `client.list_tools()` and `client.call()` calls (the BufReader on stdout blocks). Other commands (`start_synapse_mcp`, `stop_synapse_mcp`, `synapse_mcp_status`, `synapse_call` from the UI) all serialize on this lock.
- **`open_path` has a `confirmed: Option<bool>` parameter** and a frontend confirmation flow currently passes it from multiple call-sites. The contract is policy-sensitive and should not be removed as "dead" without a coordinated TS+Rust change.
- **The `synapse_tools` whitelist** in `execute_tool` is a string-literal duplicate of what `mcp_client.rs` already advertises via `list_tools()`. If Synapse adds a tool, both lists need updating.

## Proposed Design

### C.1 Service modules

Create `src-tauri/src/services/`:

```
src-tauri/src/services/
  mod.rs              // pub use + re-exports
  session.rs          // SessionService { repos... }
  project.rs          // ProjectService
  config.rs           // ConfigService
  memory.rs           // MemoryService  (wraps the existing memory.rs)
  vault.rs            // VaultService  (legacy fallback)
  synapse.rs          // SynapseService  (mcp_client.rs becomes a transport)
  tool.rs             // ToolService  (the dispatch table)
  file.rs             // FileService  (path-scope + open)
  textbook.rs         // TextbookService
  pdf.rs              // PdfImportService
  model.rs            // ModelCatalogService
  image.rs            // ImageService
  wrapup.rs           // WrapUpService
  path.rs             // PathScope (the centralized guard)
```

Each service is a plain Rust struct with explicit dependencies. Example:

```rust
// src-tauri/src/services/session.rs
use std::path::PathBuf;
use crate::models::session::{Session, SessionHeader, Message};

pub struct SessionService {
    base_dir: PathBuf,
}

impl SessionService {
    pub fn new(base_dir: PathBuf) -> Self { Self { base_dir } }

    pub fn load(&self, id: &str) -> Result<Session, AppError> { ... }
    pub fn list(&self, project_id: Option<&str>) -> Result<Vec<SessionHeader>, AppError> { ... }
    pub fn append(&self, id: &str, message: &Message) -> Result<Session, AppError> { ... }
    // ... etc
}
```

Services do not depend on Tauri at all. They take inputs, return outputs, and own their state.

### C.2 `AppServices` container

A single struct holds one instance of each service. Registered with Tauri as a managed state:

```rust
// src-tauri/src/services/mod.rs
pub struct AppServices {
    pub sessions: SessionService,
    pub projects: ProjectService,
    pub config: ConfigService,
    pub memory: MemoryService,
    pub vault: VaultService,
    pub synapse: SynapseService,
    pub tool: ToolService,
    pub file: FileService,
    pub textbook: TextbookService,
    pub pdf: PdfImportService,
    pub model: ModelCatalogService,
    pub image: ImageService,
    pub wrapup: WrapUpService,
    pub path: PathScope,
}

impl AppServices {
    pub fn init() -> Result<Self, AppError> { ... }
}
```

```rust
// src-tauri/src/lib.rs
.manage(services::AppServices::init()?)
.invoke_handler(tauri::generate_handler![
    // sessions
    load_session, list_sessions, create_session, append_message,
    rename_session, delete_session, archive_session, unarchive_session,
    list_archived_sessions, purge_session, save_last_session, get_last_session,
    // projects
    create_project, update_project, delete_project, archive_project,
    unarchive_project, list_archived_projects, delete_project_cascade, list_projects,
    // ... etc
])
```

```rust
#[tauri::command]
fn load_session(svc: State<AppServices>, session_id: String) -> Result<Session, String> {
    svc.sessions.load(&session_id).map_err(|e| e.to_string())
}
```

The wrapper macro is short — write it manually for clarity. The savings come from the consolidated path-scope guard, the consolidated error type, and the consolidated dispatch logic.

### C.3 Centralized path-scope guard

```rust
// src-tauri/src/services/path.rs
pub struct PathScope;

impl PathScope {
    /// Returns the canonicalized path if it is inside an allowed root, else AppError::AccessDenied.
    pub fn guard(
        &self,
        path: &str,
        project_id: Option<&str>,
        allow_user_picker: bool,
    ) -> Result<PathBuf, AppError> { ... }

    /// Extension allowlist (used by `open_path`).
    pub fn safe_extension(path: &Path) -> bool { ... }
}
```

Every file-touching command goes through this one function. Replaces the four inline reimplementations in `lib.rs`.

### C.4 Replace blocking `Mutex` on the MCP client

The MCP client is a synchronous `BufReader` on a child process's stdout. Holding a `tokio::sync::Mutex` does not help because the blocking reads still block the task. The right fix is to move the I/O onto a dedicated task with channels:

```rust
// src-tauri/src/services/synapse.rs
pub struct SynapseService {
    sender: mpsc::Sender<SynapseCommand>,
    status_rx: watch::Receiver<SynapseStatus>,
}

enum SynapseCommand {
    Call { tool: String, args: Value, reply: oneshot::Sender<Result<Value, AppError>> },
    ListTools { reply: oneshot::Sender<Result<Vec<ToolDefinition>, AppError>> },
    Stop,
}
```

The background task owns the `McpClient` exclusively and processes commands serially. This preserves order (important for stream protocol) while freeing the Tauri command handlers to return `await` futures. The frontend gets the same API.

For the `db` field, switch to `r2d2_sqlite` (or `deadpool-sqlite`) with a small pool (size 4–8). The current contention is a latent bug; the fix is small.

### C.5 Eliminate duplicated API surface

- Keep `open_path` confirmation behavior unchanged in 14C. Any removal/contract change for `confirmed` must be a dedicated, coordinated TS+Rust decision (tracked in 14G.2).
- Remove the `synapse_tools` string array from `execute_tool`. Replace with a call to `synapse.list_tools()` to discover the current tool names. (This is also more robust to Synapse updates.)

## Task Checklist

### C.6 Step-by-step sequence (sub-PRs)

- [ ] **C.6.a** Add `services/path.rs` with the centralized `PathScope::guard`. Migrate `read_file_as_base64`, `read_user_selected_file`, `read_note`, `scan_vault`, `open_path`, `read_project_textbook` to use it. Delete the inline reimplementations.
- [ ] **C.6.b** Adopt the shared `AppError` introduced by 14E.0 (do not define a second temporary error model in 14C). Migrate service internals to `Result<T, AppError>` while keeping command names and payloads stable.
- [ ] **C.6.c** Add `SessionService`. Migrate `load_session`, `list_sessions`, `create_session`, `append_message`, `rename_session`, `delete_session`, `archive_session`, `unarchive_session`, `list_archived_sessions`, `purge_session`, `save_last_session`, `get_last_session` to use it. Keep the `#[tauri::command]` wrappers as one-liners.
- [ ] **C.6.d** Repeat for `ProjectService` (8 commands), `ConfigService` (5 commands), `MemoryService` (7 commands), `VaultService` (3 commands), `WrapUpService` (2 commands), `ImageService` (3 commands).
- [ ] **C.6.e** Add `ToolService` that owns the dispatch table. `execute_tool` becomes `tool.execute(call, vault_path, project_id)`. The `synapse_tools` whitelist is replaced by a call to `synapse.list_tools()`. (Cross-cuts 14D.)
- [ ] **C.6.f** Add `SynapseService` with the channel-based background task. Migrate `start_synapse_mcp`, `stop_synapse_mcp`, `synapse_mcp_status`, `check_synapse_available`, `synapse_call` to use it. Move the JSON-RPC envelope unwrap into `mcp_client.rs` as `call_unwrapped`.
- [ ] **C.6.g** Add `ModelCatalogService` and `TextbookService`. Migrate the remaining commands.
- [ ] **C.6.h** Replace the `db: Mutex<Option<Connection>>` with an `r2d2_sqlite` pool. Update `MemoryService` to take the pool.
- [ ] **C.6.i** Re-evaluate `open_path.confirmed` with 14A wrapper coverage and real call-site data; either keep + document, or remove in a coordinated TS+Rust PR (see 14G.2).
- [ ] **C.6.j** Final sweep: `lib.rs` is now ≤ 250 lines (mostly `invoke_handler!` and one-liner command wrappers).

## Validation

- `cargo check` ✅
- `cargo test` ✅ (test count should increase; each service gets unit tests)
- `npm run build` ✅
- Manual smoke: every existing Tauri command still works; same error messages; same return shapes.

## Acceptance Criteria

- `lib.rs` is ≤ 250 lines and contains no business logic.
- Every Tauri command's logic is unit-testable without Tauri.
- The path-scope check exists in exactly one place.
- `AppError` is the return type of all service methods.
- `open_path` confirmation behavior is explicitly documented and covered by tests (either preserved or removed via coordinated PR).
- The `synapse_tools` string-array whitelist no longer exists.
- The MCP client I/O is on a dedicated background task; the Tauri command handlers do not block on its mutex.
- The SQLite pool eliminates the `Mutex<Option<Connection>>` bottleneck.
- No wire-format change: the Tauri command names and parameter names are unchanged, so the Phase 14A wrappers continue to work.

## Risks

- **The `SessionService` refactor is the largest single sub-step.** Mitigation: do `SessionService` first, ship it, get comfortable, then proceed with the others.
- **The `r2d2_sqlite` migration could surface transaction bugs.** Mitigation: keep the old `Mutex<Option<Connection>>` code path available behind a feature flag for one release.
- **The `SynapseService` channel refactor changes concurrent semantics.** Mitigation: the existing `McpClient` is already single-threaded (the `BufReader` is `!Sync`), so the channel is a strict improvement, not a behavioral change.
