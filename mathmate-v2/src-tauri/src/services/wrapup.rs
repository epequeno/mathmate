// ─── Wrap‑Up Service ─────────────────────────────────────────────────
//
// Generates and persists study wrap‑ups.  Delegates to `crate::wrapup`
// free functions for the AI‑generation logic.
//
// See: Implementation_Phase14C_RustServiceLayer.md § C.6

pub use crate::wrapup::WrapUpResult;

use crate::error::AppError;

pub struct WrapUpService;

impl WrapUpService {
    pub fn new() -> Self {
        Self
    }

    /// Generate a wrap‑up for a session (calls legacy `session::load_session`).
    pub fn generate(&self, session_id: &str) -> Result<WrapUpResult, AppError> {
        crate::wrapup::generate_wrap_up(session_id).map_err(AppError::from)
    }

    /// Persist a wrap‑up to the vault.
    pub fn save(
        &self,
        project_name: &str,
        vault_path: &str,
        content: &str,
        session_id: &str,
    ) -> Result<String, AppError> {
        crate::wrapup::save_wrap_up(project_name, vault_path, content, session_id)
            .map_err(AppError::from)
    }
}
