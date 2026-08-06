import { memo } from "react";
import MultipleChoice, { parseOptions } from "./MultipleChoice";
import FreeResponse from "./FreeResponse";
import ProgressiveHint, { parseHints } from "./ProgressiveHint";
import type { QuizSegment } from "../../lib/interactiveSegments";

interface QuizRendererProps {
  segment: QuizSegment;
}

/**
 * Routes quiz segments to the appropriate interactive component.
 */
const QuizRenderer = memo(function QuizRenderer({ segment }: QuizRendererProps) {
  const { kind, attrs, body } = segment;
  const question = attrs.question || "";

  switch (kind) {
    case "multiple-choice": {
      const options = attrs.options
        ? attrs.options.split("|").map((s) => s.trim()).filter(Boolean)
        : parseOptions(body);
      return <MultipleChoice question={question} options={options} attrs={attrs} />;
    }

    case "free-response":
      return <FreeResponse question={question} attrs={attrs} />;

    case "progressive-hint": {
      const hints = attrs.hints
        ? attrs.hints.split("|").map((s) => s.trim()).filter(Boolean)
        : parseHints(body);
      return <ProgressiveHint question={question} hints={hints} attrs={attrs} />;
    }

    default:
      return (
        <div
          style={{
            padding: "10px 14px",
            margin: "8px 0",
            borderRadius: 8,
            border: "1px dashed var(--color-border)",
            background: "var(--color-surface)",
            fontSize: 12,
            color: "var(--color-text-tertiary)",
            textAlign: "center",
          }}
        >
          Unknown quiz type: {kind}
        </div>
      );
  }
});

export default QuizRenderer;