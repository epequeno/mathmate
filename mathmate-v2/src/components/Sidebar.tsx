import { useEffect, useState, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useProjectStore } from "../stores/projectStore";
import { useChatStore } from "../stores/chatStore";
import type { MathProject, SessionHeader } from "../lib/types";
import { Trash2, RotateCcw } from "lucide-react";
import { cx } from "../lib/clsx";
import styles from "./Sidebar.module.css";


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
    <div ref={ref} className={styles.projectMenu}>
      <button
        className={styles.menuItem}
        onClick={(e) => { e.stopPropagation(); onArchive(); onClose(); }}
      >
        Archive project
      </button>
      <button
        className={styles.menuItemDanger}
        onClick={(e) => { e.stopPropagation(); onDelete(); onClose(); }}
      >
        Delete project…
      </button>
    </div>
  );
}

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
      className={cx(styles.sessionRow, isActive && styles.sessionRowActive)}
    >
      {/* Session icon */}
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className={styles.sessionIcon}>
        <path d="M1 2.5h10M1 5.5h7M1 8.5h8.5" stroke={isActive ? "var(--color-accent-light)" : "var(--color-text-secondary)"} strokeWidth="1.2" strokeLinecap="round"/>
      </svg>

      {/* Text */}
      <div className={styles.sessionText}>
        <span
          className={cx(
            styles.sessionTitle,
            isActive && styles.sessionTitleActive,
            isArchived && styles.sessionTitleArchived,
          )}
        >
          {session.title || "Untitled"}
        </span>
        <span className={styles.sessionTime}>
          {relativeTime(session.updated_at)}
        </span>
      </div>

      {/* Hover actions */}
      {hovered && !isArchived && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          title="Delete session"
          className="btn-icon-danger"
        >
          <Trash2 size={11} />
        </button>
      )}
      {hovered && isArchived && (
        <div className={styles.hoverActions}>
          <button
            onClick={(e) => { e.stopPropagation(); onArchive(); }}
            title="Restore session"
            className="btn-icon"
          >
            <RotateCcw size={11} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            title="Delete permanently"
            className="btn-icon-danger"
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
    <div className={styles.projectSection}>
      {/* Project header row */}
      <div
        onClick={onToggle}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className={styles.projectRow}
      >
        {/* Chevron */}
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className={styles.projectChevron}>
          {isExpanded
            ? <path d="M2 3.5L5 6.5L8 3.5" stroke="var(--color-text-tertiary)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
            : <path d="M3.5 2L6.5 5L3.5 8" stroke="var(--color-text-tertiary)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
          }
        </svg>

        {/* Project name */}
        <span className={styles.projectName}>
          {project.name}
        </span>

        {/* New session button */}
        <button
          onClick={(e) => { e.stopPropagation(); onNewSession(); }}
          title={`New session in ${project.name}`}
          className={cx(styles.newSessionBtn, !(hovered || menuOpen) && styles.newSessionBtnHidden)}
        >
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
            <path d="M5.5 1v9M1 5.5h9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
        </button>

        {/* ⋯ menu button */}
        <button
          onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v); }}
          title="Project options"
          className={cx(styles.menuBtn, !(hovered || menuOpen) && styles.menuBtnHidden)}
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
        <div className={styles.sessionsList}>
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
                className={styles.archiveToggle}
              >
                <span className={styles.archiveToggleIcon}>{showArchivedSessions ? "▼" : "▶"}</span>
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
    <form onSubmit={handleSubmit} className={styles.newProjectForm}>
      <input
        ref={inputRef}
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Project name"
        onKeyDown={(e) => e.key === "Escape" && onCancel()}
        className={styles.newProjectInput}
      />
      <div className={styles.newProjectBtns}>
        <button
          type="submit"
          disabled={!name.trim() || loading}
          className={styles.btnCreate}
        >
          {loading ? "…" : "Create"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className={styles.btnCancel}
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
      className={styles.archivedRow}
    >
      <span className={styles.archivedRowName}>
        {project.name}
      </span>
      {hovered && (
        <div className={styles.archivedHoverActions}>
          <button onClick={onRestore} title="Restore" className="btn-icon"><RotateCcw size={11} /></button>
          <button onClick={onDelete} title="Delete" className="btn-icon-danger"><Trash2 size={11} /></button>
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
    <div className={styles.sidebar}>
      {/* Header */}
      <div className={styles.header}>
        <span className={styles.title}>MathMate</span>
      </div>

      <div className={styles.divider} />

      {/* Scrollable content */}
      <div className={styles.scrollArea}>

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
          <div className={styles.archivedSection}>
            <div className={styles.divider} style={{ margin: "4px 12px 6px" }} />
            <div
              onClick={() => setShowArchivedProjects((v) => !v)}
              className={styles.archivedToggle}
            >
              <span className={styles.archivedToggleIcon}>{showArchivedProjects ? "▼" : "▶"}</span>
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

        <div className={styles.spacer} />

        {/* New project */}
        {showNewProjectForm ? (
          <NewProjectForm
            onSubmit={handleCreateProject}
            onCancel={() => setShowNewProjectForm(false)}
          />
        ) : (
          <div
            className={styles.newProjectBtn}
            onClick={() => setShowNewProjectForm(true)}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            <span className={styles.newProjectBtnText}>New Project</span>
          </div>
        )}
      </div>

      <div className={styles.settingsArea}>
        <div className={styles.settingsDivider} />
        <button
          onClick={() => navigate("/sessions")}
          className={cx(styles.settingsBtn, isSessionManagerActive && styles.settingsBtnActive)}
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
          className={styles.settingsBtn}
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
