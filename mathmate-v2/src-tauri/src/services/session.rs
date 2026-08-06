// ─── Session Service ──────────────────────────────────────────────────
//
// Owns session persistence logic.  Takes a `base_dir` at construction
// time (typically `~/.mathmate`) so the service is unit-testable with
// a temp directory.
//
// Delegates low-level JSONL I/O (read/write lines) to the existing
// `crate::session` module but owns path resolution so the base_dir
// can be injected.
//
// See: Implementation_Phase14C_RustServiceLayer.md § C.6.c

use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;

use chrono::Utc;
use serde::{Deserialize, Serialize};

use crate::error::AppError;
use std::collections::HashMap;

#[cfg(feature = "export-types")]
use ts_rs::TS;

// ─── Public data model ───────────────────────────────────────────────────────

/// Mirrors the Swift `SessionHeader` model for backward compat.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "export-types", derive(TS))]
#[cfg_attr(feature = "export-types", ts(export, export_to = "session.ts"))]
pub struct SessionHeader {
    pub id: String,
    pub title: String,
    pub model: String,
    pub provider: String,
    pub created_at: String,
    pub updated_at: String,
    pub project_id: Option<String>,
    pub tutor_style: Option<String>,
    pub flags: Option<HashMap<String, bool>>,
    /// Number of hints used during an olympiad problem session (Phase 16A).
    pub hints_used: Option<i32>,
    /// Whether the problem was solved (Phase 16A).
    pub solved: Option<bool>,
}

/// A content part within a message (text or image).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
#[cfg_attr(feature = "export-types", derive(TS))]
#[cfg_attr(feature = "export-types", ts(export, export_to = "session.ts"))]
pub enum ContentPart {
    #[serde(rename = "text")]
    Text { text: String },
    #[serde(rename = "image")]
    Image {
        /// Optional disk-reference filename (from save_image). May be absent
        /// when image data is sent inline via the `data` field.
        #[serde(default)]
        url: Option<String>,
        mime: Option<String>,
        data: Option<String>,
    },
}

// ─── Timeline segment types (Phase 12A) ─────────────────────────────────────

/// Status of a tool call in the timeline.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
#[cfg_attr(feature = "export-types", derive(TS))]
#[cfg_attr(feature = "export-types", ts(export, export_to = "session.ts"))]
pub enum ToolCallStatus {
    Pending,
    Running,
    Completed,
    Error,
}

/// The kind/type of a message segment.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
#[cfg_attr(feature = "export-types", derive(TS))]
#[cfg_attr(feature = "export-types", ts(export, export_to = "session.ts"))]
pub enum SegmentKind {
    Thinking {
        content: String,
    },
    ToolCall {
        tool_name: String,
        arguments: serde_json::Value,
        call_id: String,
        status: ToolCallStatus,
    },
    ToolResult {
        call_id: String,
        result: serde_json::Value,
        is_error: bool,
    },
    Content {
        text: String,
    },
}

/// An ordered segment within an assistant message's timeline.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "export-types", derive(TS))]
#[cfg_attr(feature = "export-types", ts(export, export_to = "session.ts"))]
pub struct MessageSegment {
    pub id: String,
    pub ts: String,
    #[serde(flatten)]
    pub kind: SegmentKind,
}

/// A single message in the conversation.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "export-types", derive(TS))]
#[cfg_attr(feature = "export-types", ts(export, export_to = "session.ts"))]
pub struct Message {
    pub id: String,
    pub role: String,
    #[serde(default)]
    pub segments: Vec<MessageSegment>,
    pub content: Vec<ContentPart>,
    pub created_at: Option<String>,
    pub flags: Option<HashMap<String, bool>>,
    /// Legacy thinking field — preserved for backward compat reads.
    /// New messages should use `segments` with type "thinking" instead.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub thinking: Option<String>,
    /// For role="tool" messages: the ID of the tool call this result satisfies.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_call_id: Option<String>,
}

/// Full session — header + messages.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "export-types", derive(TS))]
#[cfg_attr(feature = "export-types", ts(export, export_to = "session.ts"))]
pub struct Session {
    pub header: SessionHeader,
    pub messages: Vec<Message>,
}

// ─── On-disk line types (JSONL helpers, shared with session.rs) ──────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum SessionLine {
    Header(SessionHeader),
    Message(Message),
}

// ─── SessionService ──────────────────────────────────────────────────

pub struct SessionService {
    base_dir: PathBuf,
}

impl SessionService {
    /// Create a new `SessionService` rooted at `base_dir`.
    ///
    /// `base_dir` is typically `~/.mathmate`.  Sessions, archived
    /// sessions, and `last_session.json` all live under this tree.
    pub fn new(base_dir: PathBuf) -> Self {
        Self { base_dir }
    }

    // ── Session directories ──────────────────────────────────────────

    fn sessions_dir(&self) -> PathBuf {
        let mut p = self.base_dir.clone();
        p.push("sessions");
        let _ = std::fs::create_dir_all(&p);
        // Clean up orphaned .tmp files from previous crashes
        cleanup_stale_tmp(&p);
        p
    }

    fn archived_dir(&self) -> PathBuf {
        let mut p = self.base_dir.clone();
        p.push("archived");
        let _ = std::fs::create_dir_all(&p);
        p
    }

    fn session_path(&self, id: &str) -> PathBuf {
        self.sessions_dir().join(format!("{}.jsonl", id))
    }

    fn archived_path(&self, id: &str) -> PathBuf {
        self.archived_dir().join(format!("{}.jsonl", id))
    }

    fn legacy_json_path(&self, id: &str) -> PathBuf {
        self.sessions_dir().join(format!("{}.json", id))
    }

    fn legacy_archived_json_path(&self, id: &str) -> PathBuf {
        self.archived_dir().join(format!("{}.json", id))
    }

    // ── Low-level JSONL I/O ──────────────────────────────────────────

    fn write_jsonl(&self, path: &PathBuf, session: &Session) -> Result<(), AppError> {
        let tmp = path.with_extension("jsonl.tmp");
        let mut file = std::fs::File::create(&tmp)
            .map_err(|e| AppError::internal(format!("Failed to create temp session file: {}", e)))?;

        let header_line = serde_json::to_string(&SessionLine::Header(session.header.clone()))
            .map_err(|e| AppError::internal(format!("Failed to serialize header: {}", e)))?;
        writeln!(file, "{}", header_line)
            .map_err(|e| AppError::internal(format!("Failed to write header: {}", e)))?;

        for msg in &session.messages {
            let msg_line = serde_json::to_string(&SessionLine::Message(msg.clone()))
                .map_err(|e| AppError::internal(format!("Failed to serialize message: {}", e)))?;
            writeln!(file, "{}", msg_line)
                .map_err(|e| AppError::internal(format!("Failed to write message: {}", e)))?;
        }
        drop(file);
        std::fs::rename(&tmp, path)
            .map_err(|e| AppError::internal(format!("Failed to commit session file: {}", e)))
    }

    fn read_jsonl(&self, path: &PathBuf) -> Result<Session, AppError> {
        let file = std::fs::File::open(path)
            .map_err(|e| AppError::internal(format!("Failed to open session: {}", e)))?;
        let reader = BufReader::new(file);

        let mut header: Option<SessionHeader> = None;
        let mut messages: Vec<Message> = Vec::new();

        for (i, line_result) in reader.lines().enumerate() {
            let line = line_result
                .map_err(|e| AppError::internal(format!("Failed to read line {}: {}", i + 1, e)))?;
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
                    eprintln!("[session] Skipping malformed JSONL line {}: {}", i + 1, e);
                }
            }
        }

        let mut h = header.ok_or_else(|| {
            AppError::internal("Session file missing header on line 1")
        })?;

        if let Some(last_msg) = messages.last() {
            if let Some(ts) = &last_msg.created_at {
                h.updated_at = ts.clone();
            }
        }

        Ok(Session { header: h, messages })
    }

    /// Migrate a legacy monolithic-JSON session to JSONL.
    fn migrate_json_to_jsonl(
        &self,
        json_path: &PathBuf,
        jsonl_path: &PathBuf,
    ) -> Result<Session, AppError> {
        let data = std::fs::read_to_string(json_path)
            .map_err(|e| AppError::internal(format!("Failed to read legacy session: {}", e)))?;
        let session: Session = serde_json::from_str(&data)
            .map_err(|e| AppError::internal(format!("Failed to parse legacy session: {}", e)))?;
        self.write_jsonl(jsonl_path, &session)?;
        let _ = std::fs::remove_file(json_path);
        Ok(session)
    }

    // ── public API ───────────────────────────────────────────────────

    /// Load a session by ID.  Transparently migrates legacy .json files.
    pub fn load(&self, session_id: &str) -> Result<Session, AppError> {
        let jsonl = self.session_path(session_id);
        if jsonl.exists() {
            return self.read_jsonl(&jsonl);
        }
        let json = self.legacy_json_path(session_id);
        if json.exists() {
            return self.migrate_json_to_jsonl(&json, &jsonl);
        }
        Err(AppError::not_found(format!("Session {} not found", session_id)))
    }

    /// Save an entire session (full JSONL rewrite).
    fn save(&self, session: &Session) -> Result<(), AppError> {
        self.write_jsonl(&self.session_path(&session.header.id), session)
    }

    /// List active sessions, optionally filtered by project.
    pub fn list(&self, project_id: Option<&str>) -> Result<Vec<SessionHeader>, AppError> {
        self.list_in_dir(&self.sessions_dir(), project_id)
    }

    /// List archived sessions.
    pub fn list_archived(&self, project_id: Option<&str>) -> Result<Vec<SessionHeader>, AppError> {
        self.list_in_dir(&self.archived_dir(), project_id)
    }

    fn list_in_dir(
        &self,
        dir: &PathBuf,
        project_id: Option<&str>,
    ) -> Result<Vec<SessionHeader>, AppError> {
        let mut headers: Vec<SessionHeader> = Vec::new();
        let entries = std::fs::read_dir(dir)
            .map_err(|e| AppError::internal(format!("Failed to read sessions dir: {}", e)))?;

        for entry in entries.flatten() {
            let path = entry.path();
            let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");

            let maybe_header: Option<SessionHeader> = match ext {
                "jsonl" => self.read_jsonl(&path).ok().and_then(|s| {
                    let pid_match = match project_id {
                        Some(pid) => s.header.project_id.as_deref() == Some(pid),
                        None => true,
                    };
                    if pid_match { Some(s.header) } else { None }
                }),
                "json" => {
                    std::fs::read_to_string(&path)
                        .ok()
                        .and_then(|data| serde_json::from_str::<Session>(&data).ok())
                        .and_then(|session| {
                            let pid_match = match project_id {
                                Some(pid) => session.header.project_id.as_deref() == Some(pid),
                                None => true,
                            };
                            if pid_match { Some(session.header) } else { None }
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

    /// Create a new session with an optional initial message.
    pub fn create(
        &self,
        header: SessionHeader,
        initial_message: Option<Message>,
    ) -> Result<Session, AppError> {
        let session = Session {
            header,
            messages: initial_message.map(|m| vec![m]).unwrap_or_default(),
        };
        self.save(&session)?;
        Ok(session)
    }

    /// Append a message to an existing session.
    ///
    /// Performs one O(1) disk append with fsync and returns the updated
    /// in-memory session.  Writes to disk first, then updates memory, so
    /// a crash between the two steps leaves the session consistent on
    /// disk (the message is persisted).
    pub fn append(
        &self,
        session_id: &str,
        message: &Message,
    ) -> Result<Session, AppError> {
        let mut session = self.load(session_id)?;

        let path = self.session_path(session_id);
        let line = serde_json::to_string(&SessionLine::Message(message.clone()))
            .map_err(|e| AppError::internal(format!("Failed to serialize message: {}", e)))?;
        let mut file = std::fs::OpenOptions::new()
            .append(true)
            .open(&path)
            .map_err(|e| AppError::internal(format!("Failed to open session for append: {}", e)))?;
        writeln!(file, "{}", line)
            .map_err(|e| AppError::internal(format!("Failed to append message: {}", e)))?;
        // Ensure the write is durable before updating in-memory state.
        file.sync_all()
            .map_err(|e| AppError::internal(format!("Failed to fsync session: {}", e)))?;

        // Only update in-memory state after successful disk write + fsync.
        session.messages.push(message.clone());
        if let Some(ts) = &message.created_at {
            session.header.updated_at = ts.clone();
        }

        Ok(session)
    }

    /// Rename a session.
    pub fn rename(&self, session_id: &str, title: &str) -> Result<Session, AppError> {
        let path = self.session_path(session_id);
        let archived = self.archived_path(session_id);
        let target = if path.exists() {
            path
        } else if archived.exists() {
            archived
        } else {
            // Try loading (triggers migration from .json if needed)
            self.load(session_id)?;
            if self.session_path(session_id).exists() {
                self.session_path(session_id)
            } else {
                return Err(AppError::not_found(format!(
                    "Session {} not found after migration attempt",
                    session_id
                )));
            }
        };

        let mut session = self.read_jsonl(&target)?;
        session.header.title = title.to_string();
        session.header.updated_at = Utc::now().to_rfc3339();
        self.write_jsonl(&target, &session)?;
        Ok(session)
    }

    /// Update hint-ladder outcome metadata (Phase 16A).
    pub fn update_hint_outcome(
        &self,
        session_id: &str,
        hints_used: Option<i32>,
        solved: Option<bool>,
    ) -> Result<Session, AppError> {
        let path = self.session_path(session_id);
        let target = if path.exists() {
            path
        } else {
            self.load(session_id)?;
            if self.session_path(session_id).exists() {
                self.session_path(session_id)
            } else {
                return Err(AppError::not_found(format!(
                    "Session {} not found",
                    session_id
                )));
            }
        };

        let mut session = self.read_jsonl(&target)?;
        session.header.hints_used = hints_used;
        session.header.solved = solved;
        session.header.updated_at = Utc::now().to_rfc3339();
        self.write_jsonl(&target, &session)?;
        Ok(session)
    }

    /// Delete an active session.
    pub fn delete(&self, session_id: &str) -> Result<(), AppError> {
        let jsonl = self.session_path(session_id);
        if jsonl.exists() {
            return std::fs::remove_file(&jsonl)
                .map_err(|e| AppError::internal(format!("Failed to delete session: {}", e)));
        }
        let json = self.legacy_json_path(session_id);
        if json.exists() {
            return std::fs::remove_file(&json)
                .map_err(|e| AppError::internal(format!("Failed to delete legacy session: {}", e)));
        }
        Err(AppError::not_found(format!("Session {} not found", session_id)))
    }

    /// Move a session to the archived folder.
    pub fn archive(&self, session_id: &str) -> Result<(), AppError> {
        self.load(session_id)?; // ensures JSONL exists (migrates .json)
        let src = self.session_path(session_id);
        let dst = self.archived_path(session_id);
        if dst.exists() {
            return Err(AppError::internal(format!(
                "Session {} is already archived",
                session_id
            )));
        }
        std::fs::rename(&src, &dst)
            .map_err(|e| AppError::internal(format!("Failed to archive session: {}", e)))
    }

    /// Move a session from archived back to active.
    pub fn unarchive(&self, session_id: &str) -> Result<(), AppError> {
        let src = self.archived_path(session_id);
        if !src.exists() {
            let legacy = self.legacy_archived_json_path(session_id);
            if legacy.exists() {
                let jsonl = self.archived_path(session_id);
                self.migrate_json_to_jsonl(&legacy, &jsonl)?;
            } else {
                return Err(AppError::not_found(format!(
                    "Archived session {} not found",
                    session_id
                )));
            }
        }
        let dst = self.session_path(session_id);
        if dst.exists() {
            return Err(AppError::internal(format!(
                "Session {} already exists in active sessions",
                session_id
            )));
        }
        std::fs::rename(&src, &dst)
            .map_err(|e| AppError::internal(format!("Failed to unarchive session: {}", e)))
    }

    /// Permanently delete a session from archived (or active as fallback).
    pub fn purge(&self, session_id: &str) -> Result<(), AppError> {
        let archived_jsonl = self.archived_path(session_id);
        if archived_jsonl.exists() {
            return std::fs::remove_file(&archived_jsonl)
                .map_err(|e| AppError::internal(format!("Failed to purge session: {}", e)));
        }
        let archived_json = self.legacy_archived_json_path(session_id);
        if archived_json.exists() {
            return std::fs::remove_file(&archived_json)
                .map_err(|e| AppError::internal(format!("Failed to purge legacy session: {}", e)));
        }
        self.delete(session_id)
    }

    // ── Last-session persistence ─────────────────────────────────────

    pub fn save_last(&self, session_id: &str) -> Result<(), AppError> {
        let path = self.base_dir.join("last_session.json");
        std::fs::create_dir_all(&self.base_dir)
            .map_err(|e| AppError::internal(format!("Failed to create base dir: {}", e)))?;
        let data = serde_json::json!({ "session_id": session_id });
        std::fs::write(&path, serde_json::to_string_pretty(&data).unwrap())
            .map_err(|e| AppError::internal(format!("Failed to write last session: {}", e)))?;
        Ok(())
    }

    pub fn get_last(&self) -> Result<Option<String>, AppError> {
        let path = self.base_dir.join("last_session.json");
        if !path.exists() {
            return Ok(None);
        }
        let data = std::fs::read_to_string(&path).map_err(|e| {
            AppError::internal(format!("Failed to read last session: {}", e))
        })?;
        let parsed: serde_json::Value = serde_json::from_str(&data).map_err(|e| {
            AppError::internal(format!("Failed to parse last session: {}", e))
        })?;
        Ok(parsed["session_id"].as_str().map(|s| s.to_string()))
    }
}

// ─── Helpers ──────────────────────────────────────────────────────────

fn cleanup_stale_tmp(dir: &PathBuf) {
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.extension().map_or(false, |e| e == "tmp") {
                if p.file_name()
                    .map_or(false, |n| n.to_string_lossy().ends_with(".jsonl.tmp"))
                {
                    let _ = std::fs::remove_file(p);
                }
            }
        }
    }
}

// ─── Tests ───────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_service() -> (SessionService, PathBuf) {
        use std::sync::atomic::{AtomicU32, Ordering};
        static COUNTER: AtomicU32 = AtomicU32::new(0);
        let n = COUNTER.fetch_add(1, Ordering::Relaxed);
        let dir = std::env::temp_dir().join(format!("mathmate_test_{}", n));
        let _ = std::fs::remove_dir_all(&dir); // clean previous run
        std::fs::create_dir_all(&dir).unwrap();
        let svc = SessionService::new(dir.clone());
        (svc, dir)
    }

    fn sample_header(id: &str, title: &str) -> SessionHeader {
        SessionHeader {
            id: id.to_string(),
            title: title.to_string(),
            model: "test-model".to_string(),
            provider: "test-provider".to_string(),
            created_at: "2026-01-01T00:00:00Z".to_string(),
            updated_at: "2026-01-01T00:00:00Z".to_string(),
            project_id: None,
            tutor_style: None,
            flags: None,
            hints_used: None,
            solved: None,
        }
    }

    fn sample_message(id: &str, text: &str) -> Message {
        Message {
            id: id.to_string(),
            role: "user".to_string(),
            segments: vec![],
            content: vec![ContentPart::Text {
                text: text.to_string(),
            }],
            created_at: Some("2026-01-01T00:00:00Z".to_string()),
            flags: None,
            thinking: None,
            tool_call_id: None,
        }
    }

    #[test]
    fn test_create_and_load() {
        let (svc, dir) = temp_service();
        let header = sample_header("test-1", "Test Session");
        let msg = sample_message("msg-1", "Hello");
        let created = svc.create(header, Some(msg)).unwrap();
        assert_eq!(created.header.id, "test-1");

        let loaded = svc.load("test-1").unwrap();
        assert_eq!(loaded.header.title, "Test Session");
        assert_eq!(loaded.messages.len(), 1);
        assert_eq!(loaded.messages[0].id, "msg-1");

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn test_list_and_filter() {
        let (svc, dir) = temp_service();
        let h1 = SessionHeader {
            project_id: Some("proj-a".to_string()),
            ..sample_header("s1", "A1")
        };
        let h2 = SessionHeader {
            project_id: Some("proj-b".to_string()),
            ..sample_header("s2", "B1")
        };
        svc.create(h1, None).unwrap();
        svc.create(h2, None).unwrap();

        let all = svc.list(None).unwrap();
        assert_eq!(all.len(), 2);

        let filtered = svc.list(Some("proj-a")).unwrap();
        assert_eq!(filtered.len(), 1);
        assert_eq!(filtered[0].id, "s1");

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn test_append_and_rename() {
        let (svc, dir) = temp_service();
        let header = sample_header("s-append", "Orig");
        svc.create(header, None).unwrap();

        let msg = sample_message("msg-a", "Hi");
        let updated = svc.append("s-append", &msg).unwrap();
        assert_eq!(updated.messages.len(), 1);

        let renamed = svc.rename("s-append", "Renamed").unwrap();
        assert_eq!(renamed.header.title, "Renamed");
        assert_eq!(renamed.messages.len(), 1);

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn test_archive_unarchive_purge() {
        let (svc, dir) = temp_service();
        let header = sample_header("s-arch", "Archive Me");
        svc.create(header, None).unwrap();

        svc.archive("s-arch").unwrap();
        assert!(svc.list(None).unwrap().is_empty());
        assert_eq!(svc.list_archived(None).unwrap().len(), 1);

        svc.unarchive("s-arch").unwrap();
        assert_eq!(svc.list(None).unwrap().len(), 1);
        assert!(svc.list_archived(None).unwrap().is_empty());

        svc.purge("s-arch").unwrap();
        assert!(svc.list(None).unwrap().is_empty());

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn test_delete() {
        let (svc, dir) = temp_service();
        let header = sample_header("s-del", "Delete Me");
        svc.create(header, None).unwrap();
        assert_eq!(svc.list(None).unwrap().len(), 1);

        svc.delete("s-del").unwrap();
        assert!(svc.list(None).unwrap().is_empty());

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn test_last_session_persistence() {
        let (svc, dir) = temp_service();
        assert!(svc.get_last().unwrap().is_none());
        svc.save_last("my-last-session").unwrap();
        assert_eq!(svc.get_last().unwrap(), Some("my-last-session".to_string()));
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn test_load_nonexistent_returns_error() {
        let (svc, dir) = temp_service();
        let err = svc.load("nonexistent").unwrap_err();
        assert_eq!(err.kind(), "not_found");
        assert!(err.to_string().contains("not found"));
        std::fs::remove_dir_all(&dir).ok();
    }
}
