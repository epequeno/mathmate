// ─── Unified Error Model ───────────────────────────────────────────────
//
// AppError is the single canonical error type for all Tauri commands.
// It serializes to a structured JSON envelope with a machine-readable
// `kind` discriminator, so the frontend can branch on error variants
// without parsing English strings.
//
// All service-layer methods should return Result<T, AppError>.  Tauri
// commands in lib.rs are expected to map their inner AppErrors into a
// simple Tauri error (which the TS API wrappers then re-hydrate via
// toAppError), but the structured envelope is stable on the wire and
// consumable in TS without knowledge of the Rust payload.
//
// See: Implementation_Phase14E_UnifiedErrorModel.md

use serde::{Deserialize, Serialize};

// ─── AppError enum ──────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum AppError {
    /// Bad API key, expired token, invalid credentials.
    Auth(AuthPayload),

    /// Rate limited by the provider.  `retry_after_secs` may be 0 if
    /// the provider did not send a Retry-After header.
    RateLimit(RateLimitPayload),

    /// DNS failure, connection refused, timeout, offline.
    Network(NetworkPayload),

    /// Provider returned 5xx or another server-side error.
    Server(ServerPayload),

    /// Input validation failed (missing field, out of range, bad format).
    Validation(ValidationPayload),

    /// Requested resource does not exist (session, note, project, etc.).
    NotFound(NotFoundPayload),

    /// Operation not permitted (path outside vault, tool access denied).
    AccessDenied(AccessDeniedPayload),

    /// Tool execution failure (tool returned an error or crashed).
    Tool(ToolPayload),

    /// A resource or service is temporarily unavailable (database locked,
    /// file in use, backend restarting).
    Unavailable(UnavailablePayload),

    /// Operation cancelled by user (aborted stream, window close).
    Cancelled,

    /// Unexpected internal errors (panic catch, invariant violation,
    /// unknown serialization failure).
    Internal(InternalPayload),
}

// ─── Variant payloads ───────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthPayload {
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RateLimitPayload {
    pub message: String,
    pub retry_after_secs: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NetworkPayload {
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerPayload {
    pub message: String,
    pub status: u16,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidationPayload {
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NotFoundPayload {
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AccessDeniedPayload {
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolPayload {
    pub message: String,
    pub tool: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UnavailablePayload {
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InternalPayload {
    pub message: String,
}

// ─── AppError methods ───────────────────────────────────────────────

impl AppError {
    /// Return a stable string identifier (matching the JSON `kind` tag).
    #[allow(dead_code)] // used in tests, will be used by service layer
    pub fn kind(&self) -> &'static str {
        match self {
            Self::Auth(_) => "auth",
            Self::RateLimit(_) => "rate_limit",
            Self::Network(_) => "network",
            Self::Server(_) => "server",
            Self::Validation(_) => "validation",
            Self::NotFound(_) => "not_found",
            Self::AccessDenied(_) => "access_denied",
            Self::Tool(_) => "tool",
            Self::Unavailable(_) => "unavailable",
            Self::Cancelled => "cancelled",
            Self::Internal(_) => "internal",
        }
    }

    /// Whether the caller can reasonably retry this operation.
    #[allow(dead_code)] // used in tests, will be used by orchestrator
    pub fn is_retryable(&self) -> bool {
        matches!(
            self,
            Self::Network(_) | Self::RateLimit(_) | Self::Server(_) | Self::Unavailable(_)
        )
    }
}

// ─── Display ────────────────────────────────────────────────────────

impl std::fmt::Display for AppError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        use AppError::*;
        match self {
            Auth(p) => write!(f, "Authentication failed: {}", p.message),
            RateLimit(p) => write!(
                f,
                "Rate limited. Try again in {}s. {}",
                p.retry_after_secs, p.message
            ),
            Network(p) => write!(f, "Network error: {}", p.message),
            Server(p) => write!(f, "Server error ({}): {}", p.status, p.message),
            Validation(p) => write!(f, "Validation error: {}", p.message),
            NotFound(p) => write!(f, "Not found: {}", p.message),
            AccessDenied(p) => write!(f, "Access denied: {}", p.message),
            Tool(p) => write!(f, "Tool error: {} — {}", p.tool, p.message),
            Unavailable(p) => write!(f, "Backend unavailable: {}", p.message),
            Cancelled => write!(f, "Operation cancelled"),
            Internal(p) => write!(f, "Internal error: {}", p.message),
        }
    }
}

impl std::error::Error for AppError {}

// ─── Constructors (convenience) ──────────────────────────────────────

#[allow(dead_code)] // constructors used as needed by service modules
impl AppError {
    pub fn auth(msg: impl Into<String>) -> Self {
        Self::Auth(AuthPayload { message: msg.into() })
    }
    pub fn rate_limit(msg: impl Into<String>, retry_after_secs: u32) -> Self {
        Self::RateLimit(RateLimitPayload {
            message: msg.into(),
            retry_after_secs,
        })
    }
    pub fn network(msg: impl Into<String>) -> Self {
        Self::Network(NetworkPayload { message: msg.into() })
    }
    pub fn server(msg: impl Into<String>, status: u16) -> Self {
        Self::Server(ServerPayload { message: msg.into(), status })
    }
    pub fn validation(msg: impl Into<String>) -> Self {
        Self::Validation(ValidationPayload { message: msg.into() })
    }
    pub fn not_found(msg: impl Into<String>) -> Self {
        Self::NotFound(NotFoundPayload { message: msg.into() })
    }
    pub fn access_denied(msg: impl Into<String>) -> Self {
        Self::AccessDenied(AccessDeniedPayload { message: msg.into() })
    }
    pub fn tool(msg: impl Into<String>, tool: impl Into<String>) -> Self {
        Self::Tool(ToolPayload { message: msg.into(), tool: tool.into() })
    }
    pub fn unavailable(msg: impl Into<String>) -> Self {
        Self::Unavailable(UnavailablePayload { message: msg.into() })
    }
    pub fn internal(msg: impl Into<String>) -> Self {
        Self::Internal(InternalPayload { message: msg.into() })
    }
}

// ─── From impls for common error types ──────────────────────────────

impl From<rusqlite::Error> for AppError {
    fn from(err: rusqlite::Error) -> Self {
        Self::internal(err.to_string())
    }
}

impl From<std::io::Error> for AppError {
    fn from(err: std::io::Error) -> Self {
        Self::internal(err.to_string())
    }
}

impl From<serde_json::Error> for AppError {
    fn from(err: serde_json::Error) -> Self {
        Self::internal(err.to_string())
    }
}

impl From<String> for AppError {
    fn from(s: String) -> Self {
        Self::internal(s)
    }
}

impl From<&str> for AppError {
    fn from(s: &str) -> Self {
        Self::internal(s.to_string())
    }
}

// ─── Tests ──────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_kind_discriminants() {
        assert_eq!(AppError::auth("bad key").kind(), "auth");
        assert_eq!(AppError::rate_limit("slow down", 30).kind(), "rate_limit");
        assert_eq!(AppError::network("offline").kind(), "network");
        assert_eq!(AppError::server("boom", 500).kind(), "server");
        assert_eq!(AppError::validation("missing field").kind(), "validation");
        assert_eq!(AppError::not_found("gone").kind(), "not_found");
        assert_eq!(AppError::access_denied("nope").kind(), "access_denied");
        assert_eq!(AppError::tool("oom", "calculator").kind(), "tool");
        assert_eq!(AppError::unavailable("locked").kind(), "unavailable");
        assert_eq!(AppError::Cancelled.kind(), "cancelled");
        assert_eq!(AppError::internal("panic").kind(), "internal");
    }

    #[test]
    fn test_is_retryable() {
        assert!(AppError::network("offline").is_retryable());
        assert!(AppError::rate_limit("slow down", 1).is_retryable());
        assert!(AppError::server("boom", 500).is_retryable());
        assert!(AppError::unavailable("locked").is_retryable());
        assert!(!AppError::auth("bad key").is_retryable());
        assert!(!AppError::validation("bad").is_retryable());
        assert!(!AppError::not_found("gone").is_retryable());
        assert!(!AppError::access_denied("nope").is_retryable());
        assert!(!AppError::tool("fail", "calc").is_retryable());
        assert!(!AppError::Cancelled.is_retryable());
        assert!(!AppError::internal("oops").is_retryable());
    }

    #[test]
    fn test_display() {
        let e = AppError::rate_limit("too many requests", 42);
        let s = e.to_string();
        assert!(s.contains("Rate limited"));
        assert!(s.contains("42"));
        assert!(s.contains("too many requests"));
    }

    #[test]
    fn test_serialize_auth() {
        let e = AppError::auth("bad token");
        let json = serde_json::to_string(&e).unwrap();
        assert!(json.contains("\"kind\":\"auth\""));
        assert!(json.contains("\"message\":\"bad token\""));
    }

    #[test]
    fn test_serialize_rate_limit() {
        let e = AppError::rate_limit("slow down", 30);
        let json = serde_json::to_string(&e).unwrap();
        assert!(json.contains("\"kind\":\"rate_limit\""));
        assert!(json.contains("\"retry_after_secs\":30"));
    }

    #[test]
    fn test_deserialize_roundtrip() {
        let e = AppError::server("internal error", 500);
        let json = serde_json::to_string(&e).unwrap();
        let e2: AppError = serde_json::from_str(&json).unwrap();
        assert_eq!(e2.kind(), "server");
        match e2 {
            AppError::Server(p) => assert_eq!(p.status, 500),
            _ => panic!("wrong variant"),
        }
    }

    #[test]
    fn test_io_error_conversion() {
        let io = std::io::Error::new(std::io::ErrorKind::NotFound, "file missing");
        let app: AppError = io.into();
        assert_eq!(app.kind(), "internal");
        assert!(app.to_string().contains("file missing"));
    }

    #[test]
    fn test_serde_json_error_conversion() {
        let json_err = serde_json::from_str::<serde_json::Value>("not json").unwrap_err();
        let app: AppError = json_err.into();
        assert_eq!(app.kind(), "internal");
    }

    #[test]
    fn test_rusqlite_error_conversion() {
        // rusqlite::Error::ToSqlConversionFailure is easy to construct
        let e = rusqlite::Error::ToSqlConversionFailure(Box::new(
            rusqlite::types::FromSqlError::InvalidType,
        ));
        let app: AppError = e.into();
        assert_eq!(app.kind(), "internal");
    }
}
