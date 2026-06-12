use std::path::PathBuf;

/// Save a base64-encoded image to disk for a session.
/// Returns the filename (UUID + extension).
pub fn save_image(session_id: &str, mime: &str, data_base64: &str) -> Result<String, String> {
    let dir = images_dir(session_id);
    std::fs::create_dir_all(&dir).map_err(|e| format!("Failed to create images dir: {}", e))?;

    let ext = match mime {
        "image/png" => "png",
        "image/jpeg" | "image/jpg" => "jpg",
        "image/gif" => "gif",
        "image/webp" => "webp",
        _ => "bin",
    };
    let filename = format!("{}.{}", uuid_v4(), ext);
    let path = dir.join(&filename);

    // Decode base64 to binary
    use base64::Engine;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(data_base64)
        .map_err(|e| format!("Failed to decode base64: {}", e))?;

    std::fs::write(&path, &bytes).map_err(|e| format!("Failed to write image: {}", e))?;

    Ok(filename)
}

/// Load an image as base64 from disk.
pub fn load_image(session_id: &str, filename: &str) -> Result<(String, String), String> {
    let path = images_dir(session_id).join(filename);

    if !path.exists() {
        return Err(format!("Image not found: {}", filename));
    }

    let bytes = std::fs::read(&path).map_err(|e| format!("Failed to read image: {}", e))?;
    use base64::Engine;
    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);

    // Infer mime from extension
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
pub fn evict_session_images(session_id: &str) -> Result<(), String> {
    let dir = images_dir(session_id);
    if dir.exists() {
        std::fs::remove_dir_all(&dir).map_err(|e| format!("Failed to evict images: {}", e))
    } else {
        Ok(())
    }
}

/// Get path to session images directory.
fn images_dir(session_id: &str) -> PathBuf {
    let mut p = dirs_next::home_dir().unwrap_or_else(|| PathBuf::from("/tmp"));
    p.push(".mathmate");
    p.push("sessions");
    p.push(session_id);
    p.push("images");
    p
}

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
