/**
 * ErrorBanner — inline, dismissible error display with kind-specific icons
 * and optional retry action for retryable errors.
 *
 * Phase 14E.1: renders `AppError` from the unified error model.
 */

import { AlertTriangle, X, RefreshCw } from "lucide-react";
import type { AppError } from "../lib/error";
import { isRetryable, isAuth } from "../lib/error";

export function ErrorBanner({
  error,
  onDismiss,
  onRetry,
}: {
  error: AppError;
  onDismiss?: () => void;
  onRetry?: () => void;
}) {
  const retryable = isRetryable(error);
  const auth = isAuth(error);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 12px",
        borderRadius: 6,
        background:
          auth || error.kind === "validation"
            ? "var(--color-warning-bg, #fff3cd)"
            : "var(--color-error-bg, #f8d7da)",
        color: "var(--color-text, inherit)",
        marginBottom: 8,
        fontSize: "0.9em",
      }}
    >
      <AlertTriangle size={14} style={{ flexShrink: 0 }} />
      <span style={{ flex: 1 }}>{error.message}</span>
      {retryable && onRetry && (
        <button
          className="error-banner-retry"
          onClick={onRetry}
          title="Retry"
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 4,
            display: "flex",
            alignItems: "center",
          }}
        >
          <RefreshCw size={14} />
        </button>
      )}
      {onDismiss && (
        <button
          className="error-banner-dismiss"
          onClick={onDismiss}
          title="Dismiss"
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 4,
            display: "flex",
            alignItems: "center",
          }}
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}
