import { useState } from "react";
import type { SessionHeader, MathProject } from "../../lib/types";
import SessionTableRow from "./SessionTableRow";

interface SessionTableProps {
  sessions: SessionHeader[];
  archivedSessions: SessionHeader[];
  projects: MathProject[];
  checkedIds: Set<string>;
  selectedSessionId: string | null;
  onSelectSession: (id: string) => void;
  onCheckSession: (id: string, checked: boolean) => void;
  onOpenInChat: (id: string) => void;
  onArchive: (id: string) => void;
  onUnarchive: (id: string) => void;
  onDelete: (id: string) => void;
  onPurge: (id: string) => void;
  onRename: (id: string, title: string) => void;
}

interface GroupedProject {
  project: MathProject;
  activeSessions: SessionHeader[];
  archivedSessions: SessionHeader[];
}

export default function SessionTable({
  sessions,
  archivedSessions,
  projects,
  checkedIds,
  selectedSessionId,
  onSelectSession,
  onCheckSession,
  onOpenInChat,
  onArchive,
  onUnarchive,
  onDelete,
  onPurge,
  onRename,
}: SessionTableProps) {
  // Group sessions by project
  const projectMap = new Map<string, GroupedProject>();

  for (const p of projects) {
    projectMap.set(p.id, {
      project: p,
      activeSessions: [],
      archivedSessions: [],
    });
  }

  for (const s of sessions) {
    const group = projectMap.get(s.project_id ?? "");
    if (group) {
      group.activeSessions.push(s);
    }
  }

  for (const s of archivedSessions) {
    const group = projectMap.get(s.project_id ?? "");
    if (group) {
      group.archivedSessions.push(s);
    }
  }

  // Sort projects by most recently updated session descending
  // (or by project name if no sessions)
  const groups = Array.from(projectMap.values()).sort((a, b) => {
    const aLatest = a.activeSessions[0]?.updated_at ?? a.archivedSessions[0]?.updated_at ?? a.project.updated_at;
    const bLatest = b.activeSessions[0]?.updated_at ?? b.archivedSessions[0]?.updated_at ?? b.project.updated_at;
    return bLatest.localeCompare(aLatest);
  });

  // Filter out projects with no sessions
  const groupsWithSessions = groups.filter(
    (g) => g.activeSessions.length > 0 || g.archivedSessions.length > 0
  );

  if (groupsWithSessions.length === 0) {
    return (
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span style={{ fontSize: 13, color: "var(--color-text-tertiary)" }}>
          No sessions found
        </span>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Column headers */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 0,
          padding: "0 16px",
          height: 36,
          borderBottom: "1px solid var(--color-border)",
          flexShrink: 0,
        }}
      >
        <div style={{ width: 32, flexShrink: 0 }} />
        <div
          style={{
            flex: 1,
            fontSize: 10,
            fontWeight: 600,
            color: "var(--color-text-tertiary)",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          Title
        </div>
        <div
          style={{
            width: 130,
            flexShrink: 0,
            fontSize: 10,
            fontWeight: 600,
            color: "var(--color-text-tertiary)",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          Model
        </div>
        <div
          style={{
            width: 100,
            flexShrink: 0,
            fontSize: 10,
            fontWeight: 600,
            color: "var(--color-text-tertiary)",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          Messages
        </div>
        <div
          style={{
            width: 120,
            flexShrink: 0,
            fontSize: 10,
            fontWeight: 600,
            color: "var(--color-text-tertiary)",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          Updated
        </div>
        <div
          style={{
            width: 80,
            flexShrink: 0,
            fontSize: 10,
            fontWeight: 600,
            color: "var(--color-text-tertiary)",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          Status
        </div>
        <div
          style={{
            width: 56,
            flexShrink: 0,
            fontSize: 10,
            fontWeight: 600,
            color: "var(--color-text-tertiary)",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        />
      </div>

      {/* Scrollable rows */}
      <div style={{ flex: 1, overflow: "auto" }}>
        {groupsWithSessions.map((group) => (
          <ProjectGroup
            key={group.project.id}
            group={group}
            checkedIds={checkedIds}
            selectedSessionId={selectedSessionId}
            onSelectSession={onSelectSession}
            onCheckSession={onCheckSession}
            onOpenInChat={onOpenInChat}
            onArchive={onArchive}
            onUnarchive={onUnarchive}
            onDelete={onDelete}
            onPurge={onPurge}
            onRename={onRename}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Project group (collapsible) ─────────────────

function ProjectGroup({
  group,
  checkedIds,
  selectedSessionId,
  onSelectSession,
  onCheckSession,
  onOpenInChat,
  onArchive,
  onUnarchive,
  onDelete,
  onPurge,
  onRename,
}: {
  group: GroupedProject;
  checkedIds: Set<string>;
  selectedSessionId: string | null;
  onSelectSession: (id: string) => void;
  onCheckSession: (id: string, checked: boolean) => void;
  onOpenInChat: (id: string) => void;
  onArchive: (id: string) => void;
  onUnarchive: (id: string) => void;
  onDelete: (id: string) => void;
  onPurge: (id: string) => void;
  onRename: (id: string, title: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const totalCount = group.activeSessions.length + group.archivedSessions.length;

  // Sort active sessions by updated_at descending
  const sortedActive = [...group.activeSessions].sort((a, b) =>
    b.updated_at.localeCompare(a.updated_at)
  );
  const sortedArchived = [...group.archivedSessions].sort((a, b) =>
    b.updated_at.localeCompare(a.updated_at)
  );

  return (
    <div>
      {/* Group header */}
      <div
        onClick={() => setCollapsed((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "8px 16px",
          cursor: "pointer",
          borderBottom: "1px solid var(--color-border)",
          background: "var(--color-bg-elevated)",
          position: "sticky",
          top: 0,
          zIndex: 10,
        }}
      >
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="none"
          style={{
            flexShrink: 0,
            transition: "transform 0.15s",
            transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)",
          }}
        >
          <path
            d="M2 3.5L5 6.5L8 3.5"
            stroke="var(--color-text-tertiary)"
            strokeWidth="1.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span
          style={{
            flex: 1,
            fontSize: 11,
            fontWeight: 600,
            color: "var(--color-text-primary)",
            letterSpacing: "0.04em",
            textTransform: "uppercase",
          }}
        >
          {group.project.name}
        </span>
        <span
          style={{
            fontSize: 10,
            fontWeight: 600,
            color: "var(--color-text-tertiary)",
            padding: "0 6px",
            borderRadius: 8,
            background: "var(--color-surface)",
            lineHeight: "18px",
          }}
        >
          {totalCount}
        </span>
      </div>

      {!collapsed && (
        <>
          {sortedActive.map((s) => (
            <SessionTableRow
              key={s.id}
              session={s}
              project={group.project}
              isSelected={s.id === selectedSessionId}
              isChecked={checkedIds.has(s.id)}
              isArchived={false}
              onSelect={() => onSelectSession(s.id)}
              onCheck={(checked) => onCheckSession(s.id, checked)}
              onOpenInChat={() => onOpenInChat(s.id)}
              onArchive={() => onArchive(s.id)}
              onDelete={() => onDelete(s.id)}
              onRename={(title) => onRename(s.id, title)}
            />
          ))}

          {sortedArchived.map((s) => (
            <SessionTableRow
              key={s.id}
              session={s}
              project={group.project}
              isSelected={s.id === selectedSessionId}
              isChecked={checkedIds.has(s.id)}
              isArchived={true}
              onSelect={() => onSelectSession(s.id)}
              onCheck={(checked) => onCheckSession(s.id, checked)}
              onOpenInChat={() => onOpenInChat(s.id)}
              onArchive={() => onUnarchive(s.id)}
              onDelete={() => onPurge(s.id)}
              onRename={(title) => onRename(s.id, title)}
            />
          ))}
        </>
      )}
    </div>
  );
}
