import { useState, useRef, useEffect } from "react";
import type { SessionHeader, MathProject } from "../../lib/types";
import { Archive, Trash2, Eye, RotateCcw } from "lucide-react";

interface SessionTableRowProps {
  session: SessionHeader;
  project?: MathProject;
  isSelected: boolean;
  isChecked: boolean;
  isArchived: boolean;
  onSelect: () => void;
  onCheck: (checked: boolean) => void;
  onOpenInChat: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onRename: (title: string) => void;
}

export default function SessionTableRow({
  session,
  project,
  isSelected,
  isChecked,
  isArchived,
  onSelect,
  onCheck,
  onOpenInChat,
  onArchive,
  onDelete,
  onRename,
}: SessionTableRowProps) {
  const [hovered, setHovered] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(session.title);
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  // Focus input when renaming starts
  useEffect(() => {
    if (renaming) inputRef.current?.focus();
  }, [renaming]);

  const handleRenameSubmit = () => {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== session.title) {
      onRename(trimmed);
    } else {
      setRenameValue(session.title);
    }
    setRenaming(false);
  };

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setMenuOpen(false); }}
      onClick={onSelect}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 0,
        padding: "0 16px",
        height: 48,
        cursor: "pointer",
        background: isSelected
          ? "var(--color-accent-selected)"
          : isChecked
          ? "rgba(90,126,212,0.06)"
          : "transparent",
        borderLeft: isSelected ? "3px solid var(--color-accent-light)" : "3px solid transparent",
        opacity: isArchived ? 0.55 : 1,
        transition: "background 0.1s",
      }}
    >
      {/* Checkbox */}
      <div
        style={{ width: 32, display: "flex", alignItems: "center", flexShrink: 0 }}
        onClick={(e) => e.stopPropagation()}
      >
        <input
          type="checkbox"
          checked={isChecked}
          onChange={(e) => onCheck(e.target.checked)}
          style={{ cursor: "pointer", accentColor: "var(--color-accent)" }}
        />
      </div>

      {/* Title */}
      <div style={{ flex: 1, minWidth: 0, paddingRight: 12 }}>
        {renaming ? (
          <input
            ref={inputRef}
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={handleRenameSubmit}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleRenameSubmit();
              if (e.key === "Escape") {
                setRenameValue(session.title);
                setRenaming(false);
              }
            }}
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              padding: "2px 6px",
              border: "1px solid var(--color-accent-light)",
              borderRadius: 4,
              background: "var(--color-surface)",
              color: "var(--color-text-primary)",
              fontSize: 12,
              fontFamily: "inherit",
              outline: "none",
              boxSizing: "border-box",
            }}
          />
        ) : (
          <span
            style={{
              fontSize: 13,
              fontWeight: isSelected ? 600 : 500,
              color: isSelected ? "#ffffff" : "var(--color-text-primary)",
              fontStyle: isArchived ? "italic" : "normal",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              display: "block",
            }}
            title={session.title}
          >
            {session.title}
          </span>
        )}
      </div>

      {/* Model */}
      <div
        style={{
          width: 130,
          flexShrink: 0,
          fontSize: 11,
          color: isSelected ? "rgba(255,255,255,0.7)" : "var(--color-text-secondary)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {session.model}
      </div>

      {/* Messages count */}
      <div
        style={{
          width: 100,
          flexShrink: 0,
          fontSize: 11,
          color: isSelected ? "rgba(255,255,255,0.6)" : "var(--color-text-tertiary)",
        }}
      >
        —
      </div>

      {/* Updated at */}
      <div
        style={{
          width: 120,
          flexShrink: 0,
          fontSize: 11,
          color: isSelected ? "rgba(255,255,255,0.6)" : "var(--color-text-secondary)",
        }}
      >
        {formatDate(session.updated_at)}
      </div>

      {/* Status */}
      <div
        style={{
          width: 80,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          gap: 4,
        }}
      >
        {isArchived ? (
          <span style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>Archived</span>
        ) : (
          <span
            style={{
              fontSize: 10,
              padding: "1px 6px",
              borderRadius: 8,
              background: "rgba(74,158,106,0.15)",
              color: "var(--color-success)",
            }}
          >
            Active
          </span>
        )}
      </div>

      {/* Actions */}
      <div
        style={{
          width: 56,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          gap: 2,
          justifyContent: "flex-end",
        }}
      >
        {hovered && (
          <>
            <button
              onClick={(e) => { e.stopPropagation(); onOpenInChat(); }}
              title="Open in chat"
              style={iconBtnStyle}
            >
              <Eye size={13} />
            </button>
            <div style={{ position: "relative" }}>
              <button
                onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v); }}
                title="More actions"
                style={iconBtnStyle}
              >
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                  <circle cx="6.5" cy="2.5" r="1" fill="currentColor"/>
                  <circle cx="6.5" cy="6.5" r="1" fill="currentColor"/>
                  <circle cx="6.5" cy="10.5" r="1" fill="currentColor"/>
                </svg>
              </button>
              {menuOpen && (
                <div
                  ref={menuRef}
                  style={{
                    position: "absolute",
                    top: "100%",
                    right: 0,
                    zIndex: 100,
                    background: "var(--color-surface)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 8,
                    boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
                    minWidth: 148,
                    overflow: "hidden",
                  }}
                >
                  {isArchived ? (
                    <>
                      <MenuItem onClick={() => { onArchive(); setMenuOpen(false); }}>
                        <RotateCcw size={12} /> Restore
                      </MenuItem>
                      <MenuItem
                        onClick={() => { onDelete(); setMenuOpen(false); }}
                        color="var(--color-red)"
                      >
                        <Trash2 size={12} /> Purge permanently
                      </MenuItem>
                    </>
                  ) : (
                    <>
                      <MenuItem onClick={() => { setRenaming(true); setMenuOpen(false); }}>
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                          <path d="M8 1.5l2.5 2.5L4.5 10H2v-2.5L8 1.5z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
                        </svg> Rename
                      </MenuItem>
                      <MenuItem onClick={() => { onArchive(); setMenuOpen(false); }}>
                        <Archive size={12} /> Archive
                      </MenuItem>
                      <MenuItem
                        onClick={() => { onDelete(); setMenuOpen(false); }}
                        color="var(--color-red)"
                      >
                        <Trash2 size={12} /> Delete
                      </MenuItem>
                    </>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Small helpers ──────────────────────────────

function MenuItem({
  children,
  onClick,
  color,
}: {
  children: React.ReactNode;
  onClick: () => void;
  color?: string;
}) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 7,
        width: "100%",
        padding: "8px 12px",
        border: "none",
        background: "transparent",
        color: color ?? "var(--color-text-primary)",
        fontSize: 12,
        fontFamily: "inherit",
        cursor: "pointer",
        textAlign: "left",
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = color ? "rgba(192,92,92,0.08)" : "rgba(255,255,255,0.05)"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
    >
      {children}
    </button>
  );
}

const iconBtnStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  cursor: "pointer",
  color: "var(--color-text-tertiary)",
  padding: 4,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 4,
};

function formatDate(isoDate: string): string {
  try {
    const date = new Date(isoDate);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    if (diffMins < 2) return "Just now";
    if (diffHours < 1) return `${diffMins}m ago`;
    if (diffDays < 1) {
      return `Today, ${date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
    }
    if (diffDays === 1) {
      return `Yesterday, ${date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
    }
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return "";
  }
}
