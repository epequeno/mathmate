use serde::{Deserialize, Serialize};

/// Metadata extracted from a PDF textbook.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TextbookMetadata {
    pub path: String,
    pub title: Option<String>,
    pub file_size_bytes: u64,
    pub page_count: Option<u32>,
}

/// Read basic PDF metadata (file size + attempt to extract page count).
/// Uses a simple heuristic: reads the last `trailer` cross-reference for page count
/// or falls back to file size only.
pub fn read_textbook_metadata(path: &str) -> Result<TextbookMetadata, String> {
    let metadata =
        std::fs::metadata(path).map_err(|e| format!("Failed to read textbook file: {}", e))?;

    let file_size_bytes = metadata.len();
    let title = std::path::Path::new(path)
        .file_stem()
        .map(|s| s.to_string_lossy().to_string());

    // Simple page count heuristic: count /Page entries in the PDF
    // This is not fully robust but works for most well-formed PDFs
    let page_count = estimate_page_count(path);

    Ok(TextbookMetadata {
        path: path.to_string(),
        title,
        file_size_bytes,
        page_count,
    })
}

fn estimate_page_count(path: &str) -> Option<u32> {
    // Read the file in chunks and look for /Type /Page entries
    // (excluding /Type /Pages which is the page tree node)
    use std::io::{BufRead, BufReader};

    let file = std::fs::File::open(path).ok()?;
    let reader = BufReader::with_capacity(65536, file);

    let mut count = 0u32;
    for line in reader.lines() {
        let line = line.ok()?;
        if line.contains("/Type /Page") && !line.contains("/Type /Pages") {
            count += 1;
        }
    }

    if count > 0 {
        Some(count)
    } else {
        None
    }
}
