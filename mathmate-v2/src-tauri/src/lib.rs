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

use crate::services::session::{Message, Session, SessionHeader};
use tauri::State;
use crate::error::AppError;
use crate::services::AppServices;

// ─── Config Commands ────────────────────────────

#[tauri::command]
fn get_env_var(
    svc: State<AppServices>,
    key: String,
) -> Result<Option<String>, AppError> {
    svc.config.get_env_var(&key)
}

#[tauri::command]
fn get_models_config(
    svc: State<AppServices>,
) -> Result<crate::services::config::AppConfigModels, AppError> {
    svc.config.get_models_config()
}

#[tauri::command]
fn get_app_config(
    svc: State<AppServices>,
) -> Result<crate::services::config::AppConfig, AppError> {
    svc.config.get_app_config()
}

#[tauri::command]
fn save_app_config(
    svc: State<AppServices>,
    config: crate::services::config::AppConfig,
) -> Result<(), AppError> {
    svc.config.save_app_config(&config)
}

#[tauri::command]
fn set_provider_api_key(
    svc: State<AppServices>,
    provider_name: String,
    api_key: Option<String>,
) -> Result<(), AppError> {
    svc.config
        .set_provider_api_key(&provider_name, api_key)
}

#[tauri::command]
fn get_config_path(svc: State<AppServices>) -> String {
    svc.config.config_path()
}

// ─── Session Commands ───────────────────────────

#[tauri::command]
fn load_session(
    svc: State<AppServices>,
    session_id: String,
) -> Result<Session, AppError> {
    svc.sessions.load(&session_id)
}

#[tauri::command]
fn list_sessions(
    svc: State<AppServices>,
    project_id: Option<String>,
) -> Result<Vec<SessionHeader>, AppError> {
    svc.sessions.list(project_id.as_deref())
}

#[tauri::command]
fn create_session(
    svc: State<AppServices>,
    header: SessionHeader,
    initial_message: Option<Message>,
) -> Result<Session, AppError> {
    svc.sessions.create(header, initial_message)
}

#[tauri::command]
fn append_message(
    svc: State<AppServices>,
    session_id: String,
    message: Message,
) -> Result<Session, AppError> {
    svc.sessions.append(&session_id, &message)
}

#[tauri::command]
fn rename_session(
    svc: State<AppServices>,
    session_id: String,
    title: String,
) -> Result<Session, AppError> {
    svc.sessions.rename(&session_id, &title)
}

#[tauri::command]
fn delete_session(
    svc: State<AppServices>,
    session_id: String,
) -> Result<(), AppError> {
    svc.sessions.delete(&session_id)
}

#[tauri::command]
fn archive_session(
    svc: State<AppServices>,
    session_id: String,
) -> Result<(), AppError> {
    svc.sessions.archive(&session_id)
}

#[tauri::command]
fn unarchive_session(
    svc: State<AppServices>,
    session_id: String,
) -> Result<(), AppError> {
    svc.sessions.unarchive(&session_id)
}

#[tauri::command]
fn list_archived_sessions(
    svc: State<AppServices>,
    project_id: Option<String>,
) -> Result<Vec<SessionHeader>, AppError> {
    svc.sessions.list_archived(project_id.as_deref())
}

#[tauri::command]
fn purge_session(
    svc: State<AppServices>,
    session_id: String,
) -> Result<(), AppError> {
    svc.sessions.purge(&session_id)
}

// ─── Last Session Commands ──────────────────────

#[tauri::command]
fn save_last_session(
    svc: State<AppServices>,
    session_id: String,
) -> Result<(), AppError> {
    svc.sessions.save_last(&session_id)
}

#[tauri::command]
fn get_last_session(
    svc: State<AppServices>,
) -> Result<Option<String>, AppError> {
    svc.sessions.get_last()
}

// ─── File Utility Commands ──────────────────────

/// Read a file that was explicitly chosen by the user via a native OS dialog.
/// Skips path-scope checks — the OS file picker is the permission gate.
#[tauri::command]
fn read_user_selected_file(
    svc: State<AppServices>,
    path: String,
) -> Result<String, AppError> {
    svc.images.read_user_selected(&path)
}

#[tauri::command]
fn list_recent_images(
    svc: State<AppServices>,
    limit: usize,
) -> Result<Vec<crate::services::image::RecentImageEntry>, AppError> {
    svc.images.list_recent(limit)
}

#[tauri::command]
fn read_file_as_base64(
    svc: State<AppServices>,
    path: String,
    project_id: Option<String>,
) -> Result<String, AppError> {
    let target = svc
        .path
        .guard(&path, project_id.as_deref(), false)
        ?;

    use base64::Engine;
    let data = std::fs::read(&target)?;
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
) -> Result<(), AppError> {
    // Use guard_soft to get the path + containment flag without
    // rejecting paths that are outside roots (the two-step flow
    // lets the user confirm external paths).
    let (target, inside) = svc
        .path
        .guard_soft(&path, project_id.as_deref(), true)
        ?;

    if !inside && confirmed != Some(true) {
        return Err(AppError::access_denied(
            "Path is outside allowed roots; call with confirmed=true after user approval"
        ));
    }

    svc.path.open_with_system(&target)
}

// ─── Project Commands ───────────────────────────

#[tauri::command]
fn create_project(
    svc: State<AppServices>,
    name: String,
    vault_path: Option<String>,
    textbook_path: Option<String>,
    default_model: Option<String>,
    tutor_style: Option<String>,
) -> Result<crate::services::project::MathProject, AppError> {
    svc.projects
        .create(name, vault_path, textbook_path, default_model, tutor_style)
}

#[tauri::command]
fn update_project(
    svc: State<AppServices>,
    project: crate::services::project::MathProject,
) -> Result<(), AppError> {
    svc.projects.update(&project)
}

#[tauri::command]
fn delete_project(
    svc: State<AppServices>,
    project_id: String,
) -> Result<(), AppError> {
    svc.projects.delete(&project_id)
}

#[tauri::command]
fn archive_project(
    svc: State<AppServices>,
    project_id: String,
) -> Result<(), AppError> {
    svc.projects.archive(&project_id)
}

#[tauri::command]
fn unarchive_project(
    svc: State<AppServices>,
    project_id: String,
) -> Result<(), AppError> {
    svc.projects.unarchive(&project_id)
}

#[tauri::command]
fn list_archived_projects(
    svc: State<AppServices>,
) -> Result<Vec<crate::services::project::MathProject>, AppError> {
    svc.projects.list_archived()
}

#[tauri::command]
fn delete_project_cascade(
    svc: State<AppServices>,
    project_id: String,
) -> Result<(), AppError> {
    svc.projects.delete_cascade(&project_id)
}

#[tauri::command]
fn list_projects(
    svc: State<AppServices>,
) -> Result<Vec<crate::services::project::MathProject>, AppError> {
    svc.projects.list()
}

// ─── Vault Commands ─────────────────────────────

#[tauri::command]
fn scan_vault(
    svc: State<AppServices>,
    path: String,
    project_id: Option<String>,
) -> Result<Vec<crate::services::vault::VaultNote>, AppError> {
    let target = svc
        .path
        .guard(&path, project_id.as_deref(), false)
        ?;
    svc.vault.scan(&target.to_string_lossy())
}

#[tauri::command]
fn read_note(
    svc: State<AppServices>,
    path: String,
    project_id: Option<String>,
) -> Result<String, AppError> {
    let target = svc
        .path
        .guard(&path, project_id.as_deref(), true)
        ?;
    svc.vault.read_note(&target.to_string_lossy())
}

#[tauri::command]
fn init_vault(
    svc: State<AppServices>,
    vault_path: String,
    project_name: String,
) -> Result<(), AppError> {
    svc.vault.init(&vault_path, &project_name)
}

// ─── Image Commands ─────────────────────────────

#[tauri::command]
fn save_image(
    svc: State<AppServices>,
    session_id: String,
    mime: String,
    data_base64: String,
) -> Result<String, AppError> {
    svc.images
        .save(&session_id, &mime, &data_base64)
}

#[tauri::command]
fn load_image(
    svc: State<AppServices>,
    session_id: String,
    filename: String,
) -> Result<(String, String), AppError> {
    svc.images
        .load(&session_id, &filename)
}

#[tauri::command]
fn evict_session_images(
    svc: State<AppServices>,
    session_id: String,
) -> Result<(), AppError> {
    svc.images.evict(&session_id)
}

// ─── Memory Commands ────────────────────────────

#[tauri::command]
fn store_memory(
    svc: State<AppServices>,
    memory: crate::services::memory::MemoryItem,
) -> Result<(), AppError> {
    svc.memory.store(&memory)
}

#[tauri::command]
fn store_memory_with_safety(
    svc: State<AppServices>,
    memory: crate::services::memory::MemoryItem,
    mode: crate::services::memory::SafetyMode,
) -> Result<crate::services::memory::ScanResult, AppError> {
    svc.memory
        .store_with_safety(&memory, &mode)
}

#[tauri::command]
fn query_memories(
    svc: State<AppServices>,
    query: String,
    limit: usize,
) -> Result<Vec<crate::services::memory::MemoryItem>, AppError> {
    svc.memory.query(&query, limit)
}

#[tauri::command]
fn forget_memory(
    svc: State<AppServices>,
    memory_id: String,
) -> Result<(), AppError> {
    svc.memory.forget(&memory_id)
}

#[tauri::command]
fn get_profile(
    svc: State<AppServices>,
    key: String,
) -> Result<Option<String>, AppError> {
    svc.memory.get_profile(&key)
}

#[tauri::command]
fn set_profile(
    svc: State<AppServices>,
    key: String,
    value: String,
) -> Result<(), AppError> {
    svc.memory
        .set_profile(&key, &value)
}

// ─── Wrap-Up Commands ───────────────────────────

#[tauri::command]
fn generate_wrap_up(
    svc: State<AppServices>,
    session_id: String,
) -> Result<crate::services::wrapup::WrapUpResult, AppError> {
    svc.wrapup.generate(&session_id)
}

#[tauri::command]
fn save_wrap_up(
    svc: State<AppServices>,
    project_name: String,
    vault_path: String,
    content: String,
    session_id: String,
) -> Result<String, AppError> {
    svc.wrapup
        .save(&project_name, &vault_path, &content, &session_id)
}

// ─── Textbook Commands ──────────────────────────

#[tauri::command]
fn read_textbook_metadata(
    svc: State<AppServices>,
    path: String,
) -> Result<crate::services::textbook::TextbookMetadata, AppError> {
    svc.textbook.read_metadata(&path)
}

#[tauri::command]
fn read_project_textbook(
    svc: State<AppServices>,
    project_id: String,
) -> Result<String, AppError> {
    use base64::Engine;

    let project = svc.projects.load(&project_id)?;

    let path = project
        .textbook_path
        .ok_or_else(|| AppError::not_found("No textbook set for this project"))?;

    let target = svc
        .path
        .guard(&path, Some(&project_id), false)
        ?;

    let is_pdf = target
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.eq_ignore_ascii_case("pdf"))
        .unwrap_or(false);
    if !is_pdf {
        return Err(AppError::validation("Project textbook is not a PDF"));
    }

    let metadata = std::fs::metadata(&target)?;
    if metadata.len() > 150_000_000 {
        return Err(AppError::internal("Textbook PDF is too large (over 150 MB)"));
    }

    let data = std::fs::read(&target)?;

    Ok(base64::engine::general_purpose::STANDARD.encode(&data))
}

// ─── PDF Import Commands ───────────────────────────────

#[tauri::command]
fn extract_pdf_toc(
    svc: State<AppServices>,
    path: String,
) -> Result<Vec<crate::services::textbook::TocEntry>, AppError> {
    svc.textbook.extract_pdf_toc(&path)
}

#[tauri::command]
fn import_pdf_toc(
    svc: State<AppServices>,
    pdf_path: String,
    vault_path: String,
    selected_indices: Vec<usize>,
    textbook_title: Option<String>,
) -> Result<crate::services::textbook::ImportResult, AppError> {
    svc.textbook
        .import_pdf_toc(&pdf_path, &vault_path, &selected_indices, textbook_title.as_deref())
}

// ─── Free Textbook Catalog Commands ────────────

#[tauri::command]
fn list_textbook_catalog(
    svc: State<AppServices>,
) -> Result<Vec<crate::services::textbook::TextbookCatalogEntry>, AppError> {
    svc.textbook.list_catalog()
}

#[tauri::command]
fn get_textbook_license_info(
    svc: State<AppServices>,
    license: String,
) -> Result<crate::services::textbook::LicenseInfo, AppError> {
    svc.textbook.get_license_info(&license)
}

#[tauri::command]
fn download_free_textbook(
    svc: State<AppServices>,
    catalog_id: String,
    project_id: Option<String>,
) -> Result<crate::services::textbook::DownloadResult, AppError> {
    let result = svc.textbook
        .download_free_textbook(&catalog_id)
        ?;

    // If a project_id was provided, update the project's textbook path
    if let Some(pid) = project_id {
        let mut project = svc.projects.load(&pid)?;
        project.textbook_path = Some(result.local_path.clone());
        svc.projects
            .update(&project)
            ?;
    }

    Ok(result)
}

// ─── Textbook Index Commands ────────────────

#[tauri::command]
fn index_textbook_pages(
    svc: State<AppServices>,
    textbook_id: String,
    title: Option<String>,
    total_pages: u32,
    pages: Vec<crate::services::textbook::PageContent>,
    complete: bool,
) -> Result<crate::services::textbook::TextbookIndexMeta, AppError> {
    svc.textbook
        .index_pages(&textbook_id, title.as_deref(), total_pages, pages, complete)
}

#[tauri::command]
fn get_textbook_index_status(
    svc: State<AppServices>,
    textbook_id: String,
) -> Result<Option<crate::services::textbook::TextbookIndexMeta>, AppError> {
    svc.textbook.get_index_status(&textbook_id)
}

#[tauri::command]
fn derive_textbook_id(
    svc: State<AppServices>,
    pdf_path: String,
) -> Result<String, AppError> {
    Ok(svc.textbook.derive_textbook_id(&pdf_path))
}

// ─── Tool Commands ──────────────────────────────

#[tauri::command]
fn get_tool_definitions(
    svc: State<AppServices>,
) -> Result<Vec<tools::ToolDefinition>, AppError> {
    svc.synapse.get_tool_definitions()
}

#[tauri::command]
fn execute_tool(
    svc: State<AppServices>,
    call_id: String,
    tool_name: String,
    arguments: serde_json::Value,
    project_id: Option<String>,
) -> Result<tools::ToolResult, AppError> {
    let vault_path = project_id
        .as_deref()
        .and_then(|pid| svc.projects.load(pid).ok())
        .and_then(|p| p.vault_path);

    let call = tools::ToolCall {
        call_id,
        tool_name,
        arguments,
    };

    svc.synapse
        .execute_tool(call, vault_path.as_deref(), project_id.as_deref())
}

#[tauri::command]
fn synapse_call(
    svc: State<AppServices>,
    tool: String,
    args: serde_json::Value,
) -> Result<serde_json::Value, AppError> {
    svc.synapse.call(&tool, args)
}

// ─── Synapse MCP Commands ───────────────────────

#[tauri::command]
fn start_synapse_mcp(
    svc: State<AppServices>,
    vault_path: String,
) -> Result<(), AppError> {
    svc.synapse.start(&vault_path)
}

#[tauri::command]
fn stop_synapse_mcp(
    svc: State<AppServices>,
) -> Result<(), AppError> {
    svc.synapse.stop()
}

#[tauri::command]
fn synapse_mcp_status(
    svc: State<AppServices>,
) -> Result<crate::services::synapse::SynapseStatus, AppError> {
    svc.synapse.status()
}

#[tauri::command]
fn check_synapse_available(
    svc: State<AppServices>,
) -> bool {
    svc.synapse.is_available()
}

// ─── Model Catalog Commands ─────────────────────

#[tauri::command]
fn fetch_models(
    svc: State<AppServices>,
    force_refresh: bool,
) -> Result<models::ModelCatalog, AppError> {
    svc.model_catalog.fetch(force_refresh)
}

#[tauri::command]
fn get_cached_models(
    svc: State<AppServices>,
) -> Result<Option<models::ModelCatalog>, AppError> {
    Ok(svc.model_catalog.get_cached())
}

// ─── App Builder ────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
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
