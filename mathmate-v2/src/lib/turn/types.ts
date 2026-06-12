// ─── Turn Event Types ──────────────────────────────────────────────────
//
// Discriminated union of events emitted by the StreamTurnOrchestrator.
// The chatStore subscribes to these events to update UI state; the
// orchestrator itself is pure logic + injected I/O dependencies.
//
// See: Implementation_Phase14B_StreamTurnOrchestrator.md

import type { AppError } from "../error";
import type { Message, MessageSegment, StreamChunk } from "../types";
import type { ProviderConfig } from "../../stores/configStore";

// ─── TurnEvent ───────────────────────────────────────────────────────

export type TurnEvent =
  | { kind: "status"; streaming: boolean; text: string; thinking: string; segments: MessageSegment[] }
  | { kind: "segments-changed"; segments: MessageSegment[] }
  | { kind: "tool-round-started"; round: number }
  | { kind: "tool-round-finished"; round: number }
  | { kind: "message-saved"; session: Message }
  | { kind: "memory-stored" }
  | { kind: "turn-finished" }
  | { kind: "turn-aborted"; partialText: string; partialThinking: string; partialSegments: MessageSegment[] }
  | { kind: "turn-error"; error: AppError };

// ─── TurnInput ────────────────────────────────────────────────────────

export interface TurnInput {
  /** The session ID to append messages to. */
  sessionId: string;
  /** Full conversation history including system prompt + user message. */
  messagesWithSystem: any[];
  /** Selected model name. */
  model: string;
  /** Provider configuration (base_url, api_key, etc.). */
  provider: ProviderConfig;
  /** Tool definitions for function calling. */
  toolDefinitions: unknown[];
  /** Whether to auto-store session memory after the turn. */
  memoryEnabled: boolean;
  /** User's input text (for memory storage). */
  userInputText: string;
  /** Signal for cancellation. */
  signal: AbortSignal;
}

// ─── TurnDeps (injected I/O) ──────────────────────────────────────────

export interface TurnDeps {
  /** Stream chat completions from the provider. */
  streamChat: (...args: any[]) => AsyncGenerator<StreamChunk>;
  /** Append a message to the session (persisted + returned). */
  appendMessage: (sessionId: string, message: any) => Promise<any>;
  /** Load the full session (for re-reading after tool results). */
  loadSession: (sessionId: string) => Promise<any>;
  /** Execute a tool call via the Tauri backend. */
  executeTool: (callId: string, toolName: string, args: unknown, projectId?: string) => Promise<{ call_id: string; result: unknown; is_error: boolean }>;
  /** Store a memory for future retrieval. */
  storeMemory: (content: string, sessionId: string) => Promise<void>;
  /** Build payload for text-only requests. */
  buildPayload: (...args: any[]) => any;
  /** Build payload with tool definitions for function calling. */
  buildToolPayload: (...args: any[]) => any;
  /** Assemble fragmented tool call deltas into complete calls. */
  assembleToolCalls: (...args: any[]) => any[];
  /** Create a Message object. */
  makeMessage: (role: string, text: string) => any;
  /** Create a MessageSegment. */
  makeSegment: (kind: Record<string, unknown>) => any;
  /** Create a unique ID. */
  uid: () => string;
  /** Current project ID for tool context. */
  projectId?: string;
}
