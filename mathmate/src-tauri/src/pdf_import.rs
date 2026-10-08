use serde::{Deserialize, Serialize};

/// A single entry in the PDF's document outline (table of contents).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TocEntry {
    pub title: String,
    pub page: u32,
    /// Nesting depth: 0 = chapter, 1 = section, 2 = subsection, etc.
    pub level: u32,
    /// Index into the flat entry list (used for selection).
    pub index: usize,
}

/// Result of an import operation — tells the frontend what was created.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportResult {
    pub files_created: Vec<String>,
    pub chapters_found: u32,
    pub sections_found: u32,
}

// ─── PDF TOC Extraction ────────────────────────────────────────────────

/// Extract the document outline (bookmarks/TOC) from a PDF file using lopdf.
pub fn extract_pdf_toc(path: &str) -> Result<Vec<TocEntry>, String> {
    let doc = lopdf::Document::load(path).map_err(|e| format!("Failed to open PDF: {}", e))?;

    // Get the document catalog
    let catalog = doc
        .catalog()
        .map_err(|e| format!("Failed to read PDF catalog: {}", e))?;

    // Catalog → /Outlines (indirect reference) → outlines dictionary → /First (indirect reference)
    let first_ref = match catalog.get(b"Outlines") {
        Ok(lopdf::Object::Reference(outline_ref)) => {
            // Resolve the outlines dictionary
            match doc.get_dictionary(*outline_ref) {
                Ok(outlines_dict) => {
                    // Get the first outline entry
                    match outlines_dict.get(b"First") {
                        Ok(lopdf::Object::Reference(first_ref)) => Some(*first_ref),
                        _ => None,
                    }
                }
                Err(_) => None,
            }
        }
        _ => None,
    };

    let mut entries: Vec<TocEntry> = Vec::new();

    if let Some(first_id) = first_ref {
        traverse_outline_tree(&doc, first_id, 0, &mut entries);
    }

    if entries.is_empty() {
        return Err(
            "No table of contents / bookmarks found in this PDF. \
             The PDF may not have an embedded outline. \
             Try using a PDF that has bookmarks/chapter markers."
                .to_string(),
        );
    }

    Ok(entries)
}

/// Recursively traverse the PDF outline tree (linked list via First/Next).
fn traverse_outline_tree(
    doc: &lopdf::Document,
    node_id: lopdf::ObjectId,
    level: u32,
    out: &mut Vec<TocEntry>,
) {
    let dict = match doc.get_dictionary(node_id) {
        Ok(d) => d,
        Err(_) => return,
    };

    // Extract title (handle PDF string encoding: UTF-16BE BOM, PDFDocEncoding, etc.)
    let title = extract_outline_title(&dict).unwrap_or_else(|| format!("Page {}", out.len() + 1));

    // Extract destination page
    let page = extract_page_number(doc, &dict).unwrap_or(1);

    let index = out.len();
    out.push(TocEntry {
        title,
        page,
        level,
        index,
    });

    // Process children (First) — go deeper. /First may be a Reference or an integer.
    if let Ok(obj) = dict.get(b"First") {
        if let Some(child_id) = resolve_ref_or_int(obj) {
            traverse_outline_tree(doc, child_id, level + 1, out);
        }
    }

    // Process siblings (Next) — stay at same level. /Next may be a Reference or an integer.
    if let Ok(obj) = dict.get(b"Next") {
        if let Some(next_id) = resolve_ref_or_int(obj) {
            traverse_outline_tree(doc, next_id, level, out);
        }
    }
}

/// Resolve an Object that could be either a Reference or an integer object ID.
fn resolve_ref_or_int(obj: &lopdf::Object) -> Option<lopdf::ObjectId> {
    if let Ok(r) = obj.as_reference() {
        Some(r)
    } else if let Ok(n) = obj.as_i64() {
        Some((n as u32, 0u16))
    } else {
        None
    }
}

/// Extract the title string from an outline dictionary entry.
/// PDF strings can be encoded as PDFDocEncoding, UTF-16BE with BOM, or raw bytes.
fn extract_outline_title(dict: &lopdf::Dictionary) -> Option<String> {
    let obj = dict.get(b"Title").ok()?;

    // Get the raw bytes of the PDF string
    let bytes: &[u8] = match obj {
        lopdf::Object::String(data, _) => data,
        _ => return None,
    };

    Some(decode_pdf_string(bytes))
}

/// Decode a PDF string, handling UTF-16BE BOM (\xFE\xFF) and plain byte sequences.
fn decode_pdf_string(bytes: &[u8]) -> String {
    if bytes.len() >= 2 && bytes[0] == 0xFE && bytes[1] == 0xFF {
        // UTF-16BE with BOM
        let u16_bytes = &bytes[2..];
        let chars: Vec<u16> = u16_bytes
            .chunks_exact(2)
            .map(|chunk| u16::from_be_bytes([chunk[0], chunk[1]]))
            .filter(|&c| c != 0) // strip null bytes (common in PDF strings)
            .collect();
        // Handle odd trailing byte
        if u16_bytes.len() % 2 != 0 {
            // ignore trailing byte
        }
        String::from_utf16_lossy(&chars)
    } else if bytes.len() >= 2 && bytes[0] == 0xFF && bytes[1] == 0xFE {
        // UTF-16LE with BOM
        let u16_bytes = &bytes[2..];
        let chars: Vec<u16> = u16_bytes
            .chunks_exact(2)
            .map(|chunk| u16::from_le_bytes([chunk[0], chunk[1]]))
            .filter(|&c| c != 0)
            .collect();
        String::from_utf16_lossy(&chars)
    } else {
        // Assume PDFDocEncoding or Latin-1. Try UTF-8 first, fall back to lossy Latin-1.
        match std::str::from_utf8(bytes) {
            Ok(s) => s.to_string(),
            Err(_) => {
                // Decode as Latin-1 (ISO-8859-1), which maps 1:1 to the first 256 Unicode code points
                bytes.iter().map(|&b| b as char).collect()
            }
        }
    }
}

/// Extract a page number from a destination dictionary or action.
fn extract_page_number(doc: &lopdf::Document, dict: &lopdf::Dictionary) -> Option<u32> {
    // Check for /Dest (direct destination) — can be Array, or indirect reference
    if let Ok(dest_obj) = dict.get(b"Dest") {
        if let Some(page) = resolve_dest_to_page(doc, dest_obj) {
            return Some(page);
        }
    }

    // Check for /A (action dictionary) — may be inline or an indirect reference
    if let Ok(action_obj) = dict.get(b"A") {
        if let Some(page) = resolve_action_to_page(doc, action_obj) {
            return Some(page);
        }
    }

    None
}

/// Resolve a /Dest value to a page number.
fn resolve_dest_to_page(doc: &lopdf::Document, dest_obj: &lopdf::Object) -> Option<u32> {
    match dest_obj {
        lopdf::Object::Array(arr) => {
            // [pageRef, /Fit] or [pageRef, /XYZ, left, top, zoom]
            arr.first().and_then(|page_ref| resolve_page_number(doc, page_ref))
        }
        lopdf::Object::Reference(ref_id) => {
            // Resolve the reference, then recurse
            let resolved = doc.get_object(*ref_id).ok()?;
            resolve_dest_to_page(doc, resolved)
        }
        _ => None,
    }
}

/// Resolve an /A (action) entry to a page number.
fn resolve_action_to_page(doc: &lopdf::Document, action_obj: &lopdf::Object) -> Option<u32> {
    let action_dict = match action_obj {
        lopdf::Object::Reference(ref_id) => doc.get_dictionary(*ref_id).ok()?,
        _ => {
            // Try inline dictionary
            action_obj.as_dict().ok()?
        }
    };

    // Check for /D (destination) in the action dict
    if let Ok(d_obj) = action_dict.get(b"D") {
        if let Ok(arr) = d_obj.as_array() {
            if let Some(page_ref) = arr.first() {
                return resolve_page_number(doc, page_ref);
            }
        }
    }

    None
}

/// Resolve a page reference to its 1-based page number.
fn resolve_page_number(doc: &lopdf::Document, page_ref: &lopdf::Object) -> Option<u32> {
    // If it's a number, return it directly
    if let Ok(n) = page_ref.as_i64() {
        return Some((n as u32).max(1));
    }

    // If it's a reference, look it up and find its position in the page tree
    if let Ok(page_id) = page_ref.as_reference() {
        let page_dict = doc.get_dictionary(page_id).ok()?;
        if let Ok(typ) = page_dict.get(b"Type") {
            if let Ok(name) = typ.as_name() {
                if name == b"Page" {
                    return find_page_index(doc, page_id);
                }
            }
        }
    }

    None
}

/// Find the 1-based page number for a page object in the document's page tree.
fn find_page_index(doc: &lopdf::Document, target_page_id: lopdf::ObjectId) -> Option<u32> {
    let page_ids = doc.get_pages();
    for (i, pid) in page_ids.values().enumerate() {
        if *pid == target_page_id {
            return Some((i as u32) + 1);
        }
    }
    None
}

// ─── Vault File Generation ─────────────────────────────────────────────

/// Generate vault markdown files from selected TOC entries.
///
/// Structure:
/// - Top-level entries (level 0) → numbered chapter folders
/// - Level 1+ entries → markdown note files
/// - Updates PROGRESS.md with the chapter/section table
/// - Updates Home.md with textbook reference
pub fn import_pdf_toc(
    pdf_path: &str,
    vault_path: &str,
    selected_indices: &[usize],
    textbook_title: Option<&str>,
) -> Result<ImportResult, String> {
    let toc = extract_pdf_toc(pdf_path)?;

    // Filter to selected entries
    let selected: Vec<&TocEntry> = selected_indices
        .iter()
        .filter_map(|&i| toc.get(i))
        .collect();

    if selected.is_empty() {
        return Err("No TOC entries selected for import.".to_string());
    }

    let title = textbook_title
        .or_else(|| {
            std::path::Path::new(pdf_path)
                .file_stem()
                .and_then(|s| s.to_str())
        })
        .unwrap_or("Textbook");

    let vault_root = std::path::Path::new(vault_path);
    let chapters_dir = vault_root.join("Chapters");
    std::fs::create_dir_all(&chapters_dir)
        .map_err(|e| format!("Failed to create Chapters directory: {}", e))?;

    let mut files_created: Vec<String> = Vec::new();
    let mut chapter_count: u32 = 0;
    let mut section_count: u32 = 0;
    let mut current_chapter: Option<&TocEntry> = None;
    let mut chapter_section_counts: Vec<(String, u32)> = Vec::new(); // (chapter_title, section_count)
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();

    for entry in &selected {
        match entry.level {
            0 => {
                // Chapter: create a folder
                chapter_count += 1;
                current_chapter = Some(entry);
                let folder_name = sanitize_filename(&format!(
                    "{:02} - {}",
                    chapter_count, entry.title
                ));
                let folder_path = chapters_dir.join(&folder_name);
                std::fs::create_dir_all(&folder_path)
                    .map_err(|e| format!("Failed to create chapter folder '{}': {}", folder_name, e))?;
                files_created.push(format!("Chapters/{}/", folder_name));
                chapter_section_counts.push((entry.title.clone(), 0));
            }
            1 => {
                // Section: create a markdown file inside current chapter
                section_count += 1;
                let chapter_idx = (chapter_count.saturating_sub(1)) as usize;
                if let Some((_, ref mut sc)) = chapter_section_counts.get_mut(chapter_idx) {
                    *sc += 1;
                }
                let section_num = chapter_section_counts
                    .last()
                    .map(|(_, c)| *c)
                    .unwrap_or(section_count);

                let chapter_folder = current_chapter
                    .map(|c| sanitize_filename(&format!("{:02} - {}", chapter_count, c.title)))
                    .unwrap_or_else(|| format!("Chapter_{:02}", chapter_count));

                let file_name = sanitize_filename(&format!(
                    "{:02} - {}",
                    section_num, entry.title
                ));
                let file_path = chapters_dir.join(&chapter_folder).join(&format!("{}.md", file_name));
                let rel_path = format!("Chapters/{}/{}.md", chapter_folder, file_name);

                let content = generate_section_note(&entry.title, chapter_count, section_count, &today);
                std::fs::write(&file_path, &content)
                    .map_err(|e| format!("Failed to write section note '{}': {}", rel_path, e))?;
                files_created.push(rel_path);
            }
            _ => {
                // Subsection (level 2+): append as a heading within the chapter's overview
                let chapter_folder = current_chapter
                    .map(|c| sanitize_filename(&format!("{:02} - {}", chapter_count, c.title)))
                    .unwrap_or_else(|| format!("Chapter_{:02}", chapter_count));

                let overview_name = format!("{:02} - Overview", chapter_count);
                let overview_path = chapters_dir.join(&chapter_folder).join(&format!("{}.md", overview_name));
                let rel_path = format!("Chapters/{}/{}.md", chapter_folder, overview_name);

                let indent = "  ".repeat((entry.level - 1) as usize);
                let subsection_line = format!("\n## {} {}\n\n- **Page {}**\n\n", indent, entry.title, entry.page);

                let existing = std::fs::read_to_string(&overview_path).unwrap_or_else(|_| {
                    format!(
                        "# Chapter {}: {}\n\n## Subsections\n\n",
                        chapter_count,
                        current_chapter.map(|c| c.title.as_str()).unwrap_or("Overview")
                    )
                });

                let updated = if existing.contains(&entry.title) {
                    existing
                } else {
                    existing + &subsection_line
                };

                std::fs::write(&overview_path, &updated)
                    .map_err(|e| format!("Failed to update overview '{}': {}", rel_path, e))?;

                if !files_created.iter().any(|f| f == &rel_path) {
                    files_created.push(rel_path);
                }
            }
        }
    }

    // ── Generate PROGRESS.md ──────────────────────────────────────────
    generate_progress_md(vault_root, &chapter_section_counts, title, &today)?;

    // ── Update Home.md with textbook reference ───────────────────────
    update_home_md_with_textbook(vault_root, title)?;

    Ok(ImportResult {
        files_created,
        chapters_found: chapter_count,
        sections_found: section_count,
    })
}

/// Generate a section note markdown file using the vault template.
fn generate_section_note(title: &str, chapter: u32, section: u32, today: &str) -> String {
    format!(
        r#"---
chapter: {chapter}
section: {chapter}.{section}
title: "{title}"
date: {today}
status: unread
---

# {title}

## Key Concepts

-

## Definitions

> **Term** — definition

## Theorems / Rules

> **Theorem name** — statement

## Examples & Worked Problems

### Example 1


## My Questions / Confusions

-

## Exercises Attempted

| Problem | My Answer | Correct? | Notes |
| :------ | :-------- | :------- | :---- |
|         |           |          |       |

## Summary

"#,
    )
}

/// Generate or update PROGRESS.md with the chapter/section structure.
fn generate_progress_md(
    vault_root: &std::path::Path,
    chapters: &[(String, u32)],
    textbook_title: &str,
    today: &str,
) -> Result<(), String> {
    let progress_path = vault_root.join("PROGRESS.md");

    // Build the progress table
    let mut table = String::from("| Chapter | Sections | Completed | Notes |\n");
    table.push_str("| :------ | :------- | :-------- | :---- |\n");

    for (i, (ch_title, sec_count)) in chapters.iter().enumerate() {
        table.push_str(&format!(
            "| {} — {} | {} | [ ] | |\n",
            i + 1,
            ch_title,
            sec_count,
        ));
    }

    let content = format!(
        r#"# Progress Tracking — {textbook_title}

> Auto-generated by MathMate on {today} from PDF table of contents.

## Current Status

- **Current Chapter:** 1
- **Current Section:** 1.1
- **Last Topic Studied:** _(update after each session)_

## Progress Log

{table}

## Areas of Focus

_(Add topics that need extra practice)_
"#,
        textbook_title = textbook_title,
        table = table,
    );

    std::fs::write(&progress_path, &content)
        .map_err(|e| format!("Failed to write PROGRESS.md: {}", e))?;

    Ok(())
}

/// Update Home.md with a reference to the textbook and chapter structure.
fn update_home_md_with_textbook(
    vault_root: &std::path::Path,
    textbook_title: &str,
) -> Result<(), String> {
    let home_path = vault_root.join("Home.md");

    let existing = std::fs::read_to_string(&home_path).unwrap_or_default();

    // Only add if there isn't already a textbook section
    if existing.contains("## Textbook") {
        return Ok(());
    }

    let textbook_section = format!(
        r#"## Textbook

This vault tracks progress through **{title}**.

- Chapters and sections were auto-generated from the PDF table of contents.
- Each section note is in `Chapters/<chapter>/<section>.md`.
- Track your progress in [[PROGRESS]].

"#,
        title = textbook_title,
    );

    // Insert after the first heading block or at the end
    let updated = if let Some(pos) = existing.find("## How to Use") {
        let (before, after) = existing.split_at(pos);
        format!("{}{}{}", before, textbook_section, after)
    } else {
        format!("{}\n\n{}", existing, textbook_section)
    };

    std::fs::write(&home_path, &updated)
        .map_err(|e| format!("Failed to update Home.md: {}", e))?;

    Ok(())
}

// ─── Helpers ───────────────────────────────────────────────────────────

/// Sanitize a filename: replace path separators and problematic characters.
fn sanitize_filename(name: &str) -> String {
    name.replace('/', "-")
        .replace('\\', "-")
        .replace(':', " -")
        .replace('?', "")
        .replace('*', "")
        .replace('<', "")
        .replace('>', "")
        .replace('|', "-")
        .replace('"', "'")
        .trim()
        .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_stewart_algebra_toc() {
        // Optional integration test: set MATHMATE_TEST_PDF to a copy of
        // "Algebra and Trigonometry" (Stewart, 4e); skipped otherwise.
        let Ok(path) = std::env::var("MATHMATE_TEST_PDF") else {
            eprintln!("Skipping: MATHMATE_TEST_PDF not set");
            return;
        };
        if !std::path::Path::new(&path).exists() {
            eprintln!("Skipping: PDF not found at {}", path);
            return;
        }
        let result = extract_pdf_toc(&path);
        match result {
            Ok(entries) => {
                assert!(!entries.is_empty(), "Should have found TOC entries");
                assert!(entries.len() > 50, "Expected 100+ entries, got {}", entries.len());
                // Verify page numbers are resolved (not all 1)
                let pages_with_real_numbers = entries.iter().filter(|e| e.page > 1).count();
                assert!(pages_with_real_numbers > 10, "Expected many entries with page > 1");
            }
            Err(e) => {
                panic!("Failed to extract TOC: {}", e);
            }
        }
    }
}