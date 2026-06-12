/// Audit logging for MathMate security events.
///
/// Writes to `~/.mathmate/audit.log` with automatic rotation at 1 MB.
/// Each line is a tab-separated record: `timestamp  event  field=value  ...`
use std::io::Write;
use std::path::PathBuf;

/// Path to the audit log file.
fn audit_path() -> PathBuf {
    let mut p = dirs_next::home_dir().unwrap_or_else(|| PathBuf::from("/tmp"));
    p.push(".mathmate");
    let _ = std::fs::create_dir_all(&p);
    p.push("audit.log");
    p
}

/// Rotate the audit log if it exceeds `max_bytes`.
fn rotate_if_needed(max_bytes: u64) -> Result<(), String> {
    let path = audit_path();
    if !path.exists() {
        return Ok(());
    }
    if let Ok(meta) = std::fs::metadata(&path) {
        if meta.len() < max_bytes {
            return Ok(());
        }
        let backup = path.with_extension("log.1");
        let _ = std::fs::rename(&path, &backup);
    }
    Ok(())
}

/// Append a line to the audit log.
fn append(line: &str) -> Result<(), String> {
    rotate_if_needed(1024 * 1024)?; // 1 MB
    let path = audit_path();
    let mut file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|e| format!("Failed to open audit log: {}", e))?;
    writeln!(file, "{}", line).map_err(|e| format!("Failed to write audit log: {}", e))?;
    Ok(())
}

/// Log a successful wrap-up save.
pub fn log_wrapup(
    timestamp: &str,
    session_id: &str,
    vault_path: &str,
    target: &str,
    bytes: usize,
    sha256: &str,
) -> Result<(), String> {
    let line = format!(
        "{}\twrapup\tsession={}\tvault={}\ttarget={}\tbytes={}\tsha256={}",
        timestamp, session_id, vault_path, target, bytes, sha256,
    );
    append(&line)
}

/// Log a path-scope violation (a blocked path attempt).
#[allow(dead_code)]
pub fn log_path_scope_violation(
    timestamp: &str,
    command: &str,
    path: &str,
    reason: &str,
) -> Result<(), String> {
    let line = format!(
        "{}\tviolation\tcommand={}\tpath={}\treason={}",
        timestamp, command, path, reason,
    );
    append(&line)
}

// ─── Tests ───────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_log_wrapup_roundtrip() {
        let ts = "2026-06-01T12:00:00Z";
        let result = log_wrapup(
            ts,
            "sess-1",
            "/Users/x/Vault",
            "/Users/x/Vault/study.md",
            256,
            "abc123",
        );
        assert!(result.is_ok());

        // Read back from the audit log — check the line exists somewhere
        let path = audit_path();
        let content = std::fs::read_to_string(&path).unwrap_or_default();
        assert!(content.contains("sess-1"), "missing sess-1 in audit log");
        assert!(content.contains("abc123"), "missing hash in audit log");
    }

    #[test]
    fn test_log_violation() {
        let ts = "2026-06-01T12:30:00Z";
        let result =
            log_path_scope_violation(ts, "open_path", "/etc/passwd", "outside allowed roots");
        assert!(result.is_ok());

        let path = audit_path();
        let content = std::fs::read_to_string(&path).unwrap();
        assert!(content.contains("violation"));
        assert!(content.contains("open_path"));
    }

    #[test]
    fn test_rotate() {
        // Force rotation by writing a tiny max
        let path = audit_path();
        // Write enough to exceed the tiny limit
        for _ in 0..5 {
            let _ = append("test line for rotation");
        }
        // Rename existing log to .1 to simulate rotation target
        let backup = path.with_extension("log.1");
        let _ = std::fs::write(&path, "x".repeat(100));

        // Now rotate with small limit
        rotate_if_needed(50).ok();
        assert!(backup.exists());
        let _ = std::fs::remove_file(&backup);
    }
}
