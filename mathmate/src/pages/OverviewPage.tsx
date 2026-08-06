import { useEffect, useState } from "react";
import { useProjectStore } from "../stores/projectStore";
import { useChatStore } from "../stores/chatStore";
import type { SessionHeader } from "../lib/types";
import { Sessions } from "../lib/api";
import { useNavigate } from "react-router-dom";
import { cx } from "../lib/clsx";
import styles from "./OverviewPage.module.css";

// SVG icons
function ChatIcon({ color = "currentColor" }: { color?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0, overflow: "visible" }}>
      <path d="M2 2.5h10M2 5.5h7M2 8.5h8.5" stroke={color} strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0, overflow: "visible", opacity: 0.4 }}>
      <path d="M5.5 3l4 4-4 4" stroke="var(--color-text-primary)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function AISummaryIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0, overflow: "visible" }}>
      <path d="M7 1.5C4.015 1.5 1.5 4.015 1.5 7S4.015 12.5 7 12.5 12.5 9.985 12.5 7 9.985 1.5 7 1.5z" stroke="var(--color-accent)" strokeWidth="1.3" />
      <path d="M5 7.5c.5.8 1.2 1.5 2 1.5s1.5-.7 2-1.5M5.5 5.5h.01M8.5 5.5h.01" stroke="var(--color-accent)" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function Divider() {
  return (
    <div style={{
      height: 1,
      backgroundColor: "var(--color-border)",
      flexShrink: 0,
    }} />
  );
}

function formatSessionDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const sessionDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (sessionDay.getTime() === today.getTime()) {
    return `Today, ${date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
  } else if (sessionDay.getTime() === yesterday.getTime()) {
    return "Yesterday";
  } else {
    return date.toLocaleDateString([], { month: "short", day: "numeric" });
  }
}

export default function OverviewPage() {
  const currentProject = useProjectStore((s) => s.currentProject);
  const { projects, loadProjects } = useProjectStore();
  const sessionList = useChatStore((s) => s.sessionList);
  const [projectSessions, setProjectSessions] = useState<SessionHeader[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    loadProjects();
    useChatStore.getState().loadSessions();
  }, []);

  useEffect(() => {
    if (currentProject) {
      Sessions.list(currentProject.id)
        .then(setProjectSessions)
        .catch(() => setProjectSessions([]));
    } else {
      setProjectSessions([]);
    }
  }, [currentProject]);

  // Stats derived from real data
  const sessionCount = projectSessions.length;
  const vaultNoteCount = currentProject?.vault_path ? "—" : "0";

  // Collect topics from session titles as a simple proxy (until a dedicated topics system exists)
  const topicSet = new Set<string>();
  projectSessions.forEach((s) => {
    if (s.title && s.title !== "New Session") topicSet.add(s.title);
  });
  const topics = Array.from(topicSet).slice(0, 6);
  const topicCount = topics.length;

  const lastActive = projectSessions.length > 0
    ? projectSessions.reduce((latest, s) =>
        s.updated_at > latest ? s.updated_at : latest,
        projectSessions[0].updated_at
      )
    : currentProject?.updated_at ?? null;

  function formatLastActive(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const sessionDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    if (sessionDay.getTime() === today.getTime()) {
      return `Today at ${date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
    }
    return date.toLocaleDateString([], { month: "long", day: "numeric" }) +
      " at " + date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }

  if (!currentProject) {
    return (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <ToolbarArea projectName={null} />
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <p style={{ fontSize: 14, color: "var(--color-text-tertiary)" }}>
            Select a project to see its overview.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <ToolbarArea projectName={currentProject.name} />

      {/* Scrollable content */}
      <div style={{ flex: 1, overflow: "auto" }}>
        <div style={{
          display: "flex",
          flexDirection: "column",
          gap: 28,
          padding: "32px 40px",
          width: "100%",
          boxSizing: "border-box",
        }}>

          {/* Stats bar */}
          <div style={{ display: "flex", alignItems: "flex-start", gap: 40 }}>
            <div style={{ display: "flex", gap: 28 }}>
              <StatInline value={String(sessionCount)} label="Sessions" />
              <div style={{ width: 1, alignSelf: "stretch", backgroundColor: "var(--color-border)", flexShrink: 0 }} />
              <StatInline value={String(topicCount)} label="Topics" />
              <div style={{ width: 1, alignSelf: "stretch", backgroundColor: "var(--color-border)", flexShrink: 0 }} />
              <StatInline value={vaultNoteCount} label="Vault Notes" />
            </div>
            <div style={{ flex: 1 }} />
            {lastActive && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
                <div style={{
                  fontSize: 11,
                  fontWeight: 500,
                  color: "var(--color-text-tertiary)",
                  textTransform: "uppercase",
                  letterSpacing: "0.03em",
                  lineHeight: "14px",
                }}>
                  Last active
                </div>
                <div style={{
                  fontSize: 13,
                  color: "var(--color-text-primary)",
                  lineHeight: "16px",
                }}>
                  {formatLastActive(lastActive)}
                </div>
              </div>
            )}
          </div>

          <Divider />

          {/* AI Summary */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <AISummaryIcon />
              <div style={{
                fontSize: 12,
                fontWeight: 600,
                color: "var(--color-accent)",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                lineHeight: "16px",
              }}>
                AI Summary
              </div>
              <div style={{
                fontSize: 11,
                color: "var(--color-text-tertiary)",
                lineHeight: "14px",
                marginLeft: 2,
              }}>
                based on your sessions
              </div>
            </div>
            <div style={{
              fontSize: 14,
              color: "var(--color-text-primary)",
              lineHeight: "22px",
            }}>
              {sessionCount === 0
                ? "No sessions yet. Start chatting to build your study history for this project."
                : `You have ${sessionCount} session${sessionCount !== 1 ? "s" : ""} in ${currentProject.name}. ${
                    topics.length > 0
                      ? `Topics covered include ${topics.slice(0, 3).join(", ")}${topics.length > 3 ? ", and more" : ""}.`
                      : ""
                  } Keep up the great work!`
              }
            </div>
          </div>

          <Divider />

          {/* Key Topics Covered */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{
              fontSize: 12,
              fontWeight: 600,
              color: "var(--color-text-secondary)",
              textTransform: "uppercase",
              letterSpacing: "0.04em",
              lineHeight: "16px",
            }}>
              Key Topics Covered
            </div>
            {topics.length === 0 ? (
              <div style={{ fontSize: 13, color: "var(--color-text-tertiary)" }}>
                No topics yet — start a session to track your progress.
              </div>
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {topics.map((topic, i) => (
                  <TopicPill key={topic} label={topic} accent={i < 2} />
                ))}
              </div>
            )}
          </div>

          <CompetitionPrepCard />

          <Divider />

          {/* Recent Sessions */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{
              fontSize: 12,
              fontWeight: 600,
              color: "var(--color-text-secondary)",
              textTransform: "uppercase",
              letterSpacing: "0.04em",
              lineHeight: "16px",
            }}>
              Recent Sessions
            </div>
            {projectSessions.length === 0 ? (
              <div style={{ fontSize: 13, color: "var(--color-text-tertiary)" }}>
                No sessions yet.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {projectSessions.slice(0, 8).map((s, i) => (
                  <SessionRow
                    key={s.id}
                    session={s}
                    isFirst={i === 0}
                    onClick={() => navigate(`/chat/${s.id}`)}
                  />
                ))}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function ToolbarArea({ projectName }: { projectName: string | null }) {
  return (
    <div style={{
      background: "var(--color-bg-elevated)",
      borderBottom: "1px solid var(--color-border)",
      height: 62,
      display: "flex",
      flexDirection: "column",
      justifyContent: "flex-end",
      padding: "0 20px",
      flexShrink: 0,
    }}>
      {projectName && (
        <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginBottom: 2, lineHeight: "14px" }}>
          {projectName}
        </div>
      )}
      <span style={{ fontSize: 18, fontWeight: 700, color: "var(--color-text-primary)", letterSpacing: "-0.02em", lineHeight: "22px", marginBottom: 8 }}>
        {projectName ?? "Overview"}
      </span>
    </div>
  );
}

function StatInline({ value, label }: { value: string; label: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <div style={{
        fontSize: 26,
        fontWeight: 700,
        color: "var(--color-text-primary)",
        letterSpacing: "-0.04em",
        lineHeight: "100%",
      }}>
        {value}
      </div>
      <div style={{
        fontSize: 11,
        fontWeight: 500,
        color: "var(--color-text-secondary)",
        textTransform: "uppercase",
        letterSpacing: "0.04em",
        lineHeight: "14px",
      }}>
        {label}
      </div>
    </div>
  );
}

function TopicPill({ label, accent }: { label: string; accent: boolean }) {
  return (
    <div style={{
      backgroundColor: accent ? "var(--color-accent-subtle)" : "var(--color-bg-elevated)",
      border: `1px solid ${accent ? "var(--color-accent-pill-border, var(--color-accent))" : "var(--color-border)"}`,
      borderRadius: 20,
      paddingBlock: 5,
      paddingInline: 12,
      opacity: accent ? 1 : 0.85,
    }}>
      <div style={{
        fontSize: 12,
        fontWeight: 500,
        color: accent ? "var(--color-accent)" : "var(--color-text-primary)",
        lineHeight: "16px",
        whiteSpace: "nowrap",
      }}>
        {label}
      </div>
    </div>
  );
}

/**
 * Competition Prep Card — Phase 16B
 * Shows problem attempt stats with a link to the practice page.
 */
function CompetitionPrepCard() {
  const [stats, setStats] = useState<{
    total_attempted: number;
    solved: number;
    partial: number;
    stuck: number;
    gave_up: number;
    by_topic: { topic: string; attempted: number; solved: number }[];
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const fetch = async () => {
      try {
        const { ProblemBank } = await import("../lib/api/problemBank");
        const s = await ProblemBank.getStats();
        if (!cancelled) setStats(s);
      } catch {
        // Not available
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetch();
    return () => { cancelled = true; };
  }, []);

  if (loading || !stats || stats.total_attempted === 0) return null;

  const solvedPct = Math.round((stats.solved / stats.total_attempted) * 100);
  const partialPct = Math.round((stats.partial / stats.total_attempted) * 100);
  const stuckPct = Math.round(((stats.stuck + stats.gave_up) / stats.total_attempted) * 100);

  const sortedTopics = [...(stats.by_topic || [])].sort((a, b) => {
    const aRate = a.attempted > 0 ? a.solved / a.attempted : 0;
    const bRate = b.attempted > 0 ? b.solved / b.attempted : 0;
    return bRate - aRate;
  });
  const strongest = sortedTopics[0];
  const weakest = sortedTopics[sortedTopics.length - 1];

  const navigate = useNavigate();

  return (
    <div
      onClick={() => navigate("/practice")}
      style={{
        border: "1px solid var(--color-border)",
        borderRadius: 8,
        padding: 14,
        cursor: "pointer",
        transition: "border-color 0.15s",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--color-accent)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--color-border)"; }}
    >
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.2"/>
          <path d="M7 4v3l2 2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
        </svg>
        Competition Prep
      </div>

      <div style={{ fontSize: 13, color: "var(--color-text-primary)", marginBottom: 8 }}>
        {stats.total_attempted} problem{stats.total_attempted !== 1 ? "s" : ""} attempted
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 3, marginBottom: 8 }}>
        <BarSegment label="Solved" pct={solvedPct} color="#22c55e" />
        <BarSegment label="Partial" pct={partialPct} color="#f59e0b" />
        <BarSegment label="Stuck" pct={stuckPct} color="#ef4444" />
      </div>

      {strongest && (
        <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginTop: 4 }}>
          Strongest: <span style={{ color: "#22c55e", fontWeight: 600 }}>{strongest.topic}</span>
          {strongest.attempted > 0 && ` (${Math.round((strongest.solved / strongest.attempted) * 100)}%)`}
        </div>
      )}
      {weakest && weakest !== strongest && (
        <div style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>
          Needs work: <span style={{ color: "#ef4444", fontWeight: 600 }}>{weakest.topic}</span>
          {weakest.attempted > 0 && ` (${Math.round((weakest.solved / weakest.attempted) * 100)}%)`}
        </div>
      )}
    </div>
  );
}

function BarSegment({ label, pct, color }: { label: string; pct: number; color: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11 }}>
      <span style={{ width: 44, color: "var(--color-text-tertiary)", flexShrink: 0 }}>{label}</span>
      <div style={{
        flex: 1,
        height: 6,
        background: "var(--color-bg)",
        borderRadius: 3,
        overflow: "hidden",
      }}>
        <div style={{
          width: `${pct}%`,
          height: "100%",
          background: color,
          borderRadius: 3,
          transition: "width 0.3s ease",
        }} />
      </div>
      <span style={{ width: 36, color: "var(--color-text-secondary)", textAlign: "right", flexShrink: 0 }}>{pct}%</span>
    </div>
  );
}

function SessionRow({
  session,
  isFirst,
  onClick,
}: {
  session: SessionHeader;
  isFirst: boolean;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const dateStr = formatSessionDate(session.updated_at);

  return (
    <div
      onClick={onClick}
      className={cx(styles.sessionRow, isFirst && styles.sessionRowFirst)}
    >
      <ChatIcon color="var(--color-text-secondary)" />
      <div style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        minWidth: 0,
      }}>
        <div style={{
          fontSize: 13,
          fontWeight: isFirst ? 500 : 400,
          color: "var(--color-text-primary)",
          lineHeight: "16px",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}>
          {session.title || "Untitled Session"}
        </div>
        <div style={{
          fontSize: 11,
          color: "var(--color-text-secondary)",
          lineHeight: "14px",
          marginTop: 1,
        }}>
          {dateStr}
        </div>
      </div>
      <ChevronRightIcon />
    </div>
  );
}
