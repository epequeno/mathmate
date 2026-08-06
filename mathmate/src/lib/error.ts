// ─── Unified Error Model (TypeScript) ──────────────────────────────────
//
// `AppError` is the single typed error shape used across the frontend.
// It mirrors the Rust `AppError` enum's JSON wire format, giving the
// frontend a stable `kind` discriminator for branching rendering and
// retry logic without parsing English error strings.
//
// See: Implementation_Phase14E_UnifiedErrorModel.md

// ─── Type ────────────────────────────────────────────────────────────

export type AppError =
  | { kind: "auth"; message: string }
  | { kind: "rate_limit"; message: string; retry_after_secs: number }
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

// ─── Conversion ──────────────────────────────────────────────────────

/**
 * Convert any thrown value into a typed `AppError`.
 *
 * - If the value already looks like an `AppError` (has a `kind` field),
 *   it is returned as-is.
 * - `Error` instances are wrapped as `{ kind: "unknown", message }`.
 * - Strings are wrapped similarly.
 * - `null` / `undefined` / other primitives become a canned
 *   "Unknown error" message.
 */
export function toAppError(err: unknown): AppError {
  if (err && typeof err === "object") {
    const obj = err as Record<string, unknown>;
    if (typeof obj.kind === "string" && typeof obj.message === "string") {
      // Coerce to AppError; trust the `kind` field for branching.
      // The payload is validated at the call site via `isRetryable` etc.
      return err as AppError;
    }
  }
  if (err instanceof Error) {
    return { kind: "unknown", message: err.message };
  }
  if (typeof err === "string") {
    return { kind: "unknown", message: err };
  }
  return { kind: "unknown", message: "Unknown error" };
}

// ─── Predicates ──────────────────────────────────────────────────────

/** True if the error is worth retrying (network, rate-limit, server, unavailable). */
export function isRetryable(err: AppError): boolean {
  return (
    err.kind === "network" ||
    err.kind === "rate_limit" ||
    err.kind === "server" ||
    err.kind === "unavailable"
  );
}

/** True if the error is an authentication failure. */
export function isAuth(err: AppError): err is AppError & { kind: "auth" } {
  return err.kind === "auth";
}

/** True if the error is a cancellation (user aborted). */
export function isCancelled(err: AppError): err is AppError & { kind: "cancelled" } {
  return err.kind === "cancelled";
}

// ─── StreamError → AppError mapping ────────────────────────────────────

/**
 * Create an AppError from an HTTP status code and optional context.
 * Used by `streamChat` to map provider responses to typed errors.
 */
export function errorFromStatus(
  status: number,
  message: string,
  opts?: { retryAfterSecs?: number }
): AppError {
  if (status === 401 || status === 403) {
    return { kind: "auth", message };
  }
  if (status === 429) {
    return { kind: "rate_limit", message, retry_after_secs: opts?.retryAfterSecs ?? 0 };
  }
  if (status >= 500) {
    return { kind: "server", message, status };
  }
  if (status === 400) {
    return { kind: "validation", message };
  }
  if (status === 404) {
    return { kind: "not_found", message };
  }
  return { kind: "unknown", message };
}

/**
 * Determine if an error should be retried based on HTTP status code.
 * (Variant of `isRetryable` that works on raw status codes.)
 */
export function statusIsRetryable(status: number): boolean {
  return status === 429 || status >= 500 || status === 0;
}
