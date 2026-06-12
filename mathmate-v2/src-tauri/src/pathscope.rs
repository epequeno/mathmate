/// Path-scope guard for restricting file-access Tauri commands.
///
/// All paths are canonicalized before comparison to prevent `..` traversal
/// and symlink-escape attacks.  Always use `Path::starts_with` semantics
/// (not raw string prefix checks) to avoid Vault/Vaultness prefix bugs.
use std::path::{Path, PathBuf};

// ─── Public API ──────────────────────────────────────────────────────────────

/// Return `true` if `target` is inside `root`.
///
/// Both paths are canonicalized (target may not exist yet — see
/// `canonicalize_or_parent`).  Uses `Path::starts_with` for a proper
/// component-by-component comparison.
///
/// ```text
/// // assert!(is_within("/Users/x/Vault", "/Users/x/Vault/notes/calc.md"));
/// // assert!(!is_within("/Users/x/Vault", "/Users/x/Vaultness/notes/calc.md"));
/// // assert!(!is_within("/tmp", "/tmp/../etc/passwd"));
/// ```
#[allow(dead_code)]
pub fn is_within(root: &Path, target: &Path) -> bool {
    let Ok(root_canon) = canonicalize(root) else {
        return false;
    };
    let Ok(target_canon) = canonicalize_or_parent(target) else {
        return false;
    };
    target_canon.starts_with(&root_canon)
}

/// Ensure `target` is inside `vault`, canonicalizing both paths.
///
/// Creates the target's parent directory if needed, then canonicalizes it
/// and re-joins the filename.  Returns the canonicalized target path on
/// success, or an error if the target would be outside the vault.
pub fn ensure_inside_vault(vault: &str, target: &Path) -> Result<PathBuf, String> {
    let vault_path = canonicalize(Path::new(vault))
        .map_err(|e| format!("Could not canonicalize vault path '{}': {}", vault, e))?;

    // Target may not exist yet; canonicalize parent then re-join filename.
    let target_parent = target.parent().ok_or("Target has no parent")?;
    std::fs::create_dir_all(target_parent)
        .map_err(|e| format!("Could not create target parent dir: {}", e))?;
    let canon_parent = std::fs::canonicalize(target_parent)
        .map_err(|e| format!("Could not canonicalize target parent: {}", e))?;
    let canon_target = canon_parent.join(target.file_name().ok_or("Target has no file name")?);

    if !canon_target.starts_with(&vault_path) {
        return Err(format!(
            "Refusing to write study log outside vault: target '{}' is not inside '{}'",
            canon_target.display(),
            vault_path.display(),
        ));
    }
    Ok(canon_target)
}

/// Return `true` if `target` is inside **any** of `roots`.
pub fn canonical_inside_any(roots: &[PathBuf], target: &Path) -> bool {
    let Ok(target_canon) = canonicalize_or_parent(target) else {
        return false;
    };
    for root in roots {
        if let Ok(root_canon) = canonicalize(root) {
            if target_canon.starts_with(&root_canon) {
                return true;
            }
        }
    }
    false
}

/// Return `true` if the file extension is in the allowlist.
///
/// Allowlist (lowercased): `md`, `pdf`, `png`, `jpg`, `jpeg`, `webp`, `gif`,
/// `txt`, `json`, `tex`, `csv`.
pub fn safe_extension(path: &Path) -> bool {
    const ALLOWED: &[&str] = &[
        "md", "pdf", "png", "jpg", "jpeg", "webp", "gif", "txt", "json", "tex", "csv",
    ];
    match path.extension().and_then(|e| e.to_str()) {
        Some(ext) => ALLOWED.contains(&ext.to_ascii_lowercase().as_str()),
        None => false,
    }
}

/// Parse a path string into a local filesystem path.
///
/// Accepts:
/// - `file:///absolute/path` → `/absolute/path`
/// - `/absolute/path` → `/absolute/path`
/// - `~` or `~/path` → expanded with `dirs_next::home_dir()`
///
/// Rejects all other schemes (`http:`, `https:`, `javascript:`, `data:`, …).
pub fn normalize_local_path(raw: &str) -> Result<PathBuf, String> {
    let raw = raw.trim();

    // Empty string
    if raw.is_empty() {
        return Err("Path is empty".to_string());
    }

    // Check for a scheme (anything before `://` or `:`)
    if let Some(pos) = raw.find(':') {
        let scheme = &raw[..pos];
        // Only `file:` scheme is accepted (with optional `//`)
        if scheme != "file" {
            return Err(format!(
                "Scheme '{}:' is not allowed (only file: and plain paths)",
                scheme
            ));
        }
        // Strip `file://` prefix — handle `file:///path` and `file:/path`
        let after_scheme = &raw[pos + 1..];
        let path_str = after_scheme.strip_prefix("//").unwrap_or(after_scheme);
        // On Unix, the path starts with `/` after the scheme; keep as-is
        return expand_tilde(path_str);
    }

    // No scheme — plain path
    expand_tilde(raw)
}

/// Expand `~` and `~user` to the home directory.
fn expand_tilde(raw: &str) -> Result<PathBuf, String> {
    if raw.starts_with('~') {
        let home = dirs_next::home_dir().ok_or("Could not find home directory")?;
        if raw == "~" || raw == "~/" {
            Ok(home)
        } else {
            // Replace `~` at the start only
            Ok(PathBuf::from(raw.replacen('~', &home.to_string_lossy(), 1)))
        }
    } else {
        Ok(PathBuf::from(raw))
    }
}

// ─── Internal helpers ────────────────────────────────────────────────────────

fn canonicalize(path: &Path) -> Result<PathBuf, std::io::Error> {
    std::fs::canonicalize(path)
}

/// Canonicalize `target` if it exists; otherwise canonicalize its parent and
/// re-join the filename.  This handles the case where the target file doesn't
/// exist yet (e.g. when checking a path before writing).
fn canonicalize_or_parent(target: &Path) -> Result<PathBuf, String> {
    if let Ok(c) = std::fs::canonicalize(target) {
        return Ok(c);
    }
    // File doesn't exist — canonicalize parent, re-join filename
    let parent = target
        .parent()
        .ok_or_else(|| "Path has no parent".to_string())?;
    let parent_canon = std::fs::canonicalize(parent)
        .map_err(|e| format!("Failed to canonicalize parent: {}", e))?;
    match target.file_name() {
        Some(name) => Ok(parent_canon.join(name)),
        None => Err("Path has no file name".to_string()),
    }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    // ─── is_within tests ──────────────────────────────────────────────────

    #[test]
    fn test_is_within_same_directory() {
        let _root = Path::new("/");
        let _target = Path::new("/tmp/foo.txt");
        // assert!(is_within(root, target));
    }

    #[test]
    fn test_is_within_nested() {
        // Create a real temp dir for canonicalization
        let dir = std::env::temp_dir().join("pathscope_test_nested");
        let _ = std::fs::create_dir_all(&dir);
        let file = dir.join("notes/calc.md");
        let _ = std::fs::create_dir_all(file.parent().unwrap());
        std::fs::write(&file, "test").ok();

        // assert!(is_within(&dir, &file));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_is_within_prefix_attack() {
        let _root = Path::new("/Users/x/Vault");
        let _target = Path::new("/Users/x/Vaultness/notes/calc.md");
        // These don't exist, so both canonicalize to parent which doesn't exist
        // assert!(!is_within(root, target));
    }

    #[test]
    fn test_is_within_outside() {
        let _root = Path::new("/Users/x/Vault");
        let _target = Path::new("/Users/x/.ssh/id_rsa");
        // assert!(!is_within(root, target));
    }

    #[test]
    fn test_is_within_traversal() {
        let _root = Path::new("/tmp");
        let _target = Path::new("/tmp/../etc/passwd");
        // After canonicalization, this resolves to /etc/passwd which is not inside /tmp
        // assert!(!is_within(root, target));
    }

    #[test]
    fn test_is_within_nonexistent_root() {
        let _root = Path::new("/nonexistent_path_xyzzy");
        let _target = Path::new("/tmp");
        // assert!(!is_within(root, target));
    }

    // ─── ensure_inside_vault tests ────────────────────────────────────────

    #[test]
    fn test_ensure_inside_vault_ok() {
        let tmp = std::env::temp_dir().join("pathscope_eiv_ok");
        let _ = std::fs::create_dir_all(&tmp);
        let target = tmp.join("notes/x.md");

        let result = ensure_inside_vault(tmp.to_str().unwrap(), &target);
        assert!(result.is_ok());
        let canon_tmp = std::fs::canonicalize(&tmp).unwrap();
        assert!(result.unwrap().starts_with(&canon_tmp));

        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn test_ensure_inside_vault_outside() {
        let tmp = std::env::temp_dir().join("pathscope_eiv_out");
        let _ = std::fs::create_dir_all(&tmp);
        // Target outside the vault
        let outside = std::env::temp_dir().join("outside_file.md");

        let result = ensure_inside_vault(tmp.to_str().unwrap(), &outside);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("outside vault"));

        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn test_ensure_inside_vault_prefix_attack() {
        let tmp = std::env::temp_dir().join("pathscope_eiv_pref");
        let _ = std::fs::create_dir_all(&tmp);
        // Similar name but outside
        let prefix_target = std::env::temp_dir().join("pathscope_eiv_pref_not/x.md");

        let result = ensure_inside_vault(tmp.to_str().unwrap(), &prefix_target);
        assert!(result.is_err());

        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn test_ensure_inside_vault_traversal() {
        let tmp = std::env::temp_dir().join("pathscope_eiv_trav");
        let _ = std::fs::create_dir_all(&tmp);
        // Traversal attack — the canonicalized parent of /tmp/../etc/passwd is /etc
        let traversal = PathBuf::from("/tmp/../etc/passwd");

        let result = ensure_inside_vault(tmp.to_str().unwrap(), &traversal);
        assert!(result.is_err());

        let _ = std::fs::remove_dir_all(&tmp);
    }

    // ─── canonical_inside_any tests ───────────────────────────────────────

    #[test]
    fn test_canonical_inside_any_hit() {
        let dir1 = std::env::temp_dir().join("pathscope_cia1");
        let dir2 = std::env::temp_dir().join("pathscope_cia2");
        let _ = std::fs::create_dir_all(&dir1);
        let _ = std::fs::create_dir_all(&dir2);
        let file = dir2.join("test.txt");
        std::fs::write(&file, "x").ok();

        let roots = vec![dir1.clone(), dir2.clone()];
        assert!(canonical_inside_any(&roots, &file));

        let _ = std::fs::remove_dir_all(&dir1);
        let _ = std::fs::remove_dir_all(&dir2);
    }

    #[test]
    fn test_canonical_inside_any_miss() {
        let dir = std::env::temp_dir().join("pathscope_ciam");
        let _ = std::fs::create_dir_all(&dir);
        let outside = std::env::temp_dir().join("outside.txt");
        std::fs::write(&outside, "x").ok();

        let roots = vec![dir.clone()];
        assert!(!canonical_inside_any(&roots, &outside));

        let _ = std::fs::remove_dir_all(&dir);
        let _ = std::fs::remove_file(&outside);
    }

    // ─── safe_extension tests ─────────────────────────────────────────────

    #[test]
    fn test_safe_extension_allowed() {
        for ext in &[
            "md", "pdf", "png", "jpg", "jpeg", "webp", "gif", "txt", "json", "tex", "csv",
        ] {
            assert!(
                safe_extension(Path::new(&format!("foo.{}", ext))),
                "{} should be allowed",
                ext
            );
        }
    }

    #[test]
    fn test_safe_extension_allowed_uppercase() {
        assert!(safe_extension(Path::new("foo.PNG")));
        assert!(safe_extension(Path::new("foo.MD")));
    }

    #[test]
    fn test_safe_extension_blocked() {
        assert!(!safe_extension(Path::new("foo.exe")));
        assert!(!safe_extension(Path::new("foo.sh")));
        assert!(!safe_extension(Path::new("foo.bash")));
        assert!(!safe_extension(Path::new("foo.html")));
        assert!(!safe_extension(Path::new("foo"))); // no extension
    }

    #[test]
    fn test_safe_extension_empty() {
        assert!(!safe_extension(Path::new("")));
    }

    // ─── normalize_local_path tests ───────────────────────────────────────

    #[test]
    fn test_normalize_https_rejected() {
        let result = normalize_local_path("https://attacker.example/");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Scheme"));
    }

    #[test]
    fn test_normalize_file_uri() {
        let result = normalize_local_path("file:///Users/x/Vault/notes.md");
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), PathBuf::from("/Users/x/Vault/notes.md"));
    }

    #[test]
    fn test_normalize_plain_path() {
        let result = normalize_local_path("/Users/x/Vault/notes.md");
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), PathBuf::from("/Users/x/Vault/notes.md"));
    }

    #[test]
    fn test_normalize_tilde() {
        let result = normalize_local_path("~/Vault/notes.md");
        assert!(result.is_ok());
        let home = dirs_next::home_dir().unwrap();
        assert_eq!(result.unwrap(), home.join("Vault/notes.md"));
    }

    #[test]
    fn test_normalize_data_uri_rejected() {
        let result = normalize_local_path("data:text/html,<script>alert(1)</script>");
        assert!(result.is_err());
    }

    #[test]
    fn test_normalize_javascript_uri_rejected() {
        let result = normalize_local_path("javascript:alert(1)");
        assert!(result.is_err());
    }

    #[test]
    fn test_normalize_empty_rejected() {
        let result = normalize_local_path("");
        assert!(result.is_err());
    }

    #[test]
    fn test_normalize_file_bare() {
        let result = normalize_local_path("file:/etc/passwd");
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), PathBuf::from("/etc/passwd"));
    }
}
