import { GraduationCap } from "lucide-react";
import { Field, inputStyle } from "./Shared";

interface LaTeXSettingsTabProps {
  tutorStyle: string;
  onTutorStyleChange: (v: string) => void;
}

export function LaTeXSettingsTab({ tutorStyle, onTutorStyleChange }: LaTeXSettingsTabProps) {
  return (
    <Field
      label="Tutor style"
      sublabel="Guides the assistant's teaching approach"
      icon={<GraduationCap size={13} />}
    >
      <textarea
        value={tutorStyle}
        onChange={(e) => onTutorStyleChange(e.target.value)}
        style={{ ...inputStyle, minHeight: 72, resize: "vertical" }}
        placeholder="e.g. Socratic — ask guiding questions before giving answers"
      />
    </Field>
  );
}