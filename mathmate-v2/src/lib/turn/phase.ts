/**
 * TurnPhase — Discriminated-Union Stream State
 *
 * Single authoritative source for turn progress. Replaces the parallel
 * `streaming`, `abortController`, `streamedText`, `streamedThinking`,
 * `streamSegments` fields in the store with a single state machine.
 *
 * Design constraints:
 * - `streamedText`/`streamedThinking` are **derived** from segments (not stored).
 * - `AbortController` lives only in `phase.kind === "streaming"`.
 * - `visionWarning` remains a separate UI concern (outside the FSM).
 *
 * Transition map:
 *   idle
 *     → preparing       (sendMessage accepted)
 *   preparing
 *     → streaming       (first status event from runTurn)
 *     → errored         (setup failure before stream begins)
 *   streaming
 *     → finishing       (runTurn yields turn-finished)
 *     → aborted         (AbortError / cancelled)
 *     → errored         (runTurn throws)
 *   finishing
 *     → idle            (post-save side effects complete)
 *   aborted
 *     → idle            (partial append + cleanup)
 *   errored
 *     → idle            (clearError / dismiss)
 */

import type { AppError } from "../error";
import type { MessageSegment } from "../types";

// ─── TurnPhase discriminated union ────────────────────────────────────

export type TurnPhase =
  | { readonly kind: "idle" }
  | {
      readonly kind: "preparing";
      readonly sessionId: string;
      readonly capturedInput: string;
    }
  | {
      readonly kind: "streaming";
      readonly sessionId: string;
      readonly round: number;
      readonly streamSegments: MessageSegment[];
      readonly abortController: AbortController;
    }
  | {
      readonly kind: "finishing";
      readonly sessionId: string;
      readonly streamSegments: MessageSegment[];
    }
  | {
      readonly kind: "aborted";
      readonly sessionId: string;
      readonly partialSegments: MessageSegment[];
      readonly partialText: string;
      readonly partialThinking: string;
    }
  | {
      readonly kind: "errored";
      readonly sessionId: string;
      readonly partialSegments: MessageSegment[];
      readonly error: AppError;
    };

// ─── Initial state ────────────────────────────────────────────────────

export const IDLE: TurnPhase = { kind: "idle" };

// ─── Derived helpers ──────────────────────────────────────────────────

/** Extract plain text from content segments. */
export function latestText(phase: TurnPhase): string {
  if (phase.kind === "streaming" || phase.kind === "finishing") {
    return contentFromSegments(phase.streamSegments);
  }
  if (phase.kind === "aborted") {
    return phase.partialText;
  }
  return "";
}

/** Extract thinking content from thinking segments. */
export function latestThinking(phase: TurnPhase): string {
  if (phase.kind === "streaming" || phase.kind === "finishing") {
    return thinkingFromSegments(phase.streamSegments);
  }
  if (phase.kind === "aborted") {
    return phase.partialThinking;
  }
  return "";
}

/** All accumulated segments. Returns empty array for idle/preparing. */
export function currentSegments(phase: TurnPhase): MessageSegment[] {
  if (phase.kind === "streaming") return phase.streamSegments;
  if (phase.kind === "finishing") return phase.streamSegments;
  if (phase.kind === "aborted") return phase.partialSegments;
  return [];
}

// ─── Phase selectors ──────────────────────────────────────────────────

/** True when a turn is actively in progress (preparing | streaming | finishing). */
export function isTurnActive(phase: TurnPhase): boolean {
  return phase.kind === "preparing" || phase.kind === "streaming" || phase.kind === "finishing";
}

/** True when the orchestrator is actively receiving a stream from the provider. */
export function isStreaming(phase: TurnPhase): boolean {
  return phase.kind === "streaming";
}

/** The current AbortController, or null if no turn is active. */
export function currentAbortController(phase: TurnPhase): AbortController | null {
  return phase.kind === "streaming" ? phase.abortController : null;
}

/** The error from a failed turn, or null if not in errored state. */
export function currentTurnError(phase: TurnPhase): AppError | null {
  return phase.kind === "errored" ? phase.error : null;
}

/** True if the turn ended in an aborted state. */
export function isAborted(phase: TurnPhase): boolean {
  return phase.kind === "aborted";
}

/** True if the turn ended in an error state. */
export function isTurnErrored(phase: TurnPhase): boolean {
  return phase.kind === "errored";
}

// ─── Internal helpers ─────────────────────────────────────────────────

function contentFromSegments(segments: MessageSegment[]): string {
  return segments
    .filter((s) => s.type === "content")
    .map((s) => (s as Extract<MessageSegment, { type: "content" }>).text)
    .join("");
}

function thinkingFromSegments(segments: MessageSegment[]): string {
  return segments
    .filter((s) => s.type === "thinking")
    .map((s) => (s as Extract<MessageSegment, { type: "thinking" }>).content)
    .join("");
}