import type { TextbookCatalogEntry } from "../lib/types";
import { subjectLabel, subjectColor, formatFileSize } from "../lib/textbookLicenses";
import { Download, ExternalLink, BookOpen } from "lucide-react";

interface TextbookCatalogCardProps {
  entry: TextbookCatalogEntry;
  downloading: boolean;
  onDownload: (entry: TextbookCatalogEntry) => void;
}

export default function TextbookCatalogCard({ entry, downloading, onDownload }: TextbookCatalogCardProps) {
  const color = subjectColor(entry.subject);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        padding: 14,
        borderRadius: 10,
        border: "1px solid var(--color-border)",
        background: "var(--color-surface)",
        transition: "box-shadow 0.15s, border-color 0.15s",
        cursor: "default",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "var(--color-accent)";
        e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.06)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "var(--color-border)";
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 32,
            height: 32,
            borderRadius: 8,
            background: `${color}18`,
            color,
            flexShrink: 0,
          }}
        >
          <BookOpen size={15} strokeWidth={1.5} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "var(--color-text-primary)",
              lineHeight: 1.3,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            title={entry.title}
          >
            {entry.title}
          </div>
          <div
            style={{
              fontSize: 11,
              color: "var(--color-text-tertiary)",
              marginTop: 1,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {entry.authors.join(", ")}
            {entry.edition ? ` (${entry.edition} ed.)` : ""}
          </div>
        </div>
      </div>

      {/* Subject badge */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
        <span
          style={{
            display: "inline-block",
            padding: "1px 7px",
            borderRadius: 4,
            fontSize: 10,
            fontWeight: 500,
            background: `${color}15`,
            color,
            border: `1px solid ${color}30`,
          }}
        >
          {subjectLabel(entry.subject)}
        </span>
        {entry.license && (
          <span
            style={{
              display: "inline-block",
              padding: "1px 7px",
              borderRadius: 4,
              fontSize: 10,
              fontWeight: 500,
              background: "var(--color-bg)",
              color: "var(--color-text-tertiary)",
              border: "1px solid var(--color-border)",
            }}
          >
            {entry.license.replace(/-/g, " ").toUpperCase()}
          </span>
        )}
      </div>

      {/* Description */}
      <div
        style={{
          fontSize: 11,
          color: "var(--color-text-secondary)",
          lineHeight: 1.5,
          display: "-webkit-box",
          WebkitLineClamp: 3,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}
      >
        {entry.description}
      </div>

      {/* Filesize hint */}
      {entry.file_size_hint && (
        <div style={{ fontSize: 10, color: "var(--color-text-tertiary)" }}>
          ~{formatFileSize(entry.file_size_hint)}
        </div>
      )}

      {/* Actions */}
      <div style={{ display: "flex", gap: 6, marginTop: 2 }}>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDownload(entry);
          }}
          disabled={downloading}
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 5,
            padding: "6px 10px",
            borderRadius: 6,
            border: "none",
            background: downloading ? "var(--color-border)" : "var(--color-accent)",
            color: downloading ? "var(--color-text-tertiary)" : "#fff",
            fontSize: 11,
            fontWeight: 600,
            fontFamily: "inherit",
            cursor: downloading ? "default" : "pointer",
            opacity: downloading ? 0.7 : 1,
            transition: "background 0.15s",
          }}
        >
          <Download size={12} />
          {downloading ? "Downloading…" : "Download"}
        </button>
        {entry.download_urls.html && (
          <a
            href={entry.download_urls.html}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 4,
              padding: "6px 10px",
              borderRadius: 6,
              border: "1px solid var(--color-border)",
              background: "transparent",
              color: "var(--color-text-secondary)",
              fontSize: 11,
              fontFamily: "inherit",
              cursor: "pointer",
              textDecoration: "none",
              transition: "background 0.15s",
            }}
            title="Open in browser"
          >
            <ExternalLink size={12} />
            Web
          </a>
        )}
      </div>
    </div>
  );
}