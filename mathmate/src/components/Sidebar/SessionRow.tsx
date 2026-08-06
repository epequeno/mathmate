import { useState } from "react";
import { Trash2, RotateCcw } from "lucide-react";
import type { SessionHeader } from "../../lib/types";
import { cx } from "../../lib/clsx";
import styles from "./Sidebar.module.css";

interface SessionRowProps {
  session: SessionHeader;
  isActive: boolean;
  isArchived: boolean;
  onSelect: () => void;
  onArchive: () => void;
  onDelete: () => void;
}

function relativeTime(isoDate: string): string {
  try {
    const date = new Date(isoDate);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    if (diffMins < 2) return "Just now";
    if (diffHours < 1) return `${diffMins}m ago`;
    if (diffDays < 1) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

export function SessionRow({
  session,
  isActive,
  isArchived,
  onSelect,
  onArchive,
  onDelete,
}: SessionRowProps) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onClick={onSelect}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={cx(styles.sessionRow, isActive && styles.sessionRowActive)}
    >
      {/* Session icon */}
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className={styles.sessionIcon}>
        <path
          d="M1 2.5h10M1 5.5h7M1 8.5h8.5"
          stroke={isActive ? "var(--color-accent-light)" : "var(--color-text-secondary)"}
          strokeWidth="1.2"
          strokeLinecap="round"
        />
      </svg>

      {/* Text */}
      <div className={styles.sessionText}>
        <span
          className={cx(
            styles.sessionTitle,
            isActive && styles.sessionTitleActive,
            isArchived && styles.sessionTitleArchived,
          )}
        >
          {session.title || "Untitled"}
        </span>
        <span className={styles.sessionTime}>{relativeTime(session.updated_at)}</span>
      </div>

      {/* Hover actions */}
      {hovered && !isArchived && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          title="Delete session"
          className="btn-icon-danger"
        >
          <Trash2 size={11} />
        </button>
      )}
      {hovered && isArchived && (
        <div className={styles.hoverActions}>
          <button
            onClick={(e) => { e.stopPropagation(); onArchive(); }}
            title="Restore session"
            className="btn-icon"
          >
            <RotateCcw size={11} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            title="Delete permanently"
            className="btn-icon-danger"
          >
            <Trash2 size={11} />
          </button>
        </div>
      )}
    </div>
  );
}