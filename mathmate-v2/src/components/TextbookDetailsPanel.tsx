import { invoke } from "../lib/tauri";
import type { TextbookCatalogEntry, DownloadResult, TextbookLicenseInfo } from "../lib/types";
import { subjectLabel, subjectColor, buildAttributionNotice, formatFileSize, LICENSE_INFO } from "../lib/textbookLicenses";
import { useProjectStore } from "../stores/projectStore";
import { X, Download, ExternalLink, BookOpen, CheckCircle, AlertTriangle, Loader2 } from "lucide-react";
import { useState, useCallback } from "react";

interface TextbookDetailsPanelProps {
  entry: TextbookCatalogEntry;
  onClose: () => void;
}

export default function TextbookDetailsPanel({ entry, onClose }: TextbookDetailsPanelProps) {
  const currentProject = useProjectStore((s) => s.currentProject);
  const loadProjects = useProjectStore((s) => s.loadProjects);
  const [downloading, setDownloading] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const color = subjectColor(entry.subject);
  const licenseInfo = LICENSE_INFO[entry.license as keyof typeof LICENSE_INFO];
  const hasExistingTextbook = !!currentProject?.textbook_path;

  const handleDownload = useCallback(async () => {
    setDownloading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const result = await invoke<DownloadResult>("download_free_textbook", {
        catalogId: entry.id,
        projectId: currentProject?.id ?? null,
      });

      if (currentProject) {
        await loadProjects();
      }

      setSuccessMsg(`"${entry.title}" downloaded! You can now view it in the Book tab.`);
    } catch (err: unknown) {
      setErrorMsg(typeof err === "string" ? err : "Download failed. Please try again.");
    } finally {
      setDownloading(false);
    }
  }, [entry.id, entry.title, currentProject, loadProjects]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 110,
        background: "rgba(0,0,0,0.35)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 580,
          maxHeight: "80vh",
          borderRadius: 12,
          background: "var(--color-bg)",
          border: "1px solid var(--color-border)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 12,
            padding: "16px 20px",
            borderBottom: "1px solid var(--color-border)",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 40,
              height: 40,
              borderRadius: 10,
              background: `${color}18`,
              color,
              flexShrink: 0,
            }}
          >
            <BookOpen size={18} strokeWidth={1.5} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: "var(--color-text-primary)", lineHeight: 1.3 }}>
              {entry.title}
            </div>
            <div style={{ fontSize: 12, color: "var(--color-text-tertiary)", marginTop: 2 }}>
              {entry.authors.join(", ")}
              {entry.edition ? ` · ${entry.edition} ed.` : ""}
              {entry.publisher ? ` · ${entry.publisher}` : ""}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--color-text-tertiary)",
              display: "flex",
              padding: 4,
              borderRadius: 6,
            }}
            title="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Subject + License badges */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                padding: "3px 10px",
                borderRadius: 6,
                fontSize: 11,
                fontWeight: 500,
                background: `${color}15`,
                color,
                border: `1px solid ${color}30`,
              }}
            >
              {subjectLabel(entry.subject)}
            </span>
            {licenseInfo && (
              <a
                href={licenseInfo.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "3px 10px",
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: 500,
                  background: "var(--color-bg)",
                  color: "var(--color-text-secondary)",
                  border: "1px solid var(--color-border)",
                  textDecoration: "none",
                  cursor: "pointer",
                }}
                title={licenseInfo.description}
              >
                {licenseInfo.label}
                <ExternalLink size={10} />
              </a>
            )}
          </div>

          {/* Description */}
          <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.6 }}>
            {entry.description}
          </div>

          {/* Metadata grid */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {entry.file_size_hint && (
              <MetaCell label="File size" value={`~${formatFileSize(entry.file_size_hint)}`} />
            )}
            {entry.page_count_hint && (
              <MetaCell label="Pages" value={`~${entry.page_count_hint}`} />
            )}
            {entry.recommended_for && entry.recommended_for.length > 0 && (
              <MetaCell label="Recommended for" value={entry.recommended_for.join(", ")} />
            )}
          </div>

          {/* License details */}
          {licenseInfo && (
            <div
              style={{
                padding: "10px 12px",
                borderRadius: 8,
                background: "var(--color-bg)",
                border: "1px solid var(--color-border)",
                fontSize: 11,
                color: "var(--color-text-tertiary)",
                lineHeight: 1.5,
              }}
            >
              <div style={{ fontWeight: 600, color: "var(--color-text-secondary)", marginBottom: 2 }}>
                License: {licenseInfo.label}
              </div>
              {licenseInfo.description}
              {licenseInfo.attribution_required && (
                <div style={{ marginTop: 4, color: "var(--color-text-tertiary)" }}>
                  ⓘ Attribution required — see source for details
                </div>
              )}
            </div>
          )}

          {/* Attribution notice */}
          <div
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              background: "rgba(234,179,8,0.06)",
              border: "1px solid rgba(234,179,8,0.2)",
              fontSize: 10,
              color: "rgb(133,100,4)",
              lineHeight: 1.5,
              fontStyle: "italic",
            }}
          >
            {buildAttributionNotice(entry)}
          </div>

          {/* Download links */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {entry.download_urls.pdf && (
              <button
                onClick={handleDownload}
                disabled={downloading}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  padding: "10px 16px",
                  borderRadius: 8,
                  border: "none",
                  background: downloading ? "var(--color-border)" : "var(--color-accent)",
                  color: downloading ? "var(--color-text-tertiary)" : "#fff",
                  fontSize: 13,
                  fontWeight: 600,
                  fontFamily: "inherit",
                  cursor: downloading ? "default" : "pointer",
                  opacity: downloading ? 0.7 : 1,
                  transition: "background 0.15s",
                }}
              >
                {downloading ? (
                  <><Loader2 size={14} style={{ animation: "spin 0.8s linear infinite" }} /> Downloading…</>
                ) : (
                  <><Download size={14} /> Download PDF{hasExistingTextbook ? " & Set as Textbook" : ""}</>
                )}
              </button>
            )}
            <div style={{ display: "flex", gap: 6 }}>
              {entry.download_urls.epub && (
                <FormatLink href={entry.download_urls.epub} label="EPUB" />
              )}
              {entry.download_urls.html && (
                <FormatLink href={entry.download_urls.html} label="Read Online (HTML)" />
              )}
            </div>
          </div>

          {/* Status messages */}
          {successMsg && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "rgb(34,197,94)" }}>
              <CheckCircle size={13} /> {successMsg}
            </div>
          )}
          {errorMsg && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "rgb(239,68,68)" }}>
              <AlertTriangle size={13} /> {errorMsg}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MetaCell({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        padding: "8px 10px",
        borderRadius: 6,
        background: "var(--color-bg)",
        border: "1px solid var(--color-border)",
      }}
    >
      <div style={{ fontSize: 10, color: "var(--color-text-tertiary)", marginBottom: 1 }}>{label}</div>
      <div style={{ fontSize: 12, color: "var(--color-text-secondary)", fontWeight: 500 }}>{value}</div>
    </div>
  );
}

function FormatLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 4,
        padding: "8px 12px",
        borderRadius: 6,
        border: "1px solid var(--color-border)",
        background: "var(--color-surface)",
        color: "var(--color-text-secondary)",
        fontSize: 12,
        fontFamily: "inherit",
        cursor: "pointer",
        textDecoration: "none",
        transition: "background 0.15s",
      }}
    >
      <ExternalLink size={12} />
      {label}
    </a>
  );
}