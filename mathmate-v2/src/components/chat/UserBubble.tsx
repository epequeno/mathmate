import { useMemo } from "react";
import { extractInteractiveSegments } from "../../lib/interactiveSegments";
import { renderMarkdown } from "../../lib/renderMarkdown";
import { sanitize } from "../../lib/sanitize";
import type { Message } from "../../lib/types";
import VizRenderer from "../Visualization/VizRenderer";
import QuizRenderer from "../Quiz/QuizRenderer";
import { ErrorBoundary } from "../ErrorBoundary";
import type { VizSegment, QuizSegment } from "../../lib/interactiveSegments";
import styles from "./UserBubble.module.css";

interface UserBubbleProps {
  message: Message;
}

export function UserBubble({ message }: UserBubbleProps) {
  const textParts = message.content.filter((p) => p.type === "text");
  const imageParts = message.content.filter((p) => p.type === "image");
  const displayText = textParts.map((p) => p.text ?? "").join("\n");
  const segments = useMemo(() => extractInteractiveSegments(displayText), [displayText]);

  return (
    <>
      {/* Image parts */}
      {imageParts.length > 0 && (
        <div className={styles.imageStrip}>
          {imageParts.map((img, i) => {
            const src = img.data
              ? `data:${img.mime || "image/jpeg"};base64,${img.data}`
              : img.url || null;
            return src ? (
              <img key={i} src={src} alt="Attached image" className={styles.thumbnail} />
            ) : null;
          })}
        </div>
      )}

      {/* Content */}
      <div className={styles.bubble}>
        <div className="markdown-body">
          {displayText && segments.map((seg, i) => {
            if (seg.type === "html") {
              return (
                <div
                  key={i}
                  dangerouslySetInnerHTML={{
                    __html: sanitize(renderMarkdown((seg as any).html)),
                  }}
                />
              );
            }
            if (seg.type === "viz") {
              return <ErrorBoundary key={i}><VizRenderer segment={seg as VizSegment} /></ErrorBoundary>;
            }
            if (seg.type === "quiz") {
              return <ErrorBoundary key={i}><QuizRenderer segment={seg as QuizSegment} /></ErrorBoundary>;
            }
            return null;
          })}
        </div>
      </div>
    </>
  );
}
