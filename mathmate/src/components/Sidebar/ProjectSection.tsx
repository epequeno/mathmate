import { useState } from "react";
import type { MathProject, SessionHeader } from "../../lib/types";
import { ProjectMenu } from "./ProjectMenu";
import { SessionList } from "./SessionList";
import styles from "./Sidebar.module.css";

interface ProjectSectionProps {
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
}

export function ProjectSection({
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
}: ProjectSectionProps) {
  const [hovered, setHovered] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

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
        <span className={styles.projectName}>{project.name}</span>

        {/* New session button */}
        <button
          onClick={(e) => { e.stopPropagation(); onNewSession(); }}
          title={`New session in ${project.name}`}
          className={styles.newSessionBtn}
        >
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
            <path d="M5.5 1v9M1 5.5h9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
        </button>

        {/* ⋯ menu button */}
        <button
          onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v); }}
          title="Project options"
          className={styles.menuBtn}
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
        <SessionList
          sessions={sessions}
          archivedSessions={archivedSessions}
          currentSessionId={currentSessionId}
          onOpenSession={onOpenSession}
          onArchiveSession={onArchiveSession}
          onDeleteSession={onDeleteSession}
          onUnarchiveSession={onUnarchiveSession}
          onPurgeSession={onPurgeSession}
        />
      )}
    </div>
  );
}