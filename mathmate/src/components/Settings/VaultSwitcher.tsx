/**
 * VaultSwitcher — Multi-vault selector (Phase 15E)
 *
 * Shows all vaults for a project, highlights the active one, and allows
 * switching, adding, renaming, or removing vaults.
 */

import { useState } from "react";
import { useProjectStore } from "../../stores/projectStore";
import type { VaultRef, VaultKind } from "../../lib/types";
import styles from "./VaultSwitcher.module.css";

// ─── VaultSwitcher ────────────────────────────────────────────────────

export default function VaultSwitcher() {
  const project = useProjectStore((s) => s.currentProject);
  const setActiveVault = useProjectStore((s) => s.setActiveVault);
  const addVault = useProjectStore((s) => s.addVault);
  const removeVault = useProjectStore((s) => s.removeVault);

  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPath, setNewPath] = useState("");
  const [newKind, setNewKind] = useState<VaultKind>("synapse");

  const vaults = project?.vaults ?? [];
  const activeId = project?.active_vault_id;

  if (!project) return null;

  const handleAdd = async () => {
    if (!newName.trim() || !newPath.trim()) return;
    await addVault(newName.trim(), newPath.trim(), newKind);
    setNewName("");
    setNewPath("");
    setNewKind("synapse");
    setShowAdd(false);
  };

  const handleRemove = async (vaultId: string) => {
    if (vaults.length <= 1) return; // keep at least one vault
    await removeVault(vaultId);
  };

  const kindBadge = (kind: VaultKind) => {
    const labels: Record<VaultKind, string> = {
      synapse: "Synapse",
      legacy: "Legacy",
      classroom: "Classroom",
    };
    return (
      <span className={styles.badge} data-kind={kind}>
        {labels[kind]}
      </span>
    );
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span className={styles.title}>Vaults</span>
        <button
          className={styles.addBtn}
          onClick={() => setShowAdd(!showAdd)}
          title="Add vault"
        >
          {showAdd ? "−" : "+"}
        </button>
      </div>

      {showAdd && (
        <div className={styles.addForm}>
          <input
            className={styles.input}
            placeholder="Vault name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <input
            className={styles.input}
            placeholder="Path (e.g., ~/notes/math)"
            value={newPath}
            onChange={(e) => setNewPath(e.target.value)}
          />
          <select
            className={styles.select}
            value={newKind}
            onChange={(e) => setNewKind(e.target.value as VaultKind)}
          >
            <option value="synapse">Synapse</option>
            <option value="legacy">Legacy</option>
            <option value="classroom">Classroom</option>
          </select>
          <button className={styles.saveBtn} onClick={handleAdd}>
            Add
          </button>
        </div>
      )}

      <div className={styles.list}>
        {vaults.map((v) => (
          <div
            key={v.id}
            className={`${styles.item} ${v.id === activeId ? styles.active : ""}`}
            onClick={() => v.id !== activeId && setActiveVault(v.id)}
            title={`${v.path} (position ${v.position})`}
          >
            <span className={styles.vaultName}>
              {v.read_only && <span className={styles.lock}>🔒</span>}
              {v.name}
            </span>
            {kindBadge(v.kind)}
            {vaults.length > 1 && (
              <button
                className={styles.removeBtn}
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemove(v.id);
                }}
                title="Remove vault"
              >
                ×
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
