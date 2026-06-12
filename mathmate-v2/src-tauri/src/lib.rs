mod audit;
mod config;
mod error;
mod images;
mod mcp_client;
mod memory;
mod models;
mod pathscope;
mod pdf_import;
mod project;
mod services;
mod session;
mod textbook;
mod textbook_catalog;
mod textbook_index;
mod tools;
mod vault;
mod wrapup;

use config::{AppConfig, AppConfigModels};
use textbook_catalog::LicenseInfo;
use memory::MemoryItem;
use project::MathProject;
use crate::services::session::{Message, Session, SessionHeader};
use std::sync::Mutex;
use tauri::State;
use crate::services::AppServices;

// ─── App State ──────────────────────────────────

pub struct AppState {
    pub models_config: Mutex<Option<AppConfigModels>>,
    pub app_config: Mutex<Option<AppConfig>>,
    pub db: Mutex<Option<rusqlite::Connection>>,
    pub mcp_client: Mutex<Option<mcp_client::McpClient>>,
}

// (build_allowed_roots has moved to services::path::build_allowed_roots)

impl AppState {
    fn get_db(&self) -> Result<std::sync::MutexGuard<'_, Option<rusqlite::Connection>>, String> {
        let mut guard = self.db.lock().map_err(|e| e.to_string())?;
        if guard.is_none() {
            *guard = Some(memory::open_db()?);
        }
        Ok(guard)
    }
}

// ─── Environment Variable Commands ──────────────

/// Safely read an environment variable from the backend.
/// Only reads specific allowed env var names (never arbitrary keys).
#[tauri::command]
fn get_env_var(key: String) -> Result<Option<String>, String> {
    // Whitelist of allowed env var names — never expose arbitrary env vars to the frontend
    let allowed = ["OPENROUTER_API_KEY", "OPENAI_API_KEY", "ANTHROPIC_API_KEY"];
    if !allowed.contains(&key.as_str()) {
        return Err(format!(
            "Access denied: env var '{}' is not in the allowed list",
            key
        ));
    }
    Ok(std::env::var(&key).ok())
}

// ─── Config Commands ────────────────────────────

#[tauri::command]
fn get_models_config(state: State<AppState>) -> Result<AppConfigModels, String> {
    let mut cache = state.models_config.lock().map_err(|e| e.to_string())?;
    if let Some(ref config) = *cache {
        return Ok(config.clone());
    }
    let config = config::load_models_config()?;
    *cache = Some(config.clone());
    Ok(config)
}

#[tauri::command]
fn get_app_config(state: State<AppState>) -> Result<AppConfig, String> {
    let mut cache = state.app_config.lock().map_err(|e| e.to_string())?;
    if let Some(ref config) = *cache {
        return Ok(config.clone());
    }
    let config = config::load_app_config()?;
    *cache = Some(config.clone());
    Ok(config)
}

#[tauri::command]
fn save_app_config(state: State<AppState>, config: AppConfig) -> Result<(), String> {
    config::save_app_config(&config)?;
    let mut cache = state.app_config.lock().map_err(|e| e.to_string())?;
    *cache = Some(config);
    Ok(())
}

#[tauri::command]
fn set_provider_api_key(
    state: State<AppState>,
    provider_name: String,
    api_key: Option<String>,
) -> Result<(), String> {
    config::set_provider_api_key(&provider_name, api_key)?;
    // Invalidate the cache so the next read picks up the new key
    let mut cache = state.models_config.lock().map_err(|e| e.to_string())?;
    *cache = None;
    Ok(())
}

#[tauri::command]
fn get_config_path() -> String {
    config::config_dir().to_string_lossy().to_string()
}

// ─── Session Commands ───────────────────────────

#[tauri::command]
fn load_session(
    svc: State<AppServices>,
    session_id: String,
) -> Result<Session, String> {
    svc.sessions.load(&session_id).map_err(|e| e.to_string())
}

#[tauri::command]
fn list_sessions(
    svc: State<AppServices>,
    project_id: Option<String>,
) -> Result<Vec<SessionHeader>, String> {
    svc.sessions.list(project_id.as_deref()).map_err(|e| e.to_string())
}

#[tauri::command]
fn create_session(
    svc: State<AppServices>,
    header: SessionHeader,
    initial_message: Option<Message>,
) -> Result<Session, String> {
    svc.sessions.create(header, initial_message).map_err(|e| e.to_string())
}

#[tauri::command]
fn append_message(
    svc: State<AppServices>,
    session_id: String,
    message: Message,
) -> Result<Session, String> {
    svc.sessions.append(&session_id, &message).map_err(|e| e.to_string())
}

#[tauri::command]
fn rename_session(
    svc: State<AppServices>,
    session_id: String,
    title: String,
) -> Result<Session, String> {
    svc.sessions.rename(&session_id, &title).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_session(
    svc: State<AppServices>,
    session_id: String,
) -> Result<(), String> {
    svc.sessions.delete(&session_id).map_err(|e| e.to_string())
}

#[tauri::command]
fn archive_session(
    svc: State<AppServices>,
    session_id: String,
) -> Result<(), String> {
    svc.sessions.archive(&session_id).map_err(|e| e.to_string())
}

#[tauri::command]
fn unarchive_session(
    svc: State<AppServices>,
    session_id: String,
) -> Result<(), String> {
    svc.sessions.unarchive(&session_id).map_err(|e| e.to_string())
}

#[tauri::command]
fn list_archived_sessions(
    svc: State<AppServices>,
    project_id: Option<String>,
) -> Result<Vec<SessionHeader>, String> {
    svc.sessions.list_archived(project_id.as_deref()).map_err(|e| e.to_string())
}

#[tauri::command]
fn purge_session(
    svc: State<AppServices>,
    session_id: String,
) -> Result<(), String> {
    svc.sessions.purge(&session_id).map_err(|e| e.to_string())
}

// ─── Last Session Commands ──────────────────────

#[tauri::command]
fn save_last_session(
    svc: State<AppServices>,
    session_id: String,
) -> Result<(), String> {
    svc.sessions.save_last(&session_id).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_last_session(
    svc: State<AppServices>,
) -> Result<Option<String>, String> {
    svc.sessions.get_last().map_err(|e| e.to_string())
}

// ─── File Utility Commands ──────────────────────

/// Read a file that was explicitly chosen by the user via a native OS dialog.
/// Skips path-scope checks — the OS file picker is the permission gate.
#[tauri::command]
fn read_user_selected_file(path: String) -> Result<String, String> {
    use base64::Engine;
    let target =
        pathscope::normalize_local_path(&path).map_err(|_| format!("Invalid path: '{}'", path))?;
    let data = std::fs::read(&target).map_err(|e| format!("Failed to read file: {}", e))?;
    Ok(base64::engine::general_purpose::STANDARD.encode(&data))
}

/// Entry returned by list_recent_images.
#[derive(serde::Serialize)]
struct RecentImageEntry {
    path: String,
    filename: String,
    /// Unix timestamp (seconds)
    modified_at: i64,
    size_bytes: u64,
}

/// Scan standard image directories for recently modified image files.
/// Checks: ~/Desktop, ~/Downloads, ~/Pictures/Screenshots, ~/Pictures
#[tauri::command]
fn list_recent_images(limit: usize) -> Result<Vec<RecentImageEntry>, String> {
    use std::time::UNIX_EPOCH;

    let home = dirs_next::home_dir().ok_or("Cannot determine home directory")?;
    let candidates = [
        home.join("Desktop"),
        home.join("Downloads"),
        home.join("Pictures").join("Screenshots"),
        home.join("Pictures"),
    ];
    let image_exts = ["png", "jpg", "jpeg", "gif", "webp"];

    let mut entries: Vec<RecentImageEntry> = Vec::new();

    for dir in &candidates {
        if !dir.is_dir() {
            continue;
        }
        let Ok(read_dir) = std::fs::read_dir(dir) else {
            continue;
        };
        for entry in read_dir.flatten() {
            let path = entry.path();
            if !path.is_file() {
                continue;
            }
            let ext = path
                .extension()
                .and_then(|e| e.to_str())
                .map(|e| e.to_lowercase())
                .unwrap_or_default();
            if !image_exts.contains(&ext.as_str()) {
                continue;
            }
            let Ok(meta) = std::fs::metadata(&path) else {
                continue;
            };
            let modified_at = meta
                .modified()
                .ok()
                .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                .map(|d| d.as_secs() as i64)
                .unwrap_or(0);
            let filename = path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("")
                .to_string();
            entries.push(RecentImageEntry {
                path: path.to_string_lossy().to_string(),
                filename,
                modified_at,
                size_bytes: meta.len(),
            });
        }
    }

    // Sort newest first, deduplicate by filename (prefer earlier dir), cap
    entries.sort_by(|a, b| b.modified_at.cmp(&a.modified_at));
    entries.dedup_by(|a, b| a.filename == b.filename);
    entries.truncate(limit);
    Ok(entries)
}

#[tauri::command]
fn read_file_as_base64(
    svc: State<AppServices>,
    path: String,
    project_id: Option<String>,
) -> Result<String, String> {
    let target = svc
        .path
        .guard(&path, project_id.as_deref(), false)
        .map_err(|e| e.to_string())?;

    use base64::Engine;
    let data = std::fs::read(&target).map_err(|e| format!("Failed to read file: {}", e))?;
    Ok(base64::engine::general_purpose::STANDARD.encode(&data))
}

/// Open a file path in the system's default application.
///
/// # Security contract
/// - Only `file:` URIs and absolute/relative filesystem paths are accepted.
/// - Extension allowlist: `.md`, `.pdf`, `.png`, `.jpg`, `.jpeg`, `.webp`, `.gif`, `.txt`, `.json`, `.tex`, `.csv`.
/// - Paths inside the active project's allowed roots (vault, textbook, sessions, `~/.mathmate/`) open immediately.
/// - Paths outside allowed roots require `confirmed: true`, set by the frontend after a user warning dialog.
///
/// The two-step call pattern:
#[tauri::command]
fn open_path(
    svc: State<AppServices>,
    path: String,
    project_id: Option<String>,
    confirmed: Option<bool>,
) -> Result<(), String> {
    // Use guard_soft to get the path + containment flag without
    // rejecting paths that are outside roots (the two-step flow
    // lets the user confirm external paths).
    let (target, inside) = svc
        .path
        .guard_soft(&path, project_id.as_deref(), true)
        .map_err(|e| e.to_string())?;

    if !inside && confirmed != Some(true) {
        return Err(
            "Path is outside allowed roots; call with confirmed=true after user approval"
                .to_string(),
        );
    }

    svc.path.open_with_system(&target).map_err(|e| e.to_string())
}

// ─── Project Commands ───────────────────────────

#[tauri::command]
fn create_project(
    name: String,
    vault_path: Option<String>,
    textbook_path: Option<String>,
    default_model: Option<String>,
    tutor_style: Option<String>,
) -> Result<MathProject, String> {
    project::create_project(name, vault_path, textbook_path, default_model, tutor_style)
}

#[tauri::command]
fn update_project(project: MathProject) -> Result<(), String> {
    project::update_project(&project)
}

#[tauri::command]
fn delete_project(project_id: String) -> Result<(), String> {
    project::delete_project(&project_id)
}

#[tauri::command]
fn archive_project(project_id: String) -> Result<(), String> {
    project::archive_project(&project_id)
}

#[tauri::command]
fn unarchive_project(project_id: String) -> Result<(), String> {
    project::unarchive_project(&project_id)
}

#[tauri::command]
fn list_archived_projects() -> Result<Vec<MathProject>, String> {
    project::list_archived_projects()
}

#[tauri::command]
fn delete_project_cascade(project_id: String) -> Result<(), String> {
    project::delete_project_cascade(&project_id)
}

#[tauri::command]
fn list_projects() -> Result<Vec<MathProject>, String> {
    project::list_projects()
}

// ─── Vault Commands ─────────────────────────────

#[tauri::command]
fn scan_vault(
    svc: State<AppServices>,
    path: String,
    project_id: Option<String>,
) -> Result<Vec<vault::VaultNote>, String> {
    let target = svc
        .path
        .guard(&path, project_id.as_deref(), false)
        .map_err(|e| e.to_string())?;
    vault::scan_vault(&target.to_string_lossy())
}

#[tauri::command]
fn read_note(
    svc: State<AppServices>,
    path: String,
    project_id: Option<String>,
) -> Result<String, String> {
    let target = svc
        .path
        .guard(&path, project_id.as_deref(), true)
        .map_err(|e| e.to_string())?;
    vault::read_note(&target.to_string_lossy())
}

#[tauri::command]
fn init_vault(vault_path: String, project_name: String) -> Result<(), String> {
    vault::init_vault(&vault_path, &project_name)
}

// ─── Image Commands ─────────────────────────────

#[tauri::command]
fn save_image(session_id: String, mime: String, data_base64: String) -> Result<String, String> {
    images::save_image(&session_id, &mime, &data_base64)
}

#[tauri::command]
fn load_image(session_id: String, filename: String) -> Result<(String, String), String> {
    images::load_image(&session_id, &filename)
}

#[tauri::command]
fn evict_session_images(session_id: String) -> Result<(), String> {
    images::evict_session_images(&session_id)
}

// ─── Memory Commands ────────────────────────────

#[tauri::command]
fn store_memory(state: State<AppState>, memory: MemoryItem) -> Result<(), String> {
    let db_guard = state.get_db()?;
    let conn = db_guard.as_ref().ok_or("Database not initialized")?;
    memory::store_memory(conn, &memory)
}

#[tauri::command]
fn store_memory_with_safety(
    state: State<AppState>,
    memory: MemoryItem,
    mode: memory::SafetyMode,
) -> Result<memory::ScanResult, String> {
    let db_guard = state.get_db()?;
    let conn = db_guard.as_ref().ok_or("Database not initialized")?;
    memory::store_memory_with_safety(conn, &memory, &mode)
}

#[tauri::command]
fn query_memories(
    state: State<AppState>,
    query: String,
    limit: usize,
) -> Result<Vec<MemoryItem>, String> {
    let db_guard = state.get_db()?;
    let conn = db_guard.as_ref().ok_or("Database not initialized")?;
    memory::query_memories(conn, &query, limit)
}

#[tauri::command]
fn forget_memory(state: State<AppState>, memory_id: String) -> Result<(), String> {
    let db_guard = state.get_db()?;
    let conn = db_guard.as_ref().ok_or("Database not initialized")?;
    memory::forget_memory(conn, &memory_id)
}

#[tauri::command]
fn get_profile(state: State<AppState>, key: String) -> Result<Option<String>, String> {
    let db_guard = state.get_db()?;
    let conn = db_guard.as_ref().ok_or("Database not initialized")?;
    memory::get_profile(conn, &key)
}

#[tauri::command]
fn set_profile(state: State<AppState>, key: String, value: String) -> Result<(), String> {
    let db_guard = state.get_db()?;
    let conn = db_guard.as_ref().ok_or("Database not initialized")?;
    memory::set_profile(conn, &key, &value)
}

// ─── Wrap-Up Commands ───────────────────────────

#[tauri::command]
fn generate_wrap_up(session_id: String) -> Result<wrapup::WrapUpResult, String> {
    wrapup::generate_wrap_up(&session_id)
}

#[tauri::command]
fn save_wrap_up(
    project_name: String,
    vault_path: String,
    content: String,
    session_id: String,
) -> Result<String, String> {
    wrapup::save_wrap_up(&project_name, &vault_path, &content, &session_id)
}

// ─── Textbook Commands ──────────────────────────

#[tauri::command]
fn read_textbook_metadata(path: String) -> Result<textbook::TextbookMetadata, String> {
    textbook::read_textbook_metadata(&path)
}

/// Read the current project's textbook PDF and return it as base64-encoded bytes.
///
/// Security: the frontend only passes a project_id; the textbook path is read
/// from the project record, not from the frontend, preventing path substitution.
#[tauri::command]
fn read_project_textbook(
    svc: State<AppServices>,
    project_id: String,
) -> Result<String, String> {
    use base64::Engine;

    let project = project::load_project(&project_id)
        .map_err(|e| format!("Failed to load project: {}", e))?;

    let path = project
        .textbook_path
        .ok_or_else(|| "No textbook set for this project".to_string())?;

    let target = svc
        .path
        .guard(&path, Some(&project_id), false)
        .map_err(|e| e.to_string())?;

    let is_pdf = target
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.eq_ignore_ascii_case("pdf"))
        .unwrap_or(false);
    if !is_pdf {
        return Err("Project textbook is not a PDF".to_string());
    }

    // Check file size before loading — warn for large PDFs
    let metadata = std::fs::metadata(&target)
        .map_err(|e| format!("Failed to read textbook metadata: {}", e))?;
    if metadata.len() > 150_000_000 {
        // 150 MB soft limit
        return Err("Textbook PDF is too large (over 150 MB)".to_string());
    }

    let data = std::fs::read(&target)
        .map_err(|e| format!("Failed to read textbook file: {}", e))?;

    Ok(base64::engine::general_purpose::STANDARD.encode(&data))
}

// ─── PDF Import Commands ───────────────────────────────

/// Extract the table of contents (document outline) from a PDF file.
#[tauri::command]
fn extract_pdf_toc(path: String) -> Result<Vec<pdf_import::TocEntry>, String> {
    pdf_import::extract_pdf_toc(&path)
}

/// Generate vault markdown files from selected PDF TOC entries.
#[tauri::command]
fn import_pdf_toc(
    pdf_path: String,
    vault_path: String,
    selected_indices: Vec<usize>,
    textbook_title: Option<String>,
) -> Result<pdf_import::ImportResult, String> {
    pdf_import::import_pdf_toc(
        &pdf_path,
        &vault_path,
        &selected_indices,
        textbook_title.as_deref(),
    )
}

// ─── Free Textbook Catalog Commands ────────────

/// List all free textbooks in the bundled catalog.
#[tauri::command]
fn list_textbook_catalog() -> Result<Vec<textbook_catalog::TextbookCatalogEntry>, String> {
    textbook_catalog::load_catalog()
}

/// Get license information for a textbook license type.
#[tauri::command]
fn get_textbook_license_info(license: String) -> Result<LicenseInfo, String> {
    textbook_catalog::get_license_info(&license)
}

/// Download a free textbook PDF to the local library.
/// If project_id is provided, update the project's textbook_path.
#[tauri::command]
fn download_free_textbook(
    catalog_id: String,
    project_id: Option<String>,
) -> Result<textbook_catalog::DownloadResult, String> {
    let result = textbook_catalog::download_textbook(&catalog_id)?;

    // If a project_id was provided, update the project's textbook path
    if let Some(pid) = project_id {
        let mut project = project::load_project(&pid)?;
        project.textbook_path = Some(result.local_path.clone());
        project::update_project(&project)?;
    }

    Ok(result)
}

// ─── Textbook Index Commands ────────────────

/// Save a batch of extracted pages to the textbook search index.
/// Called from the frontend during pdf.js text extraction.
#[tauri::command]
fn index_textbook_pages(
    textbook_id: String,
    title: Option<String>,
    total_pages: u32,
    pages: Vec<textbook_index::PageContent>,
    complete: bool,
) -> Result<textbook_index::TextbookIndexMeta, String> {
    textbook_index::save_page_batch(&textbook_id, title, total_pages, pages, complete)
}

/// Check whether a textbook has a search index already.
#[tauri::command]
fn get_textbook_index_status(textbook_id: String) -> Result<Option<textbook_index::TextbookIndexMeta>, String> {
    match textbook_index::load_meta(&textbook_id) {
        Ok(meta) => Ok(Some(meta)),
        Err(_) => Ok(None),
    }
}

/// Derive a stable textbook ID from a PDF file path.
/// Used by the frontend to know which ID to check/lookup.
#[tauri::command]
fn derive_textbook_id(pdf_path: String) -> Result<String, String> {
    Ok(textbook_index::derive_textbook_id(&pdf_path))
}

// ─── Tool Commands (Phase 12B) ──────────────────

/// Get OpenAI-compatible tool definitions for the current session.
/// Includes Synapse MCP tools when the MCP client is running.
/// Falls back to old vault tools when Synapse is not available.
#[tauri::command]
fn get_tool_definitions(state: State<AppState>) -> Vec<tools::ToolDefinition> {
    // Start with non-vault tools (calculate, current_date, graph)
    let mut defs = vec![tools::calculate::definition(), tools::current_date::definition(), tools::graph::definition()];

    // Try to get Synapse tool definitions from the running MCP client
    if let Ok(mut guard) = state.mcp_client.lock() {
        if let Some(ref mut client) = *guard {
            if let Ok(synapse_tools) = client.list_tools() {
                defs.extend(synapse_tools);
                return defs;
            }
        }
    }

    // Fallback: include old vault tools when Synapse is NOT running
    defs.extend([
        tools::vault_list::definition(),
        tools::vault_read::definition(),
        tools::vault_search::definition(),
        tools::vault_write::definition(),
    ]);

    defs
}

/// Execute a tool call and return the result.
#[tauri::command]
fn execute_tool(
    state: State<AppState>,
    call_id: String,
    tool_name: String,
    arguments: serde_json::Value,
    project_id: Option<String>,
) -> tools::ToolResult {
    let call = tools::ToolCall {
        call_id,
        tool_name,
        arguments,
    };

    // Try Synapse MCP client: query the live tool list to decide routing.
    // This replaces the old hardcoded synapse_tools string array with a
    // runtime check that won't drift when Synapse adds/removes tools.
    if let Ok(mut guard) = state.mcp_client.lock() {
        if let Some(ref mut client) = *guard {
            if let Ok(current_tools) = client.list_tools() {
                if current_tools.iter().any(|t| t.function.name == call.tool_name) {
                    return client
                        .call(&call.tool_name, call.arguments.clone())
                        .map(|r| tools::ToolResult {
                            call_id: call.call_id.clone(),
                            result: r,
                            is_error: false,
                        })
                        .unwrap_or_else(|e| tools::ToolResult {
                            call_id: call.call_id.clone(),
                            result: serde_json::json!({"error": e}),
                            is_error: true,
                        });
                }
            }
        }
    }

    // Resolve vault path from project (for legacy vault_search tool)
    let vault_path = project_id
        .as_deref()
        .and_then(|pid| project::load_project(pid).ok())
        .and_then(|p| p.vault_path);

    tools::execute_tool(&call, vault_path.as_deref(), project_id.as_deref())
}

/// Thin proxy: call any Synapse MCP tool directly from the frontend.
/// Allows UI-driven operations (note_list, note_read, note_update, etc.)
/// independently of the agent tool loop.
#[tauri::command]
fn synapse_call(
    state: State<AppState>,
    tool: String,
    args: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let mut guard = state.mcp_client.lock().map_err(|e| e.to_string())?;
    let client = guard.as_mut().ok_or("Synapse MCP not running")?;
    client.call_unwrapped(&tool, args)
}

// ─── Synapse MCP Commands (Phase 13A) ───────────

/// Start the Synapse MCP subprocess for a given vault path.
#[tauri::command]
fn start_synapse_mcp(state: State<AppState>, vault_path: String) -> Result<(), String> {
    // Kill any existing MCP client
    if let Ok(mut guard) = state.mcp_client.lock() {
        if let Some(ref mut client) = *guard {
            client.stop();
        }
        *guard = Some(mcp_client::McpClient::start(&vault_path)?);
    }
    Ok(())
}

/// Stop the Synapse MCP subprocess.
#[tauri::command]
fn stop_synapse_mcp(state: State<AppState>) -> Result<(), String> {
    if let Ok(mut guard) = state.mcp_client.lock() {
        if let Some(ref mut client) = *guard {
            client.stop();
        }
        *guard = None;
    }
    Ok(())
}

/// Check the status of the Synapse MCP subprocess.
#[derive(serde::Serialize)]
struct SynapseStatus {
    running: bool,
    vault_path: Option<String>,
    tool_count: usize,
}

#[tauri::command]
fn synapse_mcp_status(state: State<AppState>) -> SynapseStatus {
    if let Ok(mut guard) = state.mcp_client.lock() {
        if let Some(ref mut client) = *guard {
            // Try list_tools to confirm it's alive
            if let Ok(tools) = client.list_tools() {
                return SynapseStatus {
                    running: true,
                    vault_path: None, // Not stored on the client
                    tool_count: tools.len(),
                };
            }
        }
    }
    SynapseStatus {
        running: false,
        vault_path: None,
        tool_count: 0,
    }
}

/// Check whether the synapse binary is available on the system.
#[tauri::command]
fn check_synapse_available() -> bool {
    mcp_client::is_synapse_available()
}

// ─── Model Catalog Commands ─────────────────────

#[tauri::command]
fn fetch_models(force_refresh: bool) -> Result<models::ModelCatalog, String> {
    models::fetch_models(force_refresh)
}

#[tauri::command]
fn get_cached_models() -> Result<Option<models::ModelCatalog>, String> {
    Ok(models::get_cached_models())
}

// ─── App Builder ────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .manage(AppState {
            models_config: Mutex::new(None),
            app_config: Mutex::new(None),
            db: Mutex::new(None),
            mcp_client: Mutex::new(None),
        })
        .manage(services::AppServices::init().expect("Failed to init AppServices"))
        .invoke_handler(tauri::generate_handler![
            // Environment variables
            get_env_var,
            // Config
            get_models_config,
            get_app_config,
            save_app_config,
            set_provider_api_key,
            get_config_path,
            // Sessions
            load_session,
            list_sessions,
            create_session,
            append_message,
            rename_session,
            delete_session,
            archive_session,
            unarchive_session,
            list_archived_sessions,
            purge_session,
            save_last_session,
            get_last_session,
            // File utils
            read_file_as_base64,
            read_user_selected_file,
            list_recent_images,
            open_path,
            // Projects
            create_project,
            update_project,
            delete_project,
            archive_project,
            unarchive_project,
            list_archived_projects,
            delete_project_cascade,
            list_projects,
            // Vault
            scan_vault,
            read_note,
            init_vault,
            // Images
            save_image,
            load_image,
            evict_session_images,
            // Memory
            store_memory,
            store_memory_with_safety,
            query_memories,
            forget_memory,
            get_profile,
            set_profile,
            // Wrap-up
            generate_wrap_up,
            save_wrap_up,
            // Textbook
            read_textbook_metadata,
            // PDF Import
            extract_pdf_toc,
            import_pdf_toc,
            // Textbook / PDF Viewer
            read_project_textbook,
            // Free Textbook Catalog
            list_textbook_catalog,
            get_textbook_license_info,
            download_free_textbook,
            // Textbook Search Index
            index_textbook_pages,
            get_textbook_index_status,
            derive_textbook_id,
            // Model catalog
            fetch_models,
            get_cached_models,
            // Tools (Phase 12B)
            get_tool_definitions,
            execute_tool,
            // Synapse MCP (Phase 13A)
            start_synapse_mcp,
            stop_synapse_mcp,
            synapse_mcp_status,
            check_synapse_available,
            synapse_call,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
