import { useState, Component } from "react";
import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useProjectStore } from "../stores/projectStore";
import { useConfigStore } from "../stores/configStore";
import { Library, FolderOpen, FileText } from "lucide-react";
import TextbookCatalog from "../components/TextbookCatalog";

// ─── Error Boundary ──────────────────────────────────────────────────────────
class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: string | null }
> {
  state = { error: null };
  static getDerivedStateFromError(err: unknown) {
    return { error: String(err) };
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 24, color: "var(--color-red)", fontSize: 13 }}>
          <strong>Something went wrong:</strong>
          <pre style={{ marginTop: 8, whiteSpace: "pre-wrap", fontSize: 11 }}>
            {this.state.error}
          </pre>
          <button
            onClick={() => this.setState({ error: null })}
            style={{
              marginTop: 12, padding: "6px 14px", borderRadius: 6,
              border: "1px solid var(--color-border)", background: "var(--color-surface)",
              color: "var(--color-text-primary)", cursor: "pointer", fontFamily: "inherit",
            }}
          >
            Dismiss
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const TUTOR_STYLES = [
  { value: "socratic", label: "Socratic — ask questions to guide discovery" },
  { value: "math-tutor", label: "Math Tutor — worked examples and practice" },
  { value: "explanation", label: "Explanation — clear definitions and proofs" },
  { value: "review", label: "Review — summarize and consolidate learning" },
  { value: "olympiad", label: "Olympiad Coach — productive struggle & hint ladders" },
];

export default function WelcomePage() {
  const navigate = useNavigate();
  const createProject = useProjectStore((s) => s.createProject);
  const providers = useConfigStore((s) => s.providers);

  const [name, setName] = useState("Calculus Study");
  const [vaultPath, setVaultPath] = useState("");
  const [textbookPath, setTextbookPath] = useState("");
  const [tutorStyle, setTutorStyle] = useState("socratic");
  const [defaultModel, setDefaultModel] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCatalog, setShowCatalog] = useState(false);

  const pickFolder = async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({ multiple: false, directory: true });
      if (typeof selected === "string") setVaultPath(selected);
    } catch {
      // Not in Tauri (web dev mode)
    }
  };

  const pickPDF = async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({
        multiple: false,
        directory: false,
        filters: [{ name: "PDF", extensions: ["pdf"] }],
      });
      if (typeof selected === "string") setTextbookPath(selected);
    } catch {
      // Not in Tauri (web dev mode)
    }
  };

  // Pre-select first available model
  const allModels = providers.flatMap((p) => p.models);
  const selectedModel = defaultModel || allModels[0] || "";

  const handleCreate = async () => {
    if (!name.trim()) {
      setError("Project name is required");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await createProject({
        name: name.trim(),
        vaultPath: vaultPath.trim() || undefined,
        textbookPath: textbookPath.trim() || undefined,
        defaultModel: selectedModel || undefined,
        tutorStyle,
      });
      navigate("/chat");
    } catch (err) {
      setError(String(err));
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        overflow: "auto",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 480,
          display: "flex",
          flexDirection: "column",
          gap: 0,
        }}
      >
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <h1
            style={{
              fontSize: 28,
              fontWeight: 700,
              color: "var(--color-text-primary)",
              marginBottom: 8,
            }}
          >
            Welcome to MathMate
          </h1>
          <p
            style={{
              fontSize: 14,
              color: "var(--color-text-secondary)",
              lineHeight: 1.5,
            }}
          >
            Create your first project to get started.
            <br />
            A project ties together a vault, textbook, and tutoring style.
          </p>
        </div>

        {/* Form */}
        <div
          style={{
            background: "var(--color-bg-elevated)",
            borderRadius: "var(--radius-card)",
            border: "1px solid var(--color-border)",
            overflow: "hidden",
          }}
        >
          {/* Project name */}
          <FormRow label="Project name">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Calculus Study"
              style={{
                width: "100%",
                padding: "8px 10px",
                border: "1px solid var(--color-border)",
                borderRadius: 6,
                background: "var(--color-bg)",
                color: "var(--color-text-primary)",
                fontSize: 13,
                fontFamily: "inherit",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </FormRow>

          {/* Vault path */}
          <FormRow label="Vault path" sublabel="Synapse vault directory (optional)">
            <div style={{ display: "flex", gap: 6 }}>
              <input
                type="text"
                value={vaultPath}
                onChange={(e) => setVaultPath(e.target.value)}
                placeholder="~/Documents/my-vault"
                style={{
                  flex: 1,
                  minWidth: 0,
                  padding: "8px 10px",
                  border: "1px solid var(--color-border)",
                  borderRadius: 6,
                  background: "var(--color-bg)",
                  color: "var(--color-text-primary)",
                  fontSize: 13,
                  fontFamily: "'SF Mono', Menlo, monospace",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
              <button
                onClick={pickFolder}
                title="Browse for folder"
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center",
                  padding: "0 10px", borderRadius: 6,
                  border: "1px solid var(--color-border)",
                  background: "var(--color-surface)",
                  color: "var(--color-text-secondary)",
                  cursor: "pointer", flexShrink: 0,
                }}
              >
                <FolderOpen size={14} />
              </button>
            </div>
          </FormRow>

          {/* Textbook PDF */}
          <FormRow label="Textbook PDF" sublabel="Path to textbook PDF file (optional)">
            <div style={{ display: "flex", gap: 6 }}>
              <input
                type="text"
                value={textbookPath}
                onChange={(e) => setTextbookPath(e.target.value)}
                placeholder="/path/to/textbook.pdf"
                style={{
                  flex: 1,
                  minWidth: 0,
                  padding: "8px 10px",
                  border: "1px solid var(--color-border)",
                  borderRadius: 6,
                  background: "var(--color-bg)",
                  color: "var(--color-text-primary)",
                  fontSize: 13,
                  fontFamily: "'SF Mono', Menlo, monospace",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
              <button
                onClick={pickPDF}
                title="Browse for PDF"
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center",
                  padding: "0 10px", borderRadius: 6,
                  border: "1px solid var(--color-border)",
                  background: "var(--color-surface)",
                  color: "var(--color-text-secondary)",
                  cursor: "pointer", flexShrink: 0,
                }}
              >
                <FileText size={14} />
              </button>
            </div>
          </FormRow>

          {/* Browse free textbooks */}
          <div
            style={{
              padding: "10px 16px",
              borderBottom: "1px solid var(--color-border)",
            }}
          >
            <button
              onClick={() => setShowCatalog(true)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "7px 14px",
                borderRadius: 6,
                border: "1px solid var(--color-border)",
                background: "var(--color-surface)",
                color: "var(--color-text-secondary)",
                fontSize: 12,
                fontFamily: "inherit",
                cursor: "pointer",
                transition: "background 0.15s",
              }}
            >
              <Library size={13} />
              Browse Free Textbooks
            </button>
            <div
              style={{
                marginTop: 4,
                fontSize: 11,
                color: "var(--color-text-tertiary)",
                lineHeight: 1.4,
              }}
            >
              Choose from 25+ free open-source math textbooks — downloads automatically
            </div>
          </div>

          {/* Tutor style */}
          <FormRow label="Default tutor style">
            <select
              value={tutorStyle}
              onChange={(e) => setTutorStyle(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 10px",
                border: "1px solid var(--color-border)",
                borderRadius: 6,
                background: "var(--color-bg)",
                color: "var(--color-text-primary)",
                fontSize: 13,
                fontFamily: "inherit",
                outline: "none",
                boxSizing: "border-box",
                cursor: "pointer",
              }}
            >
              {TUTOR_STYLES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </FormRow>

          {/* Default model */}
          {allModels.length > 0 && (
            <FormRow label="Default model" last>
              <select
                value={selectedModel}
                onChange={(e) => setDefaultModel(e.target.value)}
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  border: "1px solid var(--color-border)",
                  borderRadius: 6,
                  background: "var(--color-bg)",
                  color: "var(--color-text-primary)",
                  fontSize: 13,
                  fontFamily: "inherit",
                  outline: "none",
                  boxSizing: "border-box",
                  cursor: "pointer",
                }}
              >
                {providers.map((p) => (
                  <optgroup key={p.name} label={p.name}>
                    {p.models.map((m) => (
                      <option key={m} value={m}>
                        {m.split("/").pop()}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </FormRow>
          )}
        </div>

        {/* Error */}
        {error && (
          <div
            style={{
              marginTop: 12,
              padding: "8px 12px",
              background: "var(--color-error-bg)",
              color: "var(--color-red)",
              borderRadius: "var(--radius-button)",
              fontSize: 12,
            }}
          >
            {error}
          </div>
        )}

        {/* Create button */}
        <button
          onClick={handleCreate}
          disabled={loading || !name.trim()}
          style={{
            marginTop: 20,
            padding: "12px 20px",
            background: name.trim() && !loading ? "var(--color-accent)" : "var(--color-surface)",
            color: name.trim() && !loading ? "#fff" : "var(--color-text-tertiary)",
            border: "none",
            borderRadius: "var(--radius-button)",
            fontSize: 14,
            fontWeight: 600,
            cursor: name.trim() && !loading ? "pointer" : "default",
            fontFamily: "inherit",
            transition: "background 0.15s, color 0.15s",
          }}
        >
          {loading ? "Creating project..." : "Create Project →"}
        </button>
      </div>

      {/* Free Textbook Catalog overlay */}
      {showCatalog && (
        <ErrorBoundary>
          <TextbookCatalog onClose={() => setShowCatalog(false)} />
        </ErrorBoundary>
      )}
    </div>
  );
}

function FormRow({
  label,
  sublabel,
  children,
  last,
}: {
  label: string;
  sublabel?: string;
  children: React.ReactNode;
  last?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 16,
        padding: "12px 16px",
        borderBottom: last ? "none" : "1px solid var(--color-border)",
      }}
    >
      <div style={{ minWidth: 130, flexShrink: 0, paddingTop: 2 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: "var(--color-text-primary)",
          }}
        >
          {label}
        </div>
        {sublabel && (
          <div
            style={{
              fontSize: 11,
              color: "var(--color-text-tertiary)",
              marginTop: 1,
            }}
          >
            {sublabel}
          </div>
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
    </div>
  );
}