#![allow(dead_code)]
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
#[cfg(feature = "export-types")]
use ts_rs::TS;
use crate::services::session::{
    Message, Session, SessionHeader,
};


// ─── JSONL line types (internal) ─────────────────────────────────────────────
//
// On-disk format (one JSON object per line):
//   Line 1  : {"type":"header", ...SessionHeader fields...}
//   Line 2+ : {"type":"message", ...Message fields...}
//
// The header's `updated_at` is derived at read-time from the last message's
// `created_at`, so the header line never needs to be rewritten when messages
// are appended.

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum SessionLine {
    Header(SessionHeader),
    Message(Message),
}

// ─── Paths ───────────────────────────────────────────────────────────────────

fn mathmate_dir() -> PathBuf {
    let mut p = dirs_next::home_dir().unwrap_or_else(|| PathBuf::from("/tmp"));
    p.push(".mathmate");
    p
}

/// Shared base dir (sessions/, last_session.json, etc.)
pub fn session_base_dir() -> PathBuf {
    mathmate_dir()
}

pub fn sessions_dir() -> PathBuf {
    let mut p = mathmate_dir();
    p.push("sessions");
    let _ = std::fs::create_dir_all(&p);
    cleanup_stale_tmp(&p);
    p
}

/// Remove orphaned `.jsonl.tmp` temp files left by previous crashes.
fn cleanup_stale_tmp(dir: &PathBuf) {
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.extension().map_or(false, |e| e == "tmp") {
                // Only remove `.jsonl.tmp` files, not other .tmp files that might exist
                if p.file_name()
                    .map_or(false, |n| n.to_string_lossy().ends_with(".jsonl.tmp"))
                {
                    let _ = std::fs::remove_file(p);
                }
            }
        }
    }
}

pub fn archived_dir() -> PathBuf {
    let mut p = mathmate_dir();
    p.push("archived");
    let _ = std::fs::create_dir_all(&p);
    p
}

/// Canonical path for a v2 session (JSONL).
fn session_path(id: &str) -> PathBuf {
    sessions_dir().join(format!("{}.jsonl", id))
}

/// Canonical archived path (JSONL).
fn archived_path(id: &str) -> PathBuf {
    archived_dir().join(format!("{}.jsonl", id))
}

/// Legacy v2 monolithic-JSON path — used only for migration.
fn legacy_json_path(id: &str) -> PathBuf {
    sessions_dir().join(format!("{}.json", id))
}

/// Legacy archived monolithic-JSON path — used only for migration.
fn legacy_archived_json_path(id: &str) -> PathBuf {
    archived_dir().join(format!("{}.json", id))
}

// ─── JSONL low-level I/O ─────────────────────────────────────────────────────

/// Write a session to JSONL: header on line 1, one message per subsequent line.
fn write_jsonl(path: &PathBuf, session: &Session) -> Result<(), String> {
    // Write to a temp file first, then atomically rename to prevent corruption on crash.
    let tmp = path.with_extension("jsonl.tmp");
    let mut file = std::fs::File::create(&tmp)
        .map_err(|e| format!("Failed to create temp session file: {}", e))?;

    let header_line = serde_json::to_string(&SessionLine::Header(session.header.clone()))
        .map_err(|e| format!("Failed to serialize header: {}", e))?;
    writeln!(file, "{}", header_line).map_err(|e| format!("Failed to write header: {}", e))?;

    for msg in &session.messages {
        let msg_line = serde_json::to_string(&SessionLine::Message(msg.clone()))
            .map_err(|e| format!("Failed to serialize message: {}", e))?;
        writeln!(file, "{}", msg_line).map_err(|e| format!("Failed to write message: {}", e))?;
    }
    drop(file);
    std::fs::rename(&tmp, path).map_err(|e| format!("Failed to commit session file: {}", e))
}

/// Parse a JSONL session file.
/// `updated_at` is derived from the last message's `created_at` so the header
/// line never needs to be rewritten on message appends.
fn read_jsonl(path: &PathBuf) -> Result<Session, String> {
    let file = std::fs::File::open(path).map_err(|e| format!("Failed to open session: {}", e))?;
    let reader = BufReader::new(file);

    let mut header: Option<SessionHeader> = None;
    let mut messages: Vec<Message> = Vec::new();

    for (i, line_result) in reader.lines().enumerate() {
        let line = line_result.map_err(|e| format!("Failed to read line {}: {}", i + 1, e))?;
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        match serde_json::from_str::<SessionLine>(trimmed) {
            Ok(SessionLine::Header(h)) => {
                if i == 0 {
                    header = Some(h);
                }
            }
            Ok(SessionLine::Message(m)) => {
                messages.push(m);
            }
            Err(e) => {
                // Skip malformed lines rather than aborting the whole load.
                // This lets partial sessions (e.g. after a crash) still open.
                eprintln!("[session] Skipping malformed JSONL line {}: {}", i + 1, e);
            }
        }
    }

    let mut h = header.ok_or_else(|| "Session file missing header on line 1".to_string())?;

    // Derive updated_at from the last message so the header line is never stale.
    if let Some(last_msg) = messages.last() {
        if let Some(ts) = &last_msg.created_at {
            h.updated_at = ts.clone();
        }
    }

    Ok(Session {
        header: h,
        messages,
    })
}

// ─── Migration helpers ───────────────────────────────────────────────────────

/// Load a legacy v2 monolithic-JSON session, write it as JSONL, delete the
/// old .json file, and return the session.  Call-sites only need to check
/// whether the new .jsonl path exists first; if not they fall through here.
fn migrate_json_to_jsonl(json_path: &PathBuf, jsonl_path: &PathBuf) -> Result<Session, String> {
    let data = std::fs::read_to_string(json_path)
        .map_err(|e| format!("Failed to read legacy session: {}", e))?;
    let session: Session = serde_json::from_str(&data)
        .map_err(|e| format!("Failed to parse legacy session: {}", e))?;
    write_jsonl(jsonl_path, &session)?;
    let _ = std::fs::remove_file(json_path);
    Ok(session)
}

// ─── Public API ──────────────────────────────────────────────────────────────

/// Load a session by ID.  Transparently migrates legacy .json files to JSONL
/// on first access.
pub fn load_session(id: &str) -> Result<Session, String> {
    let jsonl = session_path(id);
    if jsonl.exists() {
        return read_jsonl(&jsonl);
    }
    let json = legacy_json_path(id);
    if json.exists() {
        return migrate_json_to_jsonl(&json, &jsonl);
    }
    Err(format!("Session {} not found", id))
}

/// Overwrite an entire session (full JSONL rewrite).
/// Used for: create, rename, and other whole-session mutations.
/// NOT used for message appending — use `append_message` for that.
pub fn save_session(session: &Session) -> Result<(), String> {
    write_jsonl(&session_path(&session.header.id), session)
}

/// Append a single message to a session.
///
/// Performs one disk read (to return the updated session to the caller) and
/// one O(1) disk append — no full file rewrite.
pub fn append_message(session_id: &str, message: &Message) -> Result<Session, String> {
    // Ensure the session exists in JSONL format (migrates .json if needed).
    let mut session = load_session(session_id)?;

    // Build the updated in-memory session.
    session.messages.push(message.clone());
    if let Some(ts) = &message.created_at {
        session.header.updated_at = ts.clone();
    }

    // Append exactly one line to the file — no full rewrite.
    let path = session_path(session_id);
    let line = serde_json::to_string(&SessionLine::Message(message.clone()))
        .map_err(|e| format!("Failed to serialize message: {}", e))?;
    let mut file = std::fs::OpenOptions::new()
        .append(true)
        .open(&path)
        .map_err(|e| format!("Failed to open session for append: {}", e))?;
    writeln!(file, "{}", line).map_err(|e| format!("Failed to append message: {}", e))?;

    // Return the in-memory session — no second disk read needed.
    Ok(session)
}

/// List session headers for a given project (or all sessions if project_id
/// is None).  Reads the full JSONL file per session to derive correct
/// updated_at from the last message.
pub fn list_sessions(project_id: Option<&str>) -> Result<Vec<SessionHeader>, String> {
    list_sessions_in_dir(&sessions_dir(), project_id)
}

/// List archived session headers.
pub fn list_archived_sessions(project_id: Option<&str>) -> Result<Vec<SessionHeader>, String> {
    list_sessions_in_dir(&archived_dir(), project_id)
}

fn list_sessions_in_dir(
    dir: &PathBuf,
    project_id: Option<&str>,
) -> Result<Vec<SessionHeader>, String> {
    let mut headers: Vec<SessionHeader> = Vec::new();
    let entries =
        std::fs::read_dir(dir).map_err(|e| format!("Failed to read sessions dir: {}", e))?;

    for entry in entries.flatten() {
        let path = entry.path();
        let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");

        let maybe_header: Option<SessionHeader> = match ext {
            "jsonl" => {
                // Only load v2 JSONL files (line 1 has "type":"header").
                // Legacy Swift v1 .jsonl files have a different schema and are
                // intentionally skipped here pending a dedicated migration tool.
                read_jsonl(&path).ok().and_then(|s| {
                    let pid_match = match project_id {
                        Some(pid) => s.header.project_id.as_deref() == Some(pid),
                        None => true,
                    };
                    if pid_match {
                        Some(s.header)
                    } else {
                        None
                    }
                })
            }
            "json" => {
                // Legacy v2 monolithic JSON — still readable during migration window.
                std::fs::read_to_string(&path)
                    .ok()
                    .and_then(|data| serde_json::from_str::<Session>(&data).ok())
                    .and_then(|session| {
                        let pid_match = match project_id {
                            Some(pid) => session.header.project_id.as_deref() == Some(pid),
                            None => true,
                        };
                        if pid_match {
                            Some(session.header)
                        } else {
                            None
                        }
                    })
            }
            _ => None,
        };

        if let Some(h) = maybe_header {
            headers.push(h);
        }
    }

    headers.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    Ok(headers)
}

/// Create a new session.
pub fn create_session(
    header: SessionHeader,
    initial_message: Option<Message>,
) -> Result<Session, String> {
    let session = Session {
        header,
        messages: initial_message.map(|m| vec![m]).unwrap_or_default(),
    };
    save_session(&session)?;
    Ok(session)
}

/// Update hint-ladder outcome metadata on a session (Phase 16A).
/// Requires a full JSONL rewrite since the header line changes.
pub fn update_session_hint_outcome(
    id: &str,
    hints_used: Option<i32>,
    solved: Option<bool>,
) -> Result<Session, String> {
    let path = {
        let jsonl = session_path(id);
        let _archived_jsonl = archived_path(id);
        if jsonl.exists() {
            jsonl
        } else {
            load_session(id)?;
            if session_path(id).exists() {
                session_path(id)
            } else {
                return Err(format!("Session {} not found", id));
            }
        }
    };

    let mut session = read_jsonl(&path)?;
    session.header.hints_used = hints_used;
    session.header.solved = solved;
    session.header.updated_at = Utc::now().to_rfc3339();
    write_jsonl(&path, &session)?;
    Ok(session)
}

/// Rename a session (updates title + updated_at; requires a full JSONL rewrite
/// since the header line changes — acceptable as renaming is infrequent).
pub fn rename_session(id: &str, title: &str) -> Result<Session, String> {
    // load_session handles migration from .json if needed.
    let path = {
        let jsonl = session_path(id);
        let _archived_jsonl = archived_path(id);
        if jsonl.exists() {
            jsonl
        } else if _archived_jsonl.exists() {
            _archived_jsonl
        } else {
            // Trigger migration (load_session writes the JSONL).
            load_session(id)?;
            // After migration the canonical .jsonl path exists.
            if session_path(id).exists() {
                session_path(id)
            } else {
                return Err(format!("Session {} not found after migration attempt", id));
            }
        }
    };

    let mut session = read_jsonl(&path)?;
    session.header.title = title.to_string();
    session.header.updated_at = Utc::now().to_rfc3339();
    write_jsonl(&path, &session)?;
    Ok(session)
}

/// Move a session to the archived folder.
pub fn archive_session(id: &str) -> Result<(), String> {
    // Ensure JSONL format exists (migrates .json if needed).
    load_session(id)?;
    let src = session_path(id);
    let dst = archived_path(id);
    if dst.exists() {
        return Err(format!("Session {} is already archived", id));
    }
    std::fs::rename(&src, &dst).map_err(|e| format!("Failed to archive session {}: {}", id, e))
}

/// Move a session from archived back to active.
pub fn unarchive_session(id: &str) -> Result<(), String> {
    let src = archived_path(id);
    if !src.exists() {
        // Check legacy archived .json
        let legacy = legacy_archived_json_path(id);
        if legacy.exists() {
            let jsonl = archived_path(id);
            migrate_json_to_jsonl(&legacy, &jsonl)?;
            // Now fall through with the migrated src.
        } else {
            return Err(format!("Archived session {} not found", id));
        }
    }
    let dst = session_path(id);
    if dst.exists() {
        return Err(format!("Session {} already exists in active sessions", id));
    }
    std::fs::rename(&src, &dst).map_err(|e| format!("Failed to unarchive session {}: {}", id, e))
}

/// Delete an active session.
pub fn delete_session(id: &str) -> Result<(), String> {
    let jsonl = session_path(id);
    if jsonl.exists() {
        return std::fs::remove_file(&jsonl)
            .map_err(|e| format!("Failed to delete session {}: {}", id, e));
    }
    let json = legacy_json_path(id);
    if json.exists() {
        return std::fs::remove_file(&json)
            .map_err(|e| format!("Failed to delete legacy session {}: {}", id, e));
    }
    Err(format!("Session {} not found", id))
}

/// Delete all sessions (active + archived) belonging to a project.
pub fn delete_sessions_for_project(project_id: &str) -> Result<(), String> {
    delete_matching_in_dir(&sessions_dir(), project_id);
    delete_matching_in_dir(&archived_dir(), project_id);
    Ok(())
}

fn delete_matching_in_dir(dir: &PathBuf, project_id: &str) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
        let session_project_id: Option<String> = match ext {
            "jsonl" => read_jsonl(&path).ok().and_then(|s| s.header.project_id),
            "json" => std::fs::read_to_string(&path)
                .ok()
                .and_then(|d| serde_json::from_str::<Session>(&d).ok())
                .and_then(|s| s.header.project_id),
            _ => None,
        };
        if session_project_id.as_deref() == Some(project_id) {
            let _ = std::fs::remove_file(&path);
        }
    }
}

/// Permanently delete a session from archived (or active as fallback).
pub fn purge_session(id: &str) -> Result<(), String> {
    let archived_jsonl = archived_path(id);
    if archived_jsonl.exists() {
        return std::fs::remove_file(&archived_jsonl)
            .map_err(|e| format!("Failed to purge session {}: {}", id, e));
    }
    let archived_json = legacy_archived_json_path(id);
    if archived_json.exists() {
        return std::fs::remove_file(&archived_json)
            .map_err(|e| format!("Failed to purge legacy archived session {}: {}", id, e));
    }
    delete_session(id)
}

// ─── Tests ──────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use crate::types_export::{ContentPart, MessageSegment, SegmentKind, ToolCallStatus};
    use super::*;

    #[test]
    fn test_segment_kind_serde_roundtrip() {
        let kinds: Vec<SegmentKind> = vec![
            SegmentKind::Thinking {
                content: "Let me think...".to_string(),
            },
            SegmentKind::ToolCall {
                tool_name: "calculate".to_string(),
                arguments: serde_json::json!({"expression": "2+2"}),
                call_id: "call-1".to_string(),
                status: ToolCallStatus::Completed,
            },
            SegmentKind::ToolResult {
                call_id: "call-1".to_string(),
                result: serde_json::json!({"value": 4}),
                is_error: false,
            },
            SegmentKind::Content {
                text: "The answer is 4.".to_string(),
            },
        ];

        for kind in &kinds {
            let json = serde_json::to_string(kind).unwrap();
            let parsed: SegmentKind = serde_json::from_str(&json).unwrap();
            let json2 = serde_json::to_string(&parsed).unwrap();
            assert_eq!(json, json2, "Roundtrip failed for: {}", json);
        }
    }

    #[test]
    fn test_tool_status_serde_roundtrip() {
        let statuses = vec![
            ToolCallStatus::Pending,
            ToolCallStatus::Running,
            ToolCallStatus::Completed,
            ToolCallStatus::Error,
        ];
        for status in &statuses {
            let json = serde_json::to_string(status).unwrap();
            let parsed: ToolCallStatus = serde_json::from_str(&json).unwrap();
            assert_eq!(*status, parsed);
        }
    }

    #[test]
    fn test_message_segment_roundtrip() {
        let seg = MessageSegment {
            id: "seg-1".to_string(),
            ts: "2026-06-01T12:00:00Z".to_string(),
            kind: SegmentKind::Thinking {
                content: "reasoning...".to_string(),
            },
        };
        let json = serde_json::to_string(&seg).unwrap();
        let parsed: MessageSegment = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.id, "seg-1");
        match parsed.kind {
            SegmentKind::Thinking { content } => assert_eq!(content, "reasoning..."),
            _ => panic!("Expected Thinking segment"),
        }
    }

    #[test]
    fn test_legacy_message_without_segments_loads() {
        // Simulate a legacy JSON message with no `segments` field
        let json = r#"{
            "id": "msg-1",
            "role": "assistant",
            "content": [{"type": "text", "text": "Hello"}],
            "thinking": "I was thinking..."
        }"#;
        let msg: Message = serde_json::from_str(json).unwrap();
        assert!(
            msg.segments.is_empty(),
            "Legacy message should have empty segments"
        );
        assert_eq!(msg.thinking.as_deref(), Some("I was thinking..."));
        assert_eq!(msg.content.len(), 1);
    }

    #[test]
    fn test_segment_order_preserved() {
        let msg = Message {
            id: "msg-1".to_string(),
            role: "assistant".to_string(),
            segments: vec![
                MessageSegment {
                    id: "seg-1".to_string(),
                    ts: "2026-06-01T12:00:01Z".to_string(),
                    kind: SegmentKind::Thinking {
                        content: "...".to_string(),
                    },
                },
                MessageSegment {
                    id: "seg-2".to_string(),
                    ts: "2026-06-01T12:00:02Z".to_string(),
                    kind: SegmentKind::ToolCall {
                        tool_name: "calc".to_string(),
                        arguments: serde_json::json!({}),
                        call_id: "c1".to_string(),
                        status: ToolCallStatus::Completed,
                    },
                },
                MessageSegment {
                    id: "seg-3".to_string(),
                    ts: "2026-06-01T12:00:03Z".to_string(),
                    kind: SegmentKind::Content {
                        text: "Done.".to_string(),
                    },
                },
            ],
            content: vec![],
            created_at: Some("2026-06-01T12:00:00Z".to_string()),
            flags: None,
            thinking: None,
            tool_call_id: None,
        };

        let json = serde_json::to_string(&msg).unwrap();
        let parsed: Message = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.segments.len(), 3);
        assert_eq!(parsed.segments[0].id, "seg-1");
        assert_eq!(parsed.segments[1].id, "seg-2");
        assert_eq!(parsed.segments[2].id, "seg-3");
    }

    #[test]
    fn test_user_content_parts_roundtrip() {
        let msg = Message {
            id: "msg-u".to_string(),
            role: "user".to_string(),
            segments: vec![],
            content: vec![ContentPart::Text {
                text: "What is 2+2?".to_string(),
            }],
            created_at: None,
            flags: None,
            thinking: None,
            tool_call_id: None,
        };
        let json = serde_json::to_string(&msg).unwrap();
        let parsed: Message = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.segments.len(), 0);
        assert_eq!(parsed.content.len(), 1);
    }

    #[test]
    fn test_tool_call_arguments_not_double_encoded() {
        // Verify that arguments are stored as a JSON object, not a JSON string
        let seg = MessageSegment {
            id: "seg-1".to_string(),
            ts: "2026-06-01T12:00:00Z".to_string(),
            kind: SegmentKind::ToolCall {
                tool_name: "calculate".to_string(),
                arguments: serde_json::json!({"expression": "2+2"}),
                call_id: "call-1".to_string(),
                status: ToolCallStatus::Completed,
            },
        };
        let json = serde_json::to_string(&seg).unwrap();
        // arguments should be an object, not a string
        assert!(
            json.contains(r#""expression":"2+2""#),
            "Arguments should be inline JSON, not escaped string"
        );
        assert!(
            !json.contains(r#"\"#),
            "Arguments should not have escaped quotes"
        );
    }
}
