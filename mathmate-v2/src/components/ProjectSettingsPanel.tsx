import { useState, useEffect } from "react";
import { X, FolderOpen, BookOpen, Bot, GraduationCap, Save, Sparkles, CheckCircle2, AlertCircle, FileDown, Loader2, ChevronRight, ChevronDown, Library } from "lucide-react";
import { useProjectStore } from "../stores/projectStore";
import { invoke } from "../lib/tauri";
import type { MathProject } from "../lib/types";
import TextbookCatalog from "./TextbookCatalog";

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

interface ProjectSettingsPanelProps {
  onClose: () => void;
}

export default function ProjectSettingsPanel({ onClose }: ProjectSettingsPanelProps) {
  const { currentProject, updateProject } = useProjectStore();

  const [name, setName] = useState("");
  const [textbookPath, setTextbookPath] = useState("");
  const [vaultPath, setVaultPath] = useState("");
  const [defaultModel, setDefaultModel] = useState("");
  const [tutorStyle, setTutorStyle] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [initStatus, setInitStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [initError, setInitError] = useState<string | null>(null);

  // PDF import state
  const [tocLoading, setTocLoading] = useState(false);
  const [tocError, setTocError] = useState<string | null>(null);
  const [tocEntries, setTocEntries] = useState<TocEntry[] | null>(null);
  const [tocExpanded, setTocExpanded] = useState(false);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [showCatalog, setShowCatalog] = useState(false);

  // Populate fields whenever the panel opens or the project changes
  useEffect(() => {
    if (!currentProject) return;
    setName(currentProject.name ?? "");
    setTextbookPath(currentProject.textbook_path ?? "");
    setVaultPath(currentProject.vault_path ?? "");
    setDefaultModel(currentProject.default_model ?? "");
    setTutorStyle(currentProject.tutor_style ?? "");
    setSaved(false);
  }, [currentProject]);

  if (!currentProject) {
    return (
      <div style={panelStyle}>
        <PanelHeader onClose={onClose} />
        <div style={{ padding: 20, color: "var(--color-text-secondary)", fontSize: 13 }}>
          No project selected.
        </div>
      </div>
    );
  }

  const handleSave = async () => {
    setSaving(true);
    const updated: MathProject = {
      ...currentProject,
      name: name.trim() || currentProject.name,
      textbook_path: textbookPath.trim() || undefined,
      vault_path: vaultPath.trim() || undefined,
      default_model: defaultModel.trim() || undefined,
      tutor_style: tutorStyle.trim() || undefined,
    };
    try {
      await updateProject(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  const pickFilePath = async (setter: (v: string) => void) => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({ multiple: false });
      if (selected) setter(selected as string);
    } catch {
      // Dialog not available — user can type path manually
    }
  };

  const handleInitVault = async () => {
    const path = vaultPath.trim();
    if (!path) return;
    setInitStatus("running");
    setInitError(null);
    try {
      await invoke("init_vault", {
        vaultPath: path,
        projectName: name.trim() || currentProject?.name || "Study Vault",
      });
      setInitStatus("done");
      setTimeout(() => setInitStatus("idle"), 4000);
    } catch (err) {
      setInitStatus("error");
      setInitError(String(err));
    }
  };

  const handleExtractToc = async () => {
    const pdfPath = textbookPath.trim();
    if (!pdfPath) return;
    setTocLoading(true);
    setTocError(null);
    setTocEntries(null);
    setImportResult(null);
    setImportError(null);
    try {
      const entries = await invoke<TocEntry[]>("extract_pdf_toc", { path: pdfPath });
      setTocEntries(entries);
      setTocExpanded(true);
      // Select all by default
      setSelectedIndices(new Set(entries.map((e) => e.index)));
    } catch (err) {
      setTocError(String(err));
    } finally {
      setTocLoading(false);
    }
  };

  const handleImportToc = async () => {
    const pdfPath = textbookPath.trim();
    const vPath = vaultPath.trim();
    if (!pdfPath || !vPath || !tocEntries) return;
    setImporting(true);
    setImportError(null);
    setImportResult(null);
    try {
      const result = await invoke<ImportResult>("import_pdf_toc", {
        pdfPath,
        vaultPath: vPath,
        selectedIndices: Array.from(selectedIndices),
        textbookTitle: name.trim() || undefined,
      });
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
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const selectAllToc = () => {
    if (tocEntries) setSelectedIndices(new Set(tocEntries.map((e) => e.index)));
  };

  const deselectAllToc = () => {
    setSelectedIndices(new Set());
  };

  const pickFolderPath = async (setter: (v: string) => void) => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({ multiple: false, directory: true });
      if (selected) setter(selected as string);
    } catch {
      // Dialog not available — user can type path manually
    }
  };

  return (
    <div style={panelStyle}>
      <PanelHeader onClose={onClose} />

      <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px", display: "flex", flexDirection: "column", gap: 16 }}>

        {/* Project ID (read-only) */}
        <Field label="Project ID">
          <span style={monoStyle}>{currentProject.id}</span>
        </Field>

        {/* Name */}
        <Field label="Project name">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={inputStyle}
            placeholder="e.g. Calculus II"
          />
        </Field>

        {/* Textbook path */}
        <Field
          label="Textbook PDF"
          sublabel={textbookPath ? "✓ Set" : "Not set"}
          sublabelColor={textbookPath ? "var(--color-success, #22c55e)" : "var(--color-text-tertiary)"}
          icon={<BookOpen size={13} />}
        >
          <div style={{ display: "flex", gap: 6 }}>
            <input
              value={textbookPath}
              onChange={(e) => setTextbookPath(e.target.value)}
              style={{ ...inputStyle, flex: 1 }}
              placeholder="/path/to/textbook.pdf"
            />
            <button onClick={() => pickFilePath(setTextbookPath)} style={iconBtnStyle} title="Browse for PDF">
              <FolderOpen size={14} />
            </button>
          </div>
          {textbookPath && (
            <button
              onClick={() => setTextbookPath("")}
              style={{ ...clearBtnStyle }}
            >
              Clear
            </button>
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

        {/* Vault path */}
        <Field
          label="Vault folder"
          sublabel={vaultPath ? "✓ Set" : "Not set"}
          sublabelColor={vaultPath ? "var(--color-success, #22c55e)" : "var(--color-text-tertiary)"}
          icon={<FolderOpen size={13} />}
        >
          <div style={{ display: "flex", gap: 6 }}>
            <input
              value={vaultPath}
              onChange={(e) => { setVaultPath(e.target.value); setInitStatus("idle"); setInitError(null); }}
              style={{ ...inputStyle, flex: 1 }}
              placeholder="/path/to/vault"
            />
            <button onClick={() => pickFolderPath(setVaultPath)} style={iconBtnStyle} title="Browse for folder">
              <FolderOpen size={14} />
            </button>
          </div>

          {/* Initialize vault button */}
          {vaultPath && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 2 }}>
              <button
                onClick={handleInitVault}
                disabled={initStatus === "running"}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "6px 10px",
                  borderRadius: 6,
                  border: "1px solid var(--color-border)",
                  background: initStatus === "done"
                    ? "rgba(34,197,94,0.12)"
                    : initStatus === "error"
                    ? "rgba(239,68,68,0.10)"
                    : "var(--color-surface)",
                  color: initStatus === "done"
                    ? "var(--color-success, #22c55e)"
                    : initStatus === "error"
                    ? "var(--color-red, #ef4444)"
                    : "var(--color-text-secondary)",
                  fontSize: 12,
                  fontFamily: "inherit",
                  cursor: initStatus === "running" ? "not-allowed" : "pointer",
                  opacity: initStatus === "running" ? 0.6 : 1,
                  transition: "background 0.2s, color 0.2s",
                }}
                title="Create the vault folder with a MathMate-ready structure (Home, PROGRESS, Templates, Study Logs)"
              >
                {initStatus === "done" ? <CheckCircle2 size={13} /> :
                 initStatus === "error" ? <AlertCircle size={13} /> :
                 <Sparkles size={13} />}
                {initStatus === "running" ? "Initializing…" :
                 initStatus === "done" ? "Vault initialized!" :
                 initStatus === "error" ? "Failed — try again" :
                 "Initialize vault"}
              </button>
              {initStatus === "error" && initError && (
                <span style={{ fontSize: 11, color: "var(--color-red, #ef4444)", lineHeight: 1.4 }}>
                  {initError}
                </span>
              )}
              {initStatus === "idle" && (
                <span style={{ fontSize: 11, color: "var(--color-text-tertiary)", lineHeight: 1.4 }}>
                  Creates Home.md, PROGRESS.md, Templates/, and MathMate/Study Logs/ at this path.
                </span>
              )}
              <button onClick={() => { setVaultPath(""); setInitStatus("idle"); }} style={clearBtnStyle}>
                Clear
              </button>
            </div>
          )}
        </Field>

        {/* ── PDF Structure Import ── */}
        {textbookPath && vaultPath && (
          <Field
            label="Import PDF Structure"
            icon={<FileDown size={13} />}
          >
            {!tocEntries && !tocLoading && (
              <>
                <button
                  onClick={handleExtractToc}
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
                  title="Extract chapter/section structure from the PDF and generate vault notes"
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
                  style={{ 
                    marginLeft: 6, background: "none", border: "none", cursor: "pointer", 
                    color: "var(--color-text-secondary)", fontSize: 11, textDecoration: "underline" 
                  }}
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
                    <button onClick={selectAllToc} style={tocActionStyle}>All</button>
                    <button onClick={deselectAllToc} style={tocActionStyle}>None</button>
                  </div>
                </div>

                {tocExpanded && (
                  <div
                    style={{
                      maxHeight: 220,
                      overflowY: "auto",
                      border: "1px solid var(--color-border)",
                      borderRadius: 6,
                      padding: "4px 0",
                    }}
                  >
                    {tocEntries.map((entry) => (
                      <label
                        key={entry.index}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          padding: "3px 8px",
                          cursor: "pointer",
                          fontSize: 11,
                          color: "var(--color-text-secondary)",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={selectedIndices.has(entry.index)}
                          onChange={() => toggleTocEntry(entry.index)}
                          style={{ margin: 0, accentColor: "var(--color-accent)" }}
                        />
                        <span style={{ width: 14, textAlign: "right", color: "var(--color-text-tertiary)", flexShrink: 0 }}>
                          {entry.page}
                        </span>
                        <span
                          style={{
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            paddingLeft: entry.level * 12,
                          }}
                        >
                          {entry.title}
                        </span>
                      </label>
                    ))}
                  </div>
                )}

                <button
                  onClick={handleImportToc}
                  disabled={importing || selectedIndices.size === 0}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                    padding: "6px 10px",
                    borderRadius: 6,
                    border: "none",
                    background: importing || selectedIndices.size === 0
                      ? "var(--color-border)"
                      : "var(--color-accent)",
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
                  <div style={{
                    padding: "8px 10px",
                    borderRadius: 6,
                    background: "rgba(34,197,94,0.08)",
                    fontSize: 11,
                    color: "var(--color-success, #22c55e)",
                    lineHeight: 1.5,
                  }}>
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
                    <button
                      onClick={() => setImportError(null)}
                      style={{ 
                        marginLeft: 6, background: "none", border: "none", cursor: "pointer", 
                        color: "var(--color-text-secondary)", fontSize: 11, textDecoration: "underline" 
                      }}
                    >
                      Dismiss
                    </button>
                  </div>
                )}
              </div>
            )}
          </Field>
        )}

        {/* Default model override */}
        <Field
          label="Default model"
          sublabel="Overrides the global model for this project"
          icon={<Bot size={13} />}
        >
          <input
            value={defaultModel}
            onChange={(e) => setDefaultModel(e.target.value)}
            style={inputStyle}
            placeholder="e.g. openai/gpt-4o (leave blank for global)"
          />
          {defaultModel && (
            <button onClick={() => setDefaultModel("")} style={clearBtnStyle}>
              Clear
            </button>
          )}
        </Field>

        {/* Tutor style */}
        <Field
          label="Tutor style"
          sublabel="Guides the assistant's teaching approach"
          icon={<GraduationCap size={13} />}
        >
          <textarea
            value={tutorStyle}
            onChange={(e) => setTutorStyle(e.target.value)}
            style={{ ...inputStyle, minHeight: 72, resize: "vertical" }}
            placeholder="e.g. Socratic — ask guiding questions before giving answers"
          />
        </Field>

        {/* Timestamps */}
        <div style={{ display: "flex", flexDirection: "column", gap: 4, paddingTop: 4, borderTop: "1px solid var(--color-border)" }}>
          <MetaRow label="Created" value={fmtDate(currentProject.created_at)} />
          <MetaRow label="Updated" value={fmtDate(currentProject.updated_at)} />
        </div>
      </div>

      {/* Save footer — always visible, never scrolled away */}
      <div style={{ padding: "12px 16px", borderTop: "1px solid var(--color-border)", flexShrink: 0 }}>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            width: "100%",
            padding: "8px 0",
            borderRadius: 8,
            border: "none",
            background: saved ? "var(--color-success, #22c55e)" : "var(--color-accent)",
            color: "#fff",
            fontWeight: 600,
            fontSize: 13,
            cursor: saving ? "not-allowed" : "pointer",
            opacity: saving ? 0.7 : 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            transition: "background 0.2s",
          }}
        >
          <Save size={14} />
          {saved ? "Saved!" : saving ? "Saving…" : "Save changes"}
        </button>
      </div>

      {/* Free Textbook Catalog overlay */}
      {showCatalog && <TextbookCatalog onClose={() => setShowCatalog(false)} />}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function PanelHeader({ onClose }: { onClose: () => void }) {
  return (
    <div
      style={{
        padding: "14px 14px 10px",
        borderBottom: "1px solid var(--color-border)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexShrink: 0,
      }}
    >
      <span style={{ fontWeight: 600, fontSize: 13, color: "var(--color-text-primary)" }}>
        Project Settings
      </span>
      <button
        onClick={onClose}
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          color: "var(--color-text-tertiary)",
          display: "flex",
          padding: 2,
        }}
      >
        <X size={14} />
      </button>
    </div>
  );
}

function Field({
  label,
  sublabel,
  sublabelColor,
  icon,
  children,
}: {
  label: string;
  sublabel?: string;
  sublabelColor?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
        {icon && <span style={{ color: "var(--color-text-tertiary)", display: "flex" }}>{icon}</span>}
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-secondary)" }}>{label}</span>
        {sublabel && (
          <span style={{ fontSize: 11, color: sublabelColor ?? "var(--color-text-tertiary)", marginLeft: "auto" }}>
            {sublabel}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
      <span style={{ color: "var(--color-text-tertiary)" }}>{label}</span>
      <span style={{ color: "var(--color-text-secondary)" }}>{value}</span>
    </div>
  );
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return iso;
  }
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const panelStyle: React.CSSProperties = {
  width: 280,
  minWidth: 280,
  background: "var(--color-bg-elevated)",
  borderLeft: "1px solid var(--color-border)",
  display: "flex",
  flexDirection: "column",
  height: "100%",   // fill the parent slide-in container, not the whole viewport
  overflow: "hidden", // keep header + footer pinned, let only the middle scroll
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "7px 10px",
  borderRadius: 6,
  border: "1px solid var(--color-border)",
  background: "var(--color-surface)",
  color: "var(--color-text-primary)",
  fontSize: 12,
  fontFamily: "inherit",
  outline: "none",
  boxSizing: "border-box",
};

const iconBtnStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "0 8px",
  borderRadius: 6,
  border: "1px solid var(--color-border)",
  background: "var(--color-surface)",
  color: "var(--color-text-secondary)",
  cursor: "pointer",
  flexShrink: 0,
};

const clearBtnStyle: React.CSSProperties = {
  alignSelf: "flex-start",
  background: "none",
  border: "none",
  cursor: "pointer",
  fontSize: 11,
  color: "var(--color-text-tertiary)",
  padding: "0 2px",
  textDecoration: "underline",
};

const monoStyle: React.CSSProperties = {
  fontFamily: "'SF Mono', Menlo, Monaco, monospace",
  fontSize: 11,
  color: "var(--color-text-tertiary)",
  wordBreak: "break-all",
};

const tocActionStyle: React.CSSProperties = {
  background: "none",
  border: "1px solid var(--color-border)",
  borderRadius: 4,
  cursor: "pointer",
  fontSize: 10,
  color: "var(--color-text-tertiary)",
  padding: "1px 6px",
  fontFamily: "inherit",
};
