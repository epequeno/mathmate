// ─── Stream Turn Orchestrator ──────────────────────────────────────────
//
// Extracted from chatStore.sendMessage.  Coordinates a single turn:
// streaming, tool rounds, message persistence.
//
// Yields TurnEvent values for UI state updates.  Throws on error/abort
// so the caller (chatStore) can implement retry logic.
//
// All impure I/O is injected via TurnDeps.
// Testable in isolation with mock dependencies.
//
// See: Implementation_Phase14B_StreamTurnOrchestrator.md

import type { TurnEvent, TurnInput, TurnDeps } from "./types";
import type { MessageSegment } from "../types";

// ─── Constants ────────────────────────────────────────────────────────

const MAX_TOOL_ROUNDS = 3;
const TOOL_TIMEOUT_MS = 8000;
const MAX_STREAMED_BYTES = 1_048_576; // 1 MB cap per accumulated string

// ─── Orchestrator ─────────────────────────────────────────────────────

/**
 * Run a single turn: streaming → tool rounds → finish.
 *
 * Yields `TurnEvent`s for every state transition.  The caller
 * (chatStore) processes events to update UI state.
 *
 * Throws on error/abort — the caller handles retry logic.
 */
export async function* runTurn(
  input: TurnInput,
  deps: TurnDeps,
): AsyncGenerator<TurnEvent> {
  const {
    sessionId,
    messagesWithSystem,
    model,
    provider,
    toolDefinitions,
    signal,
  } = input;

  // ── Start ──────────────────────────────────────────────────────────
  yield { kind: "status", streaming: true, text: "", thinking: "", segments: [] };

  if (signal.aborted) throw new DOMException("Aborted", "AbortError");

  const payload = deps.buildPayload(messagesWithSystem);

  let toolRound = 0;
  let conversationMessages = [...payload];

  // ── Multi-round tool loop ─────────────────────────────────────────
  while (toolRound <= MAX_TOOL_ROUNDS) {
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");

    yield { kind: "tool-round-started", round: toolRound };

    let accumulatedText = "";
    let accumulatedThinking = "";
    let accumulatedSegments: MessageSegment[] = [];
    const toolCallDeltas: {
      index: number;
      call_id_part?: string;
      tool_name_part?: string;
      arguments_part?: string;
    }[] = [];

    let contentSegmentId: string | null = null;
    let thinkingSegmentId: string | null = null;

    const updateSegments = () => {
      const segs: MessageSegment[] = [];
      if (accumulatedThinking) {
        if (!thinkingSegmentId) thinkingSegmentId = deps.uid();
        segs.push({
          id: thinkingSegmentId,
          ts: new Date().toISOString(),
          type: "thinking",
          content: accumulatedThinking,
        });
      }
      if (accumulatedText) {
        if (!contentSegmentId) contentSegmentId = deps.uid();
        segs.push({
          id: contentSegmentId,
          ts: new Date().toISOString(),
          type: "content",
          text: accumulatedText,
        });
      }
      accumulatedSegments = segs;
    };

    // Build payload with tools if available.
    const streamPayload =
      toolDefinitions.length > 0
        ? deps.buildToolPayload(conversationMessages, toolDefinitions)
        : { messages: conversationMessages };

    // ── Stream chat ────────────────────────────────────────────────
    for await (const chunk of deps.streamChat(
      streamPayload,
      model,
      provider,
      signal,
    )) {
      if (signal.aborted) throw new DOMException("Aborted", "AbortError");

      if (chunk.text) {
        accumulatedText += chunk.text;
        if (accumulatedText.length > MAX_STREAMED_BYTES) {
          throw Object.assign(new Error("Response exceeded 1 MB limit"), {
            kind: "server" as const,
            status: 502,
          });
        }
        updateSegments();
        yield {
          kind: "status",
          streaming: true,
          text: accumulatedText,
          thinking: accumulatedThinking,
          segments: [...accumulatedSegments],
        };
      }

      if (chunk.thinking) {
        accumulatedThinking += chunk.thinking;
        if (accumulatedThinking.length > MAX_STREAMED_BYTES) {
          throw Object.assign(new Error("Thinking trace exceeded 1 MB limit"), {
            kind: "server" as const,
            status: 502,
          });
        }
        updateSegments();
        yield {
          kind: "status",
          streaming: true,
          text: accumulatedText,
          thinking: accumulatedThinking,
          segments: [...accumulatedSegments],
        };
      }

      const incomingToolDeltas =
        (chunk as any).tool_call_deltas ??
        ((chunk as any).tool_call_delta
          ? [(chunk as any).tool_call_delta]
          : []);
      if (incomingToolDeltas.length > 0) {
        toolCallDeltas.push(...(incomingToolDeltas as any[]));
      }

      if (chunk.done) break;
    }

    // ── Assemble tool calls ────────────────────────────────────────
    const assembledCalls = deps.assembleToolCalls(toolCallDeltas);

    // ── No tool calls → final response ─────────────────────────────
    if (assembledCalls.length === 0) {
      const finalText = accumulatedText || "(no response)";
      const assistantMsg = deps.makeMessage("assistant", finalText);
      assistantMsg.segments = accumulatedSegments;
      if (accumulatedThinking) {
        (assistantMsg as any).thinking = accumulatedThinking;
      }

      await deps.appendMessage(sessionId, assistantMsg);
      yield { kind: "segments-changed", segments: accumulatedSegments };
      yield { kind: "tool-round-finished", round: toolRound };
      break;
    }

    // ── Tool calls present: execute them ───────────────────────────
    toolRound++;

    // Add tool call segments.
    for (const tc of assembledCalls) {
      accumulatedSegments.push(
        deps.makeSegment({
          type: "tool_call",
          tool_name: tc.tool_name,
          arguments: tc.arguments,
          call_id: tc.call_id,
          status: "running",
        }),
      );
    }
    yield {
      kind: "status",
      streaming: true,
      text: accumulatedText,
      thinking: accumulatedThinking,
      segments: [...accumulatedSegments],
    };

    // Save assistant message with tool call segments.
    const assistantWithTools = deps.makeMessage(
      "assistant",
      accumulatedText || "",
    );
    assistantWithTools.segments = [...accumulatedSegments];
    if (accumulatedThinking) {
      (assistantWithTools as any).thinking = accumulatedThinking;
    }
    await deps.appendMessage(sessionId, assistantWithTools);

    // Execute each tool call.
    const toolResults: {
      call_id: string;
      result: unknown;
      is_error: boolean;
    }[] = [];

    for (const tc of assembledCalls) {
      try {
        const resultPromise = deps.executeTool(
          tc.call_id,
          tc.tool_name,
          tc.arguments,
          deps.projectId,
        );

        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error("Tool execution timed out")),
            TOOL_TIMEOUT_MS,
          ),
        );

        const result = await Promise.race([resultPromise, timeoutPromise]);
        toolResults.push(result);

        accumulatedSegments.push(
          deps.makeSegment({
            type: "tool_result",
            call_id: tc.call_id,
            result: result.result,
            is_error: result.is_error,
          }),
        );
      } catch (toolErr: any) {
        toolResults.push({
          call_id: tc.call_id,
          result: { error: toolErr.message || "Tool execution failed" },
          is_error: true,
        });
        accumulatedSegments.push(
          deps.makeSegment({
            type: "tool_result",
            call_id: tc.call_id,
            result: { error: toolErr.message || "Tool execution failed" },
            is_error: true,
          }),
        );
      }
    }

    // Mark tool_call segments as done/error.
    const resultMap = new Map(toolResults.map((r) => [r.call_id, r]));
    for (const seg of accumulatedSegments) {
      if (seg.type === "tool_call") {
        const r = resultMap.get((seg as any).call_id);
        (seg as any).status = r
          ? r.is_error
            ? "error"
            : "completed"
          : "completed";
      }
    }

    yield {
      kind: "status",
      streaming: true,
      text: accumulatedText,
      thinking: accumulatedThinking,
      segments: [...accumulatedSegments],
    };

    // Save tool result messages.
    for (const tr of toolResults) {
      const toolResultMsg = deps.makeMessage(
        "tool" as any,
        JSON.stringify(tr.result),
      );
      (toolResultMsg as any).tool_call_id = tr.call_id;
      await deps.appendMessage(sessionId, toolResultMsg);
    }

    // Reload session.
    try {
      await deps.loadSession(sessionId);
    } catch {
      // Non-fatal.
    }

    // Build conversation for next round.
    conversationMessages = [
      ...conversationMessages,
      {
        role: "assistant",
        content: "",
        tool_calls: assembledCalls.map((tc) => ({
          id: tc.call_id,
          type: "function",
          function: {
            name: tc.tool_name,
            arguments: JSON.stringify(tc.arguments),
          },
        })),
      } as any,
      ...toolResults.map((tr) => ({
        role: "tool" as const,
        content: JSON.stringify(tr.result),
        tool_call_id: tr.call_id,
      })),
    ];

    // Reset for next round.
    yield {
      kind: "status",
      streaming: true,
      text: "",
      thinking: "",
      segments: [],
    };
    yield { kind: "tool-round-finished", round: toolRound };
  }

  // ── Max tool rounds reached without final answer ────────────────
  if (toolRound > MAX_TOOL_ROUNDS) {
    const assistantMsg = deps.makeMessage(
      "assistant",
      `Stopped after ${MAX_TOOL_ROUNDS} tool rounds without a final answer.`,
    );
    await deps.appendMessage(sessionId, assistantMsg);
  }

  // ── Turn complete ───────────────────────────────────────────────
  yield {
    kind: "status",
    streaming: false,
    text: "",
    thinking: "",
    segments: [],
  };
  yield { kind: "turn-finished" };
}
