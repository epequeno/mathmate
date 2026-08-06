// ─── Book Tab PDF Streaming — Local loopback HTTP range server ─────────
//
// Serves textbook PDFs to pdf.js over http://127.0.0.1:<port>/book/<project-id>
// with full Range/206 Partial Content support, so pdf.js uses its native
// HTTP byte-range loading path instead of a full-file base64/Blob round-trip.
//
// See: docs/mathmate/Implementation_BookTab_PdfStreaming.md
//
// Architecture:
//   - Axum server bound to 127.0.0.1:0 (ephemeral port).
//   - Per-process random token required as query param on every request.
//   - PathScope::guard runs on every request using the requested project id.
//   - Range header parsing supports single `bytes=START-END`, `START-`, `-SUFFIX`.

use std::path::PathBuf;
use std::sync::Arc;

use axum::{
    body::Body,
    extract::{Path, Query, State},
    http::{
        header::{ACCEPT_RANGES, CACHE_CONTROL, CONTENT_LENGTH, CONTENT_RANGE, CONTENT_TYPE},
        HeaderMap, HeaderName, HeaderValue, StatusCode,
    },
    response::{IntoResponse, Response},
    routing::get,
    Router,
};

// ─── Custom header names not in http::header ───────────────────────────

const X_CONTENT_TYPE_OPTIONS: HeaderName = HeaderName::from_static("x-content-type-options");
const ACCESS_CONTROL_ALLOW_ORIGIN: HeaderName = HeaderName::from_static("access-control-allow-origin");
const ACCESS_CONTROL_EXPOSE_HEADERS: HeaderName = HeaderName::from_static("access-control-expose-headers");
const ACCESS_CONTROL_ALLOW_METHODS: HeaderName = HeaderName::from_static("access-control-allow-methods");
const ACCESS_CONTROL_ALLOW_HEADERS: HeaderName = HeaderName::from_static("access-control-allow-headers");
const ACCESS_CONTROL_MAX_AGE: HeaderName = HeaderName::from_static("access-control-max-age");
use rand::Rng;
use serde::Serialize;
use tokio::io::{AsyncReadExt, AsyncSeekExt};
use tokio::sync::oneshot;
use tokio_util::io::ReaderStream;

use crate::services::path::PathScope;
use crate::services::project::ProjectService;

// ─── Range parser ────────────────────────────────────────────────────────

#[derive(Debug, Clone, PartialEq)]
pub enum RangeDecision {
    /// No Range header present — serve full file.
    None,
    /// Single valid byte range (start and end are inclusive).
    Single { start: u64, end: u64 },
    /// Unsupported or malformed range (e.g. multiple ranges, garbled syntax).
    Unsupported,
    /// Unsatisfiable range (start >= total, total == 0, etc.).
    Unsatisfiable,
}

/// Parse a single byte-range from the `Range` header value.
///
/// Supports:
/// - `bytes=START-END`     (e.g. `bytes=0-1023`)
/// - `bytes=START-`        (open-ended, clamped to total-1)
/// - `bytes=-SUFFIX`       (last N bytes)
///
/// Returns `Unsupported` for multiple ranges, malformed syntax, or overflow.
/// Returns `Unsatisfiable` when the requested range cannot be satisfied.
pub fn parse_range(header: Option<&str>, total: u64) -> RangeDecision {
    let header = match header {
        Some(h) if !h.is_empty() => h.trim(),
        _ => return RangeDecision::None,
    };

    // Must start with "bytes="
    let range_str = match header.strip_prefix("bytes=") {
        Some(s) => s.trim(),
        None => return RangeDecision::Unsupported,
    };

    if range_str.is_empty() {
        return RangeDecision::Unsupported;
    }

    // Reject multiple ranges (comma-separated) — unsupported in v1
    if range_str.contains(',') {
        return RangeDecision::Unsupported;
    }

    // Empty files — can't serve any range
    if total == 0 {
        return RangeDecision::Unsatisfiable;
    }

    // Parse the single range spec
    let mut parts = range_str.splitn(2, '-');
    let start_part = parts.next().unwrap_or("").trim();
    let end_part = parts.next().unwrap_or("").trim();

    // ── Suffix range: bytes=-N ──
    if start_part.is_empty() && !end_part.is_empty() {
        let suffix = parse_u64_safe(end_part);
        let suffix = match suffix {
            Some(n) => n,
            None => return RangeDecision::Unsupported,
        };
        if suffix == 0 {
            return RangeDecision::Unsatisfiable;
        }
        if suffix >= total {
            return RangeDecision::Single {
                start: 0,
                end: total - 1,
            };
        }
        return RangeDecision::Single {
            start: total - suffix,
            end: total - 1,
        };
    }

    // ── Open-ended: bytes=N- ──
    if end_part.is_empty() {
        let start = parse_u64_safe(start_part);
        let start = match start {
            Some(n) => n,
            None => return RangeDecision::Unsupported,
        };
        if start >= total {
            return RangeDecision::Unsatisfiable;
        }
        return RangeDecision::Single {
            start,
            end: total - 1,
        };
    }

    // ── Explicit range: bytes=START-END ──
    let start = parse_u64_safe(start_part);
    let end = parse_u64_safe(end_part);
    let (Some(start), Some(end)) = (start, end) else {
        return RangeDecision::Unsupported;
    };

    if start >= total {
        return RangeDecision::Unsatisfiable;
    }
    if end < start {
        return RangeDecision::Unsatisfiable;
    }

    // Clamp end to total-1
    let end = end.min(total - 1);

    RangeDecision::Single { start, end }
}

/// Parse a u64 from a string, returning None on overflow or non-digit chars.
fn parse_u64_safe(s: &str) -> Option<u64> {
    let s = s.trim();
    if s.is_empty() {
        return None;
    }
    // Reject leading zeros that would indicate octal in some contexts
    // (just a safety measure; `s.starts_with('0')` is overly broad for "0")
    if s.len() > 1 && s.starts_with('0') {
        return None;
    }
    for ch in s.chars() {
        if !ch.is_ascii_digit() {
            return None;
        }
    }
    // Use checked_parse to detect overflow
    s.parse::<u64>().ok()
}

// ─── Book Stream Info ────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize)]
pub struct BookStreamInfo {
    pub origin: String,
    pub token: String,
}

/// Tauri-managed state for the book stream server.
pub struct BookStreamServer {
    pub port: u16,
    pub token: String,
    shutdown_tx: Option<oneshot::Sender<()>>,
}

impl BookStreamServer {
    /// Start the book stream server on `127.0.0.1:0` (ephemeral port).
    ///
    /// Runs inside a dedicated thread with its own current-thread tokio
    /// runtime.  This avoids depending on Tauri's tokio runtime (which is
    /// not fully initialized during the `.setup()` hook).
    ///
    /// The server shuts down when `BookStreamServer` is dropped (app exit).
    pub fn start(base_dir: PathBuf) -> Result<Self, Box<dyn std::error::Error>> {
        let token = generate_token();

        let (shutdown_tx, shutdown_rx) = oneshot::channel::<()>();

        // Build the shared state upfront (can be cloned into the thread).
        let app_state = Arc::new(ServerAppState {
            token: token.clone(),
            projects: ProjectService::new(base_dir),
            path: PathScope::new(),
        });

        // Bind synchronously first so we can return the port before the
        // dedicated thread starts.
        let std_listener = std::net::TcpListener::bind("127.0.0.1:0")?;
        let port = std_listener.local_addr()?.port();

        // Spawn a dedicated thread with its own tokio runtime.
        // The setup hook runs before Tauri's tokio I/O driver is ready
        // for the main thread, so we cannot use tokio::spawn or from_std
        // directly here.
        std::thread::spawn(move || {
            // Set non-blocking before passing to from_std — tokio requires
            // this even when called from inside a tokio runtime.
            let _ = std_listener.set_nonblocking(true);
            let rt = tokio::runtime::Builder::new_current_thread()
                .enable_io()
                .build()
                .expect("Failed to build book stream tokio runtime");

            rt.block_on(async move {
                // Inside our own runtime, from_std works.
                let listener =
                    tokio::net::TcpListener::from_std(std_listener)
                        .expect("Failed to create tokio listener");

                let app = Router::new()
                    .route(
                        "/book/{project_id}",
                        get(handle_get).options(handle_options),
                    )
                    .with_state(app_state);

                axum::serve(listener, app)
                    .with_graceful_shutdown(async {
                        let _ = shutdown_rx.await;
                    })
                    .await
                    .ok();
            });
        });

        Ok(Self {
            port,
            token,
            shutdown_tx: Some(shutdown_tx),
        })
    }

    /// Return the URL origin and token for frontend use.
    pub fn info(&self) -> BookStreamInfo {
        BookStreamInfo {
            origin: format!("http://127.0.0.1:{}", self.port),
            token: self.token.clone(),
        }
    }
}

impl Drop for BookStreamServer {
    fn drop(&mut self) {
        if let Some(tx) = self.shutdown_tx.take() {
            let _ = tx.send(());
        }
    }
}

// ─── Axum state ─────────────────────────────────────────────────────────

struct ServerAppState {
    token: String,
    projects: ProjectService,
    path: PathScope,
}

type SharedState = Arc<ServerAppState>;

// ─── URL query params ───────────────────────────────────────────────────

#[derive(serde::Deserialize)]
struct BookQuery {
    /// Token is optional in the query string so Axum doesn't reject the
    /// request before the handler runs. The handler validates it and
    /// returns 401 if absent or wrong.
    token: Option<String>,
    #[serde(rename = "v")]
    #[allow(dead_code)]
    revision: Option<String>,
}

// ─── Common header helpers ──────────────────────────────────────────────

/// Headers shared by all successful GET/HEAD responses.
fn pdf_response_headers(content_len: Option<u64>, content_range: Option<&str>) -> HeaderMap {
    let mut headers = HeaderMap::new();
    headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/pdf"));
    headers.insert(ACCEPT_RANGES, HeaderValue::from_static("bytes"));
    headers.insert(
        ACCESS_CONTROL_ALLOW_ORIGIN,
        HeaderValue::from_static("*"),
    );
    headers.insert(
        ACCESS_CONTROL_EXPOSE_HEADERS,
        HeaderValue::from_static("Accept-Ranges, Content-Length, Content-Range"),
    );
    headers.insert(CACHE_CONTROL, HeaderValue::from_static("no-store"));
    headers.insert(
        X_CONTENT_TYPE_OPTIONS,
        HeaderValue::from_static("nosniff"),
    );
    if let Some(len) = content_len {
        headers.insert(
            CONTENT_LENGTH,
            HeaderValue::from_str(&len.to_string()).unwrap(),
        );
    }
    if let Some(cr) = content_range {
        headers.insert(CONTENT_RANGE, HeaderValue::from_str(cr).unwrap());
    }
    headers
}

/// Build CORS headers for OPTIONS preflight.
fn cors_headers() -> HeaderMap {
    let mut headers = HeaderMap::new();
    headers.insert(
        ACCESS_CONTROL_ALLOW_ORIGIN,
        HeaderValue::from_static("*"),
    );
    headers.insert(
        ACCESS_CONTROL_ALLOW_METHODS,
        HeaderValue::from_static("GET, HEAD, OPTIONS"),
    );
    headers.insert(
        ACCESS_CONTROL_ALLOW_HEADERS,
        HeaderValue::from_static("Range"),
    );
    headers.insert(
        ACCESS_CONTROL_MAX_AGE,
        HeaderValue::from_static("600"),
    );
    headers.insert(CONTENT_LENGTH, HeaderValue::from_static("0"));
    headers
}

/// Helper: resolve a project ID to a guarded textbook path + file size.
fn resolve_textbook(
    state: &ServerAppState,
    project_id: &str,
) -> Result<(PathBuf, u64), Response> {
    // Load project
    let project = state
        .projects
        .load(project_id)
        .map_err(|_| error_response(StatusCode::NOT_FOUND, "Project not found"))?;

    // Get textbook path
    let text_path = project
        .textbook_path
        .ok_or_else(|| error_response(StatusCode::NOT_FOUND, "No textbook set for this project"))?;

    // Guard the path — uses PathScope on every request
    let target = state
        .path
        .guard(&text_path, Some(project_id), false)
        .map_err(|_| {
            error_response(StatusCode::FORBIDDEN, "Textbook path access denied")
        })?;

    // Validate .pdf extension
    let is_pdf = target
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.eq_ignore_ascii_case("pdf"))
        .unwrap_or(false);
    if !is_pdf {
        return Err(error_response(
            StatusCode::UNSUPPORTED_MEDIA_TYPE,
            "Not a PDF file",
        ));
    }

    // Get file metadata
    let metadata = std::fs::metadata(&target).map_err(|_| {
        error_response(StatusCode::INTERNAL_SERVER_ERROR, "Failed to read textbook file")
    })?;

    if !metadata.is_file() {
        return Err(error_response(StatusCode::NOT_FOUND, "Textbook path is not a file"));
    }

    let total = metadata.len();

    Ok((target, total))
}

/// Build an error response with a plain-text body.
fn error_response(status: StatusCode, msg: &str) -> Response {
    let mut headers = HeaderMap::new();
    headers.insert(
        ACCESS_CONTROL_ALLOW_ORIGIN,
        HeaderValue::from_static("*"),
    );
    headers.insert(CONTENT_TYPE, HeaderValue::from_static("text/plain"));
    (status, headers, Body::from(msg.to_owned())).into_response()
}

/// Build a 416 response with Content-Range.
fn range_not_satisfiable(total: u64) -> Response {
    let mut headers = pdf_response_headers(None, Some(&format!("bytes */{}", total)));
    headers.insert(CONTENT_LENGTH, HeaderValue::from_static("0"));
    (StatusCode::RANGE_NOT_SATISFIABLE, headers, Body::empty()).into_response()
}

// ─── Token validation helper ────────────────────────────────────────────

fn validate_token(state: &ServerAppState, query: &BookQuery) -> Result<(), Response> {
    let provided = match &query.token {
        Some(t) if !t.is_empty() => t.as_bytes(),
        _ => {
            return Err(error_response(
                StatusCode::UNAUTHORIZED,
                "Missing or empty token",
            ));
        }
    };
    let expected = state.token.as_bytes();
    if provided.len() != expected.len() {
        return Err(error_response(StatusCode::UNAUTHORIZED, "Invalid token"));
    }
    // Constant-time-ish comparison — avoid leaking token timing
    let mut ok = 0u8;
    for (a, b) in provided.iter().zip(expected.iter()) {
        ok |= a ^ b;
    }
    if ok != 0 {
        return Err(error_response(StatusCode::UNAUTHORIZED, "Invalid token"));
    }
    Ok(())
}

// ─── GET handler ────────────────────────────────────────────────────────

async fn handle_get(
    Path(project_id): Path<String>,
    Query(query): Query<BookQuery>,
    headers: HeaderMap,
    State(state): State<SharedState>,
) -> Response {
    // 1. Validate token
    if let Err(resp) = validate_token(&state, &query) {
        return resp;
    }

    // 2. Resolve textbook path
    let (target, total) = match resolve_textbook(&state, &project_id) {
        Ok(t) => t,
        Err(resp) => return resp,
    };

    // 3. Parse Range header from the HTTP request
    let range_header = headers
        .get("range")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_owned());

    // 4. Serve with range support
    serve_file_with_range(target, total, range_header).await
}

// ─── HEAD handler ───────────────────────────────────────────────────────

// ─── OPTIONS handler ────────────────────────────────────────────────────

async fn handle_options() -> Response {
    (StatusCode::NO_CONTENT, cors_headers(), Body::empty()).into_response()
}

// ─── Serve file with optional range support ─────────────────────────────

async fn serve_file_with_range(
    target: PathBuf,
    total: u64,
    range_header: Option<String>,
) -> Response {
    let decision = parse_range(range_header.as_deref(), total);

    match decision {
        RangeDecision::None => {
            // Serve full file with streaming body
            let file = match tokio::fs::File::open(&target).await {
                Ok(f) => f,
                Err(_) => {
                    return error_response(
                        StatusCode::INTERNAL_SERVER_ERROR,
                        "Failed to open textbook file",
                    );
                }
            };
            let stream = ReaderStream::new(file);
            let body = Body::from_stream(stream);

            let headers = pdf_response_headers(Some(total), None);

            (StatusCode::OK, headers, body).into_response()
        }
        RangeDecision::Single { start, end } => {
            let length = end - start + 1;

            let file = match tokio::fs::File::open(&target).await {
                Ok(f) => f,
                Err(_) => {
                    return error_response(
                        StatusCode::INTERNAL_SERVER_ERROR,
                        "Failed to open textbook file for range request",
                    );
                }
            };

            let mut file = file;
            if file.seek(std::io::SeekFrom::Start(start)).await.is_err() {
                return error_response(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "Failed to seek in textbook file",
                );
            }
            let ranged = file.take(length);
            let stream = ReaderStream::new(ranged);
            let body = Body::from_stream(stream);

            let content_range = format!("bytes {}-{}/{}", start, end, total);
            let headers = pdf_response_headers(Some(length), Some(&content_range));

            (StatusCode::PARTIAL_CONTENT, headers, body).into_response()
        }
        RangeDecision::Unsatisfiable => {
            range_not_satisfiable(total)
        }
        RangeDecision::Unsupported => {
            error_response(StatusCode::BAD_REQUEST, "Unsupported Range header format")
        }
    }
}

// ─── Utility ────────────────────────────────────────────────────────────

fn generate_token() -> String {
    rand::thread_rng()
        .sample_iter(&rand::distributions::Alphanumeric)
        .take(32)
        .map(char::from)
        .collect()
}

// ─── Tests ──────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    // ─── Range parser tests ─────────────────────────────────────────

    #[test]
    fn test_parse_range_none() {
        assert_eq!(parse_range(None, 1000), RangeDecision::None);
        assert_eq!(parse_range(Some(""), 1000), RangeDecision::None);
    }

    #[test]
    fn test_parse_range_full() {
        assert_eq!(
            parse_range(Some("bytes=0-999"), 1000),
            RangeDecision::Single { start: 0, end: 999 }
        );
    }

    #[test]
    fn test_parse_range_partial() {
        assert_eq!(
            parse_range(Some("bytes=100-199"), 1000),
            RangeDecision::Single { start: 100, end: 199 }
        );
    }

    #[test]
    fn test_parse_range_open_ended() {
        assert_eq!(
            parse_range(Some("bytes=500-"), 1000),
            RangeDecision::Single { start: 500, end: 999 }
        );
    }

    #[test]
    fn test_parse_range_suffix() {
        assert_eq!(
            parse_range(Some("bytes=-100"), 1000),
            RangeDecision::Single { start: 900, end: 999 }
        );
    }

    #[test]
    fn test_parse_range_suffix_zero() {
        assert_eq!(parse_range(Some("bytes=-0"), 1000), RangeDecision::Unsatisfiable);
    }

    #[test]
    fn test_parse_range_suffix_larger_than_file() {
        // Suffix larger than file returns the entire file
        assert_eq!(
            parse_range(Some("bytes=-2000"), 1000),
            RangeDecision::Single { start: 0, end: 999 }
        );
    }

    #[test]
    fn test_parse_range_start_equals_total() {
        assert_eq!(parse_range(Some("bytes=1000-"), 1000), RangeDecision::Unsatisfiable);
    }

    #[test]
    fn test_parse_range_start_beyond_total() {
        assert_eq!(parse_range(Some("bytes=9999-"), 1000), RangeDecision::Unsatisfiable);
        assert_eq!(parse_range(Some("bytes=1001-2000"), 1000), RangeDecision::Unsatisfiable);
    }

    #[test]
    fn test_parse_range_end_before_start() {
        assert_eq!(parse_range(Some("bytes=20-10"), 1000), RangeDecision::Unsatisfiable);
    }

    #[test]
    fn test_parse_range_clamped() {
        // End beyond total-1 gets clamped
        assert_eq!(
            parse_range(Some("bytes=0-9999"), 1000),
            RangeDecision::Single { start: 0, end: 999 }
        );
    }

    #[test]
    fn test_parse_range_multiple_ranges() {
        // Multiple ranges are unsupported in v1
        assert_eq!(
            parse_range(Some("bytes=0-99,200-299"), 1000),
            RangeDecision::Unsupported
        );
    }

    #[test]
    fn test_parse_range_malformed_unit() {
        assert_eq!(parse_range(Some("bits=0-99"), 1000), RangeDecision::Unsupported);
        assert_eq!(parse_range(Some("bytes=abc"), 1000), RangeDecision::Unsupported);
    }

    #[test]
    fn test_parse_range_malformed_numbers() {
        assert_eq!(parse_range(Some("bytes=0-abc"), 1000), RangeDecision::Unsupported);
        assert_eq!(parse_range(Some("bytes=x-10"), 1000), RangeDecision::Unsupported);
    }

    #[test]
    fn test_parse_range_overflow() {
        // Numbers too large for u64
        assert_eq!(
            parse_range(Some("bytes=0-999999999999999999999999"), 1000),
            RangeDecision::Unsupported
        );
    }

    #[test]
    fn test_parse_range_empty_file() {
        assert_eq!(parse_range(Some("bytes=0-0"), 0), RangeDecision::Unsatisfiable);
        assert_eq!(parse_range(Some("bytes=-1"), 0), RangeDecision::Unsatisfiable);
    }

    #[test]
    fn test_parse_range_preserves_whitespace() {
        assert_eq!(
            parse_range(Some("bytes= 0 - 99 "), 1000),
            RangeDecision::Single { start: 0, end: 99 }
        );
    }

    #[test]
    fn test_parse_range_explicit_exact() {
        // Single byte
        assert_eq!(
            parse_range(Some("bytes=0-0"), 1000),
            RangeDecision::Single { start: 0, end: 0 }
        );
        // Last byte
        assert_eq!(
            parse_range(Some("bytes=999-999"), 1000),
            RangeDecision::Single { start: 999, end: 999 }
        );
    }

    // ─── Token generation ────────────────────────────────────────

    #[test]
    fn test_generate_token_length() {
        let token = generate_token();
        assert_eq!(token.len(), 32);
        assert!(token.chars().all(|c| c.is_ascii_alphanumeric()));
    }

    #[test]
    fn test_generate_token_unique() {
        let t1 = generate_token();
        let t2 = generate_token();
        assert_ne!(t1, t2);
    }

    // ─── Server integration test ────────────────────────────────────

    #[test]
    fn test_server_binds_and_responds() {
        use std::time::Duration;

        let tmp = std::env::temp_dir().join("book_stream_test_bind");
        let _ = std::fs::create_dir_all(&tmp);

        let server = BookStreamServer::start(tmp.clone())
            .expect("Server should start");

        let origin = format!("http://127.0.0.1:{}", server.port);

        // Give the server a moment to start
        std::thread::sleep(Duration::from_millis(200));

        // OPTIONS request — should return 204 No Content
        let client = reqwest::blocking::Client::new();
        let resp = client
            .request(reqwest::Method::OPTIONS, format!("{}/book/test-project", origin))
            .send()
            .expect("OPTIONS request should succeed");
        assert_eq!(resp.status(), 204, "OPTIONS should return 204");
        assert_eq!(
            resp.headers().get("access-control-allow-origin").and_then(|v| v.to_str().ok()),
            Some("*"),
            "CORS header should be present"
        );

        // GET without token — should return 401
        let resp = client
            .get(format!("{}/book/test-project", origin))
            .send()
            .expect("GET request should succeed");
        assert_eq!(resp.status(), 401, "GET without token should return 401");

        // GET with wrong token — should return 401
        let resp = client
            .get(format!("{}/book/test-project?token=wrong", origin))
            .send()
            .expect("GET request should succeed");
        assert_eq!(resp.status(), 401, "GET with wrong token should return 401");

        // GET with valid token but nonexistent project — should return 404
        let resp = client
            .get(format!("{}/book/test-project?token={}", origin, server.token))
            .send()
            .expect("GET request should succeed");
        assert_eq!(resp.status(), 404, "GET with valid token but bad project should return 404");

        let _ = std::fs::remove_dir_all(&tmp);
        // Server drops here — shutdown signal sent
    }
}
