import { useState } from "react";
import type { SessionHeader } from "../../lib/types";
import { SessionRow } from "./SessionRow";
import styles from "./Sidebar.module.css";

interface SessionListProps {
  sessions: SessionHeader[];
  archivedSessions: SessionHeader[];
  currentSessionId: string | null;
  onOpenSession: (id: string) => void;
  onArchiveSession: (id: string) => void;
  onDeleteSession: (id: string) => void;
  onUnarchiveSession: (id: string) => void;
  onPurgeSession: (id: string) => void;
}

export function SessionList({
  sessions,
  archivedSessions,
  currentSessionId,
  onOpenSession,
  onArchiveSession,
  onDeleteSession,
  onUnarchiveSession,
  onPurgeSession,
}: SessionListProps) {
  const [showArchived, setShowArchived] = useState(false);

  return (
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
            onClick={() => setShowArchived((v) => !v)}
            className={styles.archiveToggle}
          >
            <span className={styles.archiveToggleIcon}>{showArchived ? "▼" : "▶"}</span>
            Archived ({archivedSessions.length})
          </div>
          {showArchived &&
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
  );
}