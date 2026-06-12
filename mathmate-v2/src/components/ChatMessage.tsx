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
import { Brain, Loader2, ChevronDown, ChevronRight, FileText, Bookmark, Save, CheckCircle } from "lucide-react";
import { ProcessBlock } from "./chat/ProcessBlock";
import { useConfigStore } from "../stores/configStore";
import { useVaultStore } from "../stores/vaultStore";
import { useProjectStore } from "../stores/projectStore";
import { useChatStore } from "../stores/chatStore";

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
  // Phase 12C: Feature flag controls timeline vs legacy rendering
  const timelineEnabled = useConfigStore((s) => s.timelineEnabled);

  // Use streamSegments during live streaming, otherwise adapt from message
  const effectiveSegments = useMemo(() => {
    if (!timelineEnabled) return []; // Force legacy when flag is off
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
      style={{
        display: "flex",
        justifyContent: isUser ? "flex-end" : "flex-start",
        marginBottom: 8,
      }}
    >
      <div
        style={{
          maxWidth: isUser ? "76%" : "100%",
          minWidth: 0,
          width: isUser ? undefined : "100%",
        }}
      >
        {/* Role label */}
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: isUser ? "var(--color-accent)" : "var(--color-text-secondary)",
            marginBottom: 4,
            paddingLeft: isUser ? 0 : 2,
            textAlign: isUser ? "right" : "left",
          }}
        >
          {isUser ? "You" : "MathMate"}
        </div>

        {/* Thinking trace (collapsible) — legacy path, shown when segments
             carry no thinking entry (e.g. very old pre-Phase 12 sessions) */}
        {isAssistant && hasThinking && thinkingContent &&
         !effectiveSegments.some((s) => s.type === "thinking") && (
          <details
            style={{
              marginBottom: 6,
              fontSize: 13,
              color: "var(--color-text-tertiary)",
            }}
          >
            <summary
              style={{
                cursor: "pointer",
                fontWeight: 500,
                padding: "2px 0",
                userSelect: "none",
              }}
            >
              <span style={{ opacity: 0.7, display: "inline-flex", alignItems: "center", marginRight: 4 }}><Brain size={12} /></span> Thinking trace
            </summary>
            <div
              style={{
                marginTop: 6,
                padding: "8px 12px",
                background: "var(--color-surface)",
                borderRadius: 6,
                fontSize: 12,
                lineHeight: 1.4,
                color: "var(--color-text-secondary)",
                whiteSpace: "pre-wrap",
                fontFamily: "'SF Mono', Menlo, Monaco, monospace",
              }}
            >
              {thinkingContent}
            </div>
          </details>
        )}

        {/* Image parts — thumbnails, click to expand */}
        {imageParts.length > 0 && (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 6,
              justifyContent: isUser ? "flex-end" : "flex-start",
              marginBottom: displayText ? 6 : 0,
            }}
          >
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
                  style={{
                    maxWidth: 260,
                    maxHeight: 200,
                    borderRadius: 10,
                    border: "1px solid var(--color-border)",
                    objectFit: "contain",
                    display: "block",
                    cursor: "zoom-in",
                    background: "var(--color-surface)",
                  }}
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
              style={{
                padding: isStreaming && !displayText ? 0 : isUser ? "10px 16px" : "6px 0",
                borderRadius: isUser ? "16px 16px 4px 16px" : 0,
                background: isUser ? "var(--color-user-bubble)" : "transparent",
                color: isUser ? "var(--color-user-text)" : "var(--color-text-primary)",
                fontSize: 14,
                lineHeight: 1.55,
                wordBreak: "break-word",
                overflowWrap: "break-word",
                border: "none",
                overflowX: "auto",
              }}
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
              <div
                style={{
                  padding: "10px 14px",
                  borderRadius: 12,
                  background: "var(--color-bg-elevated)",
                  border: "1px solid var(--color-border)",
                  fontSize: 14,
                  color: "var(--color-text-secondary)",
                }}
              >
                <LoadingDots />
              </div>
            )}
          </>
        </div>}
      </div>
    </div>
    {/* Lightbox */}
    {lightboxSrc && createPortal(
      <div
        onClick={closeLightbox}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 9999,
          background: "rgba(0,0,0,0.85)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "zoom-out",
        }}
      >
        <img
          src={lightboxSrc}
          alt="Full size"
          onClick={(e) => e.stopPropagation()}
          style={{
            maxWidth: "90vw",
            maxHeight: "90vh",
            borderRadius: 12,
            boxShadow: "0 8px 48px rgba(0,0,0,0.6)",
            objectFit: "contain",
            cursor: "default",
          }}
        />
        <button
          onClick={closeLightbox}
          style={{
            position: "fixed",
            top: 20,
            right: 24,
            background: "rgba(255,255,255,0.15)",
            border: "none",
            borderRadius: "50%",
            width: 36,
            height: 36,
            color: "#fff",
            fontSize: 20,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
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

  // Extract vault tool results from segments
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

  // Quick save popover state
  const [showSave, setShowSave] = useState(false);
  const [saveTitle, setSaveTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedPath, setSavedPath] = useState<string | null>(null);

  // Extract text content from message
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
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
          {vaultResults.map((vr, i) => (
            <button
              key={i}
              onClick={() => handleNavigate(vr.path)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                padding: "3px 8px",
                borderRadius: 4,
                fontSize: 11,
                border: "1px solid var(--color-border)",
                background: "var(--color-surface)",
                color: "var(--color-text-secondary)",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--color-accent-subtle)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--color-surface)"; }}
            >
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
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            marginTop: 4,
            padding: "3px 8px",
            borderRadius: 4,
            fontSize: 11,
            background: "rgba(34,197,94,0.1)",
            color: "rgb(34,197,94)",
          }}
        >
          <CheckCircle size={11} />
          Saved to vault
        </div>
      )}

      {/* Quick save button */}
      {synapseRunning && textContent && !showSave && !savedPath && (
        <div
          style={{ marginTop: 4 }}
          onMouseEnter={(e) => {
            const btn = e.currentTarget.querySelector("button");
            if (btn) btn.style.opacity = "1";
          }}
          onMouseLeave={(e) => {
            const btn = e.currentTarget.querySelector("button");
            if (btn) btn.style.opacity = "0";
          }}
        >
          <button
            onClick={openSavePopover}
            title="Save to vault"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: "2px 8px",
              borderRadius: 4,
              border: "1px solid var(--color-border)",
              background: "var(--color-surface)",
              color: "var(--color-text-tertiary)",
              fontSize: 10,
              cursor: "pointer",
              opacity: 0,
              transition: "opacity 0.15s",
              fontFamily: "inherit",
            }}
          >
            <Bookmark size={10} />
            Save to vault
          </button>
        </div>
      )}

      {/* Quick save popover */}
      {showSave && (
        <div
          style={{
            marginTop: 4,
            padding: "8px 10px",
            borderRadius: 6,
            border: "1px solid var(--color-border)",
            background: "var(--color-surface)",
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-secondary)" }}>
            Save to vault
          </div>
          <input
            value={saveTitle}
            onChange={(e) => setSaveTitle(e.target.value)}
            placeholder="Note title..."
            autoFocus
            style={{
              padding: "5px 8px",
              borderRadius: 4,
              border: "1px solid var(--color-border)",
              background: "var(--color-bg)",
              color: "var(--color-text-primary)",
              fontSize: 11,
              fontFamily: "inherit",
              outline: "none",
            }}
          />
          <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
            <button
              onClick={() => setShowSave(false)}
              style={{
                padding: "3px 10px",
                borderRadius: 4,
                border: "1px solid var(--color-border)",
                background: "transparent",
                color: "var(--color-text-tertiary)",
                fontSize: 11,
                fontFamily: "inherit",
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleQuickSave}
              disabled={saving || !saveTitle.trim()}
              style={{
                padding: "3px 10px",
                borderRadius: 4,
                border: "none",
                background: "var(--color-accent)",
                color: "#fff",
                fontSize: 11,
                fontFamily: "inherit",
                cursor: saving ? "default" : "pointer",
                opacity: saving || !saveTitle.trim() ? 0.6 : 1,
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
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

// ─── ContentSegment & LoadingDots (used by both segment and legacy paths) ────

function ContentSegment({ text, isStreaming }: { text: string; isStreaming?: boolean }) {
  const segments = useMemo(() => extractInteractiveSegments(text), [text]);

  return (
    <div
      style={{
        padding: "6px 0",
        fontSize: 14,
        lineHeight: 1.55,
        color: "var(--color-text-primary)",
        wordBreak: "break-word",
        overflowWrap: "break-word",
      }}
    >
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
    <span style={{ display: "inline-flex", gap: 3, alignItems: "center" }}>
      <span className="loading-dot" />
      <span className="loading-dot" style={{ animationDelay: "0.15s" }} />
      <span className="loading-dot" style={{ animationDelay: "0.3s" }} />
    </span>
  );
}