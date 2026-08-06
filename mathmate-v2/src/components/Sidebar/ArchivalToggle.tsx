import styles from "./Sidebar.module.css";

interface ArchivalToggleProps {
  label: string;
  count: number;
  expanded: boolean;
  onToggle: () => void;
}

export function ArchivalToggle({ label, count, expanded, onToggle }: ArchivalToggleProps) {
  return (
    <div onClick={onToggle} className={styles.archiveToggle}>
      <span className={styles.archiveToggleIcon}>{expanded ? "▼" : "▶"}</span>
      {label} ({count})
    </div>
  );
}