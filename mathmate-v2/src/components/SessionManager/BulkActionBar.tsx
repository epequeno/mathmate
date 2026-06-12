import { Archive, Trash2 } from "lucide-react";

interface BulkActionBarProps {
  checkedIds: Set<string>;
  activeCheckedCount: number;
  archivedCheckedCount: number;
  onArchive: () => void;
  onDelete: () => void;
  onPurge: () => void;
}

export default function BulkActionBar({
  checkedIds,
  activeCheckedCount,
  archivedCheckedCount,
  onArchive,
  onDelete,
  onPurge,
}: BulkActionBarProps) {
  if (checkedIds.size === 0) return null;

  return (
    <div
      style={{
        height: 48,
        background: "var(--color-bg-elevated)",
        borderTop: "1px solid var(--color-border)",
        display: "flex",
        alignItems: "center",
        padding: "0 16px",
        gap: 12,
        flexShrink: 0,
      }}
    >
      <span
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: "var(--color-accent-light)",
        }}
      >
        {checkedIds.size} selected
      </span>

      <div style={{ flex: 1 }} />

      {activeCheckedCount > 0 && (
        <>
          <button
            onClick={onArchive}
            style={actionBtnStyle}
            onMouseEnter={highlight}
            onMouseLeave={unhighlight}
            title="Archive selected sessions"
          >
            <Archive size={13} />
            Archive ({activeCheckedCount})
          </button>
          <button
            onClick={onDelete}
            style={{ ...actionBtnStyle, color: "var(--color-red)" }}
            onMouseEnter={highlightRed}
            onMouseLeave={unhighlightRed}
            title="Delete selected sessions permanently"
          >
            <Trash2 size={13} />
            Delete ({activeCheckedCount})
          </button>
        </>
      )}

      {archivedCheckedCount > 0 && (
        <button
          onClick={onPurge}
          style={{ ...actionBtnStyle, color: "var(--color-red)" }}
          onMouseEnter={highlightRed}
          onMouseLeave={unhighlightRed}
          title="Permanently purge selected archived sessions"
        >
          <Trash2 size={13} />
          Purge ({archivedCheckedCount})
        </button>
      )}
    </div>
  );
}

const actionBtnStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 5,
  padding: "5px 10px",
  background: "transparent",
  border: "1px solid var(--color-border)",
  borderRadius: 6,
  color: "var(--color-text-secondary)",
  cursor: "pointer",
  fontSize: 11,
  fontWeight: 500,
  fontFamily: "inherit",
};

function highlight(e: React.MouseEvent<HTMLButtonElement>) {
  (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.05)";
}
function unhighlight(e: React.MouseEvent<HTMLButtonElement>) {
  (e.currentTarget as HTMLElement).style.background = "transparent";
}
function highlightRed(e: React.MouseEvent<HTMLButtonElement>) {
  (e.currentTarget as HTMLElement).style.background = "rgba(192,92,92,0.08)";
}
function unhighlightRed(e: React.MouseEvent<HTMLButtonElement>) {
  (e.currentTarget as HTMLElement).style.background = "transparent";
}
