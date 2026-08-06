import type { Message } from "../../lib/types";
import styles from "./ToolResultBubble.module.css";

interface ToolResultBubbleProps {
  message: Message;
}

export function ToolResultBubble({ message }: ToolResultBubbleProps) {
  const resultText = message.content
    .filter((p) => p.type === "text")
    .map((p) => p.text ?? "")
    .join("\n")
    .slice(0, 120);

  return (
    <div className={styles.bubble}>
      <span className={styles.label}>↩ Tool result</span>
      {resultText && (
        <span className={styles.preview}>
          {resultText}
          {resultText.length >= 120 ? "…" : ""}
        </span>
      )}
    </div>
  );
}
