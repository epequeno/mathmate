// Critique panel store — Phase 16D
// Manages the ProofCritiquePanel visibility and state.

import { create } from "zustand";

export interface CritiquePanelState {
  /** Whether the proof critique panel is open */
  showCritiquePanel: boolean;
  /** Pre-filled problem statement (from practice session, etc.) */
  prefilledProblem: string;
  /** Pre-filled proof attempt (from practice session scratch area) */
  prefilledProof: string;

  /** Open the panel with optional pre-filled fields */
  openCritiquePanel: (problem?: string, proof?: string) => void;
  /** Close the panel */
  closeCritiquePanel: () => void;
}

export const useCritiqueStore = create<CritiquePanelState>((set) => ({
  showCritiquePanel: false,
  prefilledProblem: "",
  prefilledProof: "",

  openCritiquePanel: (problem = "", proof = "") => {
    set({ showCritiquePanel: true, prefilledProblem: problem, prefilledProof: proof });
  },

  closeCritiquePanel: () => {
    set({ showCritiquePanel: false, prefilledProblem: "", prefilledProof: "" });
  },
}));