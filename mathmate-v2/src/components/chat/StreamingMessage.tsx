import type { Message, MessageSegment } from "../../lib/types";
import { AssistantBubble } from "./AssistantBubble";
import styles from "./StreamingMessage.module.css";

interface StreamingMessageProps {
  streamedText: string;
  streamedThinking: string;
  streamSegments: MessageSegment[];
  timelineEnabled: boolean;
}

/**
 * StreamingMessage renders the fused live output during an active streaming turn.
 * It composes the live streamed text + thinking + segment accumulation into a
 * single assistant bubble display.
 */
export function StreamingMessage({
  streamedText,
  streamedThinking,
  streamSegments,
  timelineEnabled,
}: StreamingMessageProps) {
  // Use a minimal placeholder message — streaming content is driven by the
  // streamedText/streamedThinking/streamSegments props, not message.content
  const placeholderMessage: Message = {
    role: "assistant",
    content: [],
    segments: [],
    id: "",
    created_at: "",
  };

  return (
    <div className={styles.container}>
      <AssistantBubble
        message={placeholderMessage}
        isStreaming={true}
        streamedText={streamedText}
        streamedThinking={streamedThinking}
        streamSegments={streamSegments}
        timelineEnabled={timelineEnabled}
      />
    </div>
  );
}