// ─── Vault Backend Module ─────────────────────────────────────────────
// Public API: types, backends, and normalizers.
//
// See: Implementation_Phase14D_VaultBackend.md

export type {
  VaultBackend,
  VaultEntry,
  VaultNote,
  VaultSearchResult,
  BacklinkInfo,
  VaultHealth,
} from "./types";

export { SynapseBackend } from "./synapse";
export { LegacyBackend } from "./legacy";
export {
  normalizeList,
  normalizeSearch,
  normalizeNote,
  normalizeBacklinks,
} from "./normalize";
