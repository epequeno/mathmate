import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import type { SessionHeader, MathProject } from "../lib/types";
import { useChatStore } from "../stores/chatStore";
import { useProjectStore } from "../stores/projectStore";
import SessionTable from "../components/SessionManager/SessionTable";
import SessionDetailPanel from "../components/SessionManager/SessionDetailPanel";
import BulkActionBar from "../components/SessionManager/BulkActionBar";
import { Search } from "lucide-react";

type FilterMode = "all" | "active" | "archived";

export default function SessionManagerPage() {
  const navigate = useNavigate();

  // Store data
  const storeSessions = useChatStore((s) => s.sessionList);
  const storeArchivedSessions = useChatStore((s) => s.archivedSessionList);
  const projects = useProjectStore((s) => s.projects);
  const loadSessions = useChatStore((s) => s.loadSessions);
  const loadArchivedSessions = useChatStore((s) => s.loadArchivedSessions);
  const storeOpenSession = useChatStore((s) => s.openSession);
  const storeArchiveSession = useChatStore((s) => s.archiveSession);
  const storeUnarchiveSession = useChatStore((s) => s.unarchiveSession);
  const storeDeleteSession = useChatStore((s) => s.deleteSession);
  const storePurgeSession = useChatStore((s) => s.purgeSession);
  const storeRenameSession = useChatStore((s) => s.renameSession);

  // Local state
  const [filter, setFilter] = useState<FilterMode>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  // Load data on mount
  useEffect(() => {
    Promise.all([
      loadSessions(),
      loadArchivedSessions(),
    ]).then(() => setLoading(false));
  }, []);

  // Derive the selected session header from list
  const selectedSession = useMemo(() => {
    if (!selectedSessionId) return null;
    return (
      storeSessions.find((s) => s.id === selectedSessionId) ??
      storeArchivedSessions.find((s) => s.id === selectedSessionId) ??
      null
    );
  }, [selectedSessionId, storeSessions, storeArchivedSessions]);

  const isSelectedArchived = useMemo(() => {
    if (!selectedSessionId) return false;
    return storeArchivedSessions.some((s) => s.id === selectedSessionId);
  }, [selectedSessionId, storeArchivedSessions]);

  // Filter + search
  const filteredSessions = useMemo(() => {
    let list = storeSessions;
    if (filter === "archived") {
      list = [];
    }
    return applyFilterAndSearch(list, searchQuery, projects);
  }, [storeSessions, filter, searchQuery, projects]);

  const filteredArchived = useMemo(() => {
    let list = storeArchivedSessions;
    if (filter === "active") {
      list = [];
    }
    return applyFilterAndSearch(list, searchQuery, projects);
  }, [storeArchivedSessions, filter, searchQuery, projects]);

  // Selection
  const handleSelectSession = useCallback((id: string) => {
    setSelectedSessionId((prev) => (prev === id ? null : id));
  }, []);

  // Checkbox
  const handleCheckSession = useCallback((id: string, checked: boolean) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  // Clear checks when filter changes
  useEffect(() => {
    setCheckedIds(new Set());
  }, [filter]);

  // Open in chat
  const handleOpenInChat = useCallback((sessionId: string) => {
    storeOpenSession(sessionId);
    navigate("/chat");
  }, [storeOpenSession, navigate]);

  // Archive
  const handleArchive = useCallback(
    async (id: string) => {
      await storeArchiveSession(id);
      if (selectedSessionId === id) setSelectedSessionId(null);
    },
    [storeArchiveSession, selectedSessionId]
  );

  // Unarchive
  const handleUnarchive = useCallback(
    async (id: string) => {
      await storeUnarchiveSession(id);
    },
    [storeUnarchiveSession]
  );

  // Delete
  const handleDelete = useCallback(
    async (id: string) => {
      if (!confirm("Delete this session permanently? This cannot be undone.")) return;
      await storeDeleteSession(id);
      if (selectedSessionId === id) setSelectedSessionId(null);
    },
    [storeDeleteSession, selectedSessionId]
  );

  // Purge
  const handlePurge = useCallback(
    async (id: string) => {
      if (!confirm("Permanently delete this archived session? This cannot be undone.")) return;
      await storePurgeSession(id);
      if (selectedSessionId === id) setSelectedSessionId(null);
    },
    [storePurgeSession, selectedSessionId]
  );

  // Rename
  const handleRename = useCallback(
    async (id: string, title: string) => {
      await storeRenameSession(id, title);
    },
    [storeRenameSession]
  );

  // Bulk actions
  const activeCheckedCount = useMemo(
    () => [...checkedIds].filter((id) => storeSessions.some((s) => s.id === id)).length,
    [checkedIds, storeSessions]
  );
  const archivedCheckedCount = useMemo(
    () => [...checkedIds].filter((id) => storeArchivedSessions.some((s) => s.id === id)).length,
    [checkedIds, storeArchivedSessions]
  );

  const handleBulkArchive = useCallback(async () => {
    for (const id of checkedIds) {
      if (storeSessions.some((s) => s.id === id)) {
        await storeArchiveSession(id);
      }
    }
    if (selectedSessionId && checkedIds.has(selectedSessionId)) {
      setSelectedSessionId(null);
    }
    setCheckedIds(new Set());
  }, [checkedIds, storeSessions, storeArchiveSession, selectedSessionId]);

  const handleBulkDelete = useCallback(async () => {
    if (!confirm(`Permanently delete ${activeCheckedCount} session(s)?`)) return;
    for (const id of checkedIds) {
      if (storeSessions.some((s) => s.id === id)) {
        await storeDeleteSession(id);
      }
    }
    if (selectedSessionId && checkedIds.has(selectedSessionId)) {
      setSelectedSessionId(null);
    }
    setCheckedIds(new Set());
  }, [checkedIds, storeSessions, storeDeleteSession, selectedSessionId, activeCheckedCount]);

  const handleBulkPurge = useCallback(async () => {
    if (!confirm(`Permanently purge ${archivedCheckedCount} archived session(s)?`)) return;
    for (const id of checkedIds) {
      if (storeArchivedSessions.some((s) => s.id === id)) {
        await storePurgeSession(id);
      }
    }
    if (selectedSessionId && checkedIds.has(selectedSessionId)) {
      setSelectedSessionId(null);
    }
    setCheckedIds(new Set());
  }, [checkedIds, storeArchivedSessions, storePurgeSession, selectedSessionId, archivedCheckedCount]);

  if (loading) {
    return (
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--color-bg)",
        }}
      >
        <span style={{ fontSize: 13, color: "var(--color-text-tertiary)" }}>
          Loading sessions…
        </span>
      </div>
    );
  }

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        background: "var(--color-bg)",
      }}
    >
      {/* Top bar */}
      <TopBar
        filter={filter}
        onFilterChange={setFilter}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        totalActive={storeSessions.length}
        totalArchived={storeArchivedSessions.length}
      />

      {/* Main area: table + detail panel */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        <SessionTable
          sessions={filteredSessions}
          archivedSessions={filteredArchived}
          projects={projects}
          checkedIds={checkedIds}
          selectedSessionId={selectedSessionId}
          onSelectSession={handleSelectSession}
          onCheckSession={handleCheckSession}
          onOpenInChat={handleOpenInChat}
          onArchive={handleArchive}
          onUnarchive={handleUnarchive}
          onDelete={handleDelete}
          onPurge={handlePurge}
          onRename={handleRename}
        />

        <SessionDetailPanel
          session={selectedSession}
          isArchived={isSelectedArchived}
          onOpenInChat={() => selectedSessionId && handleOpenInChat(selectedSessionId)}
          onRename={(title) => selectedSessionId && handleRename(selectedSessionId, title)}
          onArchive={() => selectedSessionId && handleArchive(selectedSessionId)}
          onUnarchive={() => selectedSessionId && handleUnarchive(selectedSessionId)}
          onDelete={() => selectedSessionId && handleDelete(selectedSessionId)}
          onPurge={() => selectedSessionId && handlePurge(selectedSessionId)}
          onClose={() => setSelectedSessionId(null)}
        />
      </div>

      {/* Bulk action bar */}
      <BulkActionBar
        checkedIds={checkedIds}
        activeCheckedCount={activeCheckedCount}
        archivedCheckedCount={archivedCheckedCount}
        onArchive={handleBulkArchive}
        onDelete={handleBulkDelete}
        onPurge={handleBulkPurge}
      />
    </div>
  );
}

// ─── Top bar ─────────────────────────────────────

function TopBar({
  filter,
  onFilterChange,
  searchQuery,
  onSearchChange,
  totalActive,
  totalArchived,
}: {
  filter: FilterMode;
  onFilterChange: (f: FilterMode) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  totalActive: number;
  totalArchived: number;
}) {
  const filters: { value: FilterMode; label: string; count?: number }[] = [
    { value: "all", label: "All" },
    { value: "active", label: "Active", count: totalActive },
    { value: "archived", label: "Archived", count: totalArchived },
  ];

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 16px",
        borderBottom: "1px solid var(--color-border)",
        background: "var(--color-bg-elevated)",
        flexShrink: 0,
      }}
    >
      <h2
        style={{
          fontSize: 16,
          fontWeight: 700,
          color: "var(--color-text-primary)",
          margin: 0,
          flexShrink: 0,
        }}
      >
        Session Manager
      </h2>

      {/* Filter pills */}
      <div style={{ display: "flex", gap: 4 }}>
        {filters.map((f) => (
          <button
            key={f.value}
            onClick={() => onFilterChange(f.value)}
            style={{
              padding: "4px 10px",
              border: "none",
              borderRadius: 12,
              background:
                filter === f.value
                  ? "var(--color-accent)"
                  : "rgba(255,255,255,0.04)",
              color:
                filter === f.value
                  ? "#ffffff"
                  : "var(--color-text-secondary)",
              cursor: "pointer",
              fontSize: 11,
              fontWeight: 500,
              fontFamily: "inherit",
              whiteSpace: "nowrap",
            }}
          >
            {f.label}
            {f.count !== undefined && (
              <span style={{ marginLeft: 4, opacity: 0.7 }}>({f.count})</span>
            )}
          </button>
        ))}
      </div>

      {/* Search */}
      <div
        style={{
          flex: 1,
          maxWidth: 300,
          position: "relative",
        }}
      >
        <Search
          size={13}
          style={{
            position: "absolute",
            left: 8,
            top: "50%",
            transform: "translateY(-50%)",
            color: "var(--color-text-tertiary)",
            pointerEvents: "none",
          }}
        />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search sessions…"
          style={{
            width: "100%",
            padding: "6px 10px 6px 28px",
            border: "1px solid var(--color-border)",
            borderRadius: 8,
            background: "var(--color-surface)",
            color: "var(--color-text-primary)",
            fontSize: 12,
            fontFamily: "inherit",
            outline: "none",
            boxSizing: "border-box",
          }}
        />
      </div>

      <div style={{ flex: 1 }} />

      <span style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>
        {totalActive + totalArchived} session{(totalActive + totalArchived) !== 1 ? "s" : ""}
      </span>
    </div>
  );
}

// ─── Utilities ───────────────────────────────────

function applyFilterAndSearch(
  sessions: SessionHeader[],
  query: string,
  projects: MathProject[]
): SessionHeader[] {
  if (!query.trim()) return sessions;
  const q = query.toLowerCase().trim();
  return sessions.filter((s) => {
    if (s.title.toLowerCase().includes(q)) return true;
    if (s.model.toLowerCase().includes(q)) return true;
    if (s.provider?.toLowerCase().includes(q)) return true;
    const project = projects.find((p) => p.id === s.project_id);
    if (project?.name.toLowerCase().includes(q)) return true;
    return false;
  });
}
