/**
 * ChatMessage — shell component
 *
 * Composes UserBubble, AssistantBubble, ToolResultBubble, and the lightbox portal.
 * All rendering logic lives in the sub-components under ./chat/.
 */
import { memo, useRef, useEffect, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { useConfigStore } from "../../stores/configStore";
import type { Message } from "../../lib/types";
import { cx } from "../../lib/clsx";
import { UserBubble } from "./UserBubble";
import { AssistantBubble } from "./AssistantBubble";
import { ToolResultBubble } from "./ToolResultBubble";
import styles from "./ChatMessage.module.css";

interface ChatMessageProps {
  message: Message;
  isStreaming?: boolean;
  streamedText?: string;
  streamedThinking?: string;
  /** Live segments during streaming */
  streamSegments?: MessageSegment[];
}

type MessageSegment = import("../../lib/types").MessageSegment;

const ChatMessage = memo(function ChatMessage({
  message,
  isStreaming,
  streamedText,
  streamedThinking,
  streamSegments,
}: ChatMessageProps) {
  const isUser = message.role === "user";
  const isToolResult = message.role === "tool";
  const isAssistant = message.role === "assistant";
  const timelineEnabled = useConfigStore((s) => s.timelineEnabled);

  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const openLightbox = useCallback((src: string) => setLightboxSrc(src), []);
  const closeLightbox = useCallback(() => setLightboxSrc(null), []);

  // Close lightbox on Escape
  useEffect(() => {
    if (!lightboxSrc) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") closeLightbox(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [lightboxSrc, closeLightbox]);

  // Extract image parts for lightbox (user messages only)
  const imageParts = message.content.filter((p) => p.type === "image");

  return (
    <>
      <div
        role="log"
        aria-label={isUser ? "Your message" : "Assistant message"}
        className={cx(
          styles.messageRow,
          isUser ? styles.user : styles.assistant,
        )}
      >
        <div className={cx(styles.messageBubble, !isUser && styles.fullWidth)}>
          {/* Role label */}
          <div
            className={cx(
              styles.roleLabel,
              isUser ? styles.roleLabelUser : styles.roleLabelAssistant,
            )}
          >
            {isUser ? "You" : "MathMate"}
          </div>

          {/* Message content by role */}
          {isUser && <UserBubble message={message} />}
          {isAssistant && (
            <AssistantBubble
              message={message}
              isStreaming={isStreaming}
              streamedText={streamedText}
              streamedThinking={streamedThinking}
              streamSegments={streamSegments}
              timelineEnabled={timelineEnabled}
            />
          )}
          {isToolResult && <ToolResultBubble message={message} />}

          {/* Streaming placeholder when no text yet */}
          {isAssistant && isStreaming && !streamedText && (
            <div className={styles.streamingPlaceholder}>
              <LoadingDots />
            </div>
          )}
        </div>
      </div>

      {/* Lightbox portal */}
      {lightboxSrc && createPortal(
        <div onClick={closeLightbox} className={styles.lightboxOverlay}>
          <img
            src={lightboxSrc}
            alt="Full size"
            onClick={(e) => e.stopPropagation()}
            className={styles.lightboxImg}
          />
          <button onClick={closeLightbox} className={styles.lightboxClose}>
            ×
          </button>
        </div>,
        document.body,
      )}
    </>
  );
});

function LoadingDots() {
  return (
    <span className={styles.loadingDotsWrap}>
      <span className="loading-dot" />
      <span className="loading-dot" style={{ animationDelay: "0.15s" }} />
      <span className="loading-dot" style={{ animationDelay: "0.3s" }} />
    </span>
  );
}

export { ChatMessage };
export default ChatMessage;