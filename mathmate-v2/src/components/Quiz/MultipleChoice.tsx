import { useState, memo } from "react";
import { CheckCircle2, XCircle } from "lucide-react";

interface MultipleChoiceProps {
  question?: string;
  options: string[];
  attrs: Record<string, string>;
}

/**
 * Interactive multiple-choice quiz card.
 * Options are shown as clickable buttons with correct/incorrect feedback.
 */
const MultipleChoice = memo(function MultipleChoice({
  question,
  options,
  attrs,
}: MultipleChoiceProps) {
  const correctAnswer = (attrs.answer || attrs.correct || "").trim().toLowerCase();
  const [selected, setSelected] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);

  if (options.length === 0) {
    return (
      <div style={containerStyle}>
        <p style={{ fontSize: 12, color: "var(--color-text-tertiary)", textAlign: "center" }}>
          No options provided for this multiple-choice question.
        </p>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      {question && (
        <p style={questionStyle}>{question}</p>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {options.map((opt, i) => {
          const optKey = opt.trim().toLowerCase();
          const isSelected = selected === optKey;
          const isCorrect = correctAnswer && optKey === correctAnswer;

          let bg = "var(--color-surface)";
          let borderColor = "var(--color-border)";
          let textColor = "var(--color-text-primary)";
          let indicator = null;

          if (selected !== null && revealed) {
            if (isCorrect) {
              bg = "rgba(34,197,94,0.12)";
              borderColor = "rgb(34,197,94)";
              textColor = "rgb(22,163,74)";
              indicator = <span style={{ marginRight: 6, fontSize: 14, display: "inline-flex", alignItems: "center" }}><CheckCircle2 size={14} /></span>;
            } else if (isSelected) {
              bg = "rgba(239,68,68,0.10)";
              borderColor = "rgb(239,68,68)";
              textColor = "rgb(220,38,38)";
              indicator = <span style={{ marginRight: 6, fontSize: 14, display: "inline-flex", alignItems: "center" }}><XCircle size={14} /></span>;
            }
          } else if (isSelected) {
            bg = "var(--color-accent-subtle)";
            borderColor = "var(--color-accent)";
          }

          return (
            <button
              key={i}
              onClick={() => {
                setSelected(optKey);
                setRevealed(true);
              }}
              disabled={revealed}
              style={{
                ...optionStyle,
                background: bg,
                borderColor,
                color: textColor,
                cursor: revealed ? "default" : "pointer",
              }}
            >
              {indicator}
              <span>{opt}</span>
            </button>
          );
        })}
      </div>
      {revealed && (
        <div
          style={{
            marginTop: 8,
            padding: "6px 10px",
            borderRadius: 6,
            fontSize: 12,
            background:
              selected === correctAnswer
                ? "rgba(34,197,94,0.10)"
                : "rgba(239,68,68,0.08)",
            color:
              selected === correctAnswer
                ? "rgb(22,163,74)"
                : "rgb(220,38,38)",
          }}
        >
          {selected === correctAnswer
            ? <><CheckCircle2 size={14} style={{ marginRight: 4, verticalAlign: "middle" }} />Correct!</>
            : <><XCircle size={14} style={{ marginRight: 4, verticalAlign: "middle" }} />Not quite. The correct answer is: {attrs.answer || attrs.correct}</>}
        </div>
      )}
      {attrs.explanation && revealed && (
        <p style={{ marginTop: 6, fontSize: 12, color: "var(--color-text-tertiary)", lineHeight: 1.4 }}>
          {attrs.explanation}
        </p>
      )}
    </div>
  );
});

/**
 * Parse options from body text (one per line or markdown list items).
 */
export function parseOptions(body: string): string[] {
  return body
    .split("\n")
    .map((line) => line.replace(/^[-*•]\s*/, "").trim())
    .filter(Boolean);
}

const containerStyle: React.CSSProperties = {
  margin: "8px 0",
  padding: "12px 14px",
  borderRadius: 8,
  border: "1px solid var(--color-border)",
  background: "var(--color-bg-elevated)",
};

const questionStyle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  color: "var(--color-text-primary)",
  marginBottom: 8,
  lineHeight: 1.4,
};

const optionStyle: React.CSSProperties = {
  width: "100%",
  textAlign: "left",
  padding: "8px 12px",
  border: "1px solid var(--color-border)",
  borderRadius: 6,
  fontSize: 13,
  fontFamily: "inherit",
  fontWeight: 500,
  lineHeight: 1.4,
  display: "flex",
  alignItems: "center",
  gap: 4,
  transition: "background 0.15s, border-color 0.15s",
};

export default MultipleChoice;