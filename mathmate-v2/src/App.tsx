import { useEffect, useRef, useState } from "react";
import { Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { listen } from "@tauri-apps/api/event";
import Layout from "./components/Layout";
import ChatPage from "./pages/ChatPage";
import PracticePage from "./pages/PracticePage";
import VaultPage from "./pages/VaultPage";
import BookPage from "./pages/BookPage";
import OverviewPage from "./pages/OverviewPage";
import SettingsPage from "./pages/SettingsPage";
import WelcomePage from "./pages/WelcomePage";
import SessionManagerPage from "./pages/SessionManagerPage";
import LibraryPage from "./pages/LibraryPage";
import { useProjectStore } from "./stores/projectStore";
import { useConfigStore } from "./stores/configStore";

export default function App() {
  const navigate = useNavigate();
  const { hasProjects, loadProjects, loading } = useProjectStore();
  const [ready, setReady] = useState(false);
  const unlisteners = useRef<(() => void)[]>([]);

  // Apply persisted font size to CSS variable when config loads
  useEffect(() => {
    const unsub = useConfigStore.subscribe((state) => {
      const fs = state.appConfig?.ui?.font_size;
      if (fs && fs >= 13 && fs <= 21) {
        document.documentElement.style.setProperty("--font-size-body", `${fs}px`);
      }
    });
    return unsub;
  }, []);

  // Load projects on startup
  useEffect(() => {
    const timeout = setTimeout(() => {
      console.warn("[App] loadProjects timed out after 10s, forcing ready");
      setReady(true);
    }, 10_000);

    loadProjects()
      .then(() => {
        clearTimeout(timeout);
        setReady(true);
      })
      .catch(() => {
        clearTimeout(timeout);
        setReady(true);
      });
  }, []);

  // Listen for menu events from Rust backend
  useEffect(() => {
    const setupListener = async () => {
      try {
        const unlisten = await listen<string>("menu-navigate", async (event) => {
          const payload = event.payload;
          if (payload === "settings") navigate("/settings");
          if (payload === "new-session") {
            navigate("/chat");
            const { useChatStore } = await import("./stores/chatStore");
            useChatStore.getState().newSession();
          }
        });
        unlisteners.current.push(unlisten);
      } catch {
        // Not running in Tauri (dev mode without Tauri)
      }
    };

    setupListener();
    return () => {
      for (const fn of unlisteners.current) fn();
      unlisteners.current = [];
    };
  }, []);

  // Loading screen
  if (!ready || loading) {
    return (
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
      }}>
        <div style={{ fontSize: 13, color: "var(--color-text-tertiary)" }}>
          Loading…
        </div>
      </div>
    );
  }

  return (
    <Routes>
      {/* No projects yet — show welcome screen */}
      {!hasProjects ? (
        <>
          <Route path="/" element={<WelcomePage />} />
          <Route path="/settings" element={<SettingsPage />} />
          {/* Redirect all other routes to home (welcome) */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </>
      ) : (
        <>
          <Route element={<Layout />}>
            <Route path="/" element={<Navigate to="/chat" replace />} />
            <Route path="/chat" element={<ChatPage />} />
            <Route path="/chat/:sessionId" element={<ChatPage />} />
            <Route path="/practice" element={<PracticePage />} />
            <Route path="/vault" element={<VaultPage />} />
            <Route path="/book" element={<BookPage />} />
            <Route path="/library" element={<LibraryPage />} />
            <Route path="/overview" element={<OverviewPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/sessions" element={<SessionManagerPage />} />
          </Route>
        </>
      )}
    </Routes>
  );
}
