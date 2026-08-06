// ─── Vault Service ────────────────────────────────────────────────────
//
// Thin wrapper around `crate::vault` free functions.  The path-scope
// guard step is NOT owned by this service — it's applied by the Tauri
// commands via `AppServices::path::guard()` before calling into the
// vault logic.
//
// See: Implementation_Phase14C_RustServiceLayer.md § C.6
use serde::{Deserialize, Serialize};
#[cfg(feature = "export-types")]
use ts_rs::TS;

/// A markdown note from a vault.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VaultNote {
    pub path: String,
    pub filename: String,
    pub title: String,
    pub tags: Vec<String>,
    pub created_at: Option<String>,
    pub modified_at: Option<String>,
    pub size_bytes: u64,
}


use crate::error::AppError;

pub struct VaultService;

impl VaultService {
    pub fn new() -> Self {
        Self
    }

    pub fn scan(&self, path: &str) -> Result<Vec<VaultNote>, AppError> {
        crate::vault::scan_vault(path).map_err(AppError::from)
    }

    pub fn read_note(&self, path: &str) -> Result<String, AppError> {
        crate::vault::read_note(path).map_err(AppError::from)
    }

    pub fn init(&self, vault_path: &str, project_name: &str) -> Result<(), AppError> {
        crate::vault::init_vault(vault_path, project_name).map_err(AppError::from)
    }
}
