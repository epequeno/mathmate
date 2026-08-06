import { useEffect, useRef } from "react";
import styles from "./Sidebar.module.css";

interface ProjectMenuProps {
  onArchive: () => void;
  onDelete: () => void;
  onClose: () => void;
}

export function ProjectMenu({ onArchive, onDelete, onClose }: ProjectMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  return (
    <div ref={ref} className={styles.projectMenu}>
      <button
        className={styles.menuItem}
        onClick={(e) => { e.stopPropagation(); onArchive(); onClose(); }}
      >
        Archive project
      </button>
      <button
        className={styles.menuItemDanger}
        onClick={(e) => { e.stopPropagation(); onDelete(); onClose(); }}
      >
        Delete project…
      </button>
    </div>
  );
}