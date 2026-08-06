import { X } from "lucide-react";

interface PanelHeaderProps {
  onClose: () => void;
}

export function PanelHeader({ onClose }: PanelHeaderProps) {
  return (
    <div
      style={{
        padding: "14px 14px 10px",
        borderBottom: "1px solid var(--color-border)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexShrink: 0,
      }}
    >
      <span style={{ fontWeight: 600, fontSize: 13, color: "var(--color-text-primary)" }}>
        Project Settings
      </span>
      <button
        onClick={onClose}
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          color: "var(--color-text-tertiary)",
          display: "flex",
          padding: 2,
        }}
      >
        <X size={14} />
      </button>
    </div>
  );
}