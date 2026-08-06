import type { ReactNode } from "react";

interface FieldProps {
  label: string;
  sublabel?: string;
  sublabelColor?: string;
  icon?: ReactNode;
  children: ReactNode;
}

export function Field({ label, sublabel, sublabelColor, icon, children }: FieldProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
        {icon && <span style={{ color: "var(--color-text-tertiary)", display: "flex" }}>{icon}</span>}
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-secondary)" }}>{label}</span>
        {sublabel && (
          <span style={{ fontSize: 11, color: sublabelColor ?? "var(--color-text-tertiary)", marginLeft: "auto" }}>
            {sublabel}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

interface MetaRowProps {
  label: string;
  value: string;
}

export function MetaRow({ label, value }: MetaRowProps) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
      <span style={{ color: "var(--color-text-tertiary)" }}>{label}</span>
      <span style={{ color: "var(--color-text-secondary)" }}>{value}</span>
    </div>
  );
}

export function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return iso;
  }
}

export const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "7px 10px",
  borderRadius: 6,
  border: "1px solid var(--color-border)",
  background: "var(--color-surface)",
  color: "var(--color-text-primary)",
  fontSize: 12,
  fontFamily: "inherit",
  outline: "none",
  boxSizing: "border-box",
};

export const iconBtnStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "0 8px",
  borderRadius: 6,
  border: "1px solid var(--color-border)",
  background: "var(--color-surface)",
  color: "var(--color-text-secondary)",
  cursor: "pointer",
  flexShrink: 0,
};

export const clearBtnStyle: React.CSSProperties = {
  alignSelf: "flex-start",
  background: "none",
  border: "none",
  cursor: "pointer",
  fontSize: 11,
  color: "var(--color-text-tertiary)",
  padding: "0 2px",
  textDecoration: "underline",
};

export const monoStyle: React.CSSProperties = {
  fontFamily: "'SF Mono', Menlo, Monaco, monospace",
  fontSize: 11,
  color: "var(--color-text-tertiary)",
  wordBreak: "break-all",
};