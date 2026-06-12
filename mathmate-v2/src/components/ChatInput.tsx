import { useRef, useEffect, useState, useCallback } from "react";
import { useChatStore } from "../stores/chatStore";
import { getCommands } from "../stores/commandStore";
import { useProjectStore } from "../stores/projectStore";
import LaTeXPalette from "./LaTeXPalette";
import RecentImagesPanel from "./RecentImagesPanel";
import { Files } from "../lib/api";

interface ChatInputProps {
  onToggleContextPanel?: () => void;
}

export default function ChatInput({ onToggleContextPanel: _onToggleContextPanel }: ChatInputProps) {
  const inputText = useChatStore((s) => s.inputText);
  const setInputText = useChatStore((s) => s.setInputText);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const cancelStream = useChatStore((s) => s.cancelStream);
  const streaming = useChatStore((s) => s.streaming);
  const pendingImages = useChatStore((s) => s.pendingImages);
  const attachImage = useChatStore((s) => s.attachImage);
  const removePendingImage = useChatStore((s) => s.removePendingImage);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showCommands, setShowCommands] = useState(false);
  const [showLaTeX, setShowLaTeX] = useState(false);
  const [showRecentImages, setShowRecentImages] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [attachError, setAttachError] = useState<string | null>(null);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, 200) + "px";
    }
  }, [inputText]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const val = e.target.value;
      setInputText(val);
      if (val === "/") setShowCommands(true);
      else if (showCommands && !val.startsWith("/")) setShowCommands(false);
    },
    [setInputText, showCommands]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (streaming) cancelStream();
        else {
          sendMessage();
          setShowCommands(false);
          const el = textareaRef.current;
          if (el) el.style.height = "auto";
        }
      }
      if (e.key === "Escape") {
        if (showCommands) setShowCommands(false);
        else if (showLaTeX) setShowLaTeX(false);
        else if (streaming) cancelStream();
      }
    },
    [streaming, sendMessage, cancelStream, showCommands, showLaTeX]
  );

  const handleCommandSelect = useCallback(
    (cmd: string) => {
      setInputText(`/${cmd} `);
      setShowCommands(false);
      textareaRef.current?.focus();
    },
    [setInputText]
  );

  const handleAttachImage = useCallback(async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({
        multiple: true,
        filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "gif", "webp"] }],
      });
      if (!selected) return;
      const paths = Array.isArray(selected) ? selected : [selected as string];
      for (const path of paths) {
        // Use read_user_selected_file — no path-scope check needed since
        // the user explicitly picked this file via the OS dialog.
        const b64 = await Files.readBase64(path);
        const ext = path.split(".").pop()?.toLowerCase() ?? "png";
        const mime = ext === "jpg" ? "image/jpeg" : ext === "webp" ? "image/webp" : `image/${ext}`;
        attachImage(b64, mime);
      }
    } catch (err) {
      console.error("Failed to attach image:", err);
      setAttachError("Could not load image. Please try again.");
      setTimeout(() => setAttachError(null), 3500);
    }
  }, [attachImage]);

  const handleLatexInsert = useCallback(
    (latex: string) => {
      const current = useChatStore.getState().inputText;
      const ta = textareaRef.current;
      if (ta) {
        const start = ta.selectionStart;
        const end = ta.selectionEnd;
        const before = current.substring(0, start);
        const after = current.substring(end);
        const insert = `\\(${latex}\\)`;
        setInputText(before + insert + after);
        setTimeout(() => {
          ta.focus();
          const pos = before.length + insert.length;
          ta.setSelectionRange(pos, pos);
        }, 0);
      } else {
        setInputText(current + (current ? " " : "") + `\\(${latex}\\)`);
      }
    },
    [setInputText]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => setDragOver(false), []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOver(false);
      const files = Array.from(e.dataTransfer.files).filter((f) =>
        ["image/png", "image/jpeg", "image/gif", "image/webp"].includes(f.type)
      );
      if (files.length === 0) return;
      for (const file of files) {
        const reader = new FileReader();
        const b64 = await new Promise<string>((resolve, reject) => {
          reader.onload = () => resolve((reader.result as string).split(",")[1]);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        attachImage(b64, file.type);
      }
    },
    [attachImage]
  );

  const canSend = !streaming && (inputText.trim().length > 0 || pendingImages.length > 0);
  const commands = getCommands();

  return (
    <>
      {showLaTeX && (
        <LaTeXPalette onInsert={handleLatexInsert} onClose={() => setShowLaTeX(false)} />
      )}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        style={{
          borderTop: "1px solid var(--color-border)",
          padding: "16px 20px",
          background: "var(--color-bg-elevated)",
          position: "relative",
        }}
      >
        {/* Recent images panel — must live inside the position:relative container */}
        {showRecentImages && (
          <RecentImagesPanel
            onAttach={(b64, mime) => { attachImage(b64, mime); }}
            onClose={() => setShowRecentImages(false)}
            onBrowse={() => { setShowRecentImages(false); handleAttachImage(); }}
          />
        )}

        {/* Drag-over overlay */}
        {dragOver && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "var(--color-accent-subtle)",
              border: "2px dashed var(--color-accent)",
              borderRadius: 8,
              zIndex: 10,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 14,
              fontWeight: 600,
              color: "var(--color-accent-light)",
              pointerEvents: "none",
            }}
          >
            Drop images here
          </div>
        )}

        {/* Slash command popup */}
        {showCommands && (
          <div
            style={{
              position: "absolute",
              bottom: "100%",
              left: 20,
              right: 20,
              marginBottom: 4,
              background: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: 10,
              boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "8px 12px 4px",
                fontSize: 10,
                fontWeight: 600,
                color: "var(--color-text-tertiary)",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}
            >
              Commands
            </div>
            {commands.map((cmd) => (
              <div
                key={cmd.name}
                onClick={() => handleCommandSelect(cmd.name)}
                style={{
                  padding: "8px 12px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  fontSize: 13,
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--color-hover)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
              >
                <span>
                  <code style={{ fontWeight: 600, color: "var(--color-accent-light)", marginRight: 8 }}>
                    /{cmd.name}
                  </code>
                  <span style={{ color: "var(--color-text-secondary)" }}>{cmd.description}</span>
                </span>
                <span style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>{cmd.usage}</span>
              </div>
            ))}
          </div>
        )}

        {/* Image thumbnail strip */}
        {pendingImages.length > 0 && (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
              marginBottom: 10,
            }}
          >
            {pendingImages.map((img, i) => (
              <div
                key={i}
                style={{
                  position: "relative",
                  width: 64,
                  height: 64,
                  borderRadius: 8,
                  overflow: "visible",
                  flexShrink: 0,
                }}
              >
                <img
                  src={`data:${img.mime};base64,${img.data}`}
                  alt={`Attachment ${i + 1}`}
                  style={{
                    width: 64,
                    height: 64,
                    objectFit: "cover",
                    borderRadius: 8,
                    border: "1px solid var(--color-border)",
                    display: "block",
                  }}
                />
                <button
                  onClick={() => removePendingImage(i)}
                  title="Remove image"
                  style={{
                    position: "absolute",
                    top: -6,
                    right: -6,
                    width: 18,
                    height: 18,
                    borderRadius: "50%",
                    border: "none",
                    background: "var(--color-text-secondary)",
                    color: "var(--color-bg-elevated)",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 11,
                    fontWeight: 700,
                    lineHeight: 1,
                    padding: 0,
                  }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Input pill */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            gap: 0,
            background: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: 12,
            padding: "4px 4px 4px 8px",
          }}
        >
          {/* Image attach button — opens recent images panel */}
          <button
            onClick={() => setShowRecentImages((v) => !v)}
            title="Attach image"
            style={{
              ...iconInputBtn,
              color: showRecentImages ? "var(--color-accent-light)" : "var(--color-text-tertiary)",
              background: showRecentImages ? "var(--color-accent-subtle)" : "none",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M2 12.5l3.5-4 2.5 3 2-2.5 4 5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
              <rect x="2" y="2" width="12" height="11" rx="2" stroke="currentColor" strokeWidth="1.2"/>
              <circle cx="5.5" cy="5.5" r="1" fill="currentColor"/>
            </svg>
          </button>

          {/* LaTeX button */}
          <button
            onClick={() => setShowLaTeX(true)}
            title="Insert LaTeX (⌘\\)"
            style={iconInputBtn}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <text x="1" y="13" style={{ font: "bold 12px Georgia, serif", fill: "currentColor" }}>∑</text>
            </svg>
          </button>

          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={inputText}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder="Ask a math question…"
            rows={1}
            style={{
              flex: 1,
              border: "none",
              background: "transparent",
              color: "var(--color-text-primary)",
              fontSize: 14,
              fontFamily: "inherit",
              outline: "none",
              resize: "none",
              padding: "8px 6px",
              minHeight: 28,
              maxHeight: 200,
              lineHeight: 1.5,
            }}
          />

          {/* Send / Stop button */}
          <button
            onClick={streaming ? cancelStream : sendMessage}
            title={streaming ? "Stop (Esc)" : "Send (↩)"}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 32,
              height: 32,
              borderRadius: 8,
              border: "none",
              background: streaming ? "var(--color-red)" : canSend ? "var(--color-accent)" : "var(--color-border)",
              color: "#fff",
              cursor: canSend || streaming ? "pointer" : "default",
              flexShrink: 0,
              margin: "4px 4px 4px 0",
              transition: "background 0.15s",
            }}
          >
            {streaming ? (
              <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                <rect x="2" y="2" width="8" height="8" rx="1.5"/>
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M7 11V3M3 7l4-4 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
          </button>
        </div>

        {/* Attach error toast */}
        {attachError && (
          <div style={{ fontSize: 11, color: "var(--color-red, #ef4444)", marginTop: 6, textAlign: "center" }}>
            {attachError}
          </div>
        )}

        {/* Bottom disclaimer */}
        <div
          style={{
            fontSize: 11,
            color: "var(--color-text-tertiary)",
            marginTop: 8,
            textAlign: "center",
          }}
        >
          MathMate can make mistakes. Verify important results.
        </div>
      </div>
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const iconInputBtn: React.CSSProperties = {
  background: "none",
  border: "none",
  cursor: "pointer",
  color: "var(--color-text-tertiary)",
  padding: "6px 6px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
  borderRadius: 6,
  transition: "color 0.1s",
};
