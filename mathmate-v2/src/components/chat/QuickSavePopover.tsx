import { useState } from "react";
import { Save, Loader2 } from "lucide-react";
import { cx } from "../../lib/clsx";
import styles from "./QuickSavePopover.module.css";

interface QuickSavePopoverProps {
  title: string;
  saving: boolean;
  onSave: () => Promise<void>;
  onCancel: () => void;
}

export function QuickSavePopover({ title, saving, onSave, onCancel }: QuickSavePopoverProps) {
  const [localTitle, setLocalTitle] = useState(title);

  const handleSave = async () => {
    if (!localTitle.trim()) return;
    await onSave();
  };

  return (
    <div className={styles.popover}>
      <div className={styles.title}>Save to vault</div>
      <input
        value={localTitle}
        onChange={(e) => setLocalTitle(e.target.value)}
        placeholder="Note title..."
        autoFocus
        className={styles.input}
        onKeyDown={(e) => {
          if (e.key === "Enter") void handleSave();
          if (e.key === "Escape") onCancel();
        }}
      />
      <div className={styles.actions}>
        <button onClick={onCancel} className={styles.cancelBtn}>Cancel</button>
        <button
          onClick={() => void handleSave()}
          disabled={saving || !localTitle.trim()}
          className={styles.saveBtn}
        >
          {saving ? <Loader2 size={11} style={{ animation: "spin 0.8s linear infinite" }} /> : <Save size={11} />}
          Save
        </button>
      </div>
    </div>
  );
}
