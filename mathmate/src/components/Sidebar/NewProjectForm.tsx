import { useEffect, useRef, useState } from "react";
import styles from "./Sidebar.module.css";

interface NewProjectFormProps {
  onSubmit: (name: string) => Promise<void>;
  onCancel: () => void;
}

export function NewProjectForm({ onSubmit, onCancel }: NewProjectFormProps) {
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    await onSubmit(name.trim());
    setLoading(false);
  };

  return (
    <form onSubmit={handleSubmit} className={styles.newProjectForm}>
      <input
        ref={inputRef}
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Project name"
        onKeyDown={(e) => e.key === "Escape" && onCancel()}
        className={styles.newProjectInput}
      />
      <div className={styles.newProjectBtns}>
        <button type="submit" disabled={!name.trim() || loading} className={styles.btnCreate}>
          {loading ? "…" : "Create"}
        </button>
        <button type="button" onClick={onCancel} className={styles.btnCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}