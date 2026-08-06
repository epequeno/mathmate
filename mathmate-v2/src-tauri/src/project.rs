#![allow(dead_code)]
use chrono::Utc;
use std::path::PathBuf;
use crate::services::project::{MathProject, VaultRef, VaultKind};

pub fn migrate_project(project: &mut MathProject) {
    // ── v0 → v2: promote vault_path → vaults[0] ─────────────────────
    if let Some(ref vp) = project.vault_path {
        if project.vaults.is_empty() {
            let vault = VaultRef {
                id: uuid_v4(),
                name: "Vault".to_string(),
                path: vp.clone(),
                kind: VaultKind::Synapse,
                read_only: false,
                position: 0,
            };
            project.vaults.push(vault);
        }
    }

    // ── Ensure every vault has an id ────────────────────────────────
    for v in project.vaults.iter_mut() {
        if v.id.is_empty() {
            v.id = uuid_v4();
        }
    }

    // ── Normalise positions ─────────────────────────────────────────
    project.vaults.sort_by_key(|v| v.position);
    for (i, v) in project.vaults.iter_mut().enumerate() {
        v.position = i as u16;
    }

    // ── Repair missing / invalid active_vault_id ────────────────────
    if project.vaults.is_empty() {
        project.active_vault_id = None;
    } else {
        let valid = project.active_vault_id.as_deref().map_or(false, |aid| {
            project.vaults.iter().any(|v| v.id == aid)
        });
        if !valid {
            project.active_vault_id = Some(project.vaults[0].id.clone());
        }
    }

    project.schema_version = Some(2);
}

/// Resolve the active `VaultRef` for this project, if any.
pub fn active_vault(project: &MathProject) -> Option<&VaultRef> {
    let aid = project.active_vault_id.as_deref()?;
    project.vaults.iter().find(|v| v.id == aid)
}

/// Get the active vault path string, if any (for backward compat).
pub fn active_vault_path(project: &MathProject) -> Option<&str> {
    active_vault(project).map(|v| v.path.as_str())
}

/// Get all vault paths (for allowed-roots computation).
pub fn all_vault_paths(project: &MathProject) -> Vec<&str> {
    project.vaults.iter().map(|v| v.path.as_str()).collect()
}

fn archived_projects_dir() -> PathBuf {
    let mut p = dirs_next::home_dir().unwrap_or_else(|| PathBuf::from("/tmp"));
    p.push(".mathmate");
    p.push("archived_projects");
    let _ = std::fs::create_dir_all(&p);
    p
}

fn archived_project_path(id: &str) -> PathBuf {
    archived_projects_dir().join(format!("{}.json", id))
}

fn projects_dir() -> PathBuf {
    let mut p = dirs_next::home_dir().unwrap_or_else(|| PathBuf::from("/tmp"));
    p.push(".mathmate");
    p.push("projects");
    let _ = std::fs::create_dir_all(&p);
    p
}

fn project_path(id: &str) -> PathBuf {
    projects_dir().join(format!("{}.json", id))
}

pub fn create_project(
    name: String,
    vault_path: Option<String>,
    textbook_path: Option<String>,
    default_model: Option<String>,
    tutor_style: Option<String>,
) -> Result<MathProject, String> {
    let now = Utc::now().to_rfc3339();
    let mut vaults = Vec::new();
    let mut active_vault_id: Option<String> = None;
    if let Some(ref vp) = vault_path {
        let v = VaultRef {
            id: uuid_v4(),
            name: "Vault".to_string(),
            path: vp.clone(),
            kind: VaultKind::Synapse,
            read_only: false,
            position: 0,
        };
        active_vault_id = Some(v.id.clone());
        vaults.push(v);
    }
    let mut project = MathProject {
        id: uuid_v4(),
        name,
        vault_path,
        vaults,
        active_vault_id,
        textbook_path,
        default_model,
        tutor_style,
        schema_version: Some(2),
        created_at: now.clone(),
        updated_at: now,
    };
    migrate_project(&mut project);
    save_project(&project)?;
    Ok(project)
}

pub fn update_project(project: &MathProject) -> Result<(), String> {
    let mut updated = project.clone();
    updated.updated_at = Utc::now().to_rfc3339();
    save_project(&updated)
}

fn save_project(project: &MathProject) -> Result<(), String> {
    let path = project_path(&project.id);
    let data = serde_json::to_string_pretty(project)
        .map_err(|e| format!("Failed to serialize project: {}", e))?;
    std::fs::write(&path, data).map_err(|e| format!("Failed to write project: {}", e))
}

pub fn archive_project(id: &str) -> Result<(), String> {
    let src = project_path(id);
    if !src.exists() {
        return Err(format!("Project {} not found", id));
    }
    let dst = archived_project_path(id);
    std::fs::rename(&src, &dst).map_err(|e| format!("Failed to archive project {}: {}", id, e))
}

pub fn unarchive_project(id: &str) -> Result<(), String> {
    let src = archived_project_path(id);
    if !src.exists() {
        return Err(format!("Archived project {} not found", id));
    }
    let dst = project_path(id);
    std::fs::rename(&src, &dst).map_err(|e| format!("Failed to unarchive project {}: {}", id, e))
}

pub fn list_archived_projects() -> Result<Vec<MathProject>, String> {
    let dir = archived_projects_dir();
    let mut projects = Vec::new();
    let entries = std::fs::read_dir(&dir)
        .map_err(|e| format!("Failed to read archived projects dir: {}", e))?;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().map_or(true, |e| e != "json") {
            continue;
        }
        if let Ok(data) = std::fs::read_to_string(&path) {
            if let Ok(project) = serde_json::from_str::<MathProject>(&data) {
                projects.push(project);
            }
        }
    }
    projects.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    Ok(projects)
}

pub fn delete_project(id: &str) -> Result<(), String> {
    let path = project_path(id);
    if path.exists() {
        std::fs::remove_file(&path).map_err(|e| format!("Failed to delete project: {}", e))
    } else {
        Err(format!("Project {} not found", id))
    }
}

/// Load a single project by ID.
/// Load a single project by ID (runs migration if needed).
pub fn load_project(id: &str) -> Result<MathProject, String> {
    let active = project_path(id);
    let mut project = if active.exists() {
        let data = std::fs::read_to_string(&active)
            .map_err(|e| format!("Failed to read project: {}", e))?;
        serde_json::from_str::<MathProject>(&data).map_err(|e| format!("Failed to parse project: {}", e))?
    } else {
        let archived = archived_project_path(id);
        if archived.exists() {
            let data = std::fs::read_to_string(&archived)
                .map_err(|e| format!("Failed to read archived project: {}", e))?;
            serde_json::from_str::<MathProject>(&data)
                .map_err(|e| format!("Failed to parse archived project: {}", e))?
        } else {
            return Err(format!("Project {} not found", id));
        }
    };
    migrate_project(&mut project);
    Ok(project)
}

/// Delete a project and all of its sessions (active + archived).
pub fn delete_project_cascade(id: &str) -> Result<(), String> {
    // Remove project file (active or archived)
    let active = project_path(id);
    if active.exists() {
        std::fs::remove_file(&active).map_err(|e| format!("Failed to delete project: {}", e))?;
    }
    let archived = archived_project_path(id);
    if archived.exists() {
        std::fs::remove_file(&archived)
            .map_err(|e| format!("Failed to delete archived project: {}", e))?;
    }
    // Remove all sessions for this project
    crate::session::delete_sessions_for_project(id)
}

pub fn list_projects() -> Result<Vec<MathProject>, String> {
    let dir = projects_dir();
    let mut projects = Vec::new();
    let entries =
        std::fs::read_dir(&dir).map_err(|e| format!("Failed to read projects dir: {}", e))?;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().map_or(true, |e| e != "json") {
            continue;
        }
        if let Ok(data) = std::fs::read_to_string(&path) {
            if let Ok(project) = serde_json::from_str::<MathProject>(&data) {
                projects.push(project);
            }
        }
    }
    // If no projects exist, return empty list — show WelcomePage instead
    projects.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    Ok(projects)
}

/// Simple UUID v4 generator (no external dep needed).
pub fn uuid_v4() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    let secs = now.as_secs();
    let nanos = now.subsec_nanos();
    format!("p{:08x}{:08x}{:04x}", secs, nanos, rand_u16())
}

fn rand_u16() -> u16 {
    // Simple LCG for randomness without extra deps
    use std::time::SystemTime;
    let seed = SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos() as u64;
    ((seed
        .wrapping_mul(6364136223846793005)
        .wrapping_add(1442695040888963407))
        >> 48) as u16
}
