import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useDebounce } from "../hooks/useDebounce";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";
import { useOutletContext } from "react-router-dom";
import { useChatStore } from "../stores/chatStore";
import { useProjectStore } from "../stores/projectStore";
import { useConfigStore } from "../stores/configStore";
import ChatMessage from "../components/ChatMessage";
import MemoryRetrievalBar from "../components/MemoryRetrievalBar";
import { ErrorBoundary } from "../components/ErrorBoundary";
import ChatInput from "../components/ChatInput";
import MathComposer from "../components/MathComposer";
import MigrationBanner from "../components/MigrationBanner";
import ModelSelector from "../components/ModelSelector";
import type { WrapUpResult, Message } from "../lib/types";
import { renderMarkdown } from "../lib/renderMarkdown";
import { sanitize } from "../lib/sanitize";
import { invoke } from "../lib/tauri";
import { ask } from "@tauri-apps/plugin-dialog";
import { AlertTriangle, X, Camera, Settings2 } from "lucide-react";

const TUTOR_STYLES = [
  { value: "socratic", label: "Socratic" },
  { value: "math-tutor", label: "Math Tutor" },
  { value: "explanation", label: "Explanation" },
  { value: "review", label: "Review" },
];

function extractBookTitle(path: string): string {
  const filename = path.split("/").pop() ?? path;
  return filename.replace(/\.[^.]+$/, "");
}

// ─── Chat Toolbar ─────────────────────────────────────────────────────────────
function ChatToolbar({
  onToggleContextPanel,
  contextPanelVisible,
  onOpenProjectSettings,
}: {
  onToggleContextPanel?: () => void;
  contextPanelVisible?: boolean;
  onOpenProjectSettings?: () => void;
}) {
  const currentSession = useChatStore((s) => s.currentSession);
  const renameSession = useChatStore((s) => s.renameSession);
  const model = useChatStore((s) => s.model);
  const provider = useChatStore((s) => s.provider);
  const setModel = useChatStore((s) => s.setModel);
  const setProvider = useChatStore((s) => s.setProvider);
  const currentProject = useProjectStore((s) => s.currentProject);
  const updateProject = useProjectStore((s) => s.updateProject);
  const modelCatalog = useConfigStore((s) => s.modelCatalog);

  const handleTutorStyleChange = async (style: string) => {
    if (!currentProject) return;
    await updateProject({ ...currentProject, tutor_style: style || undefined });
  };

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [showModelSelector, setShowModelSelector] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const title = currentSession?.header.title || "New Session";
  const bookPath = currentProject?.textbook_path;

  const startEdit = () => { setName(title); setEditing(true); };
  const commitEdit = async () => {
    setEditing(false);
    const trimmed = name.trim();
    if (trimmed && trimmed !== title && currentSession) {
      await renameSession(currentSession.header.id, trimmed);
    }
  };

  const handleModelSelect = (prov: string, mod: string) => {
    setProvider(prov);
    setModel(mod);
    useChatStore.getState().updateSessionHeader({ provider: prov, model: mod });
  };

  // No session: show a minimal project-scoped toolbar
  if (!currentSession) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          padding: "12px 20px",
          gap: 12,
          background: "var(--color-bg-elevated)",
          borderBottom: "1px solid var(--color-border)",
          height: 62,
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ fontSize: 16, fontWeight: 600, color: "var(--color-text-primary)", letterSpacing: "-0.01em" }}>
            {currentProject?.name ?? "MathMate"}
          </span>
          <span style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>
            Select a session from the sidebar, or start a new one
          </span>
        </div>
      </div>
    );
  }

  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          padding: "12px 20px",
          gap: 12,
          background: "var(--color-bg-elevated)",
          borderBottom: "1px solid var(--color-border)",
          height: 62,
          flexShrink: 0,
        }}
      >
        {/* Left: 2-row header — row 1: project meta, row 2: session title + context bar */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: 3, minWidth: 0 }}>

          {/* Row 1: project name · gear · book link */}
          <div style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 0 }}>
            {currentProject ? (
              <span style={{ fontSize: 11, color: "var(--color-text-tertiary)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {currentProject.name}
              </span>
            ) : (
              <span style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>MathMate</span>
            )}
            {currentProject && onOpenProjectSettings && (
              <button
                onClick={onOpenProjectSettings}
                title="Project settings"
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-text-tertiary)", display: "flex", padding: 0, opacity: 0.7 }}
              >
                <Settings2 size={10} />
              </button>
            )}
            {bookPath && (
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  // open_path contract (see lib.rs docs): paths inside project roots open
                  // immediately; paths outside roots require confirmed:true after a user dialog.
                  invoke("open_path", { path: bookPath, projectId: currentProject?.id, confirmed: false }).catch(async (err) => {
                    if (!String(err).includes("outside allowed roots")) return;
                    const confirmed = await ask(`Open this file outside the current project roots?\n\n${bookPath}`, {
                      title: "Open External File",
                      kind: "warning",
                    });
                    if (confirmed) {
                      await invoke("open_path", { path: bookPath, projectId: currentProject?.id, confirmed: true }).catch(() => {});
                    }
                  });
                }}
                style={{ fontSize: 11, color: "var(--color-text-tertiary)", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 3, opacity: 0.8 }}
                title={bookPath}
              >
                <svg width="9" height="9" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M2 1h9l2 2v12H2V1zm1 1v12h10V4H8V2H3zm1 2h6v1H4V4zm0 2h6v1H4V6zm0 2h4v1H4V8z"/>
                </svg>
                {extractBookTitle(bookPath)}
              </a>
            )}
          </div>

          {/* Row 2: session title (editable) + context bar inline right */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            {editing ? (
              <input
                ref={inputRef}
                value={name}
                autoFocus
                onChange={(e) => setName(e.target.value)}
                onBlur={commitEdit}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitEdit();
                  if (e.key === "Escape") setEditing(false);
                }}
                style={{
                  flex: 1,
                  fontSize: 15,
                  fontWeight: 600,
                  color: "var(--color-text-primary)",
                  background: "var(--color-surface)",
                  border: "1px solid var(--color-accent-light)",
                  borderRadius: 5,
                  padding: "1px 6px",
                  fontFamily: "inherit",
                  outline: "none",
                  letterSpacing: "-0.01em",
                  minWidth: 0,
                }}
              />
            ) : (
              <span
                onClick={currentSession ? startEdit : undefined}
                title={currentSession ? "Click to rename" : undefined}
                style={{
                  fontSize: 15,
                  fontWeight: 600,
                  color: "var(--color-text-primary)",
                  cursor: currentSession ? "pointer" : "default",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  letterSpacing: "-0.01em",
                  flex: 1,
                  minWidth: 0,
                }}
              >
                {currentSession ? title : "MathMate"}
              </span>
            )}

            {/* Context bar — inline right of title */}
            {currentSession && (() => {
              const messages = currentSession.messages ?? [];
              const charCount = messages.reduce((acc, m) =>
                acc + m.content.reduce((c, p) => c + (p.text?.length ?? 0), 0), 0);
              const tokens = Math.round(charCount / 4);
              const modelId = currentSession.header.model ?? model ?? "";
              const ctxMax = modelCatalog?.models.find((m) => m.id === modelId)?.context_length ?? 128_000;
              const pct = ctxMax > 0 ? Math.min((tokens / ctxMax) * 100, 100) : 0;
              const barColor = pct > 85 ? "var(--color-red, #ef4444)" : pct > 60 ? "#f59e0b" : "var(--color-accent)";
              const label = tokens >= 1_000_000 ? `${(tokens/1_000_000).toFixed(1)}M`
                : tokens >= 1_000 ? `${(tokens/1_000).toFixed(1)}k` : String(tokens);
              const maxLabel = ctxMax >= 1_000_000 ? `${Math.round(ctxMax/1_000_000)}M`
                : `${Math.round(ctxMax/1_000)}k`;
              return (
                <button
                  onClick={onToggleContextPanel}
                  title={`${label} / ${maxLabel} tokens · ${pct < 0.1 ? "<0.1" : pct.toFixed(1)}% context used`}
                  style={{ display: "flex", alignItems: "center", gap: 5, background: "none", border: "none", padding: "2px 6px", cursor: "pointer", borderRadius: 4, flexShrink: 0 }}
                >
                  <div style={{ width: 48, height: 3, borderRadius: 2, background: "var(--color-surface)", overflow: "hidden" }}>
                    <div style={{ width: `${Math.max(pct, pct > 0 ? 4 : 0)}%`, height: "100%", borderRadius: 2, background: barColor, transition: "width 0.4s ease" }} />
                  </div>
                  <span style={{ fontSize: 10, color: "var(--color-text-tertiary)", whiteSpace: "nowrap", letterSpacing: "0.01em" }}>
                    {label}<span style={{ opacity: 0.55 }}> / {maxLabel}</span>
                  </span>
                </button>
              );
            })()}
          </div>

        </div>

        {/* Model selector pill */}
        <button
          onClick={() => setShowModelSelector(true)}
          style={{
            display: "flex",
            alignItems: "center",
            flexShrink: 0,
            borderRadius: 20,
            padding: "6px 12px",
            gap: 6,
            background: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          {/* Status dot */}
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: model ? "var(--color-accent-light)" : "var(--color-text-tertiary)",
              flexShrink: 0,
            }}
          />
          <span style={{ fontSize: 12, fontWeight: 500, color: "var(--color-text-primary)" }}>
            {model ? model.split("/").pop() : "Select model"}
          </span>
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M2 3.5L5 6.5L8 3.5" stroke="var(--color-text-tertiary)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>

        {/* Tutor style selector */}
        {currentProject && (() => {
          const activeStyle = TUTOR_STYLES.find((s) => s.value === currentProject.tutor_style);
          return (
            <select
              value={currentProject.tutor_style ?? ""}
              onChange={(e) => handleTutorStyleChange(e.target.value)}
              title={`Tutor style: ${activeStyle?.label ?? "not set"}`}
              style={{
                padding: "5px 8px",
                borderRadius: 6,
                border: "1px solid var(--color-border)",
                background: "var(--color-surface)",
                color: activeStyle ? "var(--color-text-primary)" : "var(--color-text-tertiary)",
                fontSize: 11,
                fontFamily: "inherit",
                cursor: "pointer",
                outline: "none",
                maxWidth: 130,
                fontWeight: activeStyle ? 500 : 400,
              }}
            >
              {!activeStyle && <option value="">Set style…</option>}
              {TUTOR_STYLES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          );
        })()}

        {/* Context panel icon */}
        <button
          onClick={onToggleContextPanel}
          title="Toggle context panel (⌘⌥P)"
          style={{
            ...toolbarIconBtn,
            background: contextPanelVisible ? "var(--color-accent-subtle)" : "transparent",
            color: contextPanelVisible ? "var(--color-accent-light)" : "var(--color-text-secondary)",
          }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <rect x="2" y="2" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.2"/>
            <path d="M9 2v12" stroke="currentColor" strokeWidth="1.2"/>
          </svg>
        </button>


      </div>

      {showModelSelector && (
        <ModelSelector
          onClose={() => setShowModelSelector(false)}
          onSelect={handleModelSelect}
          currentProvider={provider}
          currentModel={model}
        />
      )}
    </>
  );
}

const toolbarIconBtn: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: 32,
  height: 32,
  borderRadius: 6,
  border: "none",
  background: "transparent",
  cursor: "pointer",
  flexShrink: 0,
  transition: "background 0.1s, color 0.1s",
};


export default function ChatPage() {
  const { toggleContextPanel, contextPanelVisible, openProjectSettings } = useOutletContext<{
    toggleContextPanel: () => void;
    contextPanelVisible: boolean;
    openProjectSettings: () => void;
  }>();

  const {
    currentSession,
    streaming,
    streamingContent,
    streamingThinking,
    streamSegments,
    error,
    newSession,
    retrievedMemories,
    visionWarning,
    clearVisionWarning,
  } = useChatStore();
  const currentProject = useProjectStore((s) => s.currentProject);

  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [showWrapUp, setShowWrapUp] = useState(false);
  const [wrapUpResult, setWrapUpResult] = useState<WrapUpResult | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [showMigration, setShowMigration] = useState(false);
  const [migrationCount, setMigrationCount] = useState(0);

  // Check for existing sessions from Swift v1 (migration banner)
  useEffect(() => {
    // Note: loadConfig and restoreLastSession are now called once in Layout.tsx
    (async () => {
      try {
        const headers = await invoke<any[]>("list_sessions", { projectId: null });
        if (headers.length > 0) {
          setMigrationCount(headers.length);
          const seen = localStorage.getItem("mathmate-migration-seen");
          if (!seen) setShowMigration(true);
        }
      } catch {}
    })();

    // Open LaTeX palette on custom event
    const handler = () => {
      const textarea = document.querySelector<HTMLTextAreaElement>("textarea");
      if (textarea) {
        textarea.focus();
        const start = textarea.selectionStart;
        const val = textarea.value;
        textarea.value = val.slice(0, start) + "\\\\(\\\\)" + val.slice(start);
        textarea.selectionStart = textarea.selectionEnd = start + 3;
        textarea.dispatchEvent(new Event("input", { bubbles: true }));
      }
    };
    window.addEventListener("open-latex-palette", handler);
    return () => window.removeEventListener("open-latex-palette", handler);
  }, []);

  // Auto-scroll during streaming
  useEffect(() => {
    if (streaming && virtuosoRef.current) {
      virtuosoRef.current.scrollToIndex({ index: "LAST", behavior: "smooth" });
    }
  }, [streamingContent, streamingThinking, streaming]);

  // Final scroll to bottom when the stream finishes
  const prevStreamingRef = useRef(false);
  useEffect(() => {
    if (prevStreamingRef.current && !streaming && virtuosoRef.current) {
      virtuosoRef.current.scrollToIndex({ index: "LAST", behavior: "smooth" });
    }
    prevStreamingRef.current = streaming;
  }, [streaming]);

  // Show scroll-to-bottom button via Virtuoso's atBottomStateChange
  const handleAtBottomStateChange = useCallback((atBottom: boolean) => {
    setShowScrollBtn(!atBottom);
  }, []);

  // Extract current LaTeX from input
  const inputText = useChatStore((s) => s.inputText);
  const latexPreview = useDebounce(extractLatex(inputText), 300);

  const messages = currentSession?.messages ?? [];
  const hasMessages = messages.length > 0;

  // During streaming, append a synthetic assistant message for inline segment rendering
  const displayMessages = useMemo(() => {
    // Filter out role:"tool" protocol messages — their content is shown
    // inline via tool_result segments on the preceding assistant message.
    const visible = messages.filter((m) => m.role !== "tool");
    if (!streaming) return visible;
    // Add a synthetic "in-progress" message that will receive streamSegments
    const synthetic: Message = {
      id: "__streaming__",
      role: "assistant",
      segments: [],
      content: [],
    };
    return [...visible, synthetic];
  }, [messages, streaming]);

  const handleWrapUp = async () => {
    if (!currentSession) return;
    try {
      setToast("Generating wrap-up summary...");
      const result = await invoke<WrapUpResult>("generate_wrap_up", {
        sessionId: currentSession.header.id,
      });
      setWrapUpResult(result);
      setToast(null);
      setShowWrapUp(true);
    } catch (err) {
      setToast(`Wrap-up failed: ${err}`);
    }
  };

  const handleSaveWrapUp = async () => {
    if (!wrapUpResult) return;
    try {
      const vaultPath = currentProject?.vault_path ?? "~/.mathmate/study_logs";
      const savedPath = await invoke<string>("save_wrap_up", {
        projectName: currentProject?.name ?? "General",
        vaultPath,
        content: wrapUpResult.content,
        sessionId: currentSession?.header.id ?? "unknown",
      });
      setToast(`Study log saved to ${savedPath}`);
      setShowWrapUp(false);
      setWrapUpResult(null);
    } catch (err) {
      setToast(`Failed to save: ${err}`);
    }
  };

  const handleDismissMigration = useCallback(() => {
    setShowMigration(false);
    localStorage.setItem("mathmate-migration-seen", "true");
  }, []);

  // Item renderer for virtuoso
  const renderMessage = useCallback(
    (index: number) => {
      const msg = displayMessages[index];
      if (!msg) return null;
      const isLiveStreaming = msg.id === "__streaming__" && streaming;
      return (
        <div style={{ width: "100%", padding: "0 8px" }}>
          <ErrorBoundary>
            <ChatMessage
              message={msg}
              isStreaming={isLiveStreaming}
              streamedText={isLiveStreaming ? streamingContent : undefined}
              streamedThinking={isLiveStreaming ? streamingThinking : undefined}
              streamSegments={isLiveStreaming ? streamSegments : undefined}
            />
          </ErrorBoundary>
        </div>
      );
    },
    [displayMessages, streaming, streamingContent, streamingThinking, streamSegments]
  );

  // Footer component for virtuoso (wrap-up only — streaming is now inline via segments)
  const Footer = useCallback(() => {
    return (
      <>
        {showWrapUp && wrapUpResult && (
          <div
            style={{
              margin: "16px auto",
              maxWidth: 640,
              background: "var(--color-bg-elevated)",
              borderRadius: "var(--radius-card)",
              border: "1px solid var(--color-border)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "10px 14px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                borderBottom: "1px solid var(--color-border)",
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-primary)" }}>
                Study Log
              </span>
              <span style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>
                {currentSession?.header.title}
              </span>
            </div>
            <pre
              style={{
                padding: 14,
                fontSize: 12,
                lineHeight: 1.5,
                color: "var(--color-text-primary)",
                fontFamily: "'SF Mono', Menlo, monospace",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                maxHeight: 300,
                overflow: "auto",
              }}
            >
              {wrapUpResult.content}
            </pre>
            <div
              style={{
                padding: "8px 14px",
                borderTop: "1px solid var(--color-border)",
                display: "flex",
                justifyContent: "flex-end",
                gap: 8,
              }}
            >
              <button
                onClick={() => {
                  setShowWrapUp(false);
                  setWrapUpResult(null);
                }}
                style={{
                  padding: "4px 12px",
                  border: "1px solid var(--color-border)",
                  borderRadius: "var(--radius-button)",
                  background: "transparent",
                  cursor: "pointer",
                  fontSize: 11,
                  color: "var(--color-text-secondary)",
                  fontFamily: "inherit",
                }}
              >
                Dismiss
              </button>
              <button
                onClick={handleSaveWrapUp}
                style={{
                  padding: "4px 12px",
                  border: "none",
                  borderRadius: "var(--radius-button)",
                  background: "var(--color-accent)",
                  cursor: "pointer",
                  fontSize: 11,
                  color: "#fff",
                  fontWeight: 500,
                  fontFamily: "inherit",
                }}
              >
                Save to Vault
              </button>
            </div>
          </div>
        )}
      </>
    );
  }, [showWrapUp, wrapUpResult, currentSession]);

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Toolbar + tab bar */}
      <ChatToolbar
        onToggleContextPanel={toggleContextPanel}
        contextPanelVisible={contextPanelVisible}
        onOpenProjectSettings={openProjectSettings}
      />

      {/* Migration banner */}
      {showMigration && migrationCount > 0 && (
        <MigrationBanner count={migrationCount} onDismiss={handleDismissMigration} />
      )}

      {/* Messages area */}
      {!currentSession && !streaming ? (
        // No session at all — show CTA to create one
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div style={{ textAlign: "center", padding: 32, maxWidth: 360 }}>
            <h2 style={{ fontSize: 22, fontWeight: 700, color: "var(--color-text-primary)", marginBottom: 8 }}>
              MathMate
            </h2>
            <p style={{ fontSize: 14, color: "var(--color-text-tertiary)", lineHeight: 1.5, marginBottom: 16 }}>
              Your AI math tutor. Ask any math question, paste LaTeX expressions, or upload images of problems.
            </p>
            <p style={{ fontSize: 12, color: "var(--color-text-tertiary)", marginBottom: 16 }}>
              {currentProject
                ? <>Session will be created in <span style={{ color: "var(--color-text-primary)", fontWeight: 600 }}>{currentProject.name}</span> &mdash; select a different project in the sidebar to change this.</>
                : <>Select a project in the sidebar to get started.</>}
            </p>
            <button
              onClick={() => newSession()}
              style={{
                padding: "8px 20px",
                background: "var(--color-accent)",
                color: "#fff",
                border: "none",
                borderRadius: "var(--radius-button)",
                fontSize: 13,
                fontWeight: 600,
                fontFamily: "inherit",
                cursor: "pointer",
                marginBottom: 12,
              }}
            >
              Start New Session
            </button>
            <div style={{ display: "flex", justifyContent: "center", gap: 8, fontSize: 11, color: "var(--color-text-tertiary)" }}>
              <span>⌘N New session</span>
              <span>⌘\ LaTeX</span>
              <span>⌘⌥P Context</span>
            </div>
          </div>
        </div>
      ) : (
        <Virtuoso
          key={currentSession?.header.id ?? "no-session"}
          ref={virtuosoRef}
          style={{ flex: 1 }}
          data={displayMessages}
          itemContent={renderMessage}
          components={{ Footer }}
          initialTopMostItemIndex={Math.max(0, displayMessages.length - 1)}
          atBottomThreshold={200}
          atBottomStateChange={handleAtBottomStateChange}
          followOutput={"auto"}
          overscan={200}
        />
      )}

      {/* Error banner */}
      {error && (
        <div
          style={{
            padding: "8px 16px",
            background: "var(--color-error-bg)",
            color: "var(--color-red)",
            fontSize: 12,
            borderBottom: "1px solid var(--color-border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span><AlertTriangle size={14} style={{ marginRight: 4, verticalAlign: "middle" }} />{error}</span>
          <button
            onClick={() => useChatStore.getState().clearError()}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--color-red)",
              fontSize: 14,
              padding: "0 4px",
              fontFamily: "inherit",
            display: "flex",
            alignItems: "center",
          }}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Vision warning toast */}
      {visionWarning && (
        <div
          style={{
            padding: "6px 16px",
            background: "rgba(255, 149, 0, 0.08)",
            color: "#cc7700",
            fontSize: 12,
            borderBottom: "1px solid rgba(255, 149, 0, 0.2)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span><Camera size={14} style={{ marginRight: 4, verticalAlign: "middle" }} />{visionWarning}</span>
          <button
            onClick={clearVisionWarning}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "#cc7700",
              fontSize: 14,
              padding: "0 4px",
              display: "flex",
              alignItems: "center",
            }}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Math composer (live LaTeX preview above input) */}
      {inputText && (
        <MathComposer latex={latexPreview} visible={latexPreview.length > 0} />
      )}

      {/* Wrap-up button — hidden; use /wrapup slash command instead */}
      {false && hasMessages && !streaming && (
        <div style={{ display: "flex", justifyContent: "center", padding: "4px 0" }}>
          <button
            onClick={handleWrapUp}
            style={{
              padding: "3px 14px",
              border: "none",
              borderRadius: "var(--radius-pill)",
              background: "var(--color-surface)",
              cursor: "pointer",
              fontSize: 10,
              color: "var(--color-text-tertiary)",
              fontFamily: "inherit",
              fontWeight: 500,
            }}
          >
            Generate Wrap-Up Summary
          </button>
        </div>
      )}

      {/* Input area */}
      <ChatInput />

      {/* Scroll-to-bottom button */}
      {showScrollBtn && (
        <button
          onClick={() => virtuosoRef.current?.scrollToIndex({ index: "LAST", behavior: "smooth" })}
          style={{
            position: "fixed",
            bottom: 100,
            right: 40,
            width: 36,
            height: 36,
            borderRadius: "50%",
            background: "var(--color-bg-elevated)",
            border: "1px solid var(--color-border)",
            cursor: "pointer",
            boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--color-text-secondary)",
            zIndex: 50,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 12L3 7h10l-5 5z" />
          </svg>
        </button>
      )}

      {/* Toast notification */}
      {toast && <div style={toastStyle}>{toast}</div>}
    </div>
  );
}

function extractLatex(text: string): string {
  // Return the full text when it contains math so the preview shows
  // both the surrounding prose and the rendered expressions.
  const hasDisplayMath = /\$\$[\s\S]*?\$\$/.test(text);
  const hasInlineMath = /\$[^$\n]+?\$/.test(text);
  const hasRawLatex =
    text.includes("\\frac") ||
    text.includes("\\sum") ||
    text.includes("\\int") ||
    text.includes("\\sqrt");
  if (hasDisplayMath || hasInlineMath || hasRawLatex) return text.trim();
  return "";
}

const toastStyle: React.CSSProperties = {
  position: "fixed",
  bottom: 24,
  left: "50%",
  transform: "translateX(-50%)",
  background: "var(--color-text-primary)",
  color: "var(--color-bg)",
  padding: "8px 20px",
  borderRadius: "var(--radius-button)",
  fontSize: 13,
  fontWeight: 500,
  zIndex: 200,
  boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
  pointerEvents: "none",
  transition: "opacity 0.2s",
};
