import { useMemo, useCallback } from "react";
import { Brain } from "lucide-react";
import { renderMarkdown } from "../../lib/renderMarkdown";
import { sanitize } from "../../lib/sanitize";
import { extractInteractiveSegments } from "../../lib/interactiveSegments";
import type { Message, MessageSegment } from "../../lib/types";
import { adaptLegacyMessage } from "../../lib/types";
import VizRenderer from "../Visualization/VizRenderer";
import QuizRenderer from "../Quiz/QuizRenderer";
import { ErrorBoundary } from "../ErrorBoundary";
import type { VizSegment, QuizSegment } from "../../lib/interactiveSegments";
import { generateHintLadder } from "../../lib/hintLadder";
import { ProcessBlock } from "./ProcessBlock";
import { HintLadderWidget } from "./HintLadderWidget";
import { VaultChips } from "./VaultChips";
import CritiqueCard from "./CritiqueCard";
import styles from "./AssistantBubble.module.css";

interface AssistantBubbleProps {
  message: Message;
  isStreaming?: boolean;
  streamedText?: string;
  streamedThinking?: string;
  streamSegments?: MessageSegment[];
  timelineEnabled: boolean;
}

function ContentSegment({ text, isStreaming }: { text: string; isStreaming?: boolean }) {
  const segments = useMemo(() => extractInteractiveSegments(text), [text]);

  return (
    <div className={styles.contentSegment}>
      <div className="markdown-body">
        {segments.map((seg, i) => {
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
        {isStreaming && <LoadingDots />}
      </div>
    </div>
  );
}

export function AssistantBubble({
  message,
  isStreaming,
  streamedText,
  streamedThinking,
  streamSegments,
  timelineEnabled,
}: AssistantBubbleProps) {
  const effectiveSegments = useMemo(() => {
    if (!timelineEnabled) return [];
    if (isStreaming && streamSegments && streamSegments.length > 0) return streamSegments;
    return adaptLegacyMessage(message);
  }, [isStreaming, streamSegments, message, timelineEnabled]);

  const hasSegments = effectiveSegments.length > 0;

  // Separate hint-ladder and proof-critique segments from the rest (Phase 16A/D)
  const hintLadderSegments = useMemo(
    () => effectiveSegments.filter((s): s is Extract<MessageSegment, { type: "hint-ladder" }> => s.type === "hint-ladder"),
    [effectiveSegments],
  );
  const critiqueSegments = useMemo(
    () => effectiveSegments.filter((s): s is Extract<MessageSegment, { type: "proof-critique" }> => s.type === "proof-critique"),
    [effectiveSegments],
  );
  const processSegments = useMemo(
    () => effectiveSegments.filter((s) => s.type !== "content" && s.type !== "hint-ladder" && s.type !== "proof-critique"),
    [effectiveSegments],
  );
  const contentSegments = useMemo(
    () => effectiveSegments.filter((s) => s.type === "content"),
    [effectiveSegments],
  );

  // ─── Hint-ladder event handlers ───────────────────────────────────
  const handleHintLadderUpdate = useCallback(
    (updated: Partial<Extract<MessageSegment, { type: "hint-ladder" }>>) => {
      // Persist updated segment state. The message is already in the session,
      // so we update locally. In production, this would trigger a session save.
      // For now, the segment lives in session memory via the message's segments array.
      const idx = message.segments.findIndex((s) => s.id === hintLadderSegments[0]?.id);
      if (idx >= 0) {
        message.segments[idx] = { ...message.segments[idx], ...updated } as MessageSegment;
      }
    },
    [message, hintLadderSegments],
  );

  const handleGenerateHints = useCallback(
    async (problem: string, attempt: string): Promise<string[]> => {
      const store = (await import("../../stores/chatStore")).useChatStore.getState();
      const model = store.model || store.currentSession?.header.model || "";
      const providerName = store.provider || store.currentSession?.header.provider || "";
      const configStore = (await import("../../stores/configStore")).useConfigStore.getState();
      const provider = configStore.providers.find((p) => p.name === providerName) ?? configStore.providers[0];

      if (!provider) {
        throw new Error("No API provider configured");
      }

      const result = await generateHintLadder(problem, attempt, model, provider);
      return result.hints;
    },
    [],
  );

  const handleHintOutcome = useCallback(
    (solved: boolean, hintsUsed: number) => {
      // Save outcome to the session header via parent
      import("../../stores/chatStore").then(({ useChatStore }) => {
        const store = useChatStore.getState();
        const sid = store.currentSession?.header.id;
        if (sid) {
          import("../../lib/api").then(({ Sessions }) => {
            Sessions.updateHintOutcome(sid, hintsUsed, solved).catch((err: any) =>
              console.error("Failed to save hint outcome:", err),
            );
          });
        }
      });
    },
    [],
  );

  const textParts = message.content.filter((p) => p.type === "text");
  const imageParts = message.content.filter((p) => p.type === "image");

  const displayText = isStreaming
    ? streamedText || ""
    : textParts.map((p) => p.text ?? "").join("\n");

  const legacyThinking = message.flags && typeof message.flags.thinking === "string" ? message.flags.thinking : "";
  const hasThinking = !!(message.thinking || legacyThinking || streamedThinking);
  const thinkingContent = streamedThinking || message.thinking || legacyThinking || "";

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

      {/* Segment-based timeline rendering */}
      {hasSegments ? (
        <div style={{ width: "100%" }}>
          <ProcessBlock segments={processSegments} isStreaming={isStreaming} />
          
          {/* Hint-ladder widget (Phase 16A) */}
          {hintLadderSegments.map((seg) => (
            <HintLadderWidget
              key={seg.id}
              segment={seg}
              onUpdate={handleHintLadderUpdate}
              onGenerateHints={handleGenerateHints}
              onOutcome={handleHintOutcome}
            />
          ))}
          
          {/* Proof-critique card (Phase 16D) */}
          {critiqueSegments.map((seg) => (
            <CritiqueCard
              key={seg.id}
              segment={seg}
              onRequestHint={(location, issue) => {
                // Open hint ladder / chat with the gap context
                import("../../stores/chatStore").then(({ useChatStore }) => {
                  const store = useChatStore.getState();
                  store.setInputText(`Can you give me a hint about: ${location} — ${issue}`);
                });
              }}
            />
          ))}
          
          {/* Content segments */}
          {contentSegments.map((seg) => (
            <ContentSegment
              key={seg.id}
              text={(seg as Extract<typeof seg, { type: "content" }>).text}
              isStreaming={isStreaming}
            />
          ))}
        </div>
      ) : (
        <>
          {/* Thinking trace (legacy path) */}
          {hasThinking && thinkingContent &&
           !effectiveSegments.some((s) => s.type === "thinking") && (
            <details className={styles.thinkingDetails}>
              <summary className={styles.thinkingSummary}>
                <span style={{ opacity: 0.7, display: "inline-flex", alignItems: "center", marginRight: 4 }}>
                  <Brain size={12} />
                </span>{" "}
                Thinking trace
              </summary>
              <div className={styles.thinkingBody}>{thinkingContent}</div>
            </details>
          )}

          {/* Vault chips */}
          <VaultChips
            message={message}
            effectiveSegments={effectiveSegments}
            hasSegments={hasSegments}
          />

          {/* Legacy fallback content */}
          <div className={styles.contentBubble}>
            {displayText ? (
              <div className="markdown-body">
                {extractInteractiveSegments(displayText).map((seg, i) => {
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
            ) : isStreaming ? (
              <span style={{ opacity: 0.5 }}><LoadingDots /></span>
            ) : null}
          </div>
        </>
      )}
    </>
  );
}

function LoadingDots() {
  return (
    <span className={styles.loadingDotsWrap}>
      <span className="loading-dot" />
      <span className="loading-dot" style={{ animationDelay: "0.15s" }} />
      <span className="loading-dot" style={{ animationDelay: "0.3s" }} />
    </span>
  );
}
