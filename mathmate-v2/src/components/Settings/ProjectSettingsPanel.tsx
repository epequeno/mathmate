/**
 * ProjectSettingsPanel — shell component
 * Composes the five tab components. All rendering logic lives in ./Settings/.
 */
import { useState, useEffect } from "react";
import { Save } from "lucide-react";
import { useProjectStore } from "../../stores/projectStore";
import type { MathProject } from "../../lib/types";
import { PanelHeader } from "./PanelHeader";
import { Field, inputStyle } from "./Shared";
import { VaultSettingsTab } from "./VaultSettingsTab";
import { TextbookTab } from "./TextbookTab";
import { ModelSettingsTab } from "./ModelSettingsTab";
import { LaTeXSettingsTab } from "./LaTeXSettingsTab";
import { AdvancedTab } from "./AdvancedTab";
import styles from "./ProjectSettingsPanel.module.css";

interface ProjectSettingsPanelProps {
  onClose: () => void;
}

const TABS = ["Vault", "Textbook", "Model", "Tutor", "Advanced"] as const;
type Tab = typeof TABS[number];

export default function ProjectSettingsPanel({ onClose }: ProjectSettingsPanelProps) {
  const { currentProject, updateProject } = useProjectStore();

  const [activeTab, setActiveTab] = useState<Tab>("Vault");
  const [name, setName] = useState("");
  const [textbookPath, setTextbookPath] = useState("");
  const [vaultPath, setVaultPath] = useState("");
  const [defaultModel, setDefaultModel] = useState("");
  const [tutorStyle, setTutorStyle] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [initStatus, setInitStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [initError, setInitError] = useState<string | null>(null);

  useEffect(() => {
    if (!currentProject) return;
    setName(currentProject.name ?? "");
    setTextbookPath(currentProject.textbook_path ?? "");
    setVaultPath(currentProject.vault_path ?? "");
    setDefaultModel(currentProject.default_model ?? "");
    setTutorStyle(currentProject.tutor_style ?? "");
    setSaved(false);
  }, [currentProject]);

  if (!currentProject) {
    return (
      <div className={styles.panel}>
        <PanelHeader onClose={onClose} />
        <div style={{ padding: 20, color: "var(--color-text-secondary)", fontSize: 13 }}>
          No project selected.
        </div>
      </div>
    );
  }

  const handleSave = async () => {
    setSaving(true);
    const updated: MathProject = {
      ...currentProject,
      name: name.trim() || currentProject.name,
      textbook_path: textbookPath.trim() || undefined,
      vault_path: vaultPath.trim() || undefined,
      default_model: defaultModel.trim() || undefined,
      tutor_style: tutorStyle.trim() || undefined,
    };
    try {
      await updateProject(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.panel}>
      <PanelHeader onClose={onClose} />

      {/* Tab bar */}
      <div className={styles.tabBar}>
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`${styles.tabBtn} ${activeTab === tab ? styles.tabBtnActive : ""}`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Scrollable content */}
      <div className={styles.content}>
        <Field label="Project name">
          <input value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} placeholder="e.g. Calculus II" />
        </Field>

        {activeTab === "Vault" && (
          <VaultSettingsTab
            name={name}
            vaultPath={vaultPath}
            onVaultPathChange={setVaultPath}
            initStatus={initStatus}
            initError={initError}
            onInitStatusChange={setInitStatus}
            onInitErrorChange={setInitError}
          />
        )}
        {activeTab === "Textbook" && (
          <TextbookTab
            textbookPath={textbookPath}
            vaultPath={vaultPath}
            projectName={name}
            onTextbookPathChange={setTextbookPath}
          />
        )}
        {activeTab === "Model" && (
          <ModelSettingsTab defaultModel={defaultModel} onDefaultModelChange={setDefaultModel} />
        )}
        {activeTab === "Tutor" && (
          <LaTeXSettingsTab tutorStyle={tutorStyle} onTutorStyleChange={setTutorStyle} />
        )}
        {activeTab === "Advanced" && (
          <AdvancedTab project={currentProject} />
        )}
      </div>

      {/* Save footer */}
      <div className={styles.footer}>
        <button
          onClick={() => void handleSave()}
          disabled={saving}
          className={styles.saveBtn}
        >
          <Save size={14} />
          {saved ? "Saved!" : saving ? "Saving…" : "Save changes"}
        </button>
      </div>
    </div>
  );
}