#![allow(dead_code)]
use std::path::PathBuf;
use crate::services::vault::VaultNote;


/// Scan a directory recursively for markdown files.
/// Skips hidden directories.
pub fn scan_vault(path: &str) -> Result<Vec<VaultNote>, String> {
    let root = PathBuf::from(path);
    if !root.exists() {
        return Err(format!("Path does not exist: {}", path));
    }
    if !root.is_dir() {
        return Err(format!("Path is not a directory: {}", path));
    }

    let mut notes = Vec::new();
    for entry in walkdir::WalkDir::new(&root)
        .into_iter()
        .filter_entry(|e| {
            let name = e.file_name().to_string_lossy();
            // Skip hidden directories
            if e.file_type().is_dir() {
                !name.starts_with('.')
            } else {
                true
            }
        })
        .filter_map(|e| e.ok())
    {
        let file_path = entry.path();
        if file_path.extension().map_or(true, |e| e != "md") {
            continue;
        }
        if !entry.file_type().is_file() {
            continue;
        }

        let filename = file_path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();
        let metadata = std::fs::metadata(file_path).ok();
        let size_bytes = metadata.as_ref().map(|m| m.len()).unwrap_or(0);
        let modified_at = metadata.and_then(|m| m.modified().ok()).map(|t| {
            let dur = t.duration_since(std::time::UNIX_EPOCH).unwrap_or_default();
            let secs = dur.as_secs();
            format!(
                "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z",
                1970 + (secs / 31536000) as u32,
                ((secs % 31536000) / 2592000 + 1) % 13,
                (secs % 2592000) / 86400 + 1,
                (secs % 86400) / 3600,
                (secs % 3600) / 60,
                secs % 60
            )
        });

        // Read first 1KB for frontmatter extraction
        let content = std::fs::read_to_string(file_path).unwrap_or_default();
        let (title, tags) = extract_frontmatter(&content);

        notes.push(VaultNote {
            path: file_path.to_string_lossy().to_string(),
            filename,
            title,
            tags,
            created_at: None, // git-based, not computed here
            modified_at,
            size_bytes,
        });
    }

    // Sort by modified_at descending
    notes.sort_by(|a, b| b.modified_at.cmp(&a.modified_at));
    Ok(notes)
}

/// Extract title (first H1) and tags from markdown frontmatter.
fn extract_frontmatter(content: &str) -> (String, Vec<String>) {
    let mut title = String::new();
    let mut tags = Vec::new();

    // Try frontmatter first
    if content.starts_with("---") {
        if let Some(end) = content[3..].find("---") {
            let fm = &content[3..3 + end];
            for line in fm.lines() {
                let trimmed = line.trim();
                if let Some(val) = trimmed.strip_prefix("title:") {
                    title = val.trim().trim_matches('"').to_string();
                }
                if let Some(val) = trimmed.strip_prefix("tags:") {
                    let val = val.trim();
                    if val.starts_with('[') {
                        // Array syntax: [tag1, tag2]
                        for t in val.trim_matches(|c| c == '[' || c == ']').split(',') {
                            let t = t.trim().trim_matches('"');
                            if !t.is_empty() {
                                tags.push(t.to_string());
                            }
                        }
                    } else if val.starts_with('-') {
                        // List syntax
                        // not supported in first pass
                    }
                }
            }
        }
    }

    // Fallback: first H1 for title
    if title.is_empty() {
        for line in content.lines() {
            if let Some(h1) = line.strip_prefix("# ") {
                title = h1.to_string();
                break;
            }
        }
    }

    // Find inline tags like #tag in content
    // Simple: find #word patterns (not inside code blocks)
    for word in content.split_whitespace() {
        if word.starts_with('#') && word.len() > 1 {
            let tag = word.trim_end_matches(|c: char| c.is_ascii_punctuation());
            if !tag.starts_with("# ") && tag.len() > 1 {
                let tag_name = tag[1..].to_string();
                if !tags.contains(&tag_name) {
                    tags.push(tag_name);
                }
            }
        }
    }

    (title, tags)
}

/// Read a note's full content.
pub fn read_note(path: &str) -> Result<String, String> {
    std::fs::read_to_string(path).map_err(|e| format!("Failed to read note: {}", e))
}
/// Initialize a new MathMate vault at the given path with standard scaffolding.
/// Creates: Home.md, PROGRESS.md, MathMate/Study Logs/, Templates/Section Note.md
/// Returns an error if the directory already exists and is non-empty.
pub fn init_vault(vault_path: &str, project_name: &str) -> Result<(), String> {
    let root = std::path::PathBuf::from(vault_path);

    // Create the root directory if it doesn't exist
    if root.exists() {
        // Allow if empty; refuse if it already contains files (safety guard)
        let has_contents = std::fs::read_dir(&root)
            .map(|mut d| d.next().is_some())
            .unwrap_or(false);
        if has_contents {
            return Err(format!(
                "Directory '{}' already exists and is not empty. \
                 Move or rename it first, or point to an empty folder.",
                vault_path
            ));
        }
    } else {
        std::fs::create_dir_all(&root)
            .map_err(|e| format!("Failed to create vault directory: {}", e))?;
    }

    // Helper to write a file, creating parent dirs as needed
    let write_file = |rel: &str, content: &str| -> Result<(), String> {
        let target = root.join(rel);
        if let Some(parent) = target.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create directory: {}", e))?;
        }
        std::fs::write(&target, content).map_err(|e| format!("Failed to write {}: {}", rel, e))
    };

    let today = chrono::Local::now().format("%Y-%m-%d").to_string();

    // ── Home.md ──────────────────────────────────────────────────────────────
    write_file(
        "Home.md",
        &format!(
            r#"# {project_name} — Study Vault

> Created by MathMate on {today}

## Navigation

- [[PROGRESS]] — current position, progress log, areas of difficulty
- [[MathMate/Study Logs/]] — AI-assisted session wrap-ups

## How to Use This Vault

- Add a `Chapters/` folder and create one note per section using `[[Templates/Section Note]]`.
- After each study session, MathMate can generate a wrap-up saved to `MathMate/Study Logs/`.
- Use `PROGRESS.md` to track which sections you have completed.
"#,
            project_name = project_name,
            today = today
        ),
    )?;

    // ── PROGRESS.md ───────────────────────────────────────────────────────────
    write_file(
        "PROGRESS.md",
        &format!(
            r#"# Progress Tracking — {project_name}

## Current Status

- **Current Chapter:** 1
- **Current Section:** 1.1
- **Last Topic Studied:** _(update after each session)_

## Progress Log

| Chapter | Sections | Completed | Notes |
| :------ | :------- | :-------- | :---- |
| 1       |          | [ ]       |       |

## Areas of Focus

_(Add topics that need extra practice)_
"#,
            project_name = project_name
        ),
    )?;

    // ── MathMate/Study Logs/.gitkeep ─────────────────────────────────────────
    write_file("MathMate/Study Logs/.gitkeep", "")?;

    // ── Templates/Section Note.md ─────────────────────────────────────────────
    write_file(
        "Templates/Section Note.md",
        r#"---
chapter: 
section: 
title: 
date: 
status: unread
---

# {{title}}

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
    )?;

    Ok(())
}
