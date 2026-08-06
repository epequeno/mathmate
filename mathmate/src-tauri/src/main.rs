// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // Load .env from the project root (two levels up from src-tauri/).
    // CARGO_MANIFEST_DIR is always src-tauri/ so this is reliable regardless
    // of which directory npm/cargo is invoked from.
    if let Ok(manifest_dir) = std::env::var("CARGO_MANIFEST_DIR") {
        let dotenv_path = std::path::Path::new(&manifest_dir)
            .join("..") // project root (mathmate/)
            .join(".env");
        let _ = dotenvy::from_path(&dotenv_path);
    }
    mathmate_lib::run()
}
