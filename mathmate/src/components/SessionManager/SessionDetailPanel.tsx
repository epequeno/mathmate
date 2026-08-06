import { useState, useRef, useEffect } from "react";
import type { SessionHeader, Session } from "../../lib/types";
import { ArrowUpRight, Archive, Trash2, RotateCcw, Pencil } from "lucide-react";
import { Sessions } from "../../lib/api";

interface SessionDetailPanelProps {
  session: SessionHeader | null;
  isArchived: boolean;
  onOpenInChat: () => void;
  onRename: (title: string) => void;
  onArchive: () => void;
  onUnarchive: () => void;
  onDelete: () => void;
  onPurge: () => void;
  onClose: () => void;
}

function formatDate(isoDate: string): string {
  try {
    const d = new Date(isoDate);
    return d.toLocaleDateString("en-US", {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export default function SessionDetailPanel({
  session,
  isArchived,
  onOpenInChat,
  onRename,
  onArchive,
  onUnarchive,
  onDelete,
  onPurge,
  onClose,
}: SessionDetailPanelProps) {
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [fullSession, setFullSession] = useState<Session | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (session) {
      setRenameValue(session.title);
      setRenaming(false);
      // Load full session for message preview
      setLoadingPreview(true);
      Sessions.load(session.id)
        .then((s) => setFullSession(s))
        .catch(() => setFullSession(null))
        .finally(() => setLoadingPreview(false));
    } else {
      setFullSession(null);
    }
  }, [session?.id]);

  useEffect(() => {
    if (renaming) inputRef.current?.focus();
  }, [renaming]);

  if (!session) {
    return (
      <div
        style={{
          width: 292,
          minWidth: 292,
          background: "var(--color-bg-elevated)",
          borderLeft: "1px solid var(--color-border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
        }}
      >
        <span style={{ fontSize: 12, color: "var(--color-text-tertiary)", textAlign: "center" }}>
          Select a session to view details
        </span>
      </div>
    );
  }

  const handleRenameSubmit = () => {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== session.title) {
      onRename(trimmed);
    }
    setRenaming(false);
  };

  return (
    <div
      style={{
        width: 292,
        minWidth: 292,
        background: "var(--color-bg-elevated)",
        borderLeft: "1px solid var(--color-border)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Section: Header */}
      <div style={{ padding: "16px 16px 0" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
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
                style={{
                  width: "100%",
                  padding: "4px 8px",
                  border: "1px solid var(--color-accent-light)",
                  borderRadius: 5,
                  background: "var(--color-surface)",
                  color: "var(--color-text-primary)",
                  fontSize: 13,
                  fontWeight: 600,
                  fontFamily: "inherit",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            ) : (
              <h3
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: "var(--color-text-primary)",
                  margin: 0,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
                title={session.title}
              >
                {session.title}
              </h3>
            )}
          </div>
          <button
            onClick={onClose}
            style={iconBtnStyle}
            title="Close detail panel"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
        <span
          style={{
            fontSize: 11,
            color: isArchived ? "var(--color-text-tertiary)" : "var(--color-success)",
            fontWeight: 500,
          }}
        >
          {isArchived ? "Archived" : "Active"}
        </span>
      </div>

      <div style={{ height: 1, background: "#3C3834", margin: "12px 16px" }} />

      {/* Section: Metadata */}
      <div style={{ padding: "0 16px", display: "flex", flexDirection: "column", gap: 10 }}>
        <MetaRow label="Created" value={formatDate(session.created_at)} />
        <MetaRow label="Updated" value={formatDate(session.updated_at)} />
        <MetaRow label="Model" value={session.model} />
        <MetaRow label="Provider" value={session.provider} />
        {session.project_id && (
          <MetaRow label="Project ID" value={session.project_id} mono />
        )}
      </div>

      {/* Message preview */}
      {fullSession && fullSession.messages.length > 0 && (
        <>
          <div style={{ height: 1, background: "#3C3834", margin: "12px 16px" }} />
          <div style={{ padding: "0 16px" }}>
            <span style={{ fontSize: 10, fontWeight: 600, color: "var(--color-text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6, display: "block" }}>
              Last message
            </span>
            <div
              style={{
                background: "var(--color-surface)",
                borderRadius: 6,
                padding: "8px 10px",
                fontSize: 11,
                color: "var(--color-text-secondary)",
                lineHeight: 1.5,
                maxHeight: 80,
                overflow: "hidden",
              }}
            >
              <span style={{ fontWeight: 600, color: "var(--color-text-primary)" }}>
                {fullSession.messages[fullSession.messages.length - 1].role === "user" ? "You" : "Assistant"}:
              </span>{' '}
              {fullSession.messages[fullSession.messages.length - 1].content
                .filter((c) => c.type === "text")
                .map((c) => c.text ?? "")
                .join(" ")
                .substring(0, 200)}
              {fullSession.messages[fullSession.messages.length - 1].content.some((c) => c.type === "image") && " [image]"}
            </div>
          </div>
        </>
      )}
      {loadingPreview && (
        <div style={{ padding: "0 16px" }}>
          <span style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>Loading preview…</span>
        </div>
      )}

      <div style={{ height: 1, background: "#3C3834", margin: "12px 16px" }} />

      {/* Section: Actions */}
      <div style={{ padding: "0 16px", display: "flex", flexDirection: "column", gap: 6 }}>
        <button
          onClick={onOpenInChat}
          className="btn-primary-large"
        >
          <ArrowUpRight size={14} />
          Open in Chat
        </button>

        {!renaming && (
          <button onClick={() => setRenaming(true)} style={secondaryBtnStyle}>
            <Pencil size={12} />
            Rename session
          </button>
        )}

        {isArchived ? (
          <>
            <button onClick={onUnarchive} style={secondaryBtnStyle}>
              <RotateCcw size={12} />
              Restore from archive
            </button>
            <button
              onClick={onPurge}
              style={{ ...secondaryBtnStyle, color: "var(--color-red)" }}
            >
              <Trash2 size={12} />
              Purge permanently
            </button>
          </>
        ) : (
          <>
            <button onClick={onArchive} style={secondaryBtnStyle}>
              <Archive size={12} />
              Archive session
            </button>
            <button
              onClick={onDelete}
              style={{ ...secondaryBtnStyle, color: "var(--color-red)" }}
            >
              <Trash2 size={12} />
              Delete session
            </button>
          </>
        )}
      </div>

      <div style={{ flex: 1 }} />
    </div>
  );
}

// ─── Subcomponents ──────────────────────────────

function MetaRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
      <span style={{ fontSize: 10, fontWeight: 600, color: "var(--color-text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
        {label}
      </span>
      <span
        style={{
          fontSize: 12,
          color: "var(--color-text-primary)",
          fontFamily: mono ? "'SF Mono', Menlo, monospace" : "inherit",
          wordBreak: "break-all",
        }}
      >
        {value}
      </span>
    </div>
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
  borderRadius: 5,
  flexShrink: 0,
};


const secondaryBtnStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  padding: "6px 12px",
  background: "transparent",
  color: "var(--color-text-secondary)",
  border: "1px solid var(--color-border)",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: 11,
  fontWeight: 500,
  fontFamily: "inherit",
  width: "100%",
  textAlign: "left",
  boxSizing: "border-box",
};

