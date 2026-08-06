// ─── Centralised path-scope guard ─────────────────────────────────────
//
// Every file-touching Tauri command must route through this module's
// `guard` method.  It normalises the path, verifies it is inside an
// allowed root, and optionally checks the file extension.
//
// This replaces four near-identical inline reimplementations that
// previously lived in lib.rs (read_file_as_base64, read_user_selected_file,
// read_note, scan_vault, open_path, read_project_textbook, extract_pdf_toc,
// init_vault).
//
// See: Implementation_Phase14C_RustServiceLayer.md § C.3

use std::path::{Path, PathBuf};

use crate::error::AppError;
use crate::pathscope;

// ─── PathScope ───────────────────────────────────────────────────────

/// Centralised path-scope guard.
///
/// Stateless — all logic delegates to the existing `pathscope` module.
/// The guard acts as the single control point so future changes (additional
/// roots, different policies) only need editing in one place.
pub struct PathScope;

impl PathScope {
    pub fn new() -> Self {
        Self
    }

    /// Validate and canonicalise a path string.
    ///
    /// # Arguments
    /// * `raw_path` — The untrusted path string from the frontend.
    /// * `project_id` — Optional project ID used to resolve vault +
    ///   textbook roots via `build_allowed_roots`.
    /// * `check_extension` — If true, reject paths whose extension is
    ///   not in the `pathscope::safe_extension` allowlist.
    ///
    /// # Returns
    /// The canonicalised `PathBuf` on success, or an `AppError::AccessDenied`
    /// if the path is invalid, outside roots, or has a disallowed extension.
    pub fn guard(
        &self,
        raw_path: &str,
        project_id: Option<&str>,
        check_extension: bool,
    ) -> Result<PathBuf, AppError> {
        // 1. Normalise — reject non-file schemes, expand ~, etc.
        let target = pathscope::normalize_local_path(raw_path)
            .map_err(|_| AppError::access_denied(format!("Invalid path: '{}'", raw_path)))?;

        // 2. Optional extension check
        if check_extension && !pathscope::safe_extension(&target) {
            return Err(AppError::access_denied(format!(
                "Extension not allowed for '{}'",
                raw_path
            )));
        }

        // 3. Build allowed roots
        let roots = build_allowed_roots(project_id);

        // 4. Containment check
        if !pathscope::canonical_inside_any(&roots, &target) {
            return Err(AppError::access_denied(format!(
                "'{}' is outside allowed roots",
                raw_path
            )));
        }

        Ok(target)
    }

    /// Like `guard` but returns `(canonical_path, is_inside)` without
    /// rejecting the path.  Used by `open_path` which implements a
    /// two-step confirmation flow for paths outside the vault.
    pub fn guard_soft(
        &self,
        raw_path: &str,
        project_id: Option<&str>,
        check_extension: bool,
    ) -> Result<(PathBuf, bool), AppError> {
        // 1. Normalise
        let target = pathscope::normalize_local_path(raw_path)
            .map_err(|_| AppError::access_denied(format!("Invalid path: '{}'", raw_path)))?;

        // 2. Extension check
        if check_extension && !pathscope::safe_extension(&target) {
            return Err(AppError::access_denied(format!(
                "Extension not allowed for '{}'",
                raw_path
            )));
        }

        // 3. Build allowed roots
        let roots = build_allowed_roots(project_id);

        // 4. Check containment — but don't reject
        let inside = pathscope::canonical_inside_any(&roots, &target);

        Ok((target, inside))
    }

    /// Open a file/folder with the OS default handler.
    ///
    /// This is a pure side-effect method that lives here because it's
    /// always paired with a `guard` call and the two should stay co-located.
    pub fn open_with_system(&self, target: &Path) -> Result<(), AppError> {
        let path_str = target.to_string_lossy().to_string();
        #[cfg(target_os = "macos")]
        {
            std::process::Command::new("open")
                .arg(&path_str)
                .spawn()
                .map_err(|e| {
                    AppError::internal(format!("Failed to open '{}': {}", path_str, e))
                })?;
        }
        #[cfg(target_os = "linux")]
        {
            std::process::Command::new("xdg-open")
                .arg(&path_str)
                .spawn()
                .map_err(|e| {
                    AppError::internal(format!("Failed to open '{}': {}", path_str, e))
                })?;
        }
        #[cfg(target_os = "windows")]
        {
            std::process::Command::new("cmd")
                .args(["/C", "start", "", &path_str])
                .spawn()
                .map_err(|e| {
                    AppError::internal(format!("Failed to open '{}': {}", path_str, e))
                })?;
        }
        #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
        {
            return Err(AppError::internal("Unsupported OS"));
        }
        Ok(())
    }
}

// ─── Allowed roots builder (shared helper) ───────────────────────────

/// Build the list of allowed filesystem roots for a given project.
///
/// Always includes `~/.mathmate/` (plus its `sessions/` and `projects/`
/// subdirectories).  If a project ID is provided, the project's vault
/// and textbook paths are also added.
///
/// This is the canonical source for the root list.  It was previously
/// a free function in `lib.rs`; moving it here co-locates it with the
/// guard that depends on it.
pub fn build_allowed_roots(project_id: Option<&str>) -> Vec<PathBuf> {
    let mut roots: Vec<PathBuf> = Vec::new();

    // Always include ~/.mathmate/
    if let Some(home) = dirs_next::home_dir() {
        roots.push(home.join(".mathmate"));
        roots.push(home.join(".mathmate/sessions"));
        roots.push(home.join(".mathmate/projects"));
    }

    // Resolve project roots
    if let Some(pid) = project_id {
        if let Ok(project) = crate::project::load_project(pid) {
            if let Some(ref vp) = project.vault_path {
                roots.push(PathBuf::from(vp));
            }
            if let Some(ref tp) = project.textbook_path {
                let tb_path = PathBuf::from(tp);
                if let Some(parent) = tb_path.parent() {
                    roots.push(parent.to_path_buf());
                }
                roots.push(tb_path);
            }
        }
    }

    roots
}

// ─── Tests ───────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn make_temp_dir(prefix: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(prefix);
        let _ = std::fs::create_dir_all(&dir);
        dir
    }

    fn cleanup(dir: &PathBuf) {
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn test_guard_valid_path_inside_root() {
        let vault = make_temp_dir("pathscope_guard_valid");
        let note = vault.join("notes/test.md");
        std::fs::create_dir_all(note.parent().unwrap()).unwrap();
        std::fs::write(&note, "# hello").unwrap();

        let _guard = PathScope::new();
        // Build a fake env where roots includes this vault
        // (test uses the fact that build_allowed_roots won't find a real
        // project for a random ID, so we check the hard-rejection path
        // separately below).
        //
        // For a meaningful test we need a real project, which requires
        // the project module.  Skip integration-style tests for now —
        // unit-test the rejection paths instead.
        cleanup(&vault);
    }

    #[test]
    fn test_guard_invalid_scheme() {
        let guard = PathScope::new();
        let err = guard
            .guard("https://evil.com/payload", None, false)
            .unwrap_err();
        assert_eq!(err.kind(), "access_denied");
        assert!(err.to_string().contains("Invalid path"));
    }

    #[test]
    fn test_guard_empty_path() {
        let guard = PathScope::new();
        let err = guard.guard("", None, false).unwrap_err();
        assert_eq!(err.kind(), "access_denied");
    }

    #[test]
    fn test_guard_dangerous_extension() {
        let guard = PathScope::new();
        let err = guard
            .guard("/tmp/evil.sh", None, true)
            .unwrap_err();
        assert_eq!(err.kind(), "access_denied");
        assert!(err.to_string().contains("Extension"));
    }

    #[test]
    fn test_guard_ok_extension_when_check_false() {
        // Even "dangerous" extensions pass when check_extension is false
        let guard = PathScope::new();
        // This will fail at containment (no roots match), but that's a
        // different error — should NOT be an extension error.
        let err = guard.guard("/tmp/evil.sh", None, false).unwrap_err();
        assert_eq!(err.kind(), "access_denied");
        assert!(!err.to_string().contains("Extension"));
    }

    #[test]
    fn test_guard_soft_returns_inside_flag() {
        let guard = PathScope::new();
        let (path, inside) = guard
            .guard_soft("/tmp/test.md", None, false)
            .unwrap();
        // /tmp should not be inside allowed roots
        assert!(!inside);
        assert!(path.ends_with("test.md"));
    }

    #[test]
    fn test_build_allowed_roots_includes_mathmate() {
        let roots = build_allowed_roots(None);
        let has_mathmate = roots
            .iter()
            .any(|r| r.to_string_lossy().contains(".mathmate"));
        assert!(has_mathmate, "roots should include ~/.mathmate");
    }
}
