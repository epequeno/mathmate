import { Bot } from "lucide-react";
import { Field, inputStyle, clearBtnStyle } from "./Shared";

interface ModelSettingsTabProps {
  defaultModel: string;
  onDefaultModelChange: (v: string) => void;
}

export function ModelSettingsTab({ defaultModel, onDefaultModelChange }: ModelSettingsTabProps) {
  return (
    <Field
      label="Default model"
      sublabel="Overrides the global model for this project"
      icon={<Bot size={13} />}
    >
      <input
        value={defaultModel}
        onChange={(e) => onDefaultModelChange(e.target.value)}
        style={inputStyle}
        placeholder="e.g. openai/gpt-4o (leave blank for global)"
      />
      {defaultModel && (
        <button onClick={() => onDefaultModelChange("")} style={clearBtnStyle}>
          Clear
        </button>
      )}
    </Field>
  );
}