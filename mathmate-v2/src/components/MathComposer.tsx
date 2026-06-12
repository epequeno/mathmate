import { useEffect, useRef } from "react";
import { renderMarkdown } from "../lib/renderMarkdown";

interface MathComposerProps {
  latex: string;
  visible: boolean;
}

/** Live KaTeX preview panel that sits above the chat input */
export default function MathComposer({ latex, visible }: MathComposerProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!visible || !latex.trim() || !el) return;

    try {
      // Input is already debounced upstream (useDebounce in ChatPage)
      el.innerHTML = renderMarkdown(latex);
    } catch {
      el.innerHTML = latex;
    }
  }, [latex, visible]);

  if (!visible || !latex.trim()) return null;

  return (
    <div
      style={{
        padding: "8px 10px",
        margin: "0 16px",
        background: "var(--color-surface)",
        borderRadius: "var(--radius-card)",
        borderBottom: "1px solid var(--color-border)",
        minHeight: 32,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "auto",
        fontSize: 14,
      }}
    >
      <div
        ref={containerRef}
        style={{
          width: "100%",
          textAlign: "center",
        }}
      >
        {latex}
      </div>
    </div>
  );
}
