import { useRef, useEffect, useState, useCallback } from "react";
import { useChatStore } from "../stores/chatStore";
import { getCommands } from "../stores/commandStore";
import { useProjectStore } from "../stores/projectStore";
import LaTeXPalette from "./LaTeXPalette";
import RecentImagesPanel from "./RecentImagesPanel";
import { Files } from "../lib/api";
import { cx } from "../lib/clsx";
import styles from "./ChatInput.module.css";
import { isTurnActive } from "../lib/turn/phase";

interface ChatInputProps {
  onToggleContextPanel?: () => void;
}

export default function ChatInput({ onToggleContextPanel: _onToggleContextPanel }: ChatInputProps) {
  const inputText = useChatStore((s) => s.inputText);
  const setInputText = useChatStore((s) => s.setInputText);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const cancelStream = useChatStore((s) => s.cancelStream);
  const phase = useChatStore((s) => s.phase);
  const pendingImages = useChatStore((s) => s.pendingImages);
  const attachImage = useChatStore((s) => s.attachImage);
  const removePendingImage = useChatStore((s) => s.removePendingImage);

  const turnActive = isTurnActive(phase);
  const streaming = phase.kind === "streaming";

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
        className={styles.container}
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
          <div className={styles.dragOverlay}>
            Drop images here
          </div>
        )}

        {/* Slash command popup */}
        {showCommands && (
          <div className={styles.commandPopup}>
            <div className={styles.commandPopupHeader}>
              Commands
            </div>
            {commands.map((cmd) => (
              <div
                key={cmd.name}
                onClick={() => handleCommandSelect(cmd.name)}
                className={styles.commandItem}
              >
                <span>
                  <code className={styles.commandName}>
                    /{cmd.name}
                  </code>
                  <span className={styles.commandDesc}>{cmd.description}</span>
                </span>
                <span className={styles.commandUsage}>{cmd.usage}</span>
              </div>
            ))}
          </div>
        )}

        {/* Image thumbnail strip */}
        {pendingImages.length > 0 && (
          <div className={styles.thumbnailStrip}>
            {pendingImages.map((img, i) => (
              <div key={i} className={styles.thumbnailWrap}>
                <img
                  src={`data:${img.mime};base64,${img.data}`}
                  alt={`Attachment ${i + 1}`}
                  className={styles.thumbnailImg}
                />
                <button
                  onClick={() => removePendingImage(i)}
                  title="Remove image"
                  className={styles.thumbnailRemove}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Input pill */}
        <div className={styles.inputPill}>
          {/* Image attach button — opens recent images panel */}
          <button
            onClick={() => setShowRecentImages((v) => !v)}
            title="Attach image"
            className={cx(styles.toolBtn, showRecentImages && styles.toolBtnActive)}
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
            className={styles.toolBtn}
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
            className={styles.textarea}
          />

          {/* Send / Stop button */}
          <button
            onClick={streaming ? cancelStream : sendMessage}
            title={streaming ? "Stop (Esc)" : "Send (↩)"}
            className={cx(
              styles.sendBtn,
              streaming ? styles.sendBtnStop : canSend ? styles.sendBtnActive : styles.sendBtnInactive
            )}
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
          <div className={styles.errorToast}>{attachError}</div>
        )}

        {/* Bottom disclaimer */}
        <div className={styles.disclaimer}>
          MathMate can make mistakes. Verify important results.
        </div>
      </div>
    </>
  );
}
