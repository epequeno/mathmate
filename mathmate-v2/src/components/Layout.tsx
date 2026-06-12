import { useState, useCallback, useEffect } from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import TabBar from "./TabBar";
import ContextPanel from "./ContextPanel";
import ProjectSettingsPanel from "./ProjectSettingsPanel";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";
import { useChatStore } from "../stores/chatStore";
import { useConfigStore } from "../stores/configStore";

type PanelMode = "context" | "project-settings";

export default function Layout() {
  const [contextPanelVisible, setContextPanelVisible] = useState(false);
  const [panelMode, setPanelMode] = useState<PanelMode>("context");
  const currentSession = useChatStore((s) => s.currentSession);
  const restoreLastSession = useChatStore((s) => s.restoreLastSession);
  const loadConfig = useConfigStore((s) => s.loadConfig);

  const toggleContextPanel = useCallback(() => {
    setContextPanelVisible((v) => {
      if (!v) setPanelMode("context");
      return !v;
    });
  }, []);

  const openProjectSettings = useCallback(() => {
    setPanelMode("project-settings");
    setContextPanelVisible(true);
  }, []);

  const closePanel = useCallback(() => setContextPanelVisible(false), []);

  // Restore the last session once when the app shell mounts.
  // Keeping this here (not in ChatPage) prevents re-triggering on every
  // Chat tab navigation, which was creating phantom sessions.
  useEffect(() => {
    loadConfig();
    restoreLastSession();
  }, []);

  useKeyboardShortcuts({ onToggleContextPanel: toggleContextPanel });

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
      <Sidebar />

      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          minWidth: 0,
          background: "var(--color-bg)",
        }}
      >
        {/* Page content (each page renders its own toolbar above TabBar) */}
        <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          {/* Tab bar: lives here so it persists across page navigations and is
              only shown when a session is open. Vault and Overview are
              project-scoped; Chat is session-scoped — all three share this bar. */}
          <TabBar />
          <div style={{ flex: 1, overflow: "hidden", display: "flex" }}>
            <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
              <Outlet context={{ toggleContextPanel, contextPanelVisible, openProjectSettings }} />
            </div>

            {/* Right-side panel — context or project settings (animated slide-in) */}
            <div
              style={{
                overflow: "hidden",
                width: contextPanelVisible ? 280 : 0,
                minWidth: contextPanelVisible ? 280 : 0,
                height: "100%",
                transition: "width 0.2s ease, min-width 0.2s ease",
              }}
            >
              {panelMode === "project-settings" ? (
                <ProjectSettingsPanel onClose={closePanel} />
              ) : (
                <ContextPanel onClose={closePanel} />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}