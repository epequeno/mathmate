/**
 * Sidebar — shell component
 *
 * Composes ProjectSection, ArchivedProjectRow, NewProjectForm, and the layout shell.
 * All rendering logic lives in the sub-components under ./Sidebar/.
 */
import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useProjectStore } from "../../stores/projectStore";
import { useChatStore } from "../../stores/chatStore";
import { ProjectSection } from "./ProjectSection";
import { ArchivedProjectRow } from "./ArchivedProjectRow";
import { NewProjectForm } from "./NewProjectForm";
import { ArchivalToggle } from "./ArchivalToggle";
import { cx } from "../../lib/clsx";
import styles from "./Sidebar.module.css";

export default function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();

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

  // Load on mount
  useEffect(() => {
    loadProjects();
    loadArchivedProjects();
    loadSessions();
    loadArchivedSessions();
  }, []);

  // Auto-expand the current project
  useEffect(() => {
    const pid = currentSession?.header.project_id;
    if (pid) {
      setExpandedProjects((prev) => {
        if (prev.has(pid)) return prev;
        return new Set([...prev, pid]);
      });
    }
  }, [currentSession?.header.project_id]);

  // Expand first project by default
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
        {projects.map((project, idx) => {
          // Also surface sessions with no project_id under the first project
          // so they aren't invisible (can happen if a session was created before
          // projects were loaded).
          const isFirst = idx === 0;
          const sessions = sessionList.filter(
            (s) => s.project_id === project.id || (isFirst && !s.project_id)
          );
          const archived = archivedSessionList.filter(
            (s) => s.project_id === project.id || (isFirst && !s.project_id)
          );
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
            <ArchivalToggle
              label="Archived"
              count={archivedProjects.length}
              expanded={showArchivedProjects}
              onToggle={() => setShowArchivedProjects((v) => !v)}
            />
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

      {/* Footer settings buttons */}
      <div className={styles.settingsArea}>
        <div className={styles.settingsDivider} />
        <button
          onClick={() => navigate("/practice")}
          className={cx(styles.settingsBtn, location.pathname === "/practice" && styles.settingsBtnActive)}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.2"/>
            <path d="M7 4v3l2 2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
          </svg>
          Practice
        </button>
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