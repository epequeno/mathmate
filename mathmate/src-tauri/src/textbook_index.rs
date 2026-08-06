use serde::{Deserialize, Serialize};
use std::path::PathBuf;

// ─── Public Types ───────────────────────────────────────────────────────

/// Content of a single page extracted from a textbook PDF.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PageContent {
    pub page: u32,
    pub text: String,
}

/// Full search index for a textbook — stored as JSON on disk.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TextbookIndex {
    pub textbook_id: String,
    pub total_pages: u32,
    pub pages: Vec<PageContent>,
    pub indexed_at: String,
}

/// Lightweight metadata about a textbook index (quick status check).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TextbookIndexMeta {
    pub textbook_id: String,
    pub title: Option<String>,
    pub total_pages: u32,
    pub indexed_pages: u32,
    pub indexed_at: String,
    pub status: IndexStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum IndexStatus {
    #[serde(rename = "complete")]
    Complete,
    #[serde(rename = "indexing")]
    Indexing,
    #[serde(rename = "failed")]
    Failed,
}

/// One search result — a single page match with a highlighted snippet.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResult {
    pub page: u32,
    pub score: f64,
    pub snippet: String,
}

pub struct SearchQuery {
    pub query: String,
    pub max_results: Option<usize>,
}

// ─── Path Helpers ───────────────────────────────────────────────────────

/// Resolve the textbook library directory (`~/.mathmate/textbooks/`).
pub fn textbook_library_dir() -> Result<PathBuf, String> {
    let home = dirs_next::home_dir().ok_or_else(|| "Could not find home directory".to_string())?;
    let dir = home.join(".mathmate").join("textbooks");
    std::fs::create_dir_all(&dir)
        .map_err(|e| format!("Failed to create textbook library directory: {e}"))?;
    Ok(dir)
}

/// Derive a stable textbook ID from the absolute path to the PDF.
///
/// Uses a simple hash so that the same file always maps to the same ID,
/// regardless of how it was added (catalog download vs manual path).
fn textbook_id_from_path(pdf_path: &str) -> String {
    use sha2::Digest;
    let mut hasher = sha2::Sha256::new();
    hasher.update(pdf_path.as_bytes());
    let result = hasher.finalize();
    hex::encode(&result[..12]) // 24-char hex ID
}

fn index_path(textbook_id: &str) -> PathBuf {
    textbook_library_dir()
        .unwrap_or_else(|_| PathBuf::from("/tmp"))
        .join(format!("{textbook_id}_index.json"))
}

fn meta_path(textbook_id: &str) -> PathBuf {
    textbook_library_dir()
        .unwrap_or_else(|_| PathBuf::from("/tmp"))
        .join(format!("{textbook_id}_meta.json"))
}

// ─── Index Management ──────────────────────────────────────────────────

/// Compute a stable textbook ID from a PDF path.
///
/// Public so the frontend can derive the same ID for lookups.
pub fn derive_textbook_id(pdf_path: &str) -> String {
    // Normalize the path before hashing
    if let Ok(canonical) = std::fs::canonicalize(pdf_path) {
        textbook_id_from_path(canonical.to_string_lossy().as_ref())
    } else {
        textbook_id_from_path(pdf_path)
    }
}

/// Save a batch of page text into the index.
///
/// If the index doesn't exist, creates it. If `complete` is true,
/// marks the index as complete. Otherwise, marks as "indexing".
pub fn save_page_batch(
    textbook_id: &str,
    title: Option<String>,
    total_pages: u32,
    pages: Vec<PageContent>,
    complete: bool,
) -> Result<TextbookIndexMeta, String> {
    let now = chrono::Utc::now().to_rfc3339();

    // Load existing index or start fresh
    let mut index = load_index(textbook_id).unwrap_or(TextbookIndex {
        textbook_id: textbook_id.to_string(),
        total_pages,
        pages: Vec::new(),
        indexed_at: now.clone(),
    });

    // Merge new pages (replace if page already indexed)
    for new_page in pages {
        if let Some(existing) = index.pages.iter_mut().find(|p| p.page == new_page.page) {
            existing.text = new_page.text;
        } else {
            index.pages.push(new_page);
        }
    }

    // Sort pages by page number
    index.pages.sort_by_key(|p| p.page);
    index.total_pages = total_pages;
    index.indexed_at = now.clone();

    // Write index file
    let ipath = index_path(textbook_id);
    let json = serde_json::to_string_pretty(&index)
        .map_err(|e| format!("Failed to serialize index: {e}"))?;
    std::fs::write(&ipath, &json)
        .map_err(|e| format!("Failed to write index file: {e}"))?;

    // Build and write meta file
    let status = if complete {
        IndexStatus::Complete
    } else {
        IndexStatus::Indexing
    };

    let meta = TextbookIndexMeta {
        textbook_id: textbook_id.to_string(),
        title,
        total_pages,
        indexed_pages: index.pages.len() as u32,
        indexed_at: now,
        status,
    };

    let mpath = meta_path(textbook_id);
    let meta_json = serde_json::to_string_pretty(&meta)
        .map_err(|e| format!("Failed to serialize meta: {e}"))?;
    std::fs::write(&mpath, &meta_json)
        .map_err(|e| format!("Failed to write meta file: {e}"))?;

    Ok(meta)
}

/// Load the full index from disk.
pub fn load_index(textbook_id: &str) -> Result<TextbookIndex, String> {
    let ipath = index_path(textbook_id);
    let json = std::fs::read_to_string(&ipath)
        .map_err(|e| format!("Failed to read index file: {e}"))?;
    serde_json::from_str(&json)
        .map_err(|e| format!("Failed to parse index: {e}"))
}

/// Load just the metadata file (faster than loading the full index).
pub fn load_meta(textbook_id: &str) -> Result<TextbookIndexMeta, String> {
    let mpath = meta_path(textbook_id);
    let json = std::fs::read_to_string(&mpath)
        .map_err(|e| format!("Failed to read meta file: {e}"))?;
    serde_json::from_str(&json)
        .map_err(|e| format!("Failed to parse meta: {e}"))
}

/// Check whether a textbook has been fully indexed.
pub fn is_indexed(textbook_id: &str) -> bool {
    load_meta(textbook_id)
        .is_ok_and(|m| matches!(m.status, IndexStatus::Complete))
}

// ─── Search ─────────────────────────────────────────────────────────────

/// Search the index for pages matching the query.
///
/// Scoring algorithm:
/// - Count term frequency across each page
/// - Bonus for term matches near the start of page text (section headings)
/// - Return top-N results with a ~200-character snippet around the best match
pub fn search_index(index: &TextbookIndex, query: &SearchQuery) -> Vec<SearchResult> {
    let query_lower = query.query.to_lowercase();
    let terms: Vec<&str> = query_lower.split_whitespace().collect();

    if terms.is_empty() {
        return Vec::new();
    }

    let mut scored: Vec<(u32, f64, String)> = index
        .pages
        .iter()
        .map(|page| {
            let text_lower = page.text.to_lowercase();
            let mut score = 0.0_f64;

            for term in &terms {
                // Skip very short terms
                if term.len() < 2 {
                    continue;
                }

                // Term frequency
                let count = text_lower.matches(term).count() as f64;
                score += count * 2.0;

                // Bonus for matches near the start (first 200 chars = likely heading)
                let head = &text_lower[..text_lower.len().min(200)];
                if head.contains(term) {
                    score += 10.0;
                }

                // Exact phrase match (if query is quoted-like with words)
                if terms.len() > 1 && text_lower.contains(&query_lower) {
                    score += 15.0;
                }
            }

            let snippet = extract_snippet(&page.text, &terms);

            (page.page, score, snippet)
        })
        .collect();

    // Sort by score descending, take top N
    scored.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
    scored
        .into_iter()
        .filter(|(_, score, _)| *score > 0.0)
        .take(query.max_results.unwrap_or(5))
        .map(|(page, score, snippet)| SearchResult {
            page,
            score,
            snippet,
        })
        .collect()
}

/// Extract a ~200-character snippet around the best matching term.
fn extract_snippet(text: &str, terms: &[&str]) -> String {
    let text_lower = text.to_lowercase();

    // Find the first occurrence of any term
    let best_pos = terms
        .iter()
        .filter_map(|t| text_lower.find(t))
        .min()
        .unwrap_or(0);

    // Get a window around that position
    let window = 100; // chars on each side
    let start = best_pos.saturating_sub(window);
    let end = (best_pos + 200).min(text.len());

    let mut snippet = String::new();
    if start > 0 {
        snippet.push_str("…");
    }
    snippet.push_str(&text[start..end]);
    if end < text.len() {
        snippet.push_str("…");
    }

    // Clean up whitespace
    let cleaned: Vec<&str> = snippet.split_whitespace().collect();
    cleaned.join(" ")
}

// ─── Delete Index ───────────────────────────────────────────────────────

/// Remove the index files for a given textbook.
#[cfg(test)]
pub fn delete_index(textbook_id: &str) -> Result<(), String> {
    let ipath = index_path(textbook_id);
    let mpath = meta_path(textbook_id);

    if ipath.exists() {
        std::fs::remove_file(&ipath)
            .map_err(|e| format!("Failed to delete index file: {e}"))?;
    }
    if mpath.exists() {
        std::fs::remove_file(&mpath)
            .map_err(|e| format!("Failed to delete meta file: {e}"))?;
    }
    Ok(())
}

// ─── Tests ──────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_derive_textbook_id_is_stable() {
        // Use a path that definitely doesn't exist on disk
        let id1 = textbook_id_from_path("/fake/path/textbook.pdf");
        let id2 = textbook_id_from_path("/fake/path/textbook.pdf");
        assert_eq!(id1, id2, "Same path should produce the same ID");
        assert_eq!(id1.len(), 24, "ID should be 24 hex chars");
    }

    #[test]
    fn test_derive_textbook_id_different_paths() {
        let id1 = textbook_id_from_path("/path/a.pdf");
        let id2 = textbook_id_from_path("/path/b.pdf");
        assert_ne!(id1, id2, "Different paths should produce different IDs");
    }

    #[test]
    fn test_search_simple() {
        let index = TextbookIndex {
            textbook_id: "test".into(),
            total_pages: 3,
            pages: vec![
                PageContent {
                    page: 1,
                    text: "Introduction to calculus Limits and derivatives".into(),
                },
                PageContent {
                    page: 2,
                    text: "The integral is the area under a curve".into(),
                },
                PageContent {
                    page: 3,
                    text: "Applications of differential equations and derivatives".into(),
                },
            ],
            indexed_at: "2026-01-01T00:00:00Z".into(),
        };

        let query = SearchQuery {
            query: "derivative".into(),
            max_results: Some(5),
        };

        let results = search_index(&index, &query);
        assert_eq!(results.len(), 2, "Should match 2 pages containing 'derivative'");
        assert_eq!(results[0].page, 1, "Page 1 should rank highest");
    }

    #[test]
    fn test_search_no_match() {
        let index = TextbookIndex {
            textbook_id: "test".into(),
            total_pages: 1,
            pages: vec![PageContent {
                page: 1,
                text: "Linear algebra vector spaces".into(),
            }],
            indexed_at: "2026-01-01T00:00:00Z".into(),
        };

        let query = SearchQuery {
            query: "quantum".into(),
            max_results: Some(5),
        };

        let results = search_index(&index, &query);
        assert!(results.is_empty(), "Should return no results for non-matching query");
    }

    #[test]
    fn test_search_phrase_boost() {
        let index = TextbookIndex {
            textbook_id: "test".into(),
            total_pages: 2,
            pages: vec![
                PageContent {
                    page: 1,
                    text: "Linear algebra Linear algebra Linear algebra".into(),
                },
                PageContent {
                    page: 2,
                    text: "The derivative of a function. The derivative measures change.".into(),
                },
            ],
            indexed_at: "2026-01-01T00:00:00Z".into(),
        };

        let query = SearchQuery {
            query: "derivative of a function".into(),
            max_results: Some(5),
        };

        let results = search_index(&index, &query);
        assert_eq!(results.len(), 1, "Should only match page 2");
        assert_eq!(results[0].page, 2);
    }

    #[test]
    fn test_snippet_extraction() {
        let text = "Page 1: This is a long paragraph about derivatives and how they relate to calculus. "
            .repeat(10);
        let snippets = extract_snippet(&text, &["derivatives"]);
        assert!(snippets.len() > 0, "Should extract a non-empty snippet");
        assert!(snippets.len() <= 250, "Snippet should not be too long");
        assert!(snippets.contains("derivatives"), "Snippet should contain the match");
    }

    #[test]
    fn test_save_and_load_roundtrip() {
        // Use a unique test ID to avoid collisions
        let test_id = format!("test_roundtrip_{}", std::process::id());
        let _ = delete_index(&test_id); // Clean up before

        let meta = save_page_batch(
            &test_id,
            Some("Test Book".into()),
            100,
            vec![
                PageContent {
                    page: 1,
                    text: "Page one content".into(),
                },
                PageContent {
                    page: 2,
                    text: "Page two content".into(),
                },
            ],
            false,
        )
        .expect("save_page_batch should succeed");

        assert_eq!(meta.indexed_pages, 2);
        assert!(matches!(meta.status, IndexStatus::Indexing));

        // Complete indexing with remaining pages
        let meta = save_page_batch(
            &test_id,
            Some("Test Book".into()),
            100,
            vec![PageContent {
                page: 3,
                text: "Page three content".into(),
            }],
            true,
        )
        .expect("save_page_batch completion should succeed");

        assert_eq!(meta.indexed_pages, 3);
        assert!(matches!(meta.status, IndexStatus::Complete));

        // Verify meta can be loaded independently
        let loaded_meta = load_meta(&test_id).expect("load_meta should succeed");
        assert!(matches!(loaded_meta.status, IndexStatus::Complete));
        assert_eq!(loaded_meta.total_pages, 100);

        // Clean up
        let _ = delete_index(&test_id);
    }

    #[test]
    fn test_load_nonexistent_index() {
        let result = load_index("nonexistent-test-book");
        assert!(result.is_err(), "Loading a non-existent index should fail");
    }

    #[test]
    fn test_load_nonexistent_meta() {
        let result = load_meta("nonexistent-test-book");
        assert!(result.is_err(), "Loading non-existent meta should fail");
    }

    #[test]
    fn test_empty_query_returns_empty_results() {
        let index = TextbookIndex {
            textbook_id: "test".into(),
            total_pages: 1,
            pages: vec![PageContent {
                page: 1,
                text: "Some content".into(),
            }],
            indexed_at: "2026-01-01T00:00:00Z".into(),
        };

        let query = SearchQuery {
            query: "".into(),
            max_results: Some(5),
        };

        let results = search_index(&index, &query);
        assert_eq!(results.len(), 0, "Empty query should return no results");
    }

    #[test]
    fn test_search_max_results() {
        let index = TextbookIndex {
            textbook_id: "test".into(),
            total_pages: 10,
            pages: (1..=10)
                .map(|i| PageContent {
                    page: i,
                    text: format!("Page {i} has some math content about calculus and derivatives"),
                })
                .collect(),
            indexed_at: "2026-01-01T00:00:00Z".into(),
        };

        let query = SearchQuery {
            query: "calculus".into(),
            max_results: Some(3),
        };

        let results = search_index(&index, &query);
        assert_eq!(results.len(), 3, "Should return at most 3 results");
    }
}

/// Re-export hex encoding (dependency used only in this module).
mod hex {
    /// Simple hex encoding without pulling in the `hex` crate.
    pub fn encode(bytes: &[u8]) -> String {
        let hex_chars = b"0123456789abcdef";
        let mut result = String::with_capacity(bytes.len() * 2);
        for &byte in bytes {
            result.push(hex_chars[(byte >> 4) as usize] as char);
            result.push(hex_chars[(byte & 0x0F) as usize] as char);
        }
        result
    }
}