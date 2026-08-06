import { MetaRow, fmtDate } from "./Shared";
import type { MathProject } from "../../lib/types";

interface AdvancedTabProps {
  project: MathProject;
}

export function AdvancedTab({ project }: AdvancedTabProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, paddingTop: 4, borderTop: "1px solid var(--color-border)" }}>
      <MetaRow label="Project ID" value={project.id} />
      <MetaRow label="Created" value={fmtDate(project.created_at)} />
      <MetaRow label="Updated" value={fmtDate(project.updated_at)} />
    </div>
  );
}