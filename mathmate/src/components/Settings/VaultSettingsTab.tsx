import { useState } from "react";
import { FolderOpen, Sparkles, CheckCircle2, AlertCircle } from "lucide-react";
import { Field, inputStyle, iconBtnStyle, clearBtnStyle } from "./Shared";
import { Vault as VaultApi } from "../../lib/api";
import VaultSwitcher from "./VaultSwitcher";

interface VaultSettingsTabProps {
  name: string;
  vaultPath: string;
  onVaultPathChange: (v: string) => void;
  onInitStatusChange: (status: "idle" | "running" | "done" | "error") => void;
  onInitErrorChange: (err: string | null) => void;
  initStatus: "idle" | "running" | "done" | "error";
  initError: string | null;
}

export function VaultSettingsTab({
  name,
  vaultPath,
  onVaultPathChange,
  onInitStatusChange,
  onInitErrorChange,
  initStatus,
  initError,
}: VaultSettingsTabProps) {
  const pickFolderPath = async (setter: (v: string) => void) => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({ multiple: false, directory: true });
      if (selected) setter(selected as string);
    } catch {
      // Dialog not available
    }
  };

  const handleInitVault = async () => {
    const path = vaultPath.trim();
    if (!path) return;
    onInitStatusChange("running");
    onInitErrorChange(null);
    try {
      await VaultApi.init(path, name.trim() || "Study Vault");
      onInitStatusChange("done");
      setTimeout(() => onInitStatusChange("idle"), 4000);
    } catch (err) {
      onInitStatusChange("error");
      onInitErrorChange(String(err));
    }
  };

  return (
    <Field
      label="Vault folder"
      sublabel={vaultPath ? "✓ Set" : "Not set"}
      sublabelColor={vaultPath ? "var(--color-success, #22c55e)" : "var(--color-text-tertiary)"}
      icon={<FolderOpen size={13} />}
    >
      <div style={{ display: "flex", gap: 6 }}>
        <input
          value={vaultPath}
          onChange={(e) => { onVaultPathChange(e.target.value); onInitStatusChange("idle"); onInitErrorChange(null); }}
          style={{ ...inputStyle, flex: 1 }}
          placeholder="/path/to/vault"
        />
        <button onClick={() => pickFolderPath(onVaultPathChange)} style={iconBtnStyle} title="Browse for folder">
          <FolderOpen size={14} />
        </button>
      </div>

      {vaultPath && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 2 }}>
          <button
            onClick={handleInitVault}
            disabled={initStatus === "running"}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 10px",
              borderRadius: 6,
              border: "1px solid var(--color-border)",
              background: initStatus === "done"
                ? "rgba(34,197,94,0.12)"
                : initStatus === "error"
                ? "rgba(239,68,68,0.10)"
                : "var(--color-surface)",
              color: initStatus === "done"
                ? "var(--color-success, #22c55e)"
                : initStatus === "error"
                ? "var(--color-red, #ef4444)"
                : "var(--color-text-secondary)",
              fontSize: 12,
              fontFamily: "inherit",
              cursor: initStatus === "running" ? "not-allowed" : "pointer",
              opacity: initStatus === "running" ? 0.6 : 1,
              transition: "background 0.2s, color 0.2s",
            }}
            title="Create the vault folder with a MathMate-ready structure"
          >
            {initStatus === "done" ? <CheckCircle2 size={13} /> :
             initStatus === "error" ? <AlertCircle size={13} /> :
             <Sparkles size={13} />}
            {initStatus === "running" ? "Initializing…" :
             initStatus === "done" ? "Vault initialized!" :
             initStatus === "error" ? "Failed — try again" :
             "Initialize vault"}
          </button>
          {initStatus === "error" && initError && (
            <span style={{ fontSize: 11, color: "var(--color-red, #ef4444)", lineHeight: 1.4 }}>
              {initError}
            </span>
          )}
          {initStatus === "idle" && (
            <span style={{ fontSize: 11, color: "var(--color-text-tertiary)", lineHeight: 1.4 }}>
              Creates Home.md, PROGRESS.md, Templates/, and MathMate/Study Logs/ at this path.
            </span>
          )}
          <button onClick={() => { onVaultPathChange(""); onInitStatusChange("idle"); }} style={clearBtnStyle}>
            Clear
          </button>
        </div>
      )}
      <VaultSwitcher />
    </Field>
  );
}