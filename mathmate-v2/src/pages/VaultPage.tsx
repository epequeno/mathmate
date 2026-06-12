import { useState, useEffect, useCallback } from "react";
import { useVaultStore, type NoteEntry } from "../stores/vaultStore";
import { useProjectStore } from "../stores/projectStore";
import { useOutletContext } from "react-router-dom";
import { useDebounce } from "../hooks/useDebounce";
import {
  AlertTriangle,
  FolderOpen,
  Settings2,
  RefreshCw,
  FileText,
  Code2,
  Edit3,
  Save,
  X,
  Plus,
  Search,
  ChevronRight,
  ChevronDown,
  Link as LinkIcon,
  ExternalLink,
  Check,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { Files } from "../lib/api";
import { renderMarkdown } from "../lib/renderMarkdown";
import { sanitize } from "../lib/sanitize";
import { ask } from "@tauri-apps/plugin-dialog";
import { cx } from "../lib/clsx";
import styles from "./VaultPage.module.css";

// ── Types ──────────────────────────────────────────────────────────────

interface OutletCtx {
  openProjectSettings?: () => void;
}

// ── Component ──────────────────────────────────────────────────────────

export default function VaultPage() {
  const {
    notes,
    loading,
    error,
    searchResults,
    searchQuery,
    selectedNote,
    backlinks,
    synapseRunning,
    synapseHealth,
    loadNotes,
    searchNotes,
    clearSearch,
    readNote,
    saveNote,
    createNote,
    deleteNote,
    loadBacklinks,
    checkSynapseStatus,
    runHealthCheck,
  } = useVaultStore();

  const currentProject = useProjectStore((s) => s.currentProject);
  const startSynapse = useProjectStore((s) => s.startSynapse);
  const { openProjectSettings } = useOutletContext<OutletCtx>();

  const vaultPath = currentProject?.vault_path ?? "";

  // ── Local UI state ──

  const [noteLoading, setNoteLoading] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [editSaved, setEditSaved] = useState(false);
  const [editDirty, setEditDirty] = useState(false);
  const [newNoteOpen, setNewNoteOpen] = useState(false);
  const [newNoteTitle, setNewNoteTitle] = useState("");
  const [newNoteCreating, setNewNoteCreating] = useState(false);
  const [backlinksOpen, setBacklinksOpen] = useState(true);
  const [rawView, setRawView] = useState(false);
  const [localSearch, setLocalSearch] = useState("");
  const [synapseStarting, setSynapseStarting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const debouncedSearch = useDebounce(localSearch, 300);

  // ── Search sync ──

  useEffect(() => {
    if (debouncedSearch) {
      searchNotes(debouncedSearch);
    } else {
      clearSearch();
    }
  }, [debouncedSearch]);

  // ── Auto-load on mount / vault change ──

  useEffect(() => {
    if (vaultPath) {
      checkSynapseStatus().then(() => {
        runHealthCheck();
        loadNotes();
      });
    }
  }, [vaultPath, currentProject?.id]);

  // ── Watch pendingSelectPath (from citation chips / related notes) ──

  useEffect(() => {
    const { pendingSelectPath: p } = useVaultStore.getState();
    if (p) {
      const entry = notes.find((n) => n.path === p);
      if (entry) {
        handleSelectNote(entry);
      } else {
        readNote(p);
      }
      useVaultStore.getState().navigateToNote(""); // clear it
    }
  }, []);

  // ── Actions ──

  const handleSelectNote = useCallback(async (note: NoteEntry) => {
    setEditMode(false);
    setNoteLoading(true);
    setNoteError(null);
    setDeleteConfirm(null);
    try {
      await readNote(note.path);
      await loadBacklinks(note.path);
      setEditContent("");
      setEditDirty(false);
      setEditSaved(false);
    } catch {
      setNoteError("Failed to load note");
    } finally {
      setNoteLoading(false);
    }
  }, [readNote, loadBacklinks]);

  // When selectedNote changes, populate editContent
  useEffect(() => {
    if (selectedNote && !editContent && editMode) {
      setEditContent(selectedNote.body);
    }
  }, [selectedNote?.path]);

  const handleEdit = () => {
    if (selectedNote) {
      setEditContent(selectedNote.body);
      setEditMode(true);
      setEditDirty(false);
      setEditSaved(false);
    }
  };

  const handleCancelEdit = () => {
    setEditMode(false);
    setEditContent("");
    setEditDirty(false);
  };

  // Click-away: dismiss delete confirmation when clicking elsewhere
  useEffect(() => {
    if (!deleteConfirm) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-delete-btn]')) {
        setDeleteConfirm(null);
      }
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [deleteConfirm]);

  const handleSave = async () => {
    if (!selectedNote) return;
    setEditSaving(true);
    setEditSaved(false);
    try {
      await saveNote(selectedNote.path, editContent);
      setEditSaved(true);
      setEditDirty(false);
      setTimeout(() => setEditSaved(false), 2000);
      // Refresh the note
      await readNote(selectedNote.path);
    } catch (err) {
      setNoteError(String(err));
    } finally {
      setEditSaving(false);
    }
  };

  const handleCreateNote = async () => {
    if (!newNoteTitle.trim()) return;
    setNewNoteCreating(true);
    try {
      const result = await createNote(newNoteTitle.trim(), `# ${newNoteTitle.trim()}\n\n`);
      if (result) {
        setNewNoteOpen(false);
        setNewNoteTitle("");
      }
    } finally {
      setNewNoteCreating(false);
    }
  };

  const handleOpenNote = async (path: string) => {
    try {
      await Files.openPath(path, currentProject?.id, false);
    } catch (err) {
      if (!String(err).includes("outside allowed roots")) return;
      const confirmed = await ask(`Open this file outside the current project roots?\n\n${path}`, {
        title: "Open External File",
        kind: "warning",
      });
      if (confirmed) {
        await Files.openPath(path, currentProject?.id, true).catch(() => {});
      }
    }
  };

  const handleStartSynapse = async () => {
    setSynapseStarting(true);
    try {
      await startSynapse();
      await checkSynapseStatus();
      await runHealthCheck();
      await loadNotes();
    } finally {
      setSynapseStarting(false);
    }
  };

  const handleDeleteNote = async () => {
    if (!deleteConfirm || !selectedNote) return;
    try {
      await deleteNote(deleteConfirm);
      setDeleteConfirm(null);
    } catch {
      setDeleteConfirm(null);
    }
  };

  const handleBacklinkClick = (path: string) => {
    const entry = notes.find((n) => n.path === path);
    if (entry) {
      handleSelectNote(entry);
    } else {
      setNoteLoading(true);
      readNote(path).catch(() => setNoteError("Failed to load backlink note"));
      setNoteLoading(false);
    }
  };

  const handleWikilinkClick = useCallback((e: React.MouseEvent) => {
    const target = (e.target as HTMLElement).closest(".wikilink") as HTMLElement | null;
    if (!target) return;
    e.preventDefault();
    const notePath = target.getAttribute("data-note-path");
    if (!notePath) return;
    handleBacklinkClick(notePath);
  }, [notes, selectedNote]);

  // ── Derive display list ──

  const displayEntries: (NoteEntry & { snippet?: string })[] = searchResults
    ? searchResults
    : notes;

  // Group by folder
  interface FolderGroup {
    folder: string | null;
    items: (NoteEntry & { snippet?: string })[];
  }
  const groups: FolderGroup[] = [];
  const folderMap = new Map<string | null, FolderGroup>();

  for (const note of displayEntries) {
    const rel = note.path.startsWith(vaultPath)
      ? note.path.slice(vaultPath.length).replace(/^\//, "")
      : note.path;
    const parts = rel.split("/");
    const folder = parts.length > 1 ? parts.slice(0, -1).join("/") : null;

    let group = folderMap.get(folder);
    if (!group) {
      group = { folder, items: [] };
      folderMap.set(folder, group);
      groups.push(group);
    }
    group.items.push(note);
  }

  // Sort groups: root (null) first, then alphabetical
  groups.sort((a, b) => {
    if (a.folder === null) return -1;
    if (b.folder === null) return 1;
    return a.folder.localeCompare(b.folder);
  });

  // ── No vault configured ──
  if (!vaultPath) {
    return (
      <div className={styles.vault}>
        <VaultToolbar onRefresh={undefined} loading={false} vaultPath="" synapseRunning={false} />
        <div className={styles.emptyState}>
          <FolderOpen size={32} strokeWidth={1.2} style={{ opacity: 0.4 }} />
          <div style={{ fontSize: 14, fontWeight: 500, color: "var(--color-text-secondary)" }}>
            No vault configured
          </div>
          <div style={{ fontSize: 13, textAlign: "center", maxWidth: 300, lineHeight: 1.5 }}>
            Set a vault folder in Project Settings to browse and preview your study notes here.
          </div>
          {openProjectSettings && (
            <button
              onClick={openProjectSettings}
              className={styles.actionBtn}
              style={{ marginTop: 4, padding: "8px 16px", fontSize: 13 }}
            >
              <Settings2 size={14} />
              Open Project Settings
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.vault}>
      <VaultToolbar
        onRefresh={() => loadNotes()}
        loading={loading}
        vaultPath={vaultPath}
        synapseRunning={synapseRunning}
      />

      {/* Synapse not running banner */}
      {!synapseRunning && vaultPath && (
        <div className={styles.synapseBanner}>
          <AlertCircle size={13} style={{ color: "rgb(234,179,8)" }} />
          <span style={{ flex: 1 }}>Synapse not running — showing legacy vault content</span>
          <button
            onClick={handleStartSynapse}
            disabled={synapseStarting}
            className={styles.synapseStartBtn}
          >
            {synapseStarting ? <Loader2 size={11} style={{ animation: "spin 0.8s linear infinite" }} /> : null}
            Start Synapse
          </button>
        </div>
      )}

      {error && (
        <div className={styles.errorBanner}>
          <AlertTriangle size={13} /> {error}
        </div>
      )}

      {/* Search bar */}
      <div className={styles.searchBar}>
        <Search size={14} style={{ color: "var(--color-text-tertiary)", flexShrink: 0 }} />
        <input
          placeholder="Search notes…"
          value={localSearch}
          onChange={(e) => setLocalSearch(e.target.value)}
          className={styles.searchInput}
        />
        {localSearch && (
          <button onClick={() => setLocalSearch("")} className={styles.searchClear}>
            <X size={14} />
          </button>
        )}
      </div>

      <div className={styles.splitLayout}>
        {/* ── Left panel: note list ── */}
        <div className={styles.noteList}>
          {loading && displayEntries.length === 0 && (
            <div style={{ padding: 24, textAlign: "center", color: "var(--color-text-tertiary)", fontSize: 12 }}>
              Loading…
            </div>
          )}
          {!loading && displayEntries.length === 0 && !error && (
            <div style={{ padding: 24, textAlign: "center", color: "var(--color-text-tertiary)", fontSize: 12 }}>
              {searchQuery ? "No notes match your search." : "No markdown notes found in vault."}
            </div>
          )}

          {/* Groups */}
          {groups.map((group) => (
            <div key={group.folder ?? "__root"}>
              {group.folder && (
                <div className={styles.folderHeader}>{group.folder}</div>
              )}
              {group.items.map((note) => {
                const isSelected = selectedNote?.path === note.path;
                return (
                  <div
                    key={note.path}
                    onClick={() => handleSelectNote(note)}
                    className={cx(styles.noteItem, isSelected && styles.noteItemSelected)}
                  >
                    <div className={cx(styles.noteTitle, isSelected && styles.noteTitleSelected)}>
                      {note.title}
                    </div>
                    {"snippet" in note && note.snippet && (
                      <div className={styles.noteSnippet}>{note.snippet}</div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}

          {/* New note button */}
          {synapseRunning && (
            <div className={styles.newNoteFooter}>
              {newNoteOpen ? (
                <div className={styles.newNoteForm}>
                  <input
                    placeholder="Note title…"
                    value={newNoteTitle}
                    onChange={(e) => setNewNoteTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleCreateNote();
                      if (e.key === "Escape") { setNewNoteOpen(false); setNewNoteTitle(""); }
                    }}
                    autoFocus
                    className={styles.newNoteTitleInput}
                  />
                  <div className={styles.newNoteActions}>
                    <button
                      onClick={handleCreateNote}
                      disabled={newNoteCreating || !newNoteTitle.trim()}
                      className={cx(styles.newNoteCreate, "btn-primary")}
                      style={{ flex: 1 }}
                    >
                      {newNoteCreating ? <Loader2 size={11} style={{ animation: "spin 0.8s linear infinite" }} /> : null}
                      Create
                    </button>
                    <button
                      onClick={() => { setNewNoteOpen(false); setNewNoteTitle(""); }}
                      className={styles.newNoteCancel}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setNewNoteOpen(true)}
                  className={styles.newNoteBtn}
                >
                  <Plus size={13} />
                  New note
                </button>
              )}
            </div>
          )}
        </div>

        {/* ── Right panel: note preview ── */}
        <div className={styles.previewPanel}>
          {noteLoading && !selectedNote && (
            <div className={styles.centeredMsg}>Loading…</div>
          )}

          {selectedNote ? (
            <>
              {/* Note header bar */}
              <div className={styles.previewHeader}>
                <div>
                  <h2 className={styles.previewTitle}>{selectedNote.title}</h2>
                  {editDirty && <div className={styles.unsavedBadge}>Unsaved changes</div>}
                  {editSaved && (
                    <div className={styles.savedBadge}>
                      <Check size={11} /> Saved
                    </div>
                  )}
                  {noteError && (
                    <div style={{ fontSize: 11, color: "var(--color-red)", marginTop: 2 }}>{noteError}</div>
                  )}
                </div>

                {/* Action buttons */}
                <div className={styles.actionBar}>
                  {editMode ? (
                    <>
                      <button
                        onClick={handleSave}
                        disabled={editSaving}
                        className={cx(styles.actionBtn, styles.actionBtnPrimary)}
                      >
                        {editSaving ? <Loader2 size={12} style={{ animation: "spin 0.8s linear infinite" }} /> : <Save size={12} />}
                        Save
                      </button>
                      <button onClick={handleCancelEdit} className={styles.actionBtn}>
                        <X size={12} /> Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      {synapseRunning && (
                        <button onClick={handleEdit} title="Edit note" className={styles.actionBtn}>
                          <Edit3 size={12} /> Edit
                        </button>
                      )}
                      {/* Raw / Rendered toggle */}
                      <div className={styles.toggleGroup}>
                        <button
                          onClick={() => setRawView(false)}
                          title="Rendered view"
                          className={cx(styles.toggleBtn, !rawView && styles.toggleBtnActive)}
                        >
                          <FileText size={12} /> Preview
                        </button>
                        <button
                          onClick={() => setRawView(true)}
                          title="Raw markdown"
                          className={cx(styles.toggleBtn, rawView && styles.toggleBtnActive)}
                        >
                          <Code2 size={12} /> Raw
                        </button>
                      </div>
                      <button
                        onClick={() => handleOpenNote(selectedNote.path)}
                        title="Open in editor"
                        className={styles.actionBtn}
                      >
                        <ExternalLink size={12} /> Open
                      </button>
                      {synapseRunning && (
                        <button
                          onClick={() => {
                            if (deleteConfirm === selectedNote.path) {
                              handleDeleteNote();
                            } else {
                              setDeleteConfirm(selectedNote.path);
                            }
                          }}
                          data-delete-btn
                          className={cx(styles.deleteBtn, deleteConfirm === selectedNote.path && styles.deleteBtnConfirm)}
                        >
                          {deleteConfirm === selectedNote.path ? (
                            <>Delete?</>
                          ) : (
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                            </svg>
                          )}
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Relative path below title */}
              <div className={styles.previewPath}>
                {selectedNote.path.startsWith(vaultPath)
                  ? selectedNote.path.slice(vaultPath.length).replace(/^\//, "")
                  : selectedNote.path}
              </div>

              {/* Content area */}
              <div className={styles.previewContent}>
                {noteLoading ? (
                  <div style={{ color: "var(--color-text-tertiary)", fontSize: 12, padding: 20 }}>
                    <Loader2 size={14} style={{ animation: "spin 0.8s linear infinite" }} /> Loading…
                  </div>
                ) : editMode ? (
                  <>
                    <textarea
                      value={editContent}
                      onChange={(e) => {
                        setEditContent(e.target.value);
                        setEditDirty(true);
                        setEditSaved(false);
                      }}
                      className={styles.editTextarea}
                    />
                    {noteError && (
                      <div className={styles.inlineRowError}>
                        <AlertTriangle size={12} /> {noteError}
                        <button
                          onClick={() => setNoteError(null)}
                          style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "var(--color-red)", padding: 2 }}
                        >
                          <X size={12} />
                        </button>
                      </div>
                    )}
                  </>
                ) : rawView ? (
                  <pre className={styles.rawView}>{selectedNote.body}</pre>
                ) : (
                  <div
                    className="markdown-body"
                    onClick={handleWikilinkClick}
                    style={{ fontSize: 14, lineHeight: 1.7, color: "var(--color-text-primary)" }}
                    dangerouslySetInnerHTML={{
                      __html: sanitize(renderMarkdown(selectedNote.body)),
                    }}
                  />
                )}

                {/* ── Backlinks panel ── */}
                {!editMode && backlinks && (
                  <div className={styles.backlinks}>
                    <div
                      onClick={() => setBacklinksOpen(!backlinksOpen)}
                      className={styles.backlinksToggle}
                    >
                      {backlinksOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      <LinkIcon size={12} />
                      Backlinks
                      {backlinks.backlinks.length > 0 && (
                        <span style={{ color: "var(--color-text-tertiary)", fontWeight: 400 }}>
                          ({backlinks.backlinks.length})
                        </span>
                      )}
                    </div>

                    {backlinksOpen && (
                      <div className={styles.backlinksBody}>
                        {backlinks.backlinks.length === 0 && backlinks.forward_links.length === 0 && (
                          <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", fontStyle: "italic" }}>
                            No backlinks
                          </div>
                        )}

                        {backlinks.backlinks.length > 0 && (
                          <div className={styles.backlinkSection}>
                            <div className={styles.backlinkSectionTitle}>Linked from</div>
                            {backlinks.backlinks.map((bl) => (
                              <div key={bl.path} onClick={() => handleBacklinkClick(bl.path)} className={styles.backlinkItem}>
                                <span style={{ color: "var(--color-text-tertiary)" }}>←</span>
                                {bl.title || bl.path.split("/").pop()?.replace(/\.md$/i, "")}
                              </div>
                            ))}
                          </div>
                        )}

                        {backlinks.forward_links.length > 0 && (
                          <div>
                            <div className={styles.backlinkSectionTitle}>Forward links</div>
                            {backlinks.forward_links.map((fl) => (
                              <div key={fl.path} className={styles.forwardLinkItem}>
                                <span style={{ color: "var(--color-text-tertiary)" }}>→</span>
                                <span
                                  style={{
                                    color: fl.exists ? "var(--color-accent-light)" : "var(--color-text-tertiary)",
                                    cursor: fl.exists ? "pointer" : "default",
                                    textDecoration: fl.exists ? "none" : "line-through",
                                  }}
                                  onClick={() => fl.exists && handleBacklinkClick(fl.path)}
                                >
                                  {fl.title || fl.path.split("/").pop()?.replace(/\.md$/i, "")}
                                </span>
                                {!fl.exists && (
                                  <span style={{ fontSize: 10, color: "var(--color-text-tertiary)" }}>✗ broken</span>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className={styles.centeredMsg}>Select a note to preview</div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Toolbar ────────────────────────────────────────────────────────────

function VaultToolbar({
  onRefresh,
  loading,
  vaultPath,
  synapseRunning,
}: {
  onRefresh?: () => void;
  loading: boolean;
  vaultPath: string;
  synapseRunning: boolean;
}) {
  const synapseStatus = useProjectStore((s) => s.synapseStatus);
  const { noteCount, synapseHealth } = useVaultStore();

  const healthLabel = synapseHealth
    ? `FTS${synapseHealth.fts.status === "healthy" ? " ✓" : " ✗"} · Embed${synapseHealth.embeddings.status === "ready" ? " ✓" : " ✗"}`
    : null;

  return (
    <div className={styles.toolbar}>
      <span className={styles.toolbarTitle}>Vault</span>

      {/* Synapse health indicator */}
      {vaultPath && (
        <div
          title={
            synapseStatus.running
              ? `Synapse active · ${healthLabel ?? ""}`
              : "Synapse not running — using legacy vault tools"
          }
          className={styles.healthBadge}
          style={{
            background: synapseStatus.running ? "rgba(34,197,94,0.1)" : "rgba(234,179,8,0.1)",
          }}
        >
          <span
            className={styles.healthDot}
            style={{ background: synapseStatus.running ? "rgb(34,197,94)" : "rgb(234,179,8)" }}
          />
          {synapseStatus.running
            ? `Synapse (${noteCount} notes${healthLabel ? ` · ${healthLabel}` : ""})`
            : "Legacy"}
        </div>
      )}

      {vaultPath && (
        <span className={styles.vaultPath}>{vaultPath}</span>
      )}
      {onRefresh && (
        <button
          onClick={onRefresh}
          disabled={loading}
          title="Refresh vault"
          className={styles.refreshBtn}
          style={{ cursor: loading ? "default" : "pointer", opacity: loading ? 0.4 : 1 }}
        >
          <RefreshCw size={14} style={{ animation: loading ? "spin 0.8s linear infinite" : "none" }} />
        </button>
      )}
    </div>
  );
}
