// CritiqueCard.tsx — Phase 16D
//
// Renders a structured proof critique with traffic-light coloring:
//   🔴 Logic gaps   — high confidence issues
//   🟡 Double-check — medium/low confidence
//   🟢 Style        -- suggestions
//
// Always shows a reliability disclaimer at the bottom.

import { useMemo, useCallback, useState } from "react";
import type { ProofCritiqueSegment } from "../../lib/types";
import styles from "./CritiqueCard.module.css";

interface CritiqueCardProps {
  segment: ProofCritiqueSegment;
  /** Called when user clicks "Get a hint" for a specific gap */
  onRequestHint?: (location: string, issue: string) => void;
}

// ─── Traffic-light icon ──────────────────────────────────────────────

function TrafficIcon({ level }: { level: "high" | "medium" | "low" | "style" }) {
  const colors: Record<string, { bg: string; fg: string; label: string }> = {
    high: { bg: "#fef2f2", fg: "#dc2626", label: "High confidence" },
    medium: { bg: "#fffbeb", fg: "#d97706", label: "Medium confidence" },
    low: { bg: "#f0fdf4", fg: "#22c55e", label: "Low confidence" },
    style: { bg: "#f0f9ff", fg: "#3b82f6", label: "Style suggestion" },
  };
  const c = colors[level] || colors.low;
  return (
    <span
      title={c.label}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 20,
        height: 20,
        borderRadius: "50%",
        background: c.bg,
        color: c.fg,
        fontSize: 10,
        fontWeight: 700,
        flexShrink: 0,
      }}
    >
      {level === "high" ? "!" : level === "medium" ? "?" : level === "low" ? "·" : "✦"}
    </span>
  );
}

// ─── Critique section ────────────────────────────────────────────────

function CritiqueSection({
  title,
  icon,
  items,
  color,
  onRequestHint,
}: {
  title: string;
  icon: string;
  items: CritiqueCardProps["segment"]["logic_gaps"];
  color: string;
  onRequestHint?: (location: string, issue: string) => void;
}) {
  if (items.length === 0) return null;

  return (
    <div className={styles.section}>
      <div className={styles.sectionHeader} style={{ color }}>
        <span style={{ fontSize: 14 }}>{icon}</span>
        <span className={styles.sectionTitle}>
          {title} ({items.length})
        </span>
      </div>
      <div className={styles.items}>
        {items.map((item, i) => (
          <div key={i} className={styles.item}>
            <div className={styles.itemRow}>
              <TrafficIcon level={item.confidence || "low"} />
              <div className={styles.itemContent}>
                <span className={styles.itemLocation}>{item.location}</span>
                <p className={styles.itemIssue}>{item.issue}</p>
                {item.suggestion && (
                  <p className={styles.itemSuggestion}>
                    <em>Suggestion:</em> {item.suggestion}
                  </p>
                )}
              </div>
            </div>
            {onRequestHint && (item.confidence === "high" || item.confidence === "medium") && (
              <button
                className={styles.hintBtn}
                onClick={() => onRequestHint(item.location, item.issue)}
              >
                Get a hint
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────

export default function CritiqueCard({ segment, onRequestHint }: CritiqueCardProps) {
  const [showReliability, setShowReliability] = useState(true);

  const modelLabel = useMemo(() => {
    const m = segment.model_used;
    // Shorten common prefixes
    return m.replace(/^anthropic\//, "").replace(/^openai\//, "").replace(/^google\//, "");
  }, [segment.model_used]);

  const hasItems =
    segment.logic_gaps.length > 0 ||
    segment.double_check.length > 0 ||
    segment.style.length > 0;

  const handleHint = useCallback(
    (location: string, issue: string) => {
      onRequestHint?.(location, issue);
    },
    [onRequestHint],
  );

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.headerIcon}>⚖</span>
          <span className={styles.headerTitle}>Proof Critique</span>
        </div>
        <span className={styles.modelBadge} title={`Critiqued by ${segment.model_used}`}>
          {modelLabel}
        </span>
      </div>

      {/* Overall summary */}
      {segment.overall && (
        <div className={styles.overall}>
          <span className={styles.overallIcon}>📋</span>
          <span>{segment.overall}</span>
        </div>
      )}

      {/* Sections */}
      <CritiqueSection
        title="Potential logic gaps"
        icon="🔴"
        items={segment.logic_gaps}
        color="#dc2626"
        onRequestHint={handleHint}
      />
      <CritiqueSection
        title="Worth double-checking"
        icon="🟡"
        items={segment.double_check}
        color="#d97706"
        onRequestHint={handleHint}
      />
      <CritiqueSection
        title="Style suggestions"
        icon="🟢"
        items={segment.style.map((s) => ({ ...s, confidence: "style" as any }))}
        color="#3b82f6"
      />

      {/* No issues found */}
      {!hasItems && (
        <div className={styles.noIssues}>
          No specific issues flagged. Review your proof carefully — LLMs can miss subtle errors.
        </div>
      )}

      {/* Reliability note */}
      {showReliability && (
        <div className={styles.reliabilityNote}>
          <strong>⚠ Reliability note</strong>
          <p>
            LLMs can miss subtle logical errors or flag valid steps incorrectly.
            This critique is a <strong>checklist</strong>, not a proof checker.
            Treat 🔴 items as "review carefully," not "definitely wrong."
          </p>
          <button
            className={styles.dismissBtn}
            onClick={() => setShowReliability(false)}
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}