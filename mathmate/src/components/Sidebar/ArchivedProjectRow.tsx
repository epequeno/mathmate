import { useState } from "react";
import { Trash2, RotateCcw } from "lucide-react";
import type { MathProject } from "../../lib/types";
import styles from "./Sidebar.module.css";

interface ArchivedProjectRowProps {
  project: MathProject;
  onRestore: () => void;
  onDelete: () => void;
}

export function ArchivedProjectRow({ project, onRestore, onDelete }: ArchivedProjectRowProps) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={styles.archivedRow}
    >
      <span className={styles.archivedRowName}>{project.name}</span>
      {hovered && (
        <div className={styles.archivedHoverActions}>
          <button onClick={onRestore} title="Restore" className="btn-icon"><RotateCcw size={11} /></button>
          <button onClick={onDelete} title="Delete" className="btn-icon-danger"><Trash2 size={11} /></button>
        </div>
      )}
    </div>
  );
}