// ─── Project Service ─────────────────────────────────────────────────
//
// Owns project CRUD + persistence (JSON files in ~/.mathmate/projects/
// and ~/.mathmate/archived_projects/).  All path resolution flows
// through the injected base_dir so the service is unit-testable with a
// temp directory.
//
// Delegates the low-level file I/O to a private implementation that
// mirrors the existing `crate::project` free functions.
//
// See: Implementation_Phase14C_RustServiceLayer.md § C.6

use std::path::PathBuf;

use chrono::Utc;
use serde::{Deserialize, Serialize};
use crate::error::AppError;

/// A named project grouping sessions, vault, and textbook.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MathProject {
    pub id: String,
    pub name: String,
    pub vault_path: Option<String>,  // deprecated; migrated to vaults[0] on load
    #[serde(default)]
    pub vaults: Vec<VaultRef>,
    pub active_vault_id: Option<String>,
    pub textbook_path: Option<String>,
    pub default_model: Option<String>,
    pub tutor_style: Option<String>,
    pub schema_version: Option<u32>,
    pub created_at: String,
    pub updated_at: String,
}

/// Vault backend kind.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum VaultKind {
    #[serde(rename = "synapse")]
    Synapse,
    #[serde(rename = "legacy")]
    Legacy,
    #[serde(rename = "classroom")]
    Classroom,
}

/// A single vault reference within a project.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VaultRef {
    pub id: String,
    pub name: String,
    pub path: String,
    pub kind: VaultKind,
    #[serde(default)]
    pub read_only: bool,
    #[serde(default)]
    pub position: u16,
}

// ─── ProjectService ──────────────────────────────────────────────────

pub struct ProjectService {
    base_dir: PathBuf,
}

impl ProjectService {
    /// Create a `ProjectService` rooted at `base_dir` (typically `~/.mathmate`).
    pub fn new(base_dir: PathBuf) -> Self {
        Self { base_dir }
    }

    // ── Path resolution ──────────────────────────────────────────────

    fn projects_dir(&self) -> PathBuf {
        let mut p = self.base_dir.clone();
        p.push("projects");
        let _ = std::fs::create_dir_all(&p);
        p
    }

    fn archived_dir(&self) -> PathBuf {
        let mut p = self.base_dir.clone();
        p.push("archived_projects");
        let _ = std::fs::create_dir_all(&p);
        p
    }

    fn project_path(&self, id: &str) -> PathBuf {
        self.projects_dir().join(format!("{}.json", id))
    }

    fn archived_path(&self, id: &str) -> PathBuf {
        self.archived_dir().join(format!("{}.json", id))
    }

    // ── File I/O helpers ─────────────────────────────────────────────

    fn save(&self, project: &MathProject) -> Result<(), AppError> {
        let path = self.project_path(&project.id);
        let data = serde_json::to_string_pretty(project)
            .map_err(|e| AppError::internal(format!("Failed to serialize project: {}", e)))?;
        std::fs::write(&path, data)
            .map_err(|e| AppError::internal(format!("Failed to write project: {}", e)))
    }

    #[allow(dead_code)] // used in tests
    fn read_file(&self, path: &PathBuf) -> Result<MathProject, AppError> {
        let data = std::fs::read_to_string(path)
            .map_err(|e| AppError::internal(format!("Failed to read project: {}", e)))?;
        serde_json::from_str(&data)
            .map_err(|e| AppError::internal(format!("Failed to parse project: {}", e)))
    }

    fn list_dir(&self, dir: &PathBuf) -> Result<Vec<MathProject>, AppError> {
        let mut projects: Vec<MathProject> = Vec::new();
        let entries = std::fs::read_dir(dir)
            .map_err(|e| AppError::internal(format!("Failed to read dir: {}", e)))?;
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

    // ── public API ───────────────────────────────────────────────────

    /// Create a new project and persist it to disk.
    pub fn create(
        &self,
        name: String,
        vault_path: Option<String>,
        textbook_path: Option<String>,
        default_model: Option<String>,
        tutor_style: Option<String>,
    ) -> Result<MathProject, AppError> {
        let now = Utc::now().to_rfc3339();
        let mut vaults = Vec::new();
        let mut active_vault_id: Option<String> = None;
        if let Some(ref vp) = vault_path {
            let v = VaultRef {
                id: crate::project::uuid_v4(),
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
            id: crate::project::uuid_v4(),
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
        crate::project::migrate_project(&mut project);
        self.save(&project)?;
        Ok(project)
    }

    /// Update a project (bumps `updated_at`).
    pub fn update(&self, project: &MathProject) -> Result<(), AppError> {
        let mut updated = project.clone();
        updated.updated_at = Utc::now().to_rfc3339();
        self.save(&updated)
    }

    /// Load a project by ID (searches active first, then archived).
    #[allow(dead_code)] // used in tests
    pub fn load(&self, id: &str) -> Result<MathProject, AppError> {
        let active = self.project_path(id);
        if active.exists() {
            return self.read_file(&active);
        }
        let archived = self.archived_path(id);
        if archived.exists() {
            return self.read_file(&archived);
        }
        Err(AppError::not_found(format!("Project {} not found", id)))
    }

    /// List all active projects.
    pub fn list(&self) -> Result<Vec<MathProject>, AppError> {
        self.list_dir(&self.projects_dir())
    }

    /// List all archived projects.
    pub fn list_archived(&self) -> Result<Vec<MathProject>, AppError> {
        self.list_dir(&self.archived_dir())
    }

    /// Delete an active project (does NOT cascade delete sessions).
    pub fn delete(&self, id: &str) -> Result<(), AppError> {
        let path = self.project_path(id);
        if path.exists() {
            std::fs::remove_file(&path)
                .map_err(|e| AppError::internal(format!("Failed to delete project: {}", e)))
        } else {
            Err(AppError::not_found(format!("Project {} not found", id)))
        }
    }

    /// Move a project to the archived folder.
    pub fn archive(&self, id: &str) -> Result<(), AppError> {
        let src = self.project_path(id);
        if !src.exists() {
            return Err(AppError::not_found(format!("Project {} not found", id)));
        }
        let dst = self.archived_path(id);
        std::fs::rename(&src, &dst).map_err(|e| {
            AppError::internal(format!("Failed to archive project {}: {}", id, e))
        })
    }

    /// Move a project from archived back to active.
    pub fn unarchive(&self, id: &str) -> Result<(), AppError> {
        let src = self.archived_path(id);
        if !src.exists() {
            return Err(AppError::not_found(format!(
                "Archived project {} not found",
                id
            )));
        }
        let dst = self.project_path(id);
        std::fs::rename(&src, &dst).map_err(|e| {
            AppError::internal(format!("Failed to unarchive project {}: {}", id, e))
        })
    }

    /// Permanently delete a project and all its sessions (active + archived).
    ///
    /// This calls into `crate::session::delete_sessions_for_project` for
    /// the cascade and removes the project JSON files from both active
    /// and archived directories.
    pub fn delete_cascade(&self, id: &str) -> Result<(), AppError> {
        // Remove project file (active or archived)
        let active = self.project_path(id);
        if active.exists() {
            std::fs::remove_file(&active)
                .map_err(|e| AppError::internal(format!("Failed to delete project: {}", e)))?;
        }
        let archived = self.archived_path(id);
        if archived.exists() {
            std::fs::remove_file(&archived).map_err(|e| {
                AppError::internal(format!("Failed to delete archived project: {}", e))
            })?;
        }
        crate::session::delete_sessions_for_project(id).map_err(AppError::from)
    }
}


// ─── Tests ───────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_service() -> (ProjectService, PathBuf) {
        use std::sync::atomic::{AtomicU32, Ordering};
        static COUNTER: AtomicU32 = AtomicU32::new(0);
        let n = COUNTER.fetch_add(1, Ordering::Relaxed);
        let dir = std::env::temp_dir().join(format!("mathmate_proj_{}", n));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let svc = ProjectService::new(dir.clone());
        (svc, dir)
    }

    #[test]
    fn test_create_and_list() {
        let (svc, dir) = temp_service();

        let p = svc
            .create(
                "Test Project".into(),
                Some("/vault/test".into()),
                None,
                Some("gpt-4".into()),
                None,
            )
            .unwrap();
        assert_eq!(p.name, "Test Project");
        assert_eq!(p.vault_path, Some("/vault/test".into()));
        assert!(p.id.starts_with('p'));

        let list = svc.list().unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].id, p.id);

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn test_update() {
        let (svc, dir) = temp_service();

        let mut p = svc
            .create("Orig".into(), None, None, None, None)
            .unwrap();
        let orig_updated = p.updated_at.clone();

        // Brief sleep to ensure timestamp changes
        std::thread::sleep(std::time::Duration::from_millis(10));

        p.name = "Updated".into();
        svc.update(&p).unwrap();

        let loaded = svc.load(&p.id).unwrap();
        assert_eq!(loaded.name, "Updated");
        assert_ne!(loaded.updated_at, orig_updated);

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn test_archive_unarchive() {
        let (svc, dir) = temp_service();

        let p = svc
            .create("Archive Me".into(), None, None, None, None)
            .unwrap();

        svc.archive(&p.id).unwrap();
        assert!(svc.list().unwrap().is_empty());
        assert_eq!(svc.list_archived().unwrap().len(), 1);

        // Load should work from archived
        let loaded = svc.load(&p.id).unwrap();
        assert_eq!(loaded.name, "Archive Me");

        svc.unarchive(&p.id).unwrap();
        assert_eq!(svc.list().unwrap().len(), 1);
        assert!(svc.list_archived().unwrap().is_empty());

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn test_delete() {
        let (svc, dir) = temp_service();

        let p = svc
            .create("Delete Me".into(), None, None, None, None)
            .unwrap();
        assert_eq!(svc.list().unwrap().len(), 1);

        svc.delete(&p.id).unwrap();
        assert!(svc.list().unwrap().is_empty());

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn test_delete_nonexistent_returns_error() {
        let (svc, dir) = temp_service();
        let err = svc.delete("nonexistent").unwrap_err();
        assert_eq!(err.kind(), "not_found");

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn test_delete_cascade() {
        let (svc, dir) = temp_service();

        let p = svc
            .create("Cascade".into(), None, None, None, None)
            .unwrap();
        svc.archive(&p.id).unwrap();
        assert_eq!(svc.list_archived().unwrap().len(), 1);

        svc.delete_cascade(&p.id).unwrap();
        assert!(svc.list_archived().unwrap().is_empty());

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn test_list_sorted_by_updated_at() {
        let (svc, dir) = temp_service();

        let a = svc
            .create("A".into(), None, None, None, None)
            .unwrap();
        std::thread::sleep(std::time::Duration::from_millis(10));
        let b = svc
            .create("B".into(), None, None, None, None)
            .unwrap();

        let list = svc.list().unwrap();
        assert_eq!(list[0].id, b.id); // newest first
        assert_eq!(list[1].id, a.id);

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn test_create_multiple() {
        let (svc, dir) = temp_service();

        for i in 0..5 {
            svc.create(
                format!("Project {}", i),
                None,
                None,
                None,
                None,
            )
            .unwrap();
        }

        let list = svc.list().unwrap();
        assert_eq!(list.len(), 5);

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn test_load_nonexistent_returns_error() {
        let (svc, dir) = temp_service();
        let err = svc.load("nonexistent").unwrap_err();
        assert_eq!(err.kind(), "not_found");
        assert!(err.to_string().contains("not found"));

        std::fs::remove_dir_all(&dir).ok();
    }
}
