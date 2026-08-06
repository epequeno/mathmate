/**
 * Typed Tauri API wrapper for Problem Bank commands (Phase 16B).
 *
 * @module lib/api/problemBank
 *
 * Every method corresponds 1:1 with a Tauri command registered
 * in lib.rs. Argument names use camelCase (the TS convention);
 * Tauri auto-coerces to snake_case on the Rust side.
 */

import { invoke } from "@tauri-apps/api/core";
import type { ProblemFilter, CompProblem, ProblemAttempt, AttemptStats } from "../types";

export const ProblemBank = {
  /** @command: list_problems */
  list: (filter: ProblemFilter) =>
    invoke<CompProblem[]>("list_problems", { filter }),

  /** @command: get_problem */
  get: (problemId: string) =>
    invoke<CompProblem>("get_problem", { problemId }),

  /** @command: random_problem */
  random: (filter: ProblemFilter) =>
    invoke<CompProblem>("random_problem", { filter }),

  /** @command: save_problem_attempt */
  saveAttempt: (attempt: ProblemAttempt) =>
    invoke<void>("save_problem_attempt", { attempt }),

  /** @command: save_problem_attempt_note */
  saveAttemptNote: (params: {
    problemId: string;
    source: string;
    year: number;
    number: number;
    difficulty: string;
    topics: string[];
    statement: string;
    outcome: string;
    hintsUsed: number;
    elapsedSeconds: number;
    notes: string;
    vaultPath: string;
  }) => invoke<string>("save_problem_attempt_note", params),

  /** @command: list_problem_attempts */
  listAttempts: (problemId?: string) =>
    invoke<ProblemAttempt[]>("list_problem_attempts", { problemId }),

  /** @command: get_attempt_stats */
  getStats: () => invoke<AttemptStats>("get_attempt_stats"),
} as const;