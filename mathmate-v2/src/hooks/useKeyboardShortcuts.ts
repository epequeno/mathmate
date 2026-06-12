import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useChatStore } from "../stores/chatStore";

interface KeyboardShortcutOptions {
  onToggleContextPanel?: () => void;
}

/**
 * Global keyboard shortcuts matching the Swift app's bindings.
 * Registered once at the Layout level.
 */
export function useKeyboardShortcuts({ onToggleContextPanel }: KeyboardShortcutOptions = {}) {
  const navigate = useNavigate();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const meta = e.metaKey;
      const shift = e.shiftKey;
      const alt = e.altKey;

      // ⌘N — new session
      if (meta && !shift && e.key === "n") {
        e.preventDefault();
        useChatStore.getState().newSession();
        navigate("/chat");
        return;
      }

      // ⌘⇧N — new project (placeholder: navigate to settings)
      if (meta && shift && e.key === "n") {
        e.preventDefault();
        navigate("/settings");
        return;
      }

      // ⌘1 — chat tab
      if (meta && e.key === "1") {
        e.preventDefault();
        navigate("/chat");
        return;
      }

      // ⌘2 — vault tab
      if (meta && e.key === "2") {
        e.preventDefault();
        navigate("/vault");
        return;
      }

      // ⌘3 — overview tab
      if (meta && e.key === "3") {
        e.preventDefault();
        navigate("/overview");
        return;
      }

      // ⌘4 — book tab
      if (meta && e.key === "4") {
        e.preventDefault();
        navigate("/book");
        return;
      }

      // ⌘, — settings
      if (meta && e.key === ",") {
        e.preventDefault();
        navigate("/settings");
        return;
      }

      // ⌘\ — open LaTeX palette (handled at ChatInput level, but we show a hint)
      if (meta && e.key === "\\") {
        e.preventDefault();
        // Dispatch a custom event that ChatInput listens to
        window.dispatchEvent(new CustomEvent("open-latex-palette"));
        return;
      }

      // ⌘⌥P — toggle context panel
      if (meta && alt && e.key === "p") {
        e.preventDefault();
        onToggleContextPanel?.();
        return;
      }

      // ⌘⌫ — clear chat (if on chat page)
      if (meta && e.key === "Backspace") {
        const store = useChatStore.getState();
        if (store.currentSession && store.currentSession.messages.length > 0) {
          e.preventDefault();
          if (window.confirm("Clear all messages in this session?")) {
            store.newSession();
          }
        }
        return;
      }

      // ⌘[ — previous session
      if (meta && e.key === "[") {
        e.preventDefault();
        const store = useChatStore.getState();
        const idx = store.sessionList.findIndex((s) => s.id === store.currentSession?.header.id);
        if (idx > 0) {
          const prev = store.sessionList[idx - 1];
          store.openSession(prev.id);
          navigate("/chat");
        }
        return;
      }

      // ⌘] — next session
      if (meta && e.key === "]") {
        e.preventDefault();
        const store = useChatStore.getState();
        const idx = store.sessionList.findIndex((s) => s.id === store.currentSession?.header.id);
        if (idx >= 0 && idx < store.sessionList.length - 1) {
          const next = store.sessionList[idx + 1];
          store.openSession(next.id);
          navigate("/chat");
        }
        return;
      }

      // ⌘R — regenerate (delegate to custom event so ChatInput can handle)
      if (meta && e.key === "r" && !shift && !alt) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("regenerate-last"));
        return;
      }

      // ⌘⌥R — regenerate with different model (same as ⌘R for now)
      if (meta && alt && e.key === "r") {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("regenerate-last"));
        return;
      }

      // Esc — stop generation (handled in components too, but global catch)
      if (e.key === "Escape") {
        const store = useChatStore.getState();
        if (store.streaming) {
          e.preventDefault();
          store.cancelStream();
        }
        return;
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [navigate, onToggleContextPanel]);
}