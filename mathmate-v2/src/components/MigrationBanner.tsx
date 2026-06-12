import { useState, useCallback } from "react";
import { Package, X } from "lucide-react";

interface MigrationBannerProps {
  count: number;
  onDismiss: () => void;
}

/**
 * Shows on first launch to inform users that existing MathMate v1 sessions
 * are compatible and ready to use.
 */
export default function MigrationBanner({ count, onDismiss }: MigrationBannerProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      role="alert"
      aria-label="Migration notification"
      style={{
        padding: "10px 16px",
        background: "var(--color-accent-subtle)",
        borderBottom: "1px solid var(--color-accent)",
        display: "flex",
        alignItems: "flex-start",
        gap: 8,
      }}
    >
      <span style={{ fontSize: 16, flexShrink: 0, display: "flex", alignItems: "center" }}><Package size={16} /></span>
      <div style={{ flex: 1 }}>
        <p style={{ fontSize: 13, fontWeight: 500, color: "var(--color-accent)", marginBottom: 4 }}>
          MathMate v2 is ready!
        </p>
        <p style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.4 }}>
          Found <strong>{count}</strong> existing session{count > 1 ? "s" : ""} from MathMate v1.
          All your sessions are fully compatible and ready to use — no migration needed.
        </p>
        {expanded && (
          <p style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginTop: 4 }}>
            Sessions are stored in <code>~/.mathmate/sessions/</code> as JSON files and
            used in-place by the new Tauri app. Your data is never copied or duplicated.
          </p>
        )}
        <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
          <button
            onClick={() => setExpanded((e) => !e)}
            style={{
              padding: "2px 10px",
              border: "none",
              borderRadius: 10,
              background: "var(--color-surface)",
              cursor: "pointer",
              fontSize: 11,
              color: "var(--color-text-secondary)",
              fontFamily: "inherit",
            }}
          >
            {expanded ? "Less" : "How does this work?"}
          </button>
        </div>
      </div>
      <button
        onClick={onDismiss}
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          color: "var(--color-text-tertiary)",
          fontSize: 16,
          padding: 2,
          flexShrink: 0,
        }}
        aria-label="Dismiss"
      >
        <X size={16} />
      </button>
    </div>
  );
}