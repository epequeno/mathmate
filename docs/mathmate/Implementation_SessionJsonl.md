# Implementation Plan: Session Storage — JSONL Migration

**Phase**: TRND-5  
**Status**: ✅ Implemented 2026-05-28  
**PR scope**: `mathmate-v2/src-tauri/src/session.rs` only — no TypeScript changes required.

---

## Problem

The v2 Tauri app accidentally used a monolithic JSON format for session storage
instead of JSONL.  Every call to `append_message` performed a full
**load → modify → rewrite** cycle on the entire session file:

```rust
// OLD append_message — full file rewrite on every turn
pub fn append_message(...) -> Result<Session, String> {
    let mut session = load_session(session_id)?;   // read whole file
    session.messages.push(message.clone());
    session.header.updated_at = Utc::now().to_rfc3339();
    save_session(&session)?;                        // write whole file
    Ok(session)
}
```

This is the opposite of how both the Swift v1 app and pi store conversations.
It also created a risk of total session loss if the process was killed mid-write
(the concern that prompted THQ-9).

Both prior apps use JSONL: one JSON object per line, with the header on line 1
and each message on subsequent lines.  Appending a message is a single
`writeln!` call — O(1), and inherently safe because a partial write can corrupt
at most the last line.

---

## New Format

```jsonl
{"type":"header","id":"abc123","title":"Quadratic formula","model":"...","provider":"...","created_at":"...","updated_at":"...","project_id":"...","tutor_style":null,"flags":null}
{"type":"message","id":"msg1","role":"user","content":[{"type":"text","text":"explain the quadratic formula"}],"created_at":"...","flags":null}
{"type":"message","id":"msg2","role":"assistant","content":[{"type":"text","text":"The quadratic formula is..."}],"created_at":"...","flags":null}
```

### Key design decision: `updated_at` derived at read time

Storing `updated_at` accurately in the header line would require rewriting the
first line of the file every time a message is appended.  Instead, `read_jsonl`
derives `updated_at` from the last message's `created_at`:

```rust
if let Some(last_msg) = messages.last() {
    if let Some(ts) = &last_msg.created_at {
        h.updated_at = ts.clone();
    }
}
```

The header's stored `updated_at` is set once at session creation (when
`updated_at == created_at`).  After that it is always overridden at read time.
This means the header line is only rewritten during `rename_session` — which is
acceptable because renaming is an infrequent user action.

---

## What Changed in `session.rs`

### Added
- `SessionLine` enum (`#[serde(tag = "type", rename_all = "snake_case")]`) with
  `Header(SessionHeader)` and `Message(Message)` variants — the JSONL line type.
- `write_jsonl(path, session)` — writes header line + one line per message.
- `read_jsonl(path)` — parses all lines, derives `updated_at`, skips malformed
  lines rather than aborting (crash-resilient partial recovery).
- `migrate_json_to_jsonl(json_path, jsonl_path)` — reads a legacy v2 `.json`
  session, writes it as `.jsonl`, removes the old file.
- `legacy_json_path(id)` / `legacy_archived_json_path(id)` — fallback paths
  for the migration window.
- `list_sessions_in_dir` — shared implementation for active and archived listing,
  handles both `.jsonl` (v2 new) and `.json` (v2 legacy) extensions.
- `delete_matching_in_dir` — project-scoped deletion, handles both extensions.

### Changed
- `session_path(id)` now returns `{id}.jsonl` (was `.json`).
- `archived_path(id)` now returns `{id}.jsonl` (was `.json`).
- `save_session` calls `write_jsonl` (full rewrite — used for create/rename).
- `append_message` now does one disk read + one O(1) line append, no full
  rewrite.  The updated session is returned from the in-memory vector (no
  second read).
- `load_session` tries `.jsonl` first, then transparently migrates `.json` to
  `.jsonl` on first access.
- `list_sessions` / `list_archived_sessions` delegate to `list_sessions_in_dir`
  which accepts both `.jsonl` and `.json` extensions.
- `archive_session` calls `load_session` first to ensure JSONL format before
  renaming the file.
- `unarchive_session` migrates legacy archived `.json` files before moving.
- `delete_session` / `purge_session` check both extensions.

### Removed
- `save_session` is no longer called from `append_message` (was the source of
  the full-rewrite problem).
- The `.json` extension filter in the old `list_sessions` loop.

---

## Migration Behaviour

| Existing file | What happens on first access |
|---|---|
| v2 `.json` session (monolithic) | Parsed, written as `.jsonl`, old `.json` deleted |
| v2 `.json` archived session | Migrated on `unarchive_session` call |
| Swift v1 `.jsonl` session | Listed as unknown extension — **not touched** (different schema; pending separate migration tool) |
| New v2 `.jsonl` session | Read directly — no migration needed |

The migration is **lazy** (triggered on first `load_session` or `unarchive_session`
call) and **transparent** (callers receive a normal `Session`, unaware any
migration occurred).

---

## Performance Comparison

| Operation | Before (monolithic JSON) | After (JSONL) |
|---|---|---|
| Append message | Read N lines + write N+1 lines | Read N lines + write 1 line |
| List sessions | Read full file per session | Read full file per session (same — can optimize to line-1-only in future) |
| Load session | Read full file | Read full file |
| Rename session | Read full file + write full file | Read full file + write full file (same — rare op) |
| Corruption risk | Entire session at risk on crash | Only last line at risk (append is atomic at OS level for lines < block size) |

The main gain is `append_message`, which accounts for ~90% of all session writes.

---

## Relation to THQ-9

THQ-9 proposed write-to-tmp + atomic rename to prevent corruption on crash.
With JSONL append:

- The header and all prior messages are never touched during `append_message`.
- A crash during `writeln!` can corrupt at most the final incomplete line.
- `read_jsonl` already skips malformed lines with `eprintln!` rather than
  returning an error, so a partial final line is silently ignored on next load.

THQ-9 is still worth doing for `rename_session` / `save_session` (full rewrites
that remain) but the risk is dramatically smaller now that those paths are
only called on rename and initial creation.

---

## Testing

Manual verification (post-implementation):
- [x] `cargo check` passes — zero new errors or warnings
- [x] JSONL output format verified with Python round-trip simulation
- [x] `updated_at` derivation from last message timestamp confirmed correct
- [ ] Start app, send a message — verify session appears in sidebar
- [ ] Reload app — verify session and messages restore correctly
- [ ] Rename session — verify title change persists
- [ ] Archive + unarchive session — verify messages intact
- [ ] Delete session — verify file removed from `~/.mathmate/sessions/`
- [ ] Verify existing v2 `.json` session auto-migrates on first load
      (`ls ~/.mathmate/sessions/` should show `.jsonl` after first open)
- [ ] Verify v1 Swift `.jsonl` files remain untouched and are not shown in the
      v2 sidebar (expected — different schema, pending migration tool)

---

## Future Work
- **Listing optimisation**: `list_sessions_in_dir` currently reads the full
  JSONL file per session to derive `updated_at`.  An optimised version would
  read only line 1 (header) and the last line (latest message timestamp) using
  `Seek`, which is efficient even for large sessions.  This is a pure
  performance improvement with no behaviour change.
- **Swift v1 legacy migration**: A dedicated migration pass to convert the
  14 existing Swift v1 `.jsonl` files (different schema: `isUser`, `parts`,
  CFAbsoluteTime timestamps) to v2 JSONL format so they appear in the v2
  sidebar.

---

*Implemented: 2026-05-28*
