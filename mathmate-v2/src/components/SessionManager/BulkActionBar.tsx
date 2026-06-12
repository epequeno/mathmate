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
            className="btn-icon" style={{ padding: "5px 10px", borderRadius: 6, border: "1px solid var(--color-border)", fontSize: 11, gap: 5 }}
            title="Archive selected sessions"
          >
            <Archive size={13} />
            Archive ({activeCheckedCount})
          </button>
          <button
            onClick={onDelete}
            className="btn-icon-danger" style={{ padding: "5px 10px", borderRadius: 6, border: "1px solid var(--color-border)", fontSize: 11, gap: 5 }}
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
          className="btn-icon-danger" style={{ padding: "5px 10px", borderRadius: 6, border: "1px solid var(--color-border)", fontSize: 11, gap: 5 }}
          title="Permanently purge selected archived sessions"
        >
          <Trash2 size={13} />
          Purge ({archivedCheckedCount})
        </button>
      )}
    </div>
  );
}


