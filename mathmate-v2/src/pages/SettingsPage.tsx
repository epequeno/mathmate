import { useState, useEffect, useCallback } from "react";
import { useConfigStore, type AppConfig, type ProviderConfig } from "../stores/configStore";
import { useChatStore } from "../stores/chatStore";
import { Config } from "../lib/api";
import { AlertTriangle, CheckCircle2, Monitor, Sun, Moon } from "lucide-react";

type Tab = "general" | "chat" | "models" | "about";


export default function SettingsPage() {
  const { providers, appConfig, error: configError, loadConfig, timelineEnabled, setTimelineEnabled, theme, setTheme } = useConfigStore();
  const [activeTab, setActiveTab] = useState<Tab>("general");
  const [dirty, setDirty] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [allProviders, setAllProviders] = useState<ProviderConfig[]>([]);
  const [apiKeyInputs, setApiKeyInputs] = useState<Record<string, string>>({});
  const [savingKeys, setSavingKeys] = useState<Record<string, boolean>>({});

  // Editable fields
  const [fontSize, setFontSize] = useState(appConfig?.ui?.font_size ?? 15);
  const [systemPrompt, setSystemPrompt] = useState(appConfig?.chat?.system_prompt ?? "");
  const [maxTokens, setMaxTokens] = useState(appConfig?.chat?.max_tokens ?? 4096);
  const [temperature, setTemperature] = useState(appConfig?.chat?.temperature ?? 0.7);
  // Safety settings
  const [safetyMode, setSafetyMode] = useState(appConfig?.chat?.safety_mode ?? "balanced");
  const [safetyMinTrust, setSafetyMinTrust] = useState(appConfig?.chat?.safety_min_trust ?? 0.3);
  const [safetyMaxTotalBytes, setSafetyMaxTotalBytes] = useState(appConfig?.chat?.safety_max_total_bytes ?? 8192);

  useEffect(() => {
    loadConfig();
  }, []);

  // Sync local state when appConfig loads asynchronously
  useEffect(() => {
    if (appConfig?.ui?.font_size != null) {
      setFontSize(appConfig.ui.font_size);
    }
  }, [appConfig?.ui?.font_size]);

  useEffect(() => {
    if (!appConfig?.chat || dirty) return;
    setSystemPrompt(appConfig.chat.system_prompt ?? "");
    setMaxTokens(appConfig.chat.max_tokens ?? 4096);
    setTemperature(appConfig.chat.temperature ?? 0.7);
    setSafetyMode(appConfig.chat.safety_mode ?? "balanced");
    setSafetyMinTrust(appConfig.chat.safety_min_trust ?? 0.3);
    setSafetyMaxTotalBytes(appConfig.chat.safety_max_total_bytes ?? 8192);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appConfig?.chat]);

  useEffect(() => {
    // Load all providers (including disabled) for models tab
    const loadAll = async () => {
      try {
        const config = await Config.getModels();
        setAllProviders(config.providers);
        // Pre-fill API key inputs from stored keys
        const keyMap: Record<string, string> = {};
        for (const p of config.providers) {
          keyMap[p.name] = p.stored_api_key ?? "";
        }
        setApiKeyInputs(keyMap);
      } catch {}
    };
    loadAll();
  }, []);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }, []);

  const handleSave = useCallback(async () => {
    const updated: AppConfig = {
      ...appConfig ?? { latex: { engine: "katex" }, synapse: {} },
      chat: {
        system_prompt: systemPrompt,
        max_tokens: maxTokens,
        temperature,
        safety_mode: safetyMode,
        safety_min_trust: safetyMinTrust,
        safety_max_total_bytes: safetyMaxTotalBytes,
      },
      ui: { font_size: fontSize },
    };
    try {
      await Config.save(updated);
      setDirty(false);
      showToast("Settings saved");
    } catch (err) {
      showToast(`Failed to save: ${err}`);
    }
  }, [appConfig, fontSize, systemPrompt, maxTokens, temperature, safetyMode, safetyMinTrust, safetyMaxTotalBytes, showToast]);

  const chatStoreModel = useChatStore((s) => s.model);

  const tabs: { id: Tab; label: string }[] = [
    { id: "general", label: "General" },
    { id: "chat", label: "Chat" },
    { id: "models", label: "Models" },
    { id: "about", label: "About" },
  ];

  return (
    <div
      style={{
        flex: 1,
        overflow: "auto",
        padding: 24,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 20,
        }}
      >
        <h2
          style={{
            fontSize: 18,
            fontWeight: 700,
            color: "var(--color-text-primary)",
          }}
        >
          Settings
        </h2>
        <div style={{ display: "flex", gap: 8 }}>
          {dirty && (
            <button
              onClick={handleSave}
              style={{
                padding: "6px 14px",
                background: "var(--color-accent)",
                color: "#fff",
                border: "none",
                borderRadius: "var(--radius-button)",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 600,
                fontFamily: "inherit",
              }}
            >
              Save Changes
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div
        style={{
          display: "flex",
          gap: 0,
          borderBottom: "1px solid var(--color-border)",
          marginBottom: 20,
        }}
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: "8px 18px",
              border: "none",
              borderBottom: activeTab === tab.id ? "2px solid var(--color-accent)" : "2px solid transparent",
              background: "transparent",
              color:
                activeTab === tab.id
                  ? "var(--color-accent)"
                  : "var(--color-text-secondary)",
              fontWeight: activeTab === tab.id ? 600 : 400,
              cursor: "pointer",
              fontSize: 13,
              fontFamily: "inherit",
              transition: "color 0.1s",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* General settings */}
      {activeTab === "general" && (
        <SettingsCard>
          <SettingRow label="Font size">
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="range"
                min={13}
                max={21}
                step={1}
                value={fontSize}
                onChange={(e) => {
                  setFontSize(Number(e.target.value));
                  setDirty(true);
                }}
                style={{ flex: 1, maxWidth: 120 }}
              />
              <span style={{ fontSize: 13, color: "var(--color-text-secondary)", minWidth: 28 }}>
                {fontSize}px
              </span>
            </div>
          </SettingRow>
          <SettingRow label="Theme">
            <ThemeToggle value={theme} onChange={setTheme} />
          </SettingRow>
          <SettingRow label="Timeline UI">
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={timelineEnabled}
                onChange={(e) => setTimelineEnabled(e.target.checked)}
              />
              <span style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>
                {timelineEnabled ? "On" : "Off"}
              </span>
            </label>
          </SettingRow>
          <SettingRow label="Config path" last>
            <code
              style={{
                fontSize: 11,
                color: "var(--color-text-tertiary)",
                wordBreak: "break-all",
              }}
            >
              ~/.mathmate/
            </code>
          </SettingRow>
        </SettingsCard>
      )}

      {/* Chat settings */}
      {activeTab === "chat" && (
        <SettingsCard>
          <SettingRow label="System prompt">
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <textarea
                value={systemPrompt}
                onChange={(e) => {
                  setSystemPrompt(e.target.value);
                  setDirty(true);
                }}
                rows={4}
                placeholder="Optional: add a custom instruction prefix..."
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  border: "1px solid var(--color-border)",
                  borderRadius: 6,
                  background: "var(--color-bg)",
                  color: "var(--color-text-primary)",
                  fontSize: 12,
                  fontFamily: "'SF Mono', Menlo, monospace",
                  resize: "vertical",
                  outline: "none",
                  lineHeight: 1.4,
                }}
              />
              <span style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>
                Prepended to the built-in math tutor instructions. Leave blank to use defaults.
              </span>
            </div>
          </SettingRow>
          <SettingRow label="Max tokens">
            <input
              type="number"
              value={maxTokens}
              onChange={(e) => {
                setMaxTokens(Number(e.target.value));
                setDirty(true);
              }}
              min={256}
              max={128000}
              step={256}
              style={{
                width: 100,
                padding: "4px 8px",
                border: "1px solid var(--color-border)",
                borderRadius: 6,
                background: "var(--color-bg)",
                color: "var(--color-text-primary)",
                fontSize: 13,
                fontFamily: "inherit",
                outline: "none",
              }}
            />
          </SettingRow>
          <SettingRow label="Temperature" last>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="range"
                min={0}
                max={200}
                step={1}
                value={Math.round(temperature * 100)}
                onChange={(e) => {
                  setTemperature(Number(e.target.value) / 100);
                  setDirty(true);
                }}
                style={{ flex: 1, maxWidth: 120 }}
              />
              <span style={{ fontSize: 13, color: "var(--color-text-secondary)", minWidth: 28 }}>
                {temperature.toFixed(2)}
              </span>
            </div>
          </SettingRow>

          {/* Safety section */}
          <div style={{ padding: "12px 0 4px", fontSize: 11, fontWeight: 600, color: "var(--color-text-tertiary)", letterSpacing: "0.04em" }}>
            MEMORY SAFETY
          </div>
          <SettingRow label="Safety mode">
            <select
              value={safetyMode}
              onChange={(e) => {
                setSafetyMode(e.target.value);
                setDirty(true);
              }}
              style={{
                padding: "4px 8px",
                border: "1px solid var(--color-border)",
                borderRadius: 6,
                background: "var(--color-bg)",
                color: "var(--color-text-primary)",
                fontSize: 13,
                outline: "none",
              }}
            >
              <option value="balanced">Balanced (redact + warn)</option>
              <option value="strict">Strict (reject all patterns)</option>
              <option value="off">Off (no scan)</option>
            </select>
          </SettingRow>
          <SettingRow label="Min trust threshold">
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={Math.round(safetyMinTrust * 100)}
                onChange={(e) => {
                  setSafetyMinTrust(Number(e.target.value) / 100);
                  setDirty(true);
                }}
                style={{ flex: 1, maxWidth: 120 }}
              />
              <span style={{ fontSize: 13, color: "var(--color-text-secondary)", minWidth: 36 }}>
                {safetyMinTrust.toFixed(2)}
              </span>
            </div>
          </SettingRow>
          <SettingRow label="Max memory bytes" last>
            <input
              type="number"
              value={safetyMaxTotalBytes}
              onChange={(e) => {
                setSafetyMaxTotalBytes(Number(e.target.value));
                setDirty(true);
              }}
              min={1024}
              max={65536}
              step={1024}
              style={{
                width: 100,
                padding: "4px 8px",
                border: "1px solid var(--color-border)",
                borderRadius: 6,
                background: "var(--color-bg)",
                color: "var(--color-text-primary)",
                fontSize: 13,
                fontFamily: "inherit",
                outline: "none",
              }}
            />
          </SettingRow>
        </SettingsCard>
      )}

      {/* Models settings */}
      {activeTab === "models" && (
        <div>
          {configError && (
            <div
              style={{
                padding: "8px 12px",
                background: "var(--color-error-bg)",
                color: "var(--color-red)",
                borderRadius: "var(--radius-button)",
                fontSize: 12,
                marginBottom: 12,
              }}
            >
              <AlertTriangle size={14} style={{ marginRight: 4, verticalAlign: "middle" }} /> Config error: {configError}
            </div>
          )}
          {allProviders.length === 0 && !configError ? (
            <SettingsCard>
              <p style={{ fontSize: 13, color: "var(--color-text-tertiary)" }}>
                No providers configured. Create a <code>~/.mathmate/models.json</code> file.
              </p>
            </SettingsCard>
          ) : (
            allProviders.map((p) => (
              <SettingsCard key={p.name} style={{ marginBottom: 8 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 8,
                  }}
                >
                  <span style={{ fontSize: 14, fontWeight: 600, color: "var(--color-text-primary)" }}>
                    {p.name}
                  </span>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span
                      style={{
                        fontSize: 11,
                        padding: "2px 8px",
                        borderRadius: 10,
                        background: p.enabled ? "rgba(52,199,89,0.15)" : "var(--color-surface)",
                        color: p.enabled ? "#34C759" : "var(--color-text-tertiary)",
                      }}
                    >
                      {p.enabled ? "Enabled" : "Disabled"}
                    </span>
                    <span style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>
                      {p.models.length} models
                    </span>
                  </div>
                </div>

                {/* API Key */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 4,
                  }}
                >
                  <span style={{ fontSize: 12, color: "var(--color-text-secondary)", minWidth: 68 }}>
                    API key
                  </span>
                  <input
                    key={p.name}
                    type="password"
                    defaultValue={p.stored_api_key ?? ""}
                    onChange={(e) =>
                      setApiKeyInputs((prev) => ({ ...prev, [p.name]: e.target.value }))
                    }
                    placeholder="Set key or leave blank to use env var"
                    style={{
                      flex: 1,
                      padding: "4px 8px",
                      border: "1px solid var(--color-border)",
                      borderRadius: 6,
                      background: "var(--color-bg)",
                      color: "var(--color-text-primary)",
                      fontSize: 12,
                      fontFamily: "'SF Mono', Menlo, monospace",
                      outline: "none",
                    }}
                  />
                  <button
                    onClick={async () => {
                      setSavingKeys((prev) => ({ ...prev, [p.name]: true }));
                      try {
                        const key = apiKeyInputs[p.name]?.trim() || null;
                        await Config.setProviderKey(p.name, key);
                        showToast(`${p.name} API key ${key ? "saved" : "cleared"}`);
                        // Reload providers to reflect the change locally and in global config store
                        const config = await Config.getModels();
                        setAllProviders(config.providers);
                        await loadConfig();
                      } catch (err) {
                        showToast(`Failed: ${err}`);
                      } finally {
                        setSavingKeys((prev) => ({ ...prev, [p.name]: false }));
                      }
                    }}
                    disabled={savingKeys[p.name]}
                    style={{
                      padding: "4px 12px",
                      background: savingKeys[p.name] ? "var(--color-surface)" : "var(--color-accent)",
                      color: "#fff",
                      border: "none",
                      borderRadius: "var(--radius-button)",
                      cursor: savingKeys[p.name] ? "default" : "pointer",
                      fontSize: 11,
                      fontWeight: 600,
                      fontFamily: "inherit",
                      flexShrink: 0,
                    }}
                  >
                    {savingKeys[p.name] ? "Saving…" : "Save"}
                  </button>
                </div>
                <p style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginLeft: 76, marginTop: 2 }}>
                  {p.stored_api_key
                    ? <><CheckCircle2 size={12} style={{ marginRight: 4, verticalAlign: "middle" }} />Key is set (overrides env var)</>
                    : `No stored key — falls back to ${p.env_key ?? p.name.toUpperCase() + "_API_KEY"} env var`}
                </p>

                <p style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 8 }}>
                  Endpoint: <code style={{ fontSize: 11 }}>{p.base_url}</code>
                </p>
                <p style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 2 }}>
                  Default: <code style={{ fontSize: 11 }}>{p.default_model}</code>
                </p>
                {chatStoreModel && p.models.includes(chatStoreModel) && (
                  <p
                    style={{
                      fontSize: 11,
                      color: "var(--color-accent)",
                      fontWeight: 500,
                      marginTop: 4,
                    }}
                  >
                    ← Currently active
                  </p>
                )}
              </SettingsCard>
            ))
          )}
          {allProviders.length > 0 && (
            <p
              style={{
                fontSize: 11,
                color: "var(--color-text-tertiary)",
                marginTop: 8,
              }}
            >
              Use the model selector in the chat toolbar to switch models.
            </p>
          )}
        </div>
      )}

      {/* About */}
      {activeTab === "about" && (
        <SettingsCard>
          <div style={{ textAlign: "center", padding: "16px 0" }}>
            <h3
              style={{
                fontSize: 20,
                fontWeight: 700,
                color: "var(--color-text-primary)",
                marginBottom: 4,
              }}
            >
              MathMate
            </h3>
            <p style={{ fontSize: 14, color: "var(--color-text-secondary)", marginBottom: 2 }}>
              v2.0.0
            </p>
            <p
              style={{
                fontSize: 12,
                color: "var(--color-text-tertiary)",
                marginBottom: 16,
              }}
            >
              Built with Tauri v2 + React + Rust
            </p>
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                gap: 12,
                fontSize: 12,
              }}
            >
              <span style={{ color: "var(--color-text-secondary)" }}>
                <strong style={{ color: "var(--color-text-primary)" }}>~3,050</strong> TS/React
              </span>
              <span style={{ color: "var(--color-text-secondary)" }}>
                <strong style={{ color: "var(--color-text-primary)" }}>~1,300</strong> Rust
              </span>
              <span style={{ color: "var(--color-text-secondary)" }}>
                <strong style={{ color: "var(--color-text-primary)" }}>30</strong> Tauri commands
              </span>
            </div>
            <p
              style={{
                fontSize: 11,
                color: "var(--color-text-tertiary)",
                marginTop: 16,
              }}
            >
              macOS desktop app for AI-powered math tutoring
            </p>
          </div>
        </SettingsCard>
      )}

      {/* Toast notification */}
      {toast && (
        <div style={toastStyle}>
          {toast}
        </div>
      )}
    </div>
  );
}

// ─── Subcomponents ──────────────────────────────

function SettingsCard({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={{
        background: "var(--color-bg-elevated)",
        borderRadius: "var(--radius-card)",
        padding: 12,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function SettingRow({
  label,
  children,
  last,
}: {
  label: string;
  children: React.ReactNode;
  last?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 16,
        padding: "8px 0",
        borderBottom: last ? "none" : "1px solid var(--color-border)",
      }}
    >
      <span
        style={{
          fontSize: 13,
          fontWeight: 500,
          color: "var(--color-text-primary)",
          minWidth: 120,
          flexShrink: 0,
        }}
      >
        {label}
      </span>
      <div style={{ flex: 1, maxWidth: 400 }}>{children}</div>
    </div>
  );
}

// ─── ThemeToggle ─────────────────────────────────────────────────────────

type ThemeOption = "system" | "light" | "dark";

const THEME_OPTIONS: { value: ThemeOption; label: string; Icon: React.ComponentType<{ size: number }> }[] = [
  { value: "system", label: "System", Icon: Monitor },
  { value: "light",  label: "Light",  Icon: Sun },
  { value: "dark",   label: "Dark",   Icon: Moon },
];

function ThemeToggle({
  value,
  onChange,
}: {
  value: ThemeOption;
  onChange: (v: ThemeOption) => void;
}) {
  return (
    <div
      style={{
        display: "inline-flex",
        gap: 0,
        border: "1px solid var(--color-border)",
        borderRadius: 8,
        overflow: "hidden",
        background: "var(--color-surface)",
      }}
    >
      {THEME_OPTIONS.map(({ value: opt, label, Icon }, i) => {
        const active = value === opt;
        return (
          <button
            key={opt}
            onClick={() => onChange(opt)}
            title={label}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              padding: "5px 12px",
              border: "none",
              borderLeft: i > 0 ? "1px solid var(--color-border)" : "none",
              background: active ? "var(--color-accent)" : "transparent",
              color: active ? "#fff" : "var(--color-text-secondary)",
              fontWeight: active ? 600 : 400,
              cursor: "pointer",
              fontSize: 12,
              fontFamily: "inherit",
              transition: "background 0.12s, color 0.12s",
            }}
          >
            <Icon size={13} />
            {label}
          </button>
        );
      })}
    </div>
  );
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
};
