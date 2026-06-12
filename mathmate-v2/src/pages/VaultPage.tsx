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
import { invoke } from "../lib/tauri";
import { renderMarkdown } from "../lib/renderMarkdown";
import { sanitize } from "../lib/sanitize";
import { ask } from "@tauri-apps/plugin-dialog";

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

  // open_path contract (see lib.rs docs): paths inside project roots open immediately;
  // paths outside roots require confirmed:true after a user confirmation dialog.
  const handleOpenNote = async (path: string) => {
    try {
      await invoke("open_path", { path, projectId: currentProject?.id, confirmed: false });
    } catch (err) {
      if (!String(err).includes("outside allowed roots")) return;
      const confirmed = await ask(`Open this file outside the current project roots?\n\n${path}`, {
        title: "Open External File",
        kind: "warning",
      });
      if (confirmed) {
        await invoke("open_path", { path, projectId: currentProject?.id, confirmed: true }).catch(() => {});
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
      // error handled by store
      setDeleteConfirm(null);
    }
  };

  const handleBacklinkClick = (path: string) => {
    const entry = notes.find((n) => n.path === path);
    if (entry) {
      handleSelectNote(entry);
    } else {
      // Path not in current list — try reading it directly
      setNoteLoading(true);
      readNote(path).catch(() => setNoteError("Failed to load backlink note"));
      setNoteLoading(false);
    }
  };

  // ── Wikilink click handler (for [[links]] in rendered markdown) ──
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

  // ── Render ──

  // ── No vault configured ──
  if (!vaultPath) {
    return (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <VaultToolbar onRefresh={undefined} loading={false} vaultPath="" synapseRunning={false} />
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
            color: "var(--color-text-tertiary)",
          }}
        >
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
              style={{
                marginTop: 4,
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 16px",
                borderRadius: 8,
                border: "1px solid var(--color-border)",
                background: "var(--color-surface)",
                color: "var(--color-text-secondary)",
                fontSize: 13,
                fontFamily: "inherit",
                cursor: "pointer",
              }}
            >
              <Settings2 size={14} />
              Open Project Settings
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── Main layout ──
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <VaultToolbar
        onRefresh={() => loadNotes()}
        loading={loading}
        vaultPath={vaultPath}
        synapseRunning={synapseRunning}
      />

      {/* Synapse not running banner */}
      {!synapseRunning && vaultPath && (
        <div
          style={{
            padding: "6px 16px",
            background: "rgba(234,179,8,0.08)",
            fontSize: 12,
            color: "var(--color-text-secondary)",
            borderBottom: "1px solid var(--color-border)",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <AlertCircle size={13} style={{ color: "rgb(234,179,8)" }} />
          <span style={{ flex: 1 }}>Synapse not running — showing legacy vault content</span>
          <button
            onClick={handleStartSynapse}
            disabled={synapseStarting}
            style={{
              padding: "3px 10px",
              borderRadius: 5,
              border: "1px solid var(--color-border)",
              background: "var(--color-surface)",
              color: "var(--color-text-secondary)",
              fontSize: 11,
              fontFamily: "inherit",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            {synapseStarting ? <Loader2 size={11} style={{ animation: "spin 0.8s linear infinite" }} /> : null}
            Start Synapse
          </button>
        </div>
      )}

      {error && (
        <div
          style={{
            padding: "8px 16px",
            background: "rgba(239,68,68,0.08)",
            color: "var(--color-red, #ef4444)",
            fontSize: 12,
            borderBottom: "1px solid var(--color-border)",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <AlertTriangle size={13} /> {error}
        </div>
      )}

      {/* Search bar */}
      <div
        style={{
          padding: "8px 16px",
          borderBottom: "1px solid var(--color-border)",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <Search size={14} style={{ color: "var(--color-text-tertiary)", flexShrink: 0 }} />
        <input
          placeholder="Search notes…"
          value={localSearch}
          onChange={(e) => setLocalSearch(e.target.value)}
          style={{
            flex: 1,
            border: "none",
            background: "transparent",
            outline: "none",
            fontSize: 13,
            color: "var(--color-text-primary)",
            fontFamily: "inherit",
          }}
        />
        {localSearch && (
          <button
            onClick={() => setLocalSearch("")}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--color-text-tertiary)",
              padding: 2,
              display: "flex",
            }}
          >
            <X size={14} />
          </button>
        )}
      </div>

      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* ── Left panel: note list ── */}
        <div
          style={{
            width: 260,
            minWidth: 260,
            borderRight: "1px solid var(--color-border)",
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
          }}
        >
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
                <div
                  style={{
                    padding: "6px 12px 4px",
                    fontSize: 10,
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    color: "var(--color-text-tertiary)",
                  }}
                >
                  {group.folder}
                </div>
              )}
              {group.items.map((note) => {
                const isSelected = selectedNote?.path === note.path;
                return (
                  <div
                    key={note.path}
                    onClick={() => handleSelectNote(note)}
                    style={{
                      padding: "7px 12px 7px",
                      cursor: "pointer",
                      borderBottom: "1px solid var(--color-border)",
                      background: isSelected ? "var(--color-accent-subtle)" : "transparent",
                      borderLeft: `3px solid ${isSelected ? "var(--color-accent)" : "transparent"}`,
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.03)";
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) (e.currentTarget as HTMLElement).style.background = "transparent";
                    }}
                  >
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: isSelected ? 600 : 400,
                        color: isSelected ? "var(--color-accent-light)" : "var(--color-text-primary)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {note.title}
                    </div>
                    {"snippet" in note && note.snippet && (
                      <div
                        style={{
                          fontSize: 11,
                          color: "var(--color-text-tertiary)",
                          marginTop: 2,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          fontStyle: "italic",
                        }}
                      >
                        {note.snippet}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}

          {/* New note button */}
          {synapseRunning && (
            <div style={{ padding: "8px 12px", borderTop: "1px solid var(--color-border)" }}>
              {newNoteOpen ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <input
                    placeholder="Note title…"
                    value={newNoteTitle}
                    onChange={(e) => setNewNoteTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleCreateNote();
                      if (e.key === "Escape") { setNewNoteOpen(false); setNewNoteTitle(""); }
                    }}
                    autoFocus
                    style={{
                      padding: "6px 10px",
                      borderRadius: 6,
                      border: "1px solid var(--color-border)",
                      background: "var(--color-surface)",
                      color: "var(--color-text-primary)",
                      fontSize: 12,
                      fontFamily: "inherit",
                      outline: "none",
                    }}
                  />
                  <div style={{ display: "flex", gap: 4 }}>
                    <button
                      onClick={handleCreateNote}
                      disabled={newNoteCreating || !newNoteTitle.trim()}
                      style={{
                        flex: 1,
                        padding: "5px 10px",
                        borderRadius: 5,
                        border: "none",
                        background: "var(--color-accent)",
                        color: "#fff",
                        fontSize: 11,
                        fontFamily: "inherit",
                        cursor: newNoteCreating || !newNoteTitle.trim() ? "default" : "pointer",
                        opacity: newNoteCreating || !newNoteTitle.trim() ? 0.6 : 1,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 4,
                      }}
                    >
                      {newNoteCreating ? <Loader2 size={11} style={{ animation: "spin 0.8s linear infinite" }} /> : null}
                      Create
                    </button>
                    <button
                      onClick={() => { setNewNoteOpen(false); setNewNoteTitle(""); }}
                      style={{
                        padding: "5px 10px",
                        borderRadius: 5,
                        border: "1px solid var(--color-border)",
                        background: "transparent",
                        color: "var(--color-text-tertiary)",
                        fontSize: 11,
                        fontFamily: "inherit",
                        cursor: "pointer",
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setNewNoteOpen(true)}
                  style={{
                    width: "100%",
                    padding: "6px 10px",
                    borderRadius: 6,
                    border: "1px dashed var(--color-border)",
                    background: "transparent",
                    color: "var(--color-text-tertiary)",
                    fontSize: 12,
                    fontFamily: "inherit",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.03)"; (e.currentTarget as HTMLElement).style.color = "var(--color-text-secondary)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.color = "var(--color-text-tertiary)"; }}
                >
                  <Plus size={13} />
                  New note
                </button>
              )}
            </div>
          )}
        </div>

        {/* ── Right panel: note preview / edit ── */}
        <div style={{ flex: 1, overflow: "auto", display: "flex", flexDirection: "column" }}>
          {noteLoading && !selectedNote && (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--color-text-tertiary)", fontSize: 13 }}>
              Loading…
            </div>
          )}

          {selectedNote ? (
            <>
              {/* Note header bar */}
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  padding: "16px 20px 0",
                  gap: 12,
                }}
              >
                <div>
                  <h2
                    style={{
                      fontSize: 16,
                      fontWeight: 700,
                      color: "var(--color-text-primary)",
                      margin: 0,
                      letterSpacing: "-0.01em",
                    }}
                  >
                    {selectedNote.title}
                  </h2>
                  {editDirty && (
                    <div style={{ fontSize: 11, color: "rgb(234,179,8)", marginTop: 2 }}>
                      Unsaved changes
                    </div>
                  )}
                  {editSaved && (
                    <div style={{ fontSize: 11, color: "rgb(34,197,94)", marginTop: 2, display: "flex", alignItems: "center", gap: 3 }}>
                      <Check size={11} /> Saved
                    </div>
                  )}
                  {noteError && (
                    <div style={{ fontSize: 11, color: "var(--color-red, #ef4444)", marginTop: 2 }}>
                      {noteError}
                    </div>
                  )}
                </div>

                {/* Action buttons */}
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                  {/* Edit / Preview toggle */}
                  {editMode ? (
                    <>
                      <button
                        onClick={handleSave}
                        disabled={editSaving}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 4,
                          padding: "5px 12px",
                          borderRadius: 6,
                          border: "none",
                          background: "var(--color-accent)",
                          color: "#fff",
                          fontSize: 11,
                          fontFamily: "inherit",
                          cursor: editSaving ? "default" : "pointer",
                          opacity: editSaving ? 0.6 : 1,
                        }}
                      >
                        {editSaving ? <Loader2 size={12} style={{ animation: "spin 0.8s linear infinite" }} /> : <Save size={12} />}
                        Save
                      </button>
                      <button
                        onClick={handleCancelEdit}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 4,
                          padding: "5px 10px",
                          borderRadius: 6,
                          border: "1px solid var(--color-border)",
                          background: "transparent",
                          color: "var(--color-text-tertiary)",
                          fontSize: 11,
                          fontFamily: "inherit",
                          cursor: "pointer",
                        }}
                      >
                        <X size={12} />
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      {synapseRunning && (
                        <button
                          onClick={handleEdit}
                          title="Edit note"
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 4,
                            padding: "5px 10px",
                            borderRadius: 6,
                            border: "1px solid var(--color-border)",
                            background: "transparent",
                            color: "var(--color-text-secondary)",
                            fontSize: 11,
                            fontFamily: "inherit",
                            cursor: "pointer",
                          }}
                        >
                          <Edit3 size={12} />
                          Edit
                        </button>
                      )}
                      {/* Raw / Rendered toggle */}
                      <div
                        style={{
                          display: "flex",
                          borderRadius: 6,
                          border: "1px solid var(--color-border)",
                          overflow: "hidden",
                        }}
                      >
                        <button
                          onClick={() => setRawView(false)}
                          title="Rendered view"
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 4,
                            padding: "4px 10px",
                            border: "none",
                            background: !rawView ? "var(--color-accent)" : "transparent",
                            color: !rawView ? "#fff" : "var(--color-text-tertiary)",
                            fontSize: 11,
                            fontFamily: "inherit",
                            cursor: "pointer",
                          }}
                        >
                          <FileText size={12} /> Preview
                        </button>
                        <button
                          onClick={() => setRawView(true)}
                          title="Raw markdown"
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 4,
                            padding: "4px 10px",
                            border: "none",
                            background: rawView ? "var(--color-accent)" : "transparent",
                            color: rawView ? "#fff" : "var(--color-text-tertiary)",
                            fontSize: 11,
                            fontFamily: "inherit",
                            cursor: "pointer",
                          }}
                        >
                          <Code2 size={12} /> Raw
                        </button>
                      </div>
                      <button
                        onClick={() => handleOpenNote(selectedNote.path)}
                        title="Open in editor"
                        style={{
                          padding: "5px 10px",
                          background: "transparent",
                          border: "1px solid var(--color-border)",
                          borderRadius: 6,
                          cursor: "pointer",
                          fontSize: 11,
                          color: "var(--color-text-secondary)",
                          fontFamily: "inherit",
                          display: "flex",
                          alignItems: "center",
                          gap: 4,
                        }}
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
                          style={{
                            padding: "5px 10px",
                            background: deleteConfirm === selectedNote.path
                              ? "rgba(239,68,68,0.15)"
                              : "transparent",
                            border: deleteConfirm === selectedNote.path
                              ? "1px solid #ef4444"
                              : "1px solid var(--color-border)",
                            borderRadius: 6,
                            cursor: "pointer",
                            fontSize: 11,
                            color: deleteConfirm === selectedNote.path
                              ? "#ef4444"
                              : "var(--color-text-tertiary)",
                            fontFamily: "inherit",
                            display: "flex",
                            alignItems: "center",
                            gap: 4,
                          }}
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
              <div
                style={{
                  fontSize: 11,
                  color: "var(--color-text-tertiary)",
                  padding: "2px 20px 8px",
                  opacity: 0.7,
                }}
              >
                {selectedNote.path.startsWith(vaultPath)
                  ? selectedNote.path.slice(vaultPath.length).replace(/^\//, "")
                  : selectedNote.path}
              </div>

              {/* Content area */}
              <div style={{ flex: 1, padding: "0 20px 20px", overflow: "auto" }}>
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
                      style={{
                        width: "100%",
                        minHeight: 400,
                        padding: 16,
                        borderRadius: 8,
                        border: "1px solid var(--color-border)",
                        background: "var(--color-surface)",
                        color: "var(--color-text-primary)",
                        fontSize: 13,
                        fontFamily: "'SF Mono', Menlo, Monaco, monospace",
                        lineHeight: 1.6,
                        resize: "vertical",
                        outline: "none",
                        boxSizing: "border-box",
                      }}
                    />
                    {/* Inline save error */}
                    {noteError && (
                      <div
                        style={{
                          marginTop: 8,
                          padding: "6px 12px",
                          borderRadius: 6,
                          background: "rgba(239,68,68,0.08)",
                          color: "var(--color-red, #ef4444)",
                          fontSize: 12,
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        <AlertTriangle size={12} /> {noteError}
                        <button
                          onClick={() => setNoteError(null)}
                          style={{
                            marginLeft: "auto",
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            color: "var(--color-red, #ef4444)",
                            padding: 2,
                          }}
                        >
                          <X size={12} />
                        </button>
                      </div>
                    )}
                  </>
                ) : rawView ? (
                  <pre
                    style={{
                      fontSize: 12,
                      lineHeight: 1.6,
                      color: "var(--color-text-secondary)",
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                      fontFamily: "'SF Mono', Menlo, Monaco, monospace",
                      margin: 0,
                      background: "var(--color-surface)",
                      padding: 16,
                      borderRadius: 8,
                      border: "1px solid var(--color-border)",
                    }}
                  >
                    {selectedNote.body}
                  </pre>
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
                  <div style={{ marginTop: 32 }}>
                    <div
                      onClick={() => setBacklinksOpen(!backlinksOpen)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        cursor: "pointer",
                        padding: "6px 0",
                        borderTop: "1px solid var(--color-border)",
                        fontSize: 12,
                        fontWeight: 600,
                        color: "var(--color-text-secondary)",
                        userSelect: "none",
                      }}
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
                      <div style={{ padding: "4px 0 4px 20px" }}>
                        {backlinks.backlinks.length === 0 && backlinks.forward_links.length === 0 && (
                          <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", fontStyle: "italic" }}>
                            No backlinks
                          </div>
                        )}

                        {backlinks.backlinks.length > 0 && (
                          <div style={{ marginBottom: 8 }}>
                            <div
                              style={{
                                fontSize: 10,
                                fontWeight: 600,
                                textTransform: "uppercase",
                                letterSpacing: "0.05em",
                                color: "var(--color-text-tertiary)",
                                marginBottom: 4,
                              }}
                            >
                              Linked from
                            </div>
                            {backlinks.backlinks.map((bl) => (
                              <div
                                key={bl.path}
                                onClick={() => handleBacklinkClick(bl.path)}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 6,
                                  padding: "3px 0",
                                  cursor: "pointer",
                                  fontSize: 12,
                                  color: "var(--color-accent-light)",
                                }}
                              >
                                <span style={{ color: "var(--color-text-tertiary)" }}>←</span>
                                {bl.title || bl.path.split("/").pop()?.replace(/\.md$/i, "")}
                              </div>
                            ))}
                          </div>
                        )}

                        {backlinks.forward_links.length > 0 && (
                          <div>
                            <div
                              style={{
                                fontSize: 10,
                                fontWeight: 600,
                                textTransform: "uppercase",
                                letterSpacing: "0.05em",
                                color: "var(--color-text-tertiary)",
                                marginBottom: 4,
                              }}
                            >
                              Forward links
                            </div>
                            {backlinks.forward_links.map((fl) => (
                              <div
                                key={fl.path}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 6,
                                  padding: "3px 0",
                                  fontSize: 12,
                                }}
                              >
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
            <div
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--color-text-tertiary)",
                fontSize: 13,
              }}
            >
              Select a note to preview
            </div>
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
    <div
      style={{
        background: "var(--color-bg-elevated)",
        borderBottom: "1px solid var(--color-border)",
        height: 62,
        display: "flex",
        alignItems: "center",
        padding: "0 20px",
        gap: 10,
        flexShrink: 0,
      }}
    >
      <span
        style={{
          fontSize: 16,
          fontWeight: 600,
          color: "var(--color-text-primary)",
          letterSpacing: "-0.01em",
          flex: 1,
        }}
      >
        Vault
      </span>

      {/* Synapse health indicator */}
      {vaultPath && (
        <div
          title={
            synapseStatus.running
              ? `Synapse active · ${healthLabel ?? ""}`
              : "Synapse not running — using legacy vault tools"
          }
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            padding: "2px 8px",
            borderRadius: 10,
            fontSize: 10,
            background: synapseStatus.running
              ? "rgba(34,197,94,0.1)"
              : "rgba(234,179,8,0.1)",
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: synapseStatus.running ? "rgb(34,197,94)" : "rgb(234,179,8)",
            }}
          />
          {synapseStatus.running
            ? `Synapse (${noteCount} notes${healthLabel ? ` · ${healthLabel}` : ""})`
            : "Legacy"}
        </div>
      )}

      {vaultPath && (
        <span
          style={{
            fontSize: 11,
            color: "var(--color-text-tertiary)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            maxWidth: 320,
            direction: "rtl",
            textAlign: "left",
          }}
        >
          {vaultPath}
        </span>
      )}
      {onRefresh && (
        <button
          onClick={onRefresh}
          disabled={loading}
          title="Refresh vault"
          style={{
            background: "none",
            border: "none",
            cursor: loading ? "default" : "pointer",
            color: "var(--color-text-tertiary)",
            display: "flex",
            padding: 4,
            opacity: loading ? 0.4 : 1,
            borderRadius: 5,
          }}
        >
          <RefreshCw size={14} style={{ animation: loading ? "spin 0.8s linear infinite" : "none" }} />
        </button>
      )}
    </div>
  );
}
