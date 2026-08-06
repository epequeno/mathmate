/**
 * HintLadderWidget.tsx
 *
 * Sequenced, pull-on-demand hint system for olympiad-style problem sessions.
 *
 * States:
 *   1. Problem shown, attempt textarea unlocked → user writes attempt
 *   2. After attempt submitted, H1 becomes available
 *   3. Each hint reveals the next one when clicked
 *   4. H4 (solution sketch) reveals after H3 is read
 *   5. User marks solved/stuck to close the ladder
 *
 * All 4 hints are generated in one model call but revealed lazily in the UI.
 * The hints are stored in the segment data.
 */

import { useState, useCallback } from "react";
import { Lightbulb, Lock, Check, ChevronDown, ChevronRight } from "lucide-react";
import type { MessageSegment } from "../../lib/types";
import styles from "./HintLadderWidget.module.css";

interface HintLadderWidgetProps {
  segment: Extract<MessageSegment, { type: "hint-ladder" }>;
  /** Called with updated fields to persist the segment state. */
  onUpdate: (updated: Partial<Extract<MessageSegment, { type: "hint-ladder" }>>) => void;
  /** Called to generate hints via the model. Returns a promise that resolves to [h1, h2, h3, solution]. */
  onGenerateHints: (problem: string, attempt: string) => Promise<string[]>;
  /** Called when the outcome is submitted (solved/stuck). */
  onOutcome: (solved: boolean, hintsUsed: number) => void;
}

const HINT_LABELS = ["H1", "H2", "H3", "Solution"] as const;
const HINT_TITLES = [
  "Meta-strategy",
  "Structural observation",
  "Key insight",
  "Solution sketch",
] as const;

export function HintLadderWidget({
  segment,
  onUpdate,
  onGenerateHints,
  onOutcome,
}: HintLadderWidgetProps) {
  const { problem, attempt, hints, hintsRevealed, solved, hintsUsed } = segment;

  const [expanded, setExpanded] = useState(true);
  const [editingAttempt, setEditingAttempt] = useState(attempt);
  const [loadingHints, setLoadingHints] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasAttempt = attempt.trim().length > 0;
  const allHintsGenerated = hints.length === 4;
  const revealCount = Math.min(hintsRevealed, hints.length);

  const handleSubmitAttempt = useCallback(async () => {
    const trimmed = editingAttempt.trim();
    if (!trimmed) return;

    onUpdate({ attempt: trimmed });
    setLoadingHints(true);
    setError(null);

    try {
      const generated = await onGenerateHints(problem, trimmed);
      onUpdate({ hints: generated, hintsRevealed: 1 });
    } catch (err: any) {
      setError(err?.message || "Failed to generate hints. Try again.");
    } finally {
      setLoadingHints(false);
    }
  }, [editingAttempt, problem, onUpdate, onGenerateHints]);

  const handleRevealHint = useCallback(
    (level: number) => {
      // Can only reveal next level (or re-read already revealed)
      if (level > revealCount) return;
      if (level === revealCount && revealCount < 4) {
        onUpdate({ hintsRevealed: revealCount + 1 });
      }
    },
    [revealCount, onUpdate],
  );

  const handleSolved = useCallback(() => {
    const used = Math.min(hintsUsed || revealCount, 4);
    onUpdate({ solved: true, hintsUsed: used });
    onOutcome(true, used);
  }, [hintsUsed, revealCount, onUpdate, onOutcome]);

  const handleStuck = useCallback(() => {
    const used = Math.min(hintsUsed || revealCount, 4);
    // Reveal all remaining hints if stuck
    onUpdate({ solved: false, hintsUsed: used, hintsRevealed: 4 });
    onOutcome(false, used);
  }, [hintsUsed, revealCount, onUpdate, onOutcome]);

  const isDone = solved !== null;

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <Lightbulb size={14} />
        Problem Session
      </div>

      {/* Problem statement */}
      <div
        className={expanded ? styles.problemStatement : styles.problemCollapsed}
        onClick={() => setExpanded((v) => !v)}
      >
        {expanded ? (
          <div style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
            <span style={{ flex: 1, whiteSpace: "pre-wrap" }}>{problem}</span>
            <ChevronDown size={14} style={{ flexShrink: 0, marginTop: 2 }} />
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>{problem}</span>
            <ChevronRight size={14} style={{ flexShrink: 0 }} />
          </div>
        )}
      </div>

      {/* Attempt section */}
      {!hasAttempt && !loadingHints && !isDone && (
        <div className={styles.attemptSection}>
          <div className={styles.attemptLabel}>What have you tried? (required before hints unlock)</div>
          <textarea
            className={styles.attemptTextarea}
            value={editingAttempt}
            onChange={(e) => setEditingAttempt(e.target.value)}
            placeholder="Describe your initial approach, observations, or partial work..."
          />
          <button
            className={styles.submitBtn}
            disabled={!editingAttempt.trim()}
            onClick={handleSubmitAttempt}
          >
            <Lightbulb size={12} />
            Submit attempt & unlock hints
          </button>
        </div>
      )}

      {/* Loading state */}
      {loadingHints && (
        <div className={styles.hintStrip}>
          <div className={styles.loadingDots}>
            <span />
            <span />
            <span />
          </div>
          <span style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>
            Generating hint ladder…
          </span>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div
          style={{
            padding: "8px 14px",
            fontSize: 12,
            color: "var(--color-red)",
          }}
        >
          {error}
        </div>
      )}

      {/* Hint chips */}
      {allHintsGenerated && !isDone && (
        <div className={styles.hintStrip}>
          {HINT_LABELS.map((label, i) => {
            const isRevealed = i < revealCount;
            const isNextUnlocked = i === revealCount;
            const isUsed = i < hintsUsed;

            let chipClass = styles.hintChipLocked;
            if (isUsed) chipClass = styles.hintChipUsed;
            else if (isRevealed || isNextUnlocked) chipClass = styles.hintChipAvailable;

            return (
              <div
                key={label}
                className={chipClass}
                onClick={() => {
                  if (isRevealed) handleRevealHint(i);
                  else if (isNextUnlocked) handleRevealHint(i);
                }}
              >
                {isUsed ? (
                  <Check size={11} />
                ) : isRevealed || isNextUnlocked ? (
                  <Lightbulb size={11} />
                ) : (
                  <Lock size={11} />
                )}
                {label}
              </div>
            );
          })}
        </div>
      )}

      {/* Revealed hint content */}
      {allHintsGenerated && revealCount > 0 && !isDone && (
        <div className={styles.hintContent}>
          {Array.from({ length: revealCount }, (_, i) => (
            <div key={i} style={{ marginBottom: i < revealCount - 1 ? 10 : 0 }}>
              <div className={styles.hintContentTitle}>
                {HINT_TITLES[i]} — {HINT_LABELS[i]}
              </div>
              <div className={styles.hintContentBody}>{hints[i]}</div>
            </div>
          ))}
        </div>
      )}

      {/* Outcome buttons */}
      {allHintsGenerated && !isDone && (
        <div className={styles.outcomeButtons}>
          <button className={styles.solvedBtn} onClick={handleSolved}>
            <Check size={13} style={{ marginRight: 4 }} />
            I solved it!
          </button>
          <button className={styles.stuckBtn} onClick={handleStuck}>
            I'm stuck
          </button>
        </div>
      )}

      {/* Outcome badge */}
      {isDone && (
        <div className={solved ? styles.badgeSolved : styles.badgeStuck}>
          {solved ? (
            <>
              <Check size={14} />
              Solved after {hintsUsed} hint{hintsUsed !== 1 ? "s" : ""}
            </>
          ) : (
            <>
              <Lightbulb size={14} />
              Solution revealed ({hintsUsed} hint{hintsUsed !== 1 ? "s" : ""} viewed)
            </>
          )}
        </div>
      )}
    </div>
  );
}