// ─── Vault Response Normalizers ───────────────────────────────────────
// Both SynapseBackend and LegacyBackend call these shared normalizers.
// Tested in isolation so shape transformations are documented and audited.
//
// See: Implementation_Phase14D_VaultBackend.md §D.3

import type {
  VaultEntry,
  VaultNote,
  VaultSearchResult,
  BacklinkInfo,
} from "./types";

// ─── Synapse raw shapes (internal, not exported) ──────────────────────

interface SynapseNoteEntry {
  path: string;
  title: string;
  snippet?: string;
}

interface SynapseNoteDetail {
  path: string;
  title: string;
  body: string;
  frontmatter?: Record<string, unknown>;
}

interface SynapseBacklinks {
  backlinks: string[];
  forward_links: { target: string; title: string; exists: boolean }[];
}

// ─── Normalizers ──────────────────────────────────────────────────────

/**
 * Normalize a "list" response from either backend into VaultEntry[].
 *
 * Synapse returns `{ notes: [...] }` or a bare array.
 * Legacy returns a flat VaultNote[].
 */
export function normalizeList(raw: unknown): VaultEntry[] {
  if (Array.isArray(raw)) {
    return (raw as SynapseNoteEntry[]).map(toVaultEntry);
  }
  const notes = (raw as Record<string, unknown>)?.notes;
  if (Array.isArray(notes)) {
    return (notes as SynapseNoteEntry[]).map(toVaultEntry);
  }
  return [];
}

/**
 * Normalize a "search" response from either backend into VaultSearchResult[].
 *
 * Synapse returns `{ results: [...] }` or a bare array.
 */
export function normalizeSearch(raw: unknown): VaultSearchResult[] {
  if (Array.isArray(raw)) {
    return (raw as SynapseNoteEntry[]).map(toVaultSearchResult);
  }
  const results = (raw as Record<string, unknown>)?.results;
  if (Array.isArray(results)) {
    return (results as SynapseNoteEntry[]).map(toVaultSearchResult);
  }
  return [];
}

/**
 * Normalize a Synapse "note_read" response into VaultNote.
 */
export function normalizeNote(raw: unknown): VaultNote {
  const detail = raw as SynapseNoteDetail;
  return {
    path: detail.path,
    title: detail.title || detail.path.split("/").pop()?.replace(/\.md$/i, "") || detail.path,
    body: detail.body,
    frontmatter: detail.frontmatter,
  };
}

/**
 * Normalize a Synapse "note_backlinks" response into BacklinkInfo.
 */
export function normalizeBacklinks(raw: unknown): BacklinkInfo {
  const bl = raw as SynapseBacklinks;
  return {
    backlinks: (bl.backlinks ?? []).map((b: string) => ({
      path: b.endsWith(".md") ? b : `${b}.md`,
      title: b.split("/").pop()?.replace(/\.md$/i, "") || b,
    })),
    forward_links: (bl.forward_links ?? []).map((fl) => ({
      path: fl.target,
      title: fl.title,
      exists: fl.exists,
    })),
  };
}

// ─── Field-level mappers ──────────────────────────────────────────────

function toVaultEntry(e: SynapseNoteEntry): VaultEntry {
  return {
    path: e.path,
    title: e.title || e.path.split("/").pop()?.replace(/\.md$/i, "") || e.path,
    // Synapse doesn't expose size/modified in list responses.
  };
}

function toVaultSearchResult(e: SynapseNoteEntry): VaultSearchResult {
  return {
    path: e.path,
    title: e.title || e.path.split("/").pop()?.replace(/\.md$/i, "") || e.path,
    snippet: e.snippet ?? "",
  };
}
