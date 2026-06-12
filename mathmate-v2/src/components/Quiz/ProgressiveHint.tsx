import { useState, memo } from "react";
import { Lightbulb, Eye, CheckCircle2 } from "lucide-react";

interface ProgressiveHintProps {
  question?: string;
  hints: string[];
  attrs: Record<string, string>;
}

/**
 * Progressive hint quiz card.
 * Shows the question, then reveals hints one at a time on click.
 * User can choose how many hints they need before answering.
 */
const ProgressiveHint = memo(function ProgressiveHint({
  question,
  hints,
  attrs,
}: ProgressiveHintProps) {
  const [revealedCount, setRevealedCount] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const answer = attrs.answer || "";

  return (
    <div
      style={{
        margin: "8px 0",
        padding: "12px 14px",
        borderRadius: 8,
        border: "1px solid var(--color-border)",
        background: "var(--color-bg-elevated)",
      }}
    >
      {question && (
        <p
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: "var(--color-text-primary)",
            marginBottom: 8,
            lineHeight: 1.4,
          }}
        >
          {question}
        </p>
      )}

      {/* Hints */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 8 }}>
        {hints.map((hint, i) => (
          <div key={i}>
            {i < revealedCount ? (
              <div
                style={{
                  padding: "6px 10px",
                  borderRadius: 6,
                  background: "var(--color-surface)",
                  border: "1px solid var(--color-border)",
                  fontSize: 12,
                  color: "var(--color-text-secondary)",
                  lineHeight: 1.4,
                }}
              >
                <span style={{ fontWeight: 600, marginRight: 4, display: "inline-flex", alignItems: "center", gap: 4 }}><Lightbulb size={12} /> Hint {i + 1}:</span>
                {hint}
              </div>
            ) : (
              <button
                onClick={() => setRevealedCount(i + 1)}
                style={{
                  width: "100%",
                  padding: "5px 10px",
                  borderRadius: 6,
                  border: "1px dashed var(--color-border)",
                  background: "transparent",
                  cursor: "pointer",
                  fontSize: 11,
                  color: "var(--color-text-tertiary)",
                  fontFamily: "inherit",
                  textAlign: "left",
                }}
              >
                {i === 0 ? <><Lightbulb size={12} style={{ marginRight: 4, verticalAlign: "middle" }} />Show hint</> : <><Lightbulb size={12} style={{ marginRight: 4, verticalAlign: "middle" }} />Show hint {i + 1}</>}
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Reveal solution */}
      {revealedCount >= hints.length && !showAnswer && answer && (
        <button
          onClick={() => setShowAnswer(true)}
          style={{
            padding: "6px 14px",
            borderRadius: 6,
            border: "1px solid var(--color-border)",
            background: "var(--color-surface)",
            cursor: "pointer",
            fontSize: 12,
            color: "var(--color-text-secondary)",
            fontFamily: "inherit",
          }}
        >
          <Eye size={14} style={{ marginRight: 4, verticalAlign: "middle" }} /> Show solution
        </button>
      )}

      {showAnswer && answer && (
        <div
          style={{
            marginTop: 6,
            padding: "8px 12px",
            borderRadius: 6,
            background: "rgba(34,197,94,0.08)",
            border: "1px solid rgb(34,197,94)",
            fontSize: 13,
            color: "rgb(22,163,74)",
            fontFamily: "'SF Mono', Menlo, Monaco, monospace",
            lineHeight: 1.4,
          }}
        >
          <CheckCircle2 size={14} style={{ marginRight: 4, verticalAlign: "middle" }} /> {answer}
        </div>
      )}

      {attrs.explanation && showAnswer && (
        <p
          style={{
            marginTop: 6,
            fontSize: 12,
            color: "var(--color-text-tertiary)",
            lineHeight: 1.4,
          }}
        >
          {attrs.explanation}
        </p>
      )}
    </div>
  );
});

/**
 * Parse hints from body text (one per line).
 */
export function parseHints(body: string): string[] {
  return body
    .split("\n")
    .map((line) => line.replace(/^[-*•]\s*/, "").trim())
    .filter(Boolean);
}

export default ProgressiveHint;