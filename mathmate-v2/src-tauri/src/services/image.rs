// ─── Image Service ────────────────────────────────────────────────────
//
// Owns image save/load/evict for sessions, plus user-selected file
// reading and recent-image discovery.  All paths resolve through the
// injected base_dir so the service is unit-testable.
//
// See: Implementation_Phase14C_RustServiceLayer.md § C.6

use std::path::PathBuf;

use crate::error::AppError;

// ─── ImageService ────────────────────────────────────────────────────

pub struct ImageService {
    base_dir: PathBuf,
}

impl ImageService {
    pub fn new(base_dir: PathBuf) -> Self {
        Self { base_dir }
    }

    fn images_dir(&self, session_id: &str) -> PathBuf {
        let mut p = self.base_dir.clone();
        p.push("sessions");
        p.push(session_id);
        p.push("images");
        p
    }

    /// Save a base64-encoded image to disk. Returns the filename.
    pub fn save(
        &self,
        session_id: &str,
        mime: &str,
        data_base64: &str,
    ) -> Result<String, AppError> {
        let dir = self.images_dir(session_id);
        std::fs::create_dir_all(&dir)
            .map_err(|e| AppError::internal(format!("Failed to create images dir: {}", e)))?;

        let ext = match mime {
            "image/png" => "png",
            "image/jpeg" | "image/jpg" => "jpg",
            "image/gif" => "gif",
            "image/webp" => "webp",
            _ => "bin",
        };
        let filename = format!("{}.{}", uuid_v4(), ext);
        let path = dir.join(&filename);

        use base64::Engine;
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(data_base64)
            .map_err(|e| AppError::validation(format!("Failed to decode base64: {}", e)))?;

        std::fs::write(&path, &bytes)
            .map_err(|e| AppError::internal(format!("Failed to write image: {}", e)))?;

        Ok(filename)
    }

    /// Load an image as (mime, base64).
    pub fn load(&self, session_id: &str, filename: &str) -> Result<(String, String), AppError> {
        let path = self.images_dir(session_id).join(filename);
        if !path.exists() {
            return Err(AppError::not_found(format!("Image not found: {}", filename)));
        }
        let bytes = std::fs::read(&path)
            .map_err(|e| AppError::internal(format!("Failed to read image: {}", e)))?;
        use base64::Engine;
        let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
        let mime = match path.extension().and_then(|e| e.to_str()) {
            Some("png") => "image/png",
            Some("jpg") | Some("jpeg") => "image/jpeg",
            Some("gif") => "image/gif",
            Some("webp") => "image/webp",
            _ => "application/octet-stream",
        };
        Ok((mime.to_string(), b64))
    }

    /// Delete all images for a session.
    pub fn evict(&self, session_id: &str) -> Result<(), AppError> {
        let dir = self.images_dir(session_id);
        if dir.exists() {
            std::fs::remove_dir_all(&dir)
                .map_err(|e| AppError::internal(format!("Failed to evict images: {}", e)))
        } else {
            Ok(())
        }
    }

    /// Read a user-selected file as base64 (bypasses path-scope guard).
    pub fn read_user_selected(&self, path: &str) -> Result<String, AppError> {
        let target = crate::pathscope::normalize_local_path(path)
            .map_err(|_| AppError::validation(format!("Invalid path: '{}'", path)))?;
        use base64::Engine;
        let data = std::fs::read(&target)
            .map_err(|e| AppError::internal(format!("Failed to read file: {}", e)))?;
        Ok(base64::engine::general_purpose::STANDARD.encode(&data))
    }

    /// List recently-modified images from common desktop directories.
    pub fn list_recent(&self, limit: usize) -> Result<Vec<RecentImageEntry>, AppError> {
        use std::time::UNIX_EPOCH;

        let home =
            dirs_next::home_dir().ok_or_else(|| AppError::internal("Cannot determine home dir"))?;
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
            let rd = match std::fs::read_dir(dir) {
                Ok(rd) => rd,
                Err(_) => continue,
            };
            for entry in rd.flatten() {
                let path = entry.path();
                if !path.is_file() {
                    continue;
                }
                let ext = path
                    .extension()
                    .and_then(|e| e.to_str())
                    .unwrap_or("")
                    .to_lowercase();
                if !image_exts.contains(&ext.as_str()) {
                    continue;
                }
                let Ok(meta) = std::fs::metadata(&path) else {
                    continue;
                };
                let filename = path
                    .file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_default();
                entries.push(RecentImageEntry {
                    path: path.to_string_lossy().to_string(),
                    filename,
                    modified_at: meta
                        .modified()
                        .ok()
                        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                        .map(|d| d.as_secs() as i64)
                        .unwrap_or(0),
                    size_bytes: meta.len(),
                });
            }
        }
        entries.sort_by(|a, b| b.modified_at.cmp(&a.modified_at));
        entries.truncate(limit);
        Ok(entries)
    }
}

// ─── Types ────────────────────────────────────────────────────────────

#[derive(serde::Serialize, Debug, Clone)]
pub struct RecentImageEntry {
    pub path: String,
    pub filename: String,
    pub modified_at: i64,
    pub size_bytes: u64,
}

// ─── Helpers ──────────────────────────────────────────────────────────

fn uuid_v4() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    let secs = now.as_secs();
    let nanos = now.subsec_nanos();
    format!("img{:08x}{:08x}{:04x}", secs, nanos, rand_u16())
}

fn rand_u16() -> u16 {
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

// ─── Tests ───────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_service() -> (ImageService, PathBuf) {
        use std::sync::atomic::{AtomicU32, Ordering};
        static COUNTER: AtomicU32 = AtomicU32::new(0);
        let n = COUNTER.fetch_add(1, Ordering::Relaxed);
        let dir = std::env::temp_dir().join(format!("mathmate_img_{}", n));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let svc = ImageService::new(dir.clone());
        (svc, dir)
    }

    #[test]
    fn test_save_and_load_image() {
        let (svc, dir) = temp_service();
        // 1×1 red PNG in base64
        let b64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPj/HwADBwIAMCbHYQAAAABJRU5ErkJggg==";
        let filename = svc.save("sess-1", "image/png", b64).unwrap();
        assert!(filename.ends_with(".png"));

        let (mime, data) = svc.load("sess-1", &filename).unwrap();
        assert_eq!(mime, "image/png");
        assert_eq!(data, b64);

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn test_evict_images() {
        let (svc, dir) = temp_service();
        let b64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPj/HwADBwIAMCbHYQAAAABJRU5ErkJggg==";
        let filename = svc.save("sess-1", "image/png", b64).unwrap();

        svc.evict("sess-1").unwrap();
        // Load should fail
        let err = svc.load("sess-1", &filename).unwrap_err();
        assert_eq!(err.kind(), "not_found");

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn test_load_nonexistent_image() {
        let (svc, dir) = temp_service();
        let err = svc.load("sess-1", "nonexistent.png").unwrap_err();
        assert_eq!(err.kind(), "not_found");
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn test_evict_nonexistent_session() {
        let (svc, dir) = temp_service();
        svc.evict("no-such-session").unwrap(); // should not panic
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn test_list_recent_does_not_panic() {
        let (svc, dir) = temp_service();
        // list_recent scans the real home directory (not the temp base_dir),
        // so it may return entries or empty — the key is it doesn't panic.
        let _entries = svc.list_recent(10).unwrap();
        std::fs::remove_dir_all(&dir).ok();
    }
}
