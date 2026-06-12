import { useState, memo } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { safeEvalNumberOrNaN } from "../../lib/safeMath";

interface FreeResponseProps {
  question?: string;
  attrs: Record<string, string>;
}

/**
 * Interactive free-response quiz card.
 * User types an answer and submits to compare with the expected answer.
 * Uses fuzzy matching for math expressions.
 */
const FreeResponse = memo(function FreeResponse({
  question,
  attrs,
}: FreeResponseProps) {
  const correctAnswer = (attrs.answer || "").trim();
  const [input, setInput] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [result, setResult] = useState<"correct" | "incorrect" | null>(null);

  const handleSubmit = () => {
    const trimmed = input.trim();
    if (!trimmed || !correctAnswer) return;

    const isCorrect = fuzzyMathMatch(trimmed, correctAnswer);
    setResult(isCorrect ? "correct" : "incorrect");
    setSubmitted(true);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

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
      <div style={{ display: "flex", gap: 6 }}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={submitted}
          placeholder="Type your answer..."
          style={{
            flex: 1,
            padding: "7px 10px",
            borderRadius: 6,
            border: "1px solid var(--color-border)",
            background: "var(--color-surface)",
            color: "var(--color-text-primary)",
            fontSize: 13,
            fontFamily: "'SF Mono', Menlo, Monaco, monospace",
            outline: "none",
          }}
        />
        {!submitted && (
          <button
            onClick={handleSubmit}
            disabled={!input.trim()}
            style={{
              padding: "7px 14px",
              borderRadius: 6,
              border: "none",
              background: "var(--color-accent)",
              color: "#fff",
              fontSize: 12,
              fontWeight: 600,
              fontFamily: "inherit",
              cursor: input.trim() ? "pointer" : "default",
              opacity: input.trim() ? 1 : 0.5,
            }}
          >
            Check
          </button>
        )}
      </div>
      {submitted && (
        <div
          style={{
            marginTop: 8,
            padding: "6px 10px",
            borderRadius: 6,
            fontSize: 12,
            background:
              result === "correct"
                ? "rgba(34,197,94,0.10)"
                : "rgba(239,68,68,0.08)",
            color:
              result === "correct"
                ? "rgb(22,163,74)"
                : "rgb(220,38,38)",
          }}
        >
          {result === "correct"
            ? <><CheckCircle2 size={14} style={{ marginRight: 4, verticalAlign: "middle" }} />Correct!</>
            : <><XCircle size={14} style={{ marginRight: 4, verticalAlign: "middle" }} />Not quite. Expected: {correctAnswer}</>}
        </div>
      )}
      {attrs.explanation && submitted && (
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
 * Fuzzy math answer matching.
 * Normalizes whitespace, removes extra parentheses, handles common variations.
 */
function fuzzyMathMatch(userAnswer: string, correctAnswer: string): boolean {
  const normalize = (s: string) =>
    s
      .replace(/\s+/g, " ")
      .replace(/\s*([+\-*/=()])\s*/g, "$1")
      .replace(/×/g, "*")
      .replace(/÷/g, "/")
      .replace(/π/g, "pi")
      .toLowerCase()
      .trim();

  const user = normalize(userAnswer);
  const correct = normalize(correctAnswer);

  // Direct match
  if (user === correct) return true;

  // Try evaluating both as numeric expressions using safe math
  const userVal = safeEvalNumberOrNaN(user);
  const correctVal = safeEvalNumberOrNaN(correct);
  if (
    !isNaN(userVal) &&
    !isNaN(correctVal) &&
    Math.abs(userVal - correctVal) < 1e-6
  ) {
    return true;
  }

  return false;
}

export default FreeResponse;