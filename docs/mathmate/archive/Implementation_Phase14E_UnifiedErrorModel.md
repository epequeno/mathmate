# Implementation Plan — Phase 14E: Unified Error Model

## Objective

Define an `AppError` type on both sides of the wire (Rust + TS) with a small set of stable, machine-readable variants. Replace the current mix of `Result<T, String>`, `console.error`-and-swallow, `set({ error: err.message })`, and per-call `try/catch` shapes. The frontend gets typed error variants for the most common cases (auth, rate-limit, network, server, validation, tool-error) and can render actionable banners.

This plan is split into two steps to align sequencing:
- **14E.0 (before 14C):** define the shared error taxonomy and conversion helpers.
- **14E.1 (after 14C service extraction):** move IPC + store/UI paths to structured errors end-to-end.

## Current Pain

Error handling today is schizophrenic. A spot check:

| Place | Error behavior |
|---|---|
| `chatStore.sendMessage` | Catches errors, sets `error` field, writes error to chat as assistant message |
| `chatStore.newSession` | `console.error` only |
| `chatStore.openSession` | `console.error` only |
| `chatStore.deleteSession` | `console.error` only |
| `vaultStore.deleteNote` | Throws the error |
| `vaultStore.createNote` | Returns `null` on error, also `set({ error: ... })` |
| `projectStore.createProject` | Throws |
| `projectStore.archiveProject` | Silent |
| `lib.rs` commands | `Result<T, String>` — loses type info, no way for the frontend to distinguish "rate limit" from "auth fail" |
| `streamChat` | Good: `StreamError { status, retryable, rateLimited }` |
| `McpClient` | `Result<Value, String>` |
| `session::append_message` | On `io::Error` mid-append, the in-memory session has the new message but the file does not — silent corruption |
| `pathscope.rs` | `Result<PathBuf, String>` |

Three problems this causes:

1. **The frontend cannot distinguish "user has a bad API key" from "OpenRouter is down" from "the model is deprecated."** It has to parse English error messages.
2. **Silent failures.** `console.error` in `archiveProject` means a user can archive a project and not know it failed.
3. **The streaming flow is the only place with rich error info** (`StreamError.status`). Everywhere else it is `string` round-tripped across the IPC boundary.

## Proposed Design

### E.1 Rust `AppError`

```rust
// src-tauri/src/error.rs
use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Debug, Error, Serialize, Deserialize, Clone)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum AppError {
    #[error("Authentication failed: {0}")]
    Auth(String),

    #[error("Rate limited. Try again in {retry_after_secs}s.")]
    RateLimit { retry_after_secs: u32 },

    #[error("Network error: {0}")]
    Network(String),

    #[error("Server error ({status}): {message}")]
    Server { status: u16, message: String },

    #[error("Validation error: {0}")]
    Validation(String),

    #[error("Not found: {0}")]
    NotFound(String),

    #[error("Access denied: {0}")]
    AccessDenied(String),

    #[error("Tool execution failed: {tool}: {message}")]
    Tool { tool: String, message: String },

    #[error("Backend unavailable: {0}")]
    Unavailable(String),

    #[error("Operation cancelled")]
    Cancelled,

    #[error("Internal error: {0}")]
    Internal(String),
}

impl AppError {
    pub fn kind(&self) -> &'static str {
        match self {
            Self::Auth(_) => "auth",
            Self::RateLimit { .. } => "rate_limit",
            Self::Network(_) => "network",
            Self::Server { .. } => "server",
            Self::Validation(_) => "validation",
            Self::NotFound(_) => "not_found",
            Self::AccessDenied(_) => "access_denied",
            Self::Tool { .. } => "tool",
            Self::Unavailable(_) => "unavailable",
            Self::Cancelled => "cancelled",
            Self::Internal(_) => "internal",
        }
    }

    pub fn is_retryable(&self) -> bool {
        matches!(self, Self::Network(_) | Self::RateLimit { .. } | Self::Server { .. })
    }
}

impl From<rusqlite::Error> for AppError { ... }
impl From<std::io::Error> for AppError { ... }
impl From<serde_json::Error> for AppError { ... }
```

All service methods return `Result<T, AppError>`. The Tauri command boundary should return a structured error envelope in 14E.1 (not lossy stringification) so TS can consume `kind` reliably.

### E.2 TS `AppError`

```ts
// src/lib/error.ts
export type AppError =
  | { kind: "auth"; message: string }
  | { kind: "rate_limit"; message: string; retryAfterSecs: number }
  | { kind: "network"; message: string }
  | { kind: "server"; message: string; status: number }
  | { kind: "validation"; message: string }
  | { kind: "not_found"; message: string }
  | { kind: "access_denied"; message: string }
  | { kind: "tool"; message: string; tool: string }
  | { kind: "unavailable"; message: string }
  | { kind: "cancelled"; message: string }
  | { kind: "internal"; message: string }
  | { kind: "unknown"; message: string };

export function toAppError(err: unknown): AppError {
  if (err && typeof err === "object" && "kind" in err) return err as AppError;
  if (err instanceof Error) return { kind: "unknown", message: err.message };
  return { kind: "unknown", message: String(err) };
}

export function isRetryable(err: AppError): boolean {
  return err.kind === "network" || err.kind === "rate_limit" || err.kind === "server";
}
```

### E.3 StreamError merges into AppError

`StreamError` becomes a constructor that produces an `AppError`:

```ts
// src/lib/providers.ts
throw toAppError(new StreamError("Rate limited by OpenRouter. Waiting before retry...", { status: 429, rateLimited: true }));
```

The orchestrator (14B) catches `AppError` directly.

### E.4 Error banners in the UI

Add a small `ErrorBanner` component used by:
- `Layout` (global errors)
- `ChatInput` (per-turn errors)
- `VaultPage` (per-action errors)

```tsx
// src/components/ErrorBanner.tsx
function ErrorBanner({ error, onRetry, onDismiss }: Props) {
  if (!error) return null;
  return (
    <div className={`error-banner error-banner--${error.kind}`}>
      <Icon kind={error.kind} />
      <span>{error.message}</span>
      {error.kind === "rate_limit" && <RetryButton countdown={error.retryAfterSecs} />}
      {error.kind === "auth" && <SwitchKeyButton />}
      {onRetry && isRetryable(error) && <button onClick={onRetry}>Retry</button>}
      {onDismiss && <button onClick={onDismiss}>Dismiss</button>}
    </div>
  );
}
```

### E.5 Fix `append_message` corruption

In the service refactor (14C), the in-memory update and the disk write must be coordinated. The cleanest fix is a write-ahead log: append to disk first, then update in-memory; if the disk append fails, return an `AppError` and do not update in-memory. The current "open in append mode → write one line → return in-memory session" pattern can lose data on power failure between the in-memory update and the fsync.

```rust
// src-tauri/src/services/session.rs
pub fn append(&self, id: &str, message: &Message) -> Result<Session, AppError> {
    let path = self.session_path(id);
    let line = serde_json::to_string(&SessionLine::Message(message.clone()))?;
    let mut file = std::fs::OpenOptions::new().append(true).create(true).open(&path)?;
    writeln!(file, "{}", line)?;
    file.sync_all()?;  // <-- the missing fsync
    drop(file);
    // Now load to get the in-memory view
    self.load(id)
}
```

## Task Checklist

### 14E.0 — Foundation (before 14C)
- [ ] Add `src-tauri/src/error.rs` with the `AppError` enum, `From` impls, and `is_retryable`.
- [ ] Add `src/lib/error.ts` with the TS `AppError` union, `toAppError`, and `isRetryable`.
- [ ] Map `StreamError` to `AppError::RateLimit` / `AppError::Server` / `AppError::Network` / `AppError::Auth` / `AppError::Validation` based on status.
- [ ] Add `src/lib/error.test.ts` covering `toAppError` for `Error`, string, unknown, and IPC error-envelope shapes.

### 14E.1 — End-to-end rollout (after 14C)
- [ ] Migrate service methods to return `Result<T, AppError>` and keep one canonical enum (no temporary duplicate in services).
- [ ] Return structured errors over IPC (typed envelope with `kind`, message, and variant fields), not lossy stringification.
- [ ] Update `streamChat`/orchestrator/store flows to throw/store `AppError` directly.
- [ ] Add `src/components/ErrorBanner.tsx` with kind-specific icons and actions.
- [ ] Migrate `chatStore` to a single `error: AppError | null` field, render via `ErrorBanner`.
- [ ] Migrate `vaultStore`, `projectStore`, `memoryStore` to typed errors.
- [ ] Fix `session::append_message` to fsync (or move to `SessionService.append` per 14C).
- [ ] Add a "Retry" button in `ChatInput` that re-fires the last user message after `error.kind !== "validation"`.
- [ ] Replace all `console.error("...", err)` in `stores/*.ts` with `set({ error: toAppError(err) })` (or a toast).

## Validation

- `cargo check` ✅, `cargo test` ✅
- `npm run build` ✅, `npm test` ✅
- Manual smoke: trigger each error kind (auth fail via bad key, rate limit by hammering, network by killing the network adapter, server error via a 500-returning mock, access denied by requesting a path outside the vault, tool error by giving bad args, cancelled by pressing Esc mid-stream, validation by submitting an empty session title).

## Acceptance Criteria

- Every Tauri command returns `Result<T, AppError>` from the service layer, and IPC preserves structured `AppError` data (`kind` + fields) without string parsing.
- `console.error(...)` is not used in any `src/stores/*.ts` file except for true "I have no recovery path" log-and-swallow cases, which are documented in code.
- The streaming flow's retry/cancel decisions are based on `AppError.kind`, not on string parsing.
- A single `ErrorBanner` component renders every persistent error in the app.
- `session.append` cannot silently lose data on crash.

## Risks

- **Structured IPC rollout touches many commands.** Mitigation: migrate command groups incrementally with contract tests for error envelopes.
- **The `fsync` change to `append_message` adds a syscall per message.** Negligible at human-message rates (~1/sec) but worth measuring.
- **Some existing components catch and discard errors with `try { ... } catch { /* silent */ }`.** These need a decision in each PR: either surface the error or document why it's safe to swallow.
