use rusqlite::{params, Connection};
use std::path::PathBuf;
#[cfg(feature = "export-types")]
use ts_rs::TS;
use crate::services::memory::{MemoryItem, SafetyMode, ScanResult, ScanResultKind};

fn db_path() -> PathBuf {
    let mut p = dirs_next::home_dir().unwrap_or_else(|| PathBuf::from("/tmp"));
    p.push(".mathmate");
    let _ = std::fs::create_dir_all(&p);
    p.push("memory.db");
    p
}

/// Open the database at a specific path and ensure schema exists.
pub fn open_db_at(path: &PathBuf) -> Result<Connection, String> {
    let conn = Connection::open(path).map_err(|e| format!("Failed to open memory.db: {}", e))?;
    init_schema(&conn)?;
    run_idempotent_migrations(&conn)?;
    Ok(conn)
}

/// Open the database at the default ~/.mathmate/memory.db path.
#[allow(dead_code)] // kept for backward compat; MemoryService uses open_db_at
pub fn open_db() -> Result<Connection, String> {
    open_db_at(&db_path())
}

fn init_schema(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS memories (
            id TEXT PRIMARY KEY,
            session_id TEXT,
            source_type TEXT NOT NULL DEFAULT 'manual',
            unit_type TEXT NOT NULL DEFAULT 'note',
            content TEXT NOT NULL,
            score REAL NOT NULL DEFAULT 0.0,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            tags TEXT NOT NULL DEFAULT '[]',
            provenance TEXT
        );
        CREATE TABLE IF NOT EXISTS learner_profile (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        -- FTS5 virtual table for full-text search
        CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
            content, tags, content=memories, content_rowid=rowid
        );
        -- Triggers to keep FTS index in sync
        CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
            INSERT INTO memories_fts(rowid, content, tags) VALUES (new.rowid, new.content, new.tags);
        END;
        CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN
            INSERT INTO memories_fts(memories_fts, rowid, content, tags) VALUES('delete', old.rowid, old.content, old.tags);
        END;
        CREATE TRIGGER IF NOT EXISTS memories_au AFTER UPDATE ON memories BEGIN
            INSERT INTO memories_fts(memories_fts, rowid, content, tags) VALUES('delete', old.rowid, old.content, old.tags);
            INSERT INTO memories_fts(rowid, content, tags) VALUES (new.rowid, new.content, new.tags);
        END;"
    ).map_err(|e| format!("Failed to init schema: {}", e))
}

/// Run idempotent ALTER TABLE migrations.  SQLite returns an error if the
/// column already exists, which we ignore.
fn run_idempotent_migrations(conn: &Connection) -> Result<(), String> {
    let migrations = [
        "ALTER TABLE memories ADD COLUMN scan_status TEXT",
        "ALTER TABLE memories ADD COLUMN scan_reason TEXT",
    ];
    for sql in &migrations {
        let _ = conn.execute(sql, []);
    }
    Ok(())
}

// ─── Content Scanning ───────────────────────────

/// Scan memory content for injection patterns.
///
/// Mirror of the TypeScript `scanMemoryContent` in `memorySafety.ts`.
/// The Rust side is the authoritative enforcement point.
pub fn scan_memory_content(content: &str, mode: &SafetyMode) -> ScanResult {
    if *mode == SafetyMode::Off {
        return ScanResult {
            kind: ScanResultKind::Accepted,
            reason: None,
            redacted: None,
        };
    }

    // Reject patterns — these always block the write
    if let Some(id) = match_exfil_url(content) {
        return ScanResult {
            kind: ScanResultKind::Rejected,
            reason: Some(format!("Matched injection pattern \"{}\"", id)),
            redacted: None,
        };
    }
    if let Some(id) = match_tool_call(content) {
        return ScanResult {
            kind: ScanResultKind::Rejected,
            reason: Some(format!("Matched injection pattern \"{}\"", id)),
            redacted: None,
        };
    }

    // Redact patterns — in strict mode these also reject
    if let Some((id, redacted)) = redact_pattern(content, mode) {
        if *mode == SafetyMode::Strict {
            return ScanResult {
                kind: ScanResultKind::Rejected,
                reason: Some(format!(
                    "Matched injection pattern \"{}\" (strict mode)",
                    id
                )),
                redacted: None,
            };
        }
        return ScanResult {
            kind: ScanResultKind::AcceptedWithRedaction,
            reason: Some(format!("Matched pattern \"{}\"", id)),
            redacted: Some(redacted),
        };
    }

    ScanResult {
        kind: ScanResultKind::Accepted,
        reason: None,
        redacted: None,
    }
}

/// Check for exfil URL patterns: `src=`, `href=`, `fetch=`, `location=` followed by a URL.
fn match_exfil_url(content: &str) -> Option<&'static str> {
    let re = regex::Regex::new(
        r##"(?i)(?:src|href|fetch|location)\s*[:=]\s*["']?(?:https?:)?//[^"'\s]+"##,
    )
    .unwrap();
    if re.is_match(content) {
        Some("exfil-url")
    } else {
        None
    }
}

/// Check for JSON tool-call patterns.
fn match_tool_call(content: &str) -> Option<&'static str> {
    let re = regex::Regex::new(r#"(?i)\{\s*"name"\s*:\s*"(?:invoke|fetch|curl|exec)""#).unwrap();
    if re.is_match(content) {
        Some("tool-call")
    } else {
        None
    }
}

/// Check redact patterns and return the first match + redacted content.
fn redact_pattern(content: &str, mode: &SafetyMode) -> Option<(&'static str, String)> {
    let patterns: Vec<(&str, regex::Regex)> = vec![
        (
            "ignore-previous",
            regex::Regex::new(
                r"(?i)ignore (?:all )?(?:previous|prior|above) (?:instructions|prompts?|rules)",
            )
            .unwrap(),
        ),
        (
            "system-impersonation",
            regex::Regex::new(r"^\s*<\|im_start\|>system\b").unwrap(),
        ),
        (
            "system-block",
            regex::Regex::new(r"(?i)###\s*system\s*prompt\s*[:-]").unwrap(),
        ),
        (
            "role-hijack",
            regex::Regex::new(r"(?i)you are now\b|act as(?:\s+a)?\b|pretend to be\b").unwrap(),
        ),
        (
            "secret-ask",
            regex::Regex::new(
                r"(?i)(?:api[_\-]?key|access[_\-]?token|secret|sk-[A-Za-z0-9_\-]{8,})",
            )
            .unwrap(),
        ),
    ];

    for (id, re) in &patterns {
        if re.is_match(content) {
            if *mode == SafetyMode::Strict {
                return Some((id, String::new()));
            }
            let redacted = re
                .replace(content, "[redacted:prompt-injection]")
                .to_string();
            return Some((id, redacted));
        }
    }

    None
}

// ─── Store with Safety ──────────────────────────

/// Store a memory after scanning for injection patterns.
/// The scan result is persisted in `scan_status` / `scan_reason`.
/// If `redacted` content is provided, the redacted version is stored.
pub fn store_memory_with_safety(
    conn: &Connection,
    memory: &MemoryItem,
    mode: &SafetyMode,
) -> Result<ScanResult, String> {
    let scan = scan_memory_content(&memory.content, mode);

    match scan.kind {
        ScanResultKind::Rejected => {
            return Ok(scan);
        }
        ScanResultKind::AcceptedWithRedaction => {
            let stored_content = scan.redacted.as_deref().unwrap_or(&memory.content);
            conn.execute(
                "INSERT INTO memories (id, session_id, source_type, unit_type, content, score, created_at, tags, provenance, scan_status, scan_reason)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
                params![
                    memory.id,
                    memory.session_id,
                    memory.source_type,
                    memory.unit_type,
                    stored_content,
                    memory.score,
                    memory.created_at,
                    serde_json::to_string(&memory.tags).unwrap_or_else(|_| "[]".into()),
                    memory.provenance,
                    "accepted_with_redaction",
                    scan.reason,
                ],
            )
            .map_err(|e| format!("Failed to store memory: {}", e))?;
        }
        ScanResultKind::Accepted => {
            conn.execute(
                "INSERT INTO memories (id, session_id, source_type, unit_type, content, score, created_at, tags, provenance, scan_status, scan_reason)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
                params![
                    memory.id,
                    memory.session_id,
                    memory.source_type,
                    memory.unit_type,
                    memory.content,
                    memory.score,
                    memory.created_at,
                    serde_json::to_string(&memory.tags).unwrap_or_else(|_| "[]".into()),
                    memory.provenance,
                    "accepted",
                    Option::<String>::None,
                ],
            )
            .map_err(|e| format!("Failed to store memory: {}", e))?;
        }
    }

    Ok(scan)
}

/// Store a new memory (legacy — no scan).
pub fn store_memory(conn: &Connection, memory: &MemoryItem) -> Result<(), String> {
    conn.execute(
        "INSERT INTO memories (id, session_id, source_type, unit_type, content, score, created_at, tags, provenance)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![
            memory.id,
            memory.session_id,
            memory.source_type,
            memory.unit_type,
            memory.content,
            memory.score,
            memory.created_at,
            serde_json::to_string(&memory.tags).unwrap_or_else(|_| "[]".into()),
            memory.provenance,
        ],
    ).map_err(|e| format!("Failed to store memory: {}", e))?;
    Ok(())
}

// ─── Query ──────────────────────────────────────

/// Query memories by FTS5 full-text search with score ranking.
pub fn query_memories(
    conn: &Connection,
    query: &str,
    limit: usize,
) -> Result<Vec<MemoryItem>, String> {
    if query.trim().is_empty() {
        // Return most recent memories when no query
        let mut stmt = conn.prepare(
            "SELECT id, session_id, source_type, unit_type, content, score, created_at, tags, provenance, scan_status, scan_reason
             FROM memories ORDER BY score DESC, created_at DESC LIMIT ?1"
        ).map_err(|e| format!("Failed to prepare query: {}", e))?;

        let results = stmt
            .query_map(params![limit as i64], |row| {
                let tags_str: String = row.get(7)?;
                let tags: Vec<String> = serde_json::from_str(&tags_str).unwrap_or_default();
                Ok(MemoryItem {
                    id: row.get(0)?,
                    session_id: row.get(1)?,
                    source_type: row.get(2)?,
                    unit_type: row.get(3)?,
                    content: row.get(4)?,
                    score: row.get(5)?,
                    created_at: row.get(6)?,
                    tags,
                    provenance: row.get(8)?,
                    scan_status: row.get(9)?,
                    scan_reason: row.get(10)?,
                })
            })
            .map_err(|e| format!("Failed to query memories: {}", e))?;

        let mut items = Vec::new();
        for r in results.flatten() {
            items.push(r);
        }
        return Ok(items);
    }

    // FTS5 search with ranking
    let mut stmt = conn.prepare(
        "SELECT m.id, m.session_id, m.source_type, m.unit_type, m.content, m.score, m.created_at, m.tags, m.provenance, m.scan_status, m.scan_reason
         FROM memories m
         JOIN memories_fts fts ON m.rowid = fts.rowid
         WHERE memories_fts MATCH ?1
         ORDER BY rank
         LIMIT ?2"
    ).map_err(|e| format!("Failed to prepare search: {}", e))?;

    let results = stmt
        .query_map(params![query, limit as i64], |row| {
            let tags_str: String = row.get(7)?;
            let tags: Vec<String> = serde_json::from_str(&tags_str).unwrap_or_default();
            Ok(MemoryItem {
                id: row.get(0)?,
                session_id: row.get(1)?,
                source_type: row.get(2)?,
                unit_type: row.get(3)?,
                content: row.get(4)?,
                score: row.get(5)?,
                created_at: row.get(6)?,
                tags,
                provenance: row.get(8)?,
                scan_status: row.get(9)?,
                scan_reason: row.get(10)?,
            })
        })
        .map_err(|e| format!("Failed to search memories: {}", e))?;

    let mut items = Vec::new();
    for r in results.flatten() {
        items.push(r);
    }
    Ok(items)
}

// ─── Delete ─────────────────────────────────────

/// Delete a memory by ID.
pub fn forget_memory(conn: &Connection, id: &str) -> Result<(), String> {
    conn.execute("DELETE FROM memories WHERE id = ?1", params![id])
        .map_err(|e| format!("Failed to delete memory: {}", e))?;
    Ok(())
}

// ─── Profile ────────────────────────────────────

/// Get a value from the learner profile.
pub fn get_profile(conn: &Connection, key: &str) -> Result<Option<String>, String> {
    let mut stmt = conn
        .prepare("SELECT value FROM learner_profile WHERE key = ?1")
        .map_err(|e| format!("Failed to prepare profile query: {}", e))?;
    let result = stmt
        .query_row(params![key], |row| row.get::<_, String>(0))
        .ok();
    Ok(result)
}

/// Set a value in the learner profile.
pub fn set_profile(conn: &Connection, key: &str, value: &str) -> Result<(), String> {
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO learner_profile (key, value, updated_at) VALUES (?1, ?2, ?3)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
        params![key, value, now],
    )
    .map_err(|e| format!("Failed to set profile: {}", e))?;
    Ok(())
}

/// Check if the database exists and has been initialised.
#[allow(dead_code)]
pub fn db_exists() -> bool {
    db_path().exists()
}
