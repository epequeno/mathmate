import { memo, useRef, useEffect, useState, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { renderMarkdown } from "../lib/renderMarkdown";
import { sanitize } from "../lib/sanitize";
import { extractInteractiveSegments } from "../lib/interactiveSegments";
import VizRenderer from "./Visualization/VizRenderer";
import QuizRenderer from "./Quiz/QuizRenderer";
import { ErrorBoundary } from "./ErrorBoundary";
import type { Message, MessageSegment } from "../lib/types";
import { adaptLegacyMessage } from "../lib/types";
import type { VizSegment, QuizSegment } from "../lib/interactiveSegments";
import { Brain, Loader2, FileText, ChevronRight, Bookmark, Save, CheckCircle } from "lucide-react";
import { ProcessBlock } from "./chat/ProcessBlock";
import { useConfigStore } from "../stores/configStore";
import { useVaultStore } from "../stores/vaultStore";
import { useProjectStore } from "../stores/projectStore";
import { useChatStore } from "../stores/chatStore";
import { cx } from "../lib/clsx";
import styles from "./ChatMessage.module.css";

interface ChatMessageProps {
  message: Message;
  isStreaming?: boolean;
  streamedText?: string;
  streamedThinking?: string;
  /** Live segments during streaming (Phase 12A) */
  streamSegments?: MessageSegment[];
}

const ChatMessage = memo(function ChatMessage({ message, isStreaming, streamedText, streamedThinking, streamSegments }: ChatMessageProps) {
  const isUser = message.role === "user";
  const isAssistant = message.role === "assistant";
  const contentRef = useRef<HTMLDivElement>(null);
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

  // ─── Segment-based rendering (Phase 12A) ─────────
  const timelineEnabled = useConfigStore((s) => s.timelineEnabled);

  const effectiveSegments = useMemo(() => {
    if (!timelineEnabled) return [];
    if (isStreaming && streamSegments && streamSegments.length > 0) return streamSegments;
    return adaptLegacyMessage(message);
  }, [isStreaming, streamSegments, message, timelineEnabled]);

  const hasSegments = effectiveSegments.length > 0;

  // ─── Legacy fallback rendering ───────────────────
  const textParts = message.content.filter((p) => p.type === "text");
  const imageParts = message.content.filter((p) => p.type === "image");

  const displayText = isStreaming
    ? streamedText || ""
    : textParts.map((p) => p.text ?? "").join("\n");

  const segments = useMemo(() => extractInteractiveSegments(displayText), [displayText]);

  const legacyThinking = message.flags && typeof message.flags.thinking === "string" ? message.flags.thinking : "";
  const hasThinking = !!(message.thinking || legacyThinking || streamedThinking);
  const thinkingContent = streamedThinking || message.thinking || legacyThinking || "";

  return (
    <>
    <div
      role="log"
      aria-label={isUser ? "Your message" : "Assistant message"}
      className={cx(styles.messageRow, isUser ? styles.user : styles.assistant)}
    >
      <div className={cx(styles.messageBubble, !isUser && styles.fullWidth)}>
        {/* Role label */}
        <div className={cx(styles.roleLabel, isUser ? styles.roleLabelUser : styles.roleLabelAssistant)}>
          {isUser ? "You" : "MathMate"}
        </div>

        {/* Thinking trace (collapsible) — legacy path */}
        {isAssistant && hasThinking && thinkingContent &&
         !effectiveSegments.some((s) => s.type === "thinking") && (
          <details className={styles.thinkingDetails}>
            <summary className={styles.thinkingSummary}>
              <span style={{ opacity: 0.7, display: "inline-flex", alignItems: "center", marginRight: 4 }}><Brain size={12} /></span> Thinking trace
            </summary>
            <div className={styles.thinkingBody}>
              {thinkingContent}
            </div>
          </details>
        )}

        {/* Image parts — thumbnails, click to expand */}
        {imageParts.length > 0 && (
          <div className={cx(styles.imageStrip, isUser ? styles.user : styles.assistant)} style={{ marginBottom: displayText ? 6 : 0 }}>
            {imageParts.map((img, i) => {
              const src = img.data
                ? `data:${img.mime || "image/jpeg"};base64,${img.data}`
                : img.url || null;
              return src ? (
                <img
                  key={i}
                  src={src}
                  alt="Attached image"
                  onClick={() => openLightbox(src)}
                  className={styles.thumbnail}
                />
              ) : null;
            })}
          </div>
        )}

        {/* ─── Segment-based timeline rendering (Phase 12D: Process Block) ─── */}
        {isAssistant && hasSegments ? (
          <div style={{ width: "100%" }}>
            <ProcessBlock
              segments={effectiveSegments.filter((s) => s.type !== "content")}
              isStreaming={isStreaming}
            />
            {effectiveSegments
              .filter((s) => s.type === "content")
              .map((seg) => (
                <ContentSegment
                  key={seg.id}
                  text={(seg as Extract<typeof seg, { type: "content" }>).text}
                  isStreaming={isStreaming}
                />
              ))}
          </div>
        ) : <div>
          {/* ─── Citation chips (Phase 13C) ─── */}
          {isAssistant && !isUser && (
            <VaultChips message={message} effectiveSegments={effectiveSegments} hasSegments={hasSegments} />
          )}

          {/* ─── Legacy fallback rendering ─── */}
          <>
            {(displayText || isStreaming || !isUser) && <div
              ref={contentRef}
              className={cx(
                styles.contentBubble,
                isUser ? styles.contentBubbleUser : styles.contentBubbleAssistant,
                isStreaming && !displayText && !isUser && styles.contentBubbleEmpty
              )}
            >
              {displayText ? (
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
                </div>
              ) : isStreaming ? (
                <span style={{ opacity: 0.5 }}>
                  <LoadingDots />
                </span>
              ) : null}
            </div>}

            {/* Streaming indicator */}
            {isStreaming && !displayText && (
              <div className={styles.streamingPlaceholder}>
                <LoadingDots />
              </div>
            )}
          </>
        </div>}
      </div>
    </div>
    {/* Lightbox */}
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
      document.body
    )}
    </>
  );
});


// ─── Vault citation chips & quick save (Phase 13C) ──────────────────────────────────

function VaultChips({ message, effectiveSegments, hasSegments }: { message: Message; effectiveSegments: MessageSegment[]; hasSegments: boolean }) {
  const navigate = useNavigate();
  const synapseRunning = useProjectStore((s) => s.synapseStatus.running);

  const vaultResults = useMemo(() => {
    if (!hasSegments) return [];
    const results: { path: string; action: string; title?: string }[] = [];
    for (const seg of effectiveSegments) {
      if (seg.type !== "tool_result") continue;
      const raw = typeof seg.result === "string" ? seg.result : JSON.stringify(seg.result);
      try {
        const r = JSON.parse(raw);
        if (r?.path) {
          const action = r.bytes_written ? (r.updated ? "updated" : "created") : "read";
          results.push({ path: r.path, action, title: r.title });
        }
      } catch {
        // not JSON, skip
      }
    }
    return results.slice(0, 3);
  }, [effectiveSegments, hasSegments]);

  const handleNavigate = useCallback((path: string) => {
    useVaultStore.getState().navigateToNote(path);
    navigate("/vault");
  }, [navigate]);

  const [showSave, setShowSave] = useState(false);
  const [saveTitle, setSaveTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedPath, setSavedPath] = useState<string | null>(null);

  const textContent = useMemo(() => {
    if (hasSegments) {
      return effectiveSegments
        .filter((s) => s.type === "content")
        .map((s) => (s as Extract<MessageSegment, { type: "content" }>).text)
        .join("\n");
    }
    return message.content.filter((p) => p.type === "text").map((p) => p.text).join("\n");
  }, [message, effectiveSegments, hasSegments]);

  const handleQuickSave = async () => {
    if (!synapseRunning || !textContent) return;
    setSaving(true);
    try {
      const title = saveTitle ? saveTitle : "Quick save - " + new Date().toLocaleDateString();
      const result = await useVaultStore.getState().createNote(title, textContent);
      if (result) {
        setSavedPath(result.path);
        setShowSave(false);
        setTimeout(() => setSavedPath(null), 3000);
      }
    } catch {
      // silent
    } finally {
      setSaving(false);
    }
  };

  const openSavePopover = () => {
    const sessionTitle = useChatStore.getState().currentSession?.header.title || "Quick Save";
    setSaveTitle(sessionTitle + " - " + new Date().toLocaleDateString());
    setShowSave(true);
  };

  return (
    <>
      {/* Citation chips */}
      {vaultResults.length > 0 && (
        <div className={styles.vaultChips}>
          {vaultResults.map((vr, i) => (
            <button key={i} onClick={() => handleNavigate(vr.path)} className={styles.vaultChip}>
              <FileText size={11} />
              {vr.title ? vr.title : (vr.path.split("/").pop()?.replace(/\.md$/i, "") || "Note")}
              {" "}
              {vr.action === "created" ? "created" : vr.action === "updated" ? "updated" : ""}
              <ChevronRight size={10} />
            </button>
          ))}
        </div>
      )}

      {/* Saved confirmation */}
      {savedPath && (
        <div className={styles.savedBadge}>
          <CheckCircle size={11} />
          Saved to vault
        </div>
      )}

      {/* Quick save button */}
      {synapseRunning && textContent && !showSave && !savedPath && (
        <div className={styles.quickSaveContainer}>
          <button onClick={openSavePopover} title="Save to vault" className={styles.quickSaveBtn}>
            <Bookmark size={10} />
            Save to vault
          </button>
        </div>
      )}

      {/* Quick save popover */}
      {showSave && (
        <div className={styles.quickSavePopover}>
          <div className={styles.popoverTitle}>Save to vault</div>
          <input
            value={saveTitle}
            onChange={(e) => setSaveTitle(e.target.value)}
            placeholder="Note title..."
            autoFocus
            className={styles.popoverInput}
          />
          <div className={styles.popoverActions}>
            <button onClick={() => setShowSave(false)} className={styles.popoverCancel}>Cancel</button>
            <button
              onClick={handleQuickSave}
              disabled={saving || !saveTitle.trim()}
              className={styles.popoverSave}
            >
              {saving ? <Loader2 size={11} style={{ animation: "spin 0.8s linear infinite" }} /> : <Save size={11} />}
              Save
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export default ChatMessage;

// ─── ContentSegment & LoadingDots ──────────────────

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
        {isStreaming && <span style={{ opacity: 0.5 }}><LoadingDots /></span>}
      </div>
    </div>
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
