# Implementation Plan: Security — OS Keychain Storage for API Keys

## 1) Goal

Move provider API keys out of plaintext `~/.mathmate/models.json` into the operating system's native credential store:

- **macOS** — Keychain (via the `security` CLI or `security-framework`/`keyring` crate)
- **Windows** — Credential Manager / DPAPI
- **Linux** — libsecret / Secret Service API (D-Bus)

The Settings page surfaces a "Stored in Keychain" / "Stored in plaintext (legacy)" badge and a one-click "Move to Keychain" affordance. Existing plaintext keys are migrated at first launch.

This is the single most visible trust signal to security-conscious end users and addresses roadmap item **(2)**.

---

## 2) Threat Model (Practical)

- Adversary: shared/lost machine, accidental cloud backup (iCloud Drive, Dropbox, OneDrive), a co-worker with file-level access to the user's home dir, a misconfigured backup tool, a fork-bomb or malware that exfiltrates `~/.mathmate/`.
- Capability sought: read the user's OpenAI / Anthropic / OpenRouter / custom-provider keys.
- Mitigation: keys live in the OS keychain, not in `~/.mathmate/models.json`. The JSON file is no longer sufficient to authenticate.
- Out of scope: secrets stored elsewhere in the app (none today). Side-channel attacks on the keychain itself.

---

## 3) Scope

### In scope
- New Rust module `secrets.rs` wrapping the `keyring` crate.
- New Tauri commands: `set_provider_api_key_secure`, `has_provider_api_key`, `migrate_legacy_keys`.
- Update existing `set_provider_api_key` to store in keychain (or keep as plaintext for the legacy migration path).
- `models.json` schema: add `key_storage: "keychain" | "plaintext"` field per provider. Stop serializing `stored_api_key` to disk in the keychain case.
- Frontend: Settings page UI showing badge + "Move to Keychain" / "Use plaintext" toggles + one-time migration on first launch.
- CSP-friendly: avoid leaking keys through any Tauri command that returns the full provider list to non-Settings pages.

### Out of scope
- Multi-account / per-project key support.
- Keychain syncing (iCloud Keychain, etc.) — that's a per-user OS choice; we just use the local store.
- Encrypted-at-rest fallback for Linux systems without libsecret (e.g., headless servers). Show a clear error and a "fall back to plaintext (advanced, encrypted with a passphrase you set)" path in a later phase.

---

## 4) System Design

### 4.1 Crate choice

Use the `keyring` crate (v3.x). It has cross-platform backends: `apple-native` (Keychain on macOS), `windows-native` (Credential Manager), `linux-native-sync-persistent` (libsecret + a sync fallback).

Add to `Cargo.toml`:
```toml
keyring = { version = "3", features = ["apple-native", "windows-native", "sync-secret-service"] }
```

### 4.2 Service identifier

`service = "ai.mathmate.app"`, `username = "provider:<provider_name>"` (e.g., `provider:openrouter`). This puts all MathMate secrets in one bucket per user, easy to find and revoke.

### 4.3 Schema migration

Current `models.json`:
```json
{
  "providers": [
    { "name": "openrouter", "stored_api_key": "sk-...", ... }
  ]
}
```

New schema:
```json
{
  "providers": [
    { "name": "openrouter", "key_storage": "plaintext", "stored_api_key": "sk-...", ... },
    { "name": "anthropic", "key_storage": "keychain", "stored_api_key": null, ... }
  ]
}
```

When `key_storage == "keychain"`, `stored_api_key` is `null` (or omitted via `skip_serializing_if`). The real key lives in the OS keychain under `provider:<name>`.

The migration is:
1. On first load, if any provider has `stored_api_key` set and `key_storage` is missing, treat as `"plaintext"`.
2. On user action ("Move to Keychain"), write the key to the keychain, set `key_storage = "keychain"`, set `stored_api_key = null`, save.
3. On user action ("Use plaintext (not recommended)"), delete from keychain, set `key_storage = "plaintext"`, set `stored_api_key = "<value>"`, save.
4. On first app launch in a future release, optionally show a one-time banner: "We can store your API keys in the macOS Keychain for better security. [Migrate now] [Not now]".

### 4.4 IPC surface

Add Tauri commands:
- `set_provider_api_key_secure(name: String, key: Option<String>) -> Result<KeyStorage, String>`
  - Writes/clears the key in the keychain.
  - Returns the new `key_storage` value so the UI can refresh.
- `has_provider_api_key(name: String) -> Result<bool, String>`
  - Returns presence only (no secret value).
- `migrate_legacy_keys() -> Result<MigrationReport, String>`
  - Walks `models.json`, moves every `stored_api_key` into the keychain, returns counts.
  - Idempotent: a key already in the keychain with the same value is a no-op.

Avoid adding a general-purpose `get_provider_api_key` command in this phase. Route-level UI checks are not a true security boundary in a compromised renderer.

### 4.5 CSP / IPC exposure of keys

No command should return raw API keys to the renderer by default.
- `get_models_config` must never include raw `stored_api_key` values.
- Expose only `has_stored_api_key: bool` and storage metadata.
- Settings uses a write-only flow: user pastes/replaces a key and saves; existing key value is never read back.
- Optional future enhancement: one-shot reveal with explicit user re-authentication (OS biometric/prompt), separate command, and strict audit logging.

### 4.6 Frontend UX

Settings page per-provider block:

```
Provider: openrouter
[ enabled toggle ]
Endpoint: https://openrouter.ai/api/v1
Default model: moonshotai/kimi-k2
Storage: 🟢 Stored in macOS Keychain     [ Use plaintext ]   [ Replace key ]
```

When `key_storage == "plaintext"`:
```
Storage: 🟡 Stored in plaintext (legacy)  [ Move to Keychain ]   [ Replace key ]
```

The password input continues to work as today. The "Save" button writes to whichever backend is selected. Existing keys are not revealed back to the UI; users can replace or clear them.

### 4.7 Settings page entrypoint

Today's `SettingsPage.tsx:347` does `defaultValue={p.stored_api_key ?? ""}` — change to a write-only editor with placeholder text (e.g. `••••••••`). Avoid hydrating actual key material into React state.

---

## 5) File-by-File Tickets

### S2E1 — `secrets` Rust module
**New:**
- `mathmate/src-tauri/src/secrets.rs`

**Tasks:**
- Add `keyring = { version = "3", features = [...] }` to `Cargo.toml`.
- Implement:
  - `pub fn store_key(provider: &str, key: &str) -> Result<(), String>`
  - `pub fn load_key(provider: &str) -> Result<Option<String>, String>`
  - `pub fn delete_key(provider: &str) -> Result<(), String>`
- Use `service = "ai.mathmate.app"`, `user = "provider:<name>"`.
- Map `keyring::Error::NoEntry` to `Ok(None)`.
- On macOS, also handle the keychain access prompt that may appear on first call. Document the prompt in the user-facing first-run experience.

### S2E2 — Tauri commands
**Modify:**
- `mathmate/src-tauri/src/lib.rs`

**Tasks:**
- Add commands:
  - `set_provider_api_key_secure(name: String, key: Option<String>) -> Result<String, String>` (returns new `key_storage` value)
  - `has_provider_api_key(name: String) -> Result<bool, String>`
  - `migrate_legacy_keys() -> Result<MigrationReport, String>`
- Register in `invoke_handler!`.
- Refactor `set_provider_api_key` to delegate to `secrets` when `key_storage == "keychain"`, else to existing plaintext path.

### S2E3 — `ProviderConfig` schema
**Modify:**
- `mathmate/src-tauri/src/config.rs`

**Tasks:**
- Add `key_storage: String` field with default `"plaintext"`.
- Add `#[serde(skip_serializing_if = "Option::is_none")]` on `stored_api_key` (already present).
- Add `#[serde(default)]` on `key_storage` for backward compatibility with old `models.json` files.
- Add `default_models_config()` and the SettingsPage to write `key_storage: "keychain"` for new providers once the user clicks "Move to Keychain".

### S2E4 — `get_models_config` key redaction
**Modify:**
- `mathmate/src-tauri/src/lib.rs:57`

**Tasks:**
- For all storage modes, return `has_stored_api_key: bool` only; never return raw key material.
- Keep `stored_api_key` internal-only for migration/write paths and omit from public config payload.
- Update `ProviderConfig` TypeScript type in `configStore.ts` to add `key_storage: "keychain" | "plaintext"` and `has_stored_api_key: boolean`.

### S2E5 — Settings page UI
**Modify:**
- `mathmate/src/pages/SettingsPage.tsx`

**Tasks:**
- Replace the always-rendered `<input type="password" defaultValue={p.stored_api_key ?? ""}>` with:
  - write-only input (`placeholder="••••••••"`) used for replace/clear operations.
  - Save button that calls `set_provider_api_key_secure`.
  - "Storage:" badge showing `🟢 Keychain` / `🟡 Plaintext (legacy)`.
  - "Move to Keychain" / "Use plaintext" buttons (with a confirmation modal for "Use plaintext" warning the user that the key will be written to disk in plaintext).
- On first mount, call `migrate_legacy_keys()` once (track via localStorage flag) and show a toast summarizing the migration result.

### S2E6 — `docs/SECURITY.md` (existing file from CSP plan)
**Modify:**
- Add a "Key storage" section explaining the keychain model, the `ai.mathmate.app` service name, how to find/revoke keys in the OS, and the migration story.

---

## 6) Testing Plan

### Unit (Rust)
- `secrets.rs`:
  - `store_key` then `load_key` round-trip.
  - `load_key` for an unknown provider returns `Ok(None)`.
  - `delete_key` then `load_key` returns `Ok(None)`.
- `config.rs`:
  - Round-trip serialization of a provider with `key_storage = "keychain"` and `stored_api_key = None` — `stored_api_key` is not written to the file.

### Integration
- On macOS dev machine:
  1. Save an OpenRouter key via the UI; verify it appears in `Keychain Access` under `ai.mathmate.app`.
  2. Verify `~/.mathmate/models.json` has `key_storage: "keychain"` and `stored_api_key: null`.
  3. Verify key presence indicator (`has_provider_api_key`) is true without exposing the key value.
  4. Click "Use plaintext" — confirm dialog, then verify `models.json` has the key and the keychain entry is gone.
  5. Click "Move to Keychain" — verify the keychain entry is restored and the JSON is clean.
- On a fresh install, with an existing plaintext `models.json` containing keys, launch the app — the first-run banner offers migration; click "Migrate now" — verify all keys are moved.

### CI
- `cargo test` (with the secrets tests gated behind `#[cfg(target_os = "macos")]` or using `keyring`'s mock store).
- `npm run build` and `vitest` for the frontend SettingsPage changes.

---

## 7) Acceptance Criteria

- [ ] `keyring` crate added; secrets module compiles on macOS, Windows, and Linux.
- [ ] `models.json` no longer contains `stored_api_key` for any provider with `key_storage = "keychain"`.
- [ ] Settings page shows the storage badge and the "Move to Keychain" affordance.
- [ ] On macOS, the key is visible in Keychain Access under `ai.mathmate.app`.
- [ ] One-time migration banner works for users with existing plaintext keys.
- [ ] No general-purpose command returns raw key material to the renderer; `get_models_config` always redacts key values.
- [ ] CHANGELOG and dev log updated; `SECURITY.md` documents the keychain model.

---

## 8) Rollout Plan

1. Land the `secrets` module and Tauri commands behind a feature flag (`MATHMATE_KEYCHAIN=1`).
2. Add the storage badge to Settings; ship as opt-in for one release so we get field feedback.
3. Enable by default; show the one-time migration banner to existing users.
4. Add a Settings toggle for advanced users to "always use plaintext" (with a clear warning).
5. CHANGELOG entry: "Changed (Security): API keys can now be stored in the OS keychain (Keychain on macOS, Credential Manager on Windows, libsecret on Linux) instead of plaintext `~/.mathmate/models.json`. Existing plaintext keys are migrated on first launch via an in-app prompt."
