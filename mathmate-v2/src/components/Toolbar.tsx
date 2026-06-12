import { useNavigate } from "react-router-dom";
import { useConfigStore } from "../stores/configStore";

interface ToolbarProps {
  activeTab: string;
}

export default function Toolbar({ activeTab }: ToolbarProps) {
  const navigate = useNavigate();
  const providers = useConfigStore((s) => s.providers);
  const defaultModel = providers.length > 0 ? providers[0].default_model : null;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        padding: "12px 20px",
        background: "var(--color-bg)",
        borderBottom: "1px solid var(--color-border)",
        gap: 12,
      }}
    >
      {/* Model pill */}
      {activeTab === "/chat" && defaultModel && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "6px 12px",
            background: "var(--color-bg-elevated)",
            borderRadius: "var(--radius-pill)",
            border: "1px solid var(--color-border)",
            fontSize: 12,
            fontWeight: 500,
            color: "var(--color-text-primary)",
            cursor: "pointer",
          }}
          onClick={() => navigate("/settings")}
          title="Change model (click to open settings)"
        >
          <span style={{ maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {defaultModel.split("/").pop()}
          </span>
          <span style={{ fontSize: 10, color: "var(--color-text-secondary)" }}>
            {providers[0]?.name ?? ""}
          </span>
        </div>
      )}

      <div style={{ flex: 1 }} />

      {/* Settings button */}
      <button
        onClick={() => navigate("/settings")}
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          color: "var(--color-text-secondary)",
          padding: 4,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
        title="Settings"
      >
        <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 4.5a3.5 3.5 0 100 7 3.5 3.5 0 000-7z" />
          <path d="M6.5.5a.5.5 0 00-.5.5v.76l-.76.29a.5.5 0 00-.24.2l-.52.9-.9-.28a.5.5 0 00-.52.13l-1.08 1.08a.5.5 0 00-.13.52l.28.9-.9.52a.5.5 0 00-.2.24l-.29.76H.5a.5.5 0 00-.5.5v1.54a.5.5 0 00.5.5h.76l.29.76a.5.5 0 00.2.24l.9.52-.28.9a.5.5 0 00.13.52l1.08 1.08a.5.5 0 00.52.13l.9-.28.52.9a.5.5 0 00.24.2l.76.29v.76a.5.5 0 00.5.5h1.54a.5.5 0 00.5-.5v-.76l.76-.29a.5.5 0 00.24-.2l.52-.9.9.28a.5.5 0 00.52-.13l1.08-1.08a.5.5 0 00.13-.52l-.28-.9.9-.52a.5.5 0 00.2-.24l.29-.76h.76a.5.5 0 00.5-.5V6.08a.5.5 0 00-.5-.5h-.76l-.29-.76a.5.5 0 00-.2-.24l-.9-.52.28-.9a.5.5 0 00-.13-.52L12.6 2.98a.5.5 0 00-.52-.13l-.9.28-.52-.9a.5.5 0 00-.24-.2L9.5 1.76V1a.5.5 0 00-.5-.5H6.5z" />
        </svg>
      </button>
    </div>
  );
}
