import { useState } from "react";
import { FolderOpen, BookOpen, FileDown, Loader2, CheckCircle2, ChevronRight, ChevronDown, Library } from "lucide-react";
import { Field, inputStyle, iconBtnStyle, clearBtnStyle } from "./Shared";
import { Textbook as TextbookApi } from "../../lib/api";
import TextbookCatalog from "../TextbookCatalog";

interface TocEntry {
  title: string;
  page: number;
  level: number;
  index: number;
}

interface ImportResult {
  files_created: string[];
  chapters_found: number;
  sections_found: number;
}

interface TextbookTabProps {
  textbookPath: string;
  vaultPath: string;
  projectName: string;
  onTextbookPathChange: (v: string) => void;
}

export function TextbookTab({
  textbookPath,
  vaultPath,
  projectName,
  onTextbookPathChange,
}: TextbookTabProps) {
  const [tocLoading, setTocLoading] = useState(false);
  const [tocError, setTocError] = useState<string | null>(null);
  const [tocEntries, setTocEntries] = useState<TocEntry[] | null>(null);
  const [tocExpanded, setTocExpanded] = useState(false);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [showCatalog, setShowCatalog] = useState(false);

  const pickFilePath = async (setter: (v: string) => void) => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({ multiple: false });
      if (selected) setter(selected as string);
    } catch {
      // Dialog not available
    }
  };

  const handleExtractToc = async () => {
    if (!textbookPath.trim()) return;
    setTocLoading(true);
    setTocError(null);
    setTocEntries(null);
    setImportResult(null);
    setImportError(null);
    try {
      const entries = await TextbookApi.extractToc(textbookPath.trim());
      setTocEntries(entries);
      setTocExpanded(true);
      setSelectedIndices(new Set(entries.map((e) => e.index)));
    } catch (err) {
      setTocError(String(err));
    } finally {
      setTocLoading(false);
    }
  };

  const handleImportToc = async () => {
    const vPath = vaultPath.trim();
    if (!textbookPath.trim() || !vPath || !tocEntries) return;
    setImporting(true);
    setImportError(null);
    setImportResult(null);
    try {
      const result = await TextbookApi.importToc(
        textbookPath.trim(),
        vPath,
        Array.from(selectedIndices),
        projectName.trim() || undefined
      );
      setImportResult(result);
    } catch (err) {
      setImportError(String(err));
    } finally {
      setImporting(false);
    }
  };

  const toggleTocEntry = (index: number) => {
    setSelectedIndices((prev) => {
      const next = new Set(prev);
      next.has(index) ? next.delete(index) : next.add(index);
      return next;
    });
  };

  return (
    <>
      <Field
        label="Textbook PDF"
        sublabel={textbookPath ? "✓ Set" : "Not set"}
        sublabelColor={textbookPath ? "var(--color-success, #22c55e)" : "var(--color-text-tertiary)"}
        icon={<BookOpen size={13} />}
      >
        <div style={{ display: "flex", gap: 6 }}>
          <input
            value={textbookPath}
            onChange={(e) => onTextbookPathChange(e.target.value)}
            style={{ ...inputStyle, flex: 1 }}
            placeholder="/path/to/textbook.pdf"
          />
          <button onClick={() => pickFilePath(onTextbookPathChange)} style={iconBtnStyle} title="Browse for PDF">
            <FolderOpen size={14} />
          </button>
        </div>
        {textbookPath && (
          <button onClick={() => onTextbookPathChange("")} style={clearBtnStyle}>Clear</button>
        )}
        <button
          onClick={() => setShowCatalog(true)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "6px 10px",
            borderRadius: 6,
            border: "1px solid var(--color-border)",
            background: "var(--color-surface)",
            color: "var(--color-text-secondary)",
            fontSize: 12,
            fontFamily: "inherit",
            cursor: "pointer",
            transition: "background 0.15s",
          }}
          title="Browse free open-source textbooks"
        >
          <Library size={13} />
          Browse Free Textbooks
        </button>
      </Field>

      {/* PDF Structure Import */}
      {textbookPath && vaultPath && (
        <Field label="Import PDF Structure" icon={<FileDown size={13} />}>
          {!tocEntries && !tocLoading && (
            <>
              <button
                onClick={() => void handleExtractToc()}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "6px 10px",
                  borderRadius: 6,
                  border: "1px solid var(--color-border)",
                  background: "var(--color-surface)",
                  color: "var(--color-text-secondary)",
                  fontSize: 12,
                  fontFamily: "inherit",
                  cursor: "pointer",
                }}
                title="Extract chapter/section structure from the PDF"
              >
                <FileDown size={13} />
                Parse PDF table of contents
              </button>
              <span style={{ fontSize: 11, color: "var(--color-text-tertiary)", lineHeight: 1.4 }}>
                Extracts the bookmarks/TOC from your textbook PDF and creates study notes in the vault.
              </span>
            </>
          )}

          {tocLoading && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--color-text-secondary)" }}>
              <Loader2 size={13} style={{ animation: "spin 0.8s linear infinite" }} />
              Reading PDF outline…
            </div>
          )}

          {tocError && (
            <div style={{ fontSize: 11, color: "var(--color-red, #ef4444)", lineHeight: 1.4 }}>
              {tocError}
              <button
                onClick={() => { setTocError(null); setTocEntries(null); }}
                style={{ marginLeft: 6, background: "none", border: "none", cursor: "pointer", color: "var(--color-text-secondary)", fontSize: 11, textDecoration: "underline" }}
              >
                Dismiss
              </button>
            </div>
          )}

          {tocEntries && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <button
                  onClick={() => setTocExpanded(!tocExpanded)}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-text-secondary)", padding: 2, display: "flex" }}
                >
                  {tocExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-primary)" }}>
                  {tocEntries.length} entries found
                </span>
                <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
                  <TocActionBtn onClick={() => setSelectedIndices(new Set(tocEntries.map((e) => e.index)))}>All</TocActionBtn>
                  <TocActionBtn onClick={() => setSelectedIndices(new Set())}>None</TocActionBtn>
                </div>
              </div>

              {tocExpanded && (
                <div style={{ maxHeight: 220, overflowY: "auto", border: "1px solid var(--color-border)", borderRadius: 6, padding: "4px 0" }}>
                  {tocEntries.map((entry) => (
                    <label key={entry.index} style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 8px", cursor: "pointer", fontSize: 11, color: "var(--color-text-secondary)" }}>
                      <input
                        type="checkbox"
                        checked={selectedIndices.has(entry.index)}
                        onChange={() => toggleTocEntry(entry.index)}
                        style={{ margin: 0, accentColor: "var(--color-accent)" }}
                      />
                      <span style={{ width: 14, textAlign: "right", color: "var(--color-text-tertiary)", flexShrink: 0 }}>
                        {entry.page}
                      </span>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", paddingLeft: entry.level * 12 }}>
                        {entry.title}
                      </span>
                    </label>
                  ))}
                </div>
              )}

              <button
                onClick={() => void handleImportToc()}
                disabled={importing || selectedIndices.size === 0}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  padding: "6px 10px",
                  borderRadius: 6,
                  border: "none",
                  background: importing || selectedIndices.size === 0 ? "var(--color-border)" : "var(--color-accent)",
                  color: importing || selectedIndices.size === 0 ? "var(--color-text-tertiary)" : "#fff",
                  fontSize: 12,
                  fontWeight: 600,
                  fontFamily: "inherit",
                  cursor: importing || selectedIndices.size === 0 ? "default" : "pointer",
                  opacity: importing ? 0.7 : 1,
                }}
              >
                {importing ? (
                  <><Loader2 size={12} style={{ animation: "spin 0.8s linear infinite" }} /> Importing…</>
                ) : (
                  <>Generate {selectedIndices.size} vault notes</>
                )}
              </button>

              {importResult && (
                <div style={{ padding: "8px 10px", borderRadius: 6, background: "rgba(34,197,94,0.08)", fontSize: 11, color: "var(--color-success, #22c55e)", lineHeight: 1.5 }}>
                  <CheckCircle2 size={13} style={{ marginRight: 4, verticalAlign: -2 }} />
                  Created {importResult.chapters_found} chapters, {importResult.sections_found} sections
                  {importResult.files_created.length > 0 && (
                    <div style={{ marginTop: 4, color: "var(--color-text-tertiary)" }}>
                      {importResult.files_created.slice(0, 5).map((f, i) => (
                        <div key={i} style={{ paddingLeft: 12, fontSize: 10 }}>{f}</div>
                      ))}
                      {importResult.files_created.length > 5 && (
                        <div style={{ paddingLeft: 12, fontSize: 10 }}>
                          …and {importResult.files_created.length - 5} more
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {importError && (
                <div style={{ fontSize: 11, color: "var(--color-red, #ef4444)", lineHeight: 1.4 }}>
                  {importError}
                  <button onClick={() => setImportError(null)} style={{ marginLeft: 6, background: "none", border: "none", cursor: "pointer", color: "var(--color-text-secondary)", fontSize: 11, textDecoration: "underline" }}>
                    Dismiss
                  </button>
                </div>
              )}
            </div>
          )}
        </Field>
      )}

      {showCatalog && <TextbookCatalog onClose={() => setShowCatalog(false)} />}
    </>
  );
}

function TocActionBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: "none",
        border: "1px solid var(--color-border)",
        borderRadius: 4,
        cursor: "pointer",
        fontSize: 10,
        color: "var(--color-text-tertiary)",
        padding: "1px 6px",
        fontFamily: "inherit",
      }}
    >
      {children}
    </button>
  );
}