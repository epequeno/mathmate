/**
 * MemoryRetrievalBar — inline memory context indicator.
 *
 * Renders as a subtle collapsible bar showing memories that were retrieved
 * for the current query. Appears between the user's message and the
 * assistant's response to give visibility into what context the model
 * received.
 *
 * Shows scan status badges for redacted/rejected items and groups by
 * status in the expanded view.
 */

import { memo, useState } from "react";
import type { MemoryItem } from "../lib/types";
import { MessageSquare, FileText, BookOpen, BookMarked, Brain, AlertTriangle, CheckCircle2, XCircle } from "lucide-react";

interface MemoryRetrievalBarProps {
  memories: MemoryItem[];
  queryText?: string;
}

const MAX_PREVIEW_LENGTH = 120;

function sourceIcon(sourceType: string): React.ReactNode {
  const size = 12;
  switch (sourceType) {
    case "chat":
      return <MessageSquare size={size} />;
    case "vault":
      return <FileText size={size} />;
    case "wrap-up":
    case "study_log":
      return <BookMarked size={size} />;
    case "textbook":
      return <BookOpen size={size} />;
    default:
      return <Brain size={size} />;
  }
}

function sourceLabel(sourceType: string): string {
  switch (sourceType) {
    case "chat":
      return "Conversation";
    case "vault":
      return "Note";
    case "wrap-up":
    case "study_log":
      return "Study log";
    case "textbook":
      return "Textbook";
    default:
      return "Memory";
  }
}

function scanBadge(item: MemoryItem): { label: string; color: string; icon: React.ReactNode } | null {
  const status = item.scan_status;
  if (!status || status === "accepted") return null;

  if (status === "accepted_with_redaction") {
    return {
      label: `Redacted: ${item.scan_reason ?? "injection pattern"}`,
      color: "#d4a72c",
      icon: <AlertTriangle size={10} />,
    };
  }
  if (status === "rejected") {
    return {
      label: `Rejected: ${item.scan_reason ?? "injection pattern"}`,
      color: "#e74c3c",
      icon: <XCircle size={10} />,
    };
  }
  return null;
}

const MemoryRetrievalBar = memo(function MemoryRetrievalBar({
  memories,
  queryText,
}: MemoryRetrievalBarProps) {
  const [expanded, setExpanded] = useState(false);

  if (!memories || memories.length === 0) return null;

  // Count items by scan status
  const redactedCount = memories.filter((m) => m.scan_status === "accepted_with_redaction").length;
  const rejectedCount = memories.filter((m) => m.scan_status === "rejected").length;
  const hasIssues = redactedCount > 0 || rejectedCount > 0;

  return (
    <div
      style={{
        marginBottom: 8,
        borderRadius: "var(--radius-card)",
        border: "1px solid var(--color-border)",
        background: "var(--color-surface)",
        overflow: "hidden",
        fontSize: 12,
        lineHeight: 1.4,
      }}
    >
      {/* Header bar */}
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "6px 10px",
          cursor: "pointer",
          userSelect: "none",
          color: "var(--color-text-tertiary)",
        }}
      >
        <span style={{ fontSize: 11, opacity: 0.7, display: "flex", alignItems: "center" }}><Brain size={12} /></span>
        <span style={{ fontWeight: 500 }}>
          Retrieved {memories.length} {memories.length === 1 ? "memory" : "memories"}
        </span>
        {hasIssues && (
          <span style={{ fontSize: 10, color: "#d4a72c", display: "flex", alignItems: "center", gap: 2 }}>
            <AlertTriangle size={10} />
            {redactedCount > 0 && `${redactedCount} redacted`}
            {redactedCount > 0 && rejectedCount > 0 && ", "}
            {rejectedCount > 0 && `${rejectedCount} rejected`}
          </span>
        )}
        {queryText && (
          <span style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginLeft: 4 }}>
            · &ldquo;{queryText.substring(0, 40)}{queryText.length > 40 ? "…" : ""}&rdquo;
          </span>
        )}
        <span style={{ marginLeft: "auto", fontSize: 10 }}>
          {expanded ? "▲" : "▼"}
        </span>
      </div>

      {/* Expanded items */}
      {expanded && (
        <div
          style={{
            padding: "0 10px 8px",
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          {memories.map((m) => {
            const badge = scanBadge(m);
            return (
              <div
                key={m.id}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 6,
                  padding: "5px 8px",
                  background: "var(--color-bg)",
                  borderRadius: 6,
                  opacity: m.scan_status === "rejected" ? 0.6 : 1,
                }}
              >
                <span
                  style={{
                    fontSize: 11,
                    flexShrink: 0,
                    marginTop: 1,
                  }}
                  title={sourceLabel(m.source_type)}
                >
                  {sourceIcon(m.source_type)}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p
                    style={{
                      color: "var(--color-text-primary)",
                      fontSize: 11,
                      lineHeight: 1.4,
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                      wordBreak: "break-word",
                    }}
                  >
                    {m.content.substring(0, MAX_PREVIEW_LENGTH)}
                    {m.content.length > MAX_PREVIEW_LENGTH ? "…" : ""}
                  </p>
                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      marginTop: 2,
                      alignItems: "center",
                    }}
                  >
                    <span style={{ fontSize: 10, color: "var(--color-text-tertiary)" }}>
                      {sourceLabel(m.source_type)}
                    </span>
                    {m.score > 0 && (
                      <span style={{ fontSize: 10, color: "var(--color-text-tertiary)", marginLeft: 4 }}>
                        Relevance: {(m.score * 100).toFixed(0)}%
                      </span>
                    )}
                    {badge && (
                      <span
                        style={{
                          fontSize: 10,
                          color: badge.color,
                          display: "flex",
                          alignItems: "center",
                          gap: 2,
                          marginLeft: 4,
                        }}
                        title={badge.label}
                      >
                        {badge.icon}
                        {badge.label.split(":")[0]}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
});

export default MemoryRetrievalBar;
