import { useEffect, useState, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useProjectStore } from "../stores/projectStore";
import { useChatStore } from "../stores/chatStore";
import type { MathProject, SessionHeader } from "../lib/types";
import { Trash2, RotateCcw } from "lucide-react";

// ─── Relative time ────────────────────────────────

function relativeTime(isoDate: string): string {
  try {
    const date = new Date(isoDate);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    if (diffMins < 2) return "Just now";
    if (diffHours < 1) return `${diffMins}m ago`;
    if (diffDays < 1) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

// ─── Project overflow menu ────────────────────────

function ProjectMenu({
  onArchive,
  onDelete,
  onClose,
}: {
  onArchive: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  return (
    <div
      ref={ref}
      style={{
        position: "absolute",
        top: "calc(100% + 2px)",
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
      <button
        onClick={(e) => { e.stopPropagation(); onArchive(); onClose(); }}
        style={menuItemStyle}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--color-hover)"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
      >
        Archive project
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(); onClose(); }}
        style={{ ...menuItemStyle, color: "var(--color-red)" }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(224,82,82,0.08)"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
      >
        Delete project…
      </button>
    </div>
  );
}

const menuItemStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  padding: "9px 14px",
  background: "transparent",
  border: "none",
  cursor: "pointer",
  fontSize: 12,
  color: "var(--color-text-secondary)",
  fontFamily: "inherit",
  textAlign: "left",
  transition: "background 0.1s",
};

// ─── Session row ─────────────────────────────────

function SessionRow({
  session,
  isActive,
  isArchived,
  onSelect,
  onArchive,
  onDelete,
}: {
  session: SessionHeader;
  isActive: boolean;
  isArchived: boolean;
  onSelect: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onClick={onSelect}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        alignItems: "center",
        margin: "1px 8px",
        borderRadius: 6,
        padding: "7px 12px 7px 10px",
        gap: 8,
        cursor: "pointer",
        background: isActive ? "var(--color-accent-selected)" : hovered ? "var(--color-hover)" : "transparent",
        borderLeft: isActive ? "2px solid var(--color-accent-light)" : "2px solid transparent",
        transition: "background 0.1s",
      }}
    >
      {/* Session icon */}
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0, opacity: isActive ? 0.8 : 0.4 }}>
        <path d="M1 2.5h10M1 5.5h7M1 8.5h8.5" stroke={isActive ? "var(--color-accent-light)" : "var(--color-text-secondary)"} strokeWidth="1.2" strokeLinecap="round"/>
      </svg>

      {/* Text */}
      <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column", gap: 1 }}>
        <span
          style={{
            fontSize: 13,
            fontWeight: isActive ? 500 : 400,
            color: isActive ? "var(--color-accent-light)" : isArchived ? "var(--color-text-tertiary)" : "var(--color-text-primary)",
            fontStyle: isArchived ? "italic" : "normal",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {session.title || "Untitled"}
        </span>
        <span
          style={{
            fontSize: 11,
            color: "var(--color-text-tertiary)",
          }}
        >
          {relativeTime(session.updated_at)}
        </span>
      </div>

      {/* Hover actions */}
      {hovered && !isArchived && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          title="Delete session"
          style={iconBtnStyle}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--color-red)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--color-text-tertiary)"; }}
        >
          <Trash2 size={11} />
        </button>
      )}
      {hovered && isArchived && (
        <div style={{ display: "flex", gap: 2 }}>
          <button
            onClick={(e) => { e.stopPropagation(); onArchive(); }}
            title="Restore session"
            style={iconBtnStyle}
          >
            <RotateCcw size={11} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            title="Delete permanently"
            style={{ ...iconBtnStyle, color: "var(--color-red)" }}
          >
            <Trash2 size={11} />
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Project section ─────────────────────────────

function ProjectSection({
  project,
  sessions,
  archivedSessions,
  currentSessionId,
  isExpanded,
  onToggle,
  onNewSession,
  onOpenSession,
  onArchiveProject,
  onDeleteProject,
  onArchiveSession,
  onDeleteSession,
  onUnarchiveSession,
  onPurgeSession,
}: {
  project: MathProject;
  sessions: SessionHeader[];
  archivedSessions: SessionHeader[];
  currentSessionId: string | null;
  isExpanded: boolean;
  onToggle: () => void;
  onNewSession: () => void;
  onOpenSession: (id: string) => void;
  onArchiveProject: () => void;
  onDeleteProject: () => void;
  onArchiveSession: (id: string) => void;
  onDeleteSession: (id: string) => void;
  onUnarchiveSession: (id: string) => void;
  onPurgeSession: (id: string) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showArchivedSessions, setShowArchivedSessions] = useState(false);

  return (
    <div style={{ marginBottom: 2 }}>
      {/* Project header row */}
      <div
        onClick={onToggle}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          display: "flex",
          alignItems: "center",
          padding: "6px 16px 6px 12px",
          gap: 6,
          cursor: "pointer",
          position: "relative",
        }}
      >
        {/* Chevron */}
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ flexShrink: 0, transition: "transform 0.15s" }}>
          {isExpanded
            ? <path d="M2 3.5L5 6.5L8 3.5" stroke="var(--color-text-tertiary)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
            : <path d="M3.5 2L6.5 5L3.5 8" stroke="var(--color-text-tertiary)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
          }
        </svg>

        {/* Project name */}
        <span
          style={{
            flex: 1,
            fontSize: 12,
            fontWeight: 600,
            color: "var(--color-text-primary)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            letterSpacing: "0.03em",
            textTransform: "uppercase",
          }}
        >
          {project.name}
        </span>

        {/* New session button */}
        <button
          onClick={(e) => { e.stopPropagation(); onNewSession(); }}
          title={`New session in ${project.name}`}
          style={{
            ...iconBtnStyle,
            opacity: hovered || menuOpen ? 1 : 0,
            transition: "opacity 0.1s",
            background: hovered ? "var(--color-accent-subtle)" : "transparent",
            color: "var(--color-accent-light)",
            width: 20,
            height: 20,
            borderRadius: 5,
          }}
        >
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
            <path d="M5.5 1v9M1 5.5h9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
        </button>

        {/* ⋯ menu button */}
        <button
          onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v); }}
          title="Project options"
          style={{
            ...iconBtnStyle,
            opacity: hovered || menuOpen ? 1 : 0,
            transition: "opacity 0.1s",
          }}
        >
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <circle cx="6.5" cy="2.5" r="1" fill="var(--color-text-secondary)"/>
            <circle cx="6.5" cy="6.5" r="1" fill="var(--color-text-secondary)"/>
            <circle cx="6.5" cy="10.5" r="1" fill="var(--color-text-secondary)"/>
          </svg>
        </button>

        {/* Dropdown menu */}
        {menuOpen && (
          <ProjectMenu
            onArchive={onArchiveProject}
            onDelete={onDeleteProject}
            onClose={() => setMenuOpen(false)}
          />
        )}
      </div>

      {/* Sessions list */}
      {isExpanded && (
        <div>
          {sessions.map((s) => (
            <SessionRow
              key={s.id}
              session={s}
              isActive={s.id === currentSessionId}
              isArchived={false}
              onSelect={() => onOpenSession(s.id)}
              onArchive={() => onArchiveSession(s.id)}
              onDelete={() => onDeleteSession(s.id)}
            />
          ))}

          {/* Archived sessions */}
          {archivedSessions.length > 0 && (
            <div>
              <div
                onClick={() => setShowArchivedSessions((v) => !v)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "4px 12px 4px 22px",
                  cursor: "pointer",
                  fontSize: 11,
                  color: "var(--color-text-tertiary)",
                }}
              >
                <span style={{ fontSize: 8 }}>{showArchivedSessions ? "▼" : "▶"}</span>
                Archived ({archivedSessions.length})
              </div>
              {showArchivedSessions &&
                archivedSessions.map((s) => (
                  <SessionRow
                    key={s.id}
                    session={s}
                    isActive={false}
                    isArchived={true}
                    onSelect={() => onUnarchiveSession(s.id)}
                    onArchive={() => onUnarchiveSession(s.id)}
                    onDelete={() => onPurgeSession(s.id)}
                  />
                ))}
            </div>
          )}


        </div>
      )}
    </div>
  );
}

// ─── New project inline form ─────────────────────

function NewProjectForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (name: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    await onSubmit(name.trim());
    setLoading(false);
  };

  return (
    <form onSubmit={handleSubmit} style={{ padding: "8px 12px" }}>
      <input
        ref={inputRef}
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Project name"
        onKeyDown={(e) => e.key === "Escape" && onCancel()}
        style={{
          width: "100%",
          padding: "7px 10px",
          border: "1px solid var(--color-accent-light)",
          borderRadius: 7,
          background: "var(--color-surface)",
          color: "var(--color-text-primary)",
          fontSize: 13,
          fontFamily: "inherit",
          outline: "none",
          boxSizing: "border-box",
          marginBottom: 6,
        }}
      />
      <div style={{ display: "flex", gap: 6 }}>
        <button
          type="submit"
          disabled={!name.trim() || loading}
          style={{
            flex: 1,
            padding: "6px 0",
            background: name.trim() ? "var(--color-accent)" : "var(--color-surface)",
            color: name.trim() ? "#fff" : "var(--color-text-tertiary)",
            border: "none",
            borderRadius: 6,
            cursor: name.trim() ? "pointer" : "default",
            fontSize: 12,
            fontWeight: 600,
            fontFamily: "inherit",
          }}
        >
          {loading ? "…" : "Create"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          style={{
            padding: "6px 10px",
            background: "var(--color-surface)",
            color: "var(--color-text-secondary)",
            border: "none",
            borderRadius: 6,
            cursor: "pointer",
            fontSize: 12,
            fontFamily: "inherit",
          }}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

// ─── Archived project row ─────────────────────────

function ArchivedProjectRow({
  project,
  onRestore,
  onDelete,
}: {
  project: MathProject;
  onRestore: () => void;
  onDelete: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "6px 16px 6px 12px",
        fontSize: 12,
        color: "var(--color-text-tertiary)",
        fontStyle: "italic",
      }}
    >
      <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {project.name}
      </span>
      {hovered && (
        <div style={{ display: "flex", gap: 4 }}>
          <button onClick={onRestore} title="Restore" style={iconBtnStyle}><RotateCcw size={11} /></button>
          <button onClick={onDelete} title="Delete" style={{ ...iconBtnStyle, color: "var(--color-red)" }}><Trash2 size={11} /></button>
        </div>
      )}
    </div>
  );
}

// ─── Main Sidebar ─────────────────────────────────

export default function Sidebar() {
  const navigate = useNavigate();

  const projects = useProjectStore((s) => s.projects);
  const archivedProjects = useProjectStore((s) => s.archivedProjects);
  const loadProjects = useProjectStore((s) => s.loadProjects);
  const loadArchivedProjects = useProjectStore((s) => s.loadArchivedProjects);
  const currentProject = useProjectStore((s) => s.currentProject);
  const setCurrentProject = useProjectStore((s) => s.setCurrentProject);
  const createProject = useProjectStore((s) => s.createProject);
  const archiveProject = useProjectStore((s) => s.archiveProject);
  const unarchiveProject = useProjectStore((s) => s.unarchiveProject);
  const deleteProjectCascade = useProjectStore((s) => s.deleteProjectCascade);

  const sessionList = useChatStore((s) => s.sessionList);
  const archivedSessionList = useChatStore((s) => s.archivedSessionList);
  const currentSession = useChatStore((s) => s.currentSession);
  const openSession = useChatStore((s) => s.openSession);
  const newSession = useChatStore((s) => s.newSession);
  const archiveSession = useChatStore((s) => s.archiveSession);
  const unarchiveSession = useChatStore((s) => s.unarchiveSession);
  const deleteSession = useChatStore((s) => s.deleteSession);
  const purgeSession = useChatStore((s) => s.purgeSession);
  const loadSessions = useChatStore((s) => s.loadSessions);
  const loadArchivedSessions = useChatStore((s) => s.loadArchivedSessions);

  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
  const [showArchivedProjects, setShowArchivedProjects] = useState(false);
  const [showNewProjectForm, setShowNewProjectForm] = useState(false);

  useEffect(() => {
    loadProjects();
    loadArchivedProjects();
    loadSessions();
    loadArchivedSessions();
  }, []);

  useEffect(() => {
    const pid = currentSession?.header.project_id;
    if (pid) {
      setExpandedProjects((prev) => {
        if (prev.has(pid)) return prev;
        return new Set([...prev, pid]);
      });
    }
  }, [currentSession?.header.project_id]);

  useEffect(() => {
    if (projects.length > 0 && expandedProjects.size === 0) {
      setExpandedProjects(new Set([projects[0].id]));
    }
  }, [projects]);

  const toggleProject = (id: string) => {
    // Also set this project as current so new sessions land in it
    const project = projects.find((p) => p.id === id);
    if (project) setCurrentProject(project);
    setExpandedProjects((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleNewSession = (projectId: string) => {
    newSession(projectId);
    navigate("/chat");
  };

  const handleOpenSession = (sessionId: string) => {
    openSession(sessionId);
    navigate("/chat");
  };

  const handleDeleteProject = (id: string) => {
    if (confirm("Delete this project and all its sessions permanently? This cannot be undone.")) {
      deleteProjectCascade(id);
    }
  };

  const handleDeleteSession = (id: string) => {
    if (confirm("Delete this session permanently? This cannot be undone.")) {
      deleteSession(id);
    }
  };

  const handlePurgeSession = (id: string) => {
    if (confirm("Permanently delete this session from archive? This cannot be undone.")) {
      purgeSession(id);
    }
  };

  const handleCreateProject = async (name: string) => {
    await createProject({ name });
    setShowNewProjectForm(false);
  };

  const location = useLocation();
  const isSessionManagerActive = location.pathname === "/sessions";

  return (
    <div style={sidebarStyle}>
      {/* Header */}
      <div style={headerStyle}>
        <span style={titleStyle}>MathMate</span>
  
      </div>

      <div style={{ height: 1, background: "var(--color-border)", flexShrink: 0 }} />

      {/* Scrollable content */}
      <div style={{ flex: 1, overflow: "auto", padding: "8px 0", display: "flex", flexDirection: "column" }}>

        {projects.map((project) => {
          const sessions = sessionList.filter((s) => s.project_id === project.id);
          const archived = archivedSessionList.filter((s) => s.project_id === project.id);
          return (
            <ProjectSection
              key={project.id}
              project={project}
              sessions={sessions}
              archivedSessions={archived}
              currentSessionId={currentSession?.header.id ?? null}
              isExpanded={expandedProjects.has(project.id)}
              onToggle={() => toggleProject(project.id)}
              onNewSession={() => handleNewSession(project.id)}
              onOpenSession={handleOpenSession}
              onArchiveProject={() => archiveProject(project.id)}
              onDeleteProject={() => handleDeleteProject(project.id)}
              onArchiveSession={(id) => archiveSession(id)}
              onDeleteSession={handleDeleteSession}
              onUnarchiveSession={(id) => unarchiveSession(id)}
              onPurgeSession={handlePurgeSession}
            />
          );
        })}

        {/* Archived projects */}
        {archivedProjects.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <div style={{ height: 1, background: "var(--color-border)", margin: "4px 12px 6px" }} />
            <div
              onClick={() => setShowArchivedProjects((v) => !v)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                padding: "4px 12px",
                cursor: "pointer",
                fontSize: 10,
                fontWeight: 600,
                color: "var(--color-text-tertiary)",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}
            >
              <span style={{ fontSize: 7 }}>{showArchivedProjects ? "▼" : "▶"}</span>
              Archived ({archivedProjects.length})
            </div>
            {showArchivedProjects &&
              archivedProjects.map((project) => (
                <ArchivedProjectRow
                  key={project.id}
                  project={project}
                  onRestore={() => unarchiveProject(project.id)}
                  onDelete={() => {
                    if (confirm("Permanently delete this archived project and all its sessions?")) {
                      deleteProjectCascade(project.id);
                    }
                  }}
                />
              ))}
          </div>
        )}

        <div style={{ flex: 1 }} />

        {/* New project */}
        {showNewProjectForm ? (
          <NewProjectForm
            onSubmit={handleCreateProject}
            onCancel={() => setShowNewProjectForm(false)}
          />
        ) : (
          <div
            style={newProjectBtnStyle}
            onClick={() => setShowNewProjectForm(true)}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            <span style={{ fontSize: 13, fontWeight: 500, fontFamily: "inherit" }}>New Project</span>
          </div>
        )}
      </div>

      <div style={{ padding: "8px 12px 12px", flexShrink: 0 }}>
        <div style={{ height: 1, background: "var(--color-border)", marginBottom: 10 }} />
        <button
          onClick={() => navigate("/sessions")}
          style={{
            ...settingsBtnStyle,
            background: isSessionManagerActive ? "var(--color-accent-selected)" : "transparent",
            color: isSessionManagerActive ? "var(--color-accent-light)" : "var(--color-text-secondary)",
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--color-hover)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = isSessionManagerActive ? "var(--color-accent-selected)" : "transparent"; }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <rect x="1" y="1" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2"/>
            <rect x="8" y="1" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2"/>
            <rect x="1" y="8" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2"/>
            <rect x="8" y="8" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2"/>
          </svg>
          Session Manager
        </button>
        <button
          onClick={() => navigate("/settings")}
          style={settingsBtnStyle}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--color-hover)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <circle cx="7" cy="7" r="2.5" stroke="currentColor" strokeWidth="1.2"/>
            <path d="M7 1v1.5M7 11.5V13M1 7h1.5M11.5 7H13M2.9 2.9l1.06 1.06M10.04 10.04l1.06 1.06M2.9 11.1l1.06-1.06M10.04 3.96l1.06-1.06" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
          </svg>
          Settings
        </button>
      </div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────

const sidebarStyle: React.CSSProperties = {
  width: 240,
  minWidth: 240,
  background: "var(--color-bg-elevated)",
  borderRight: "1px solid var(--color-border)",
  display: "flex",
  flexDirection: "column",
  height: "100vh",
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  padding: "20px 16px 12px",
  flexShrink: 0,
};

const titleStyle: React.CSSProperties = {
  flex: 1,
  fontSize: 15,
  fontWeight: 700,
  color: "var(--color-text-primary)",
  letterSpacing: "-0.02em",
};

const newProjectBtnStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  margin: "12px 12px 0",
  borderRadius: 8,
  padding: "9px 12px",
  background: "var(--color-accent)",
  color: "#ffffff",
  cursor: "pointer",
  userSelect: "none",
};

const settingsBtnStyle: React.CSSProperties = {
  width: "100%",
  padding: "7px 10px",
  background: "transparent",
  color: "var(--color-text-secondary)",
  border: "none",
  borderRadius: 7,
  fontSize: 12,
  cursor: "pointer",
  textAlign: "left",
  fontFamily: "inherit",
  display: "flex",
  alignItems: "center",
  gap: 8,
  transition: "background 0.1s",
};

const iconBtnStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  cursor: "pointer",
  color: "var(--color-text-tertiary)",
  padding: "2px 3px",
  borderRadius: 4,
  lineHeight: 1,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
};
