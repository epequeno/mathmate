import { useCallback, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { FileText, ChevronRight, Bookmark, CheckCircle } from "lucide-react";
import { useVaultStore } from "../../stores/vaultStore";
import { useProjectStore } from "../../stores/projectStore";
import { useChatStore } from "../../stores/chatStore";
import type { MessageSegment } from "../../lib/types";
import { QuickSavePopover } from "./QuickSavePopover";
import styles from "./VaultChips.module.css";

interface VaultChipsProps {
  message: { content: { type: string; text?: string }[] };
  effectiveSegments: MessageSegment[];
  hasSegments: boolean;
}

interface VaultResult {
  path: string;
  action: string;
  title?: string;
}

export function VaultChips({ message, effectiveSegments, hasSegments }: VaultChipsProps) {
  const navigate = useNavigate();
  const synapseRunning = useProjectStore((s) => s.synapseStatus.running);

  const vaultResults = useMemo<VaultResult[]>(() => {
    if (!hasSegments) return [];
    const results: VaultResult[] = [];
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

  const [showSave, setShowSave] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedPath, setSavedPath] = useState<string | null>(null);

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
      const title = "Quick save - " + new Date().toLocaleDateString();
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
    setShowSave(true);
    void sessionTitle; // used to derive title — consumed in QuickSavePopover via parent
    void textContent;
  };

  return (
    <>
      {/* Citation chips */}
      {vaultResults.length > 0 && (
        <div className={styles.chips}>
          {vaultResults.map((vr, i) => (
            <button key={i} onClick={() => handleNavigate(vr.path)} className={styles.chip}>
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
        <div className={styles.savedBadge}>
          <CheckCircle size={11} />
          Saved to vault
        </div>
      )}

      {/* Quick save button */}
      {synapseRunning && textContent && !showSave && !savedPath && (
        <div className={styles.container}>
          <button onClick={openSavePopover} title="Save to vault" className={styles.btn}>
            <Bookmark size={10} />
            Save to vault
          </button>
        </div>
      )}

      {/* Quick save popover */}
      {showSave && (
        <QuickSavePopover
          title={useChatStore.getState().currentSession?.header.title || "Quick Save"}
          saving={saving}
          onSave={handleQuickSave}
          onCancel={() => setShowSave(false)}
        />
      )}
    </>
  );
}
