import type { ProviderConfig } from "../stores/configStore";
import type { StreamChunk } from "./types";
import { Config } from "./api";
import { errorFromStatus, isCancelled } from "./error";
import type { AppError } from "./error";

// ─── Wire variant ─────────────────────────────────────────────────────

export type WireVariant = "openai_compatible" | "anthropic_native";

/** Detect wire variant from provider config. Never infers from model ID. */
function detectWireVariant(provider: ProviderConfig): WireVariant {
  const name = provider.name.toLowerCase();
  const base = provider.base_url.toLowerCase();

  // OpenRouter always stays OpenAI-compatible (even for Claude models)
  if (name.includes("openrouter") || base.includes("openrouter.ai")) {
    return "openai_compatible";
  }

  if (name.includes("anthropic") || base.includes("api.anthropic.com")) {
    return "anthropic_native";
  }

  return "openai_compatible";
}

// ─── Shared types ─────────────────────────────────────────────────────

export interface MessagePayload {
  role: "user" | "assistant" | "system" | "tool";
  content: string | { type: string; text?: string; image_url?: { url: string } }[];
  tool_call_id?: string;
  tool_calls?: unknown[];
}

/** Custom error class enriched with retry/status info */
export class StreamError extends Error {
  status?: number;
  retryable: boolean;
  rateLimited: boolean;
  constructor(msg: string, opts?: { status?: number; retryable?: boolean; rateLimited?: boolean }) {
    super(msg);
    this.name = "StreamError";
    this.status = opts?.status;
    this.retryable = opts?.retryable ?? false;
    this.rateLimited = opts?.rateLimited ?? false;
  }
}

// Configuration
const CONNECTION_TIMEOUT = 30_000;   // 30s to establish connection
const IDLE_TIMEOUT = 60_000;         // 60s with no tokens received
const TOTAL_TIMEOUT = 120_000;       // 120s total for entire response

// ─── SSE frame reader ──────────────────────────────────────────────────

export interface SSEFrame {
  event: string;
  data: string;
}

/**
 * Read a raw ReadableStream byte reader and yield SSE frames.
 * Handles multi-line `data:` fields and optional `event:` fields per the
 * SSE specification (W3C).
 */
export async function* readSSEFrames(
  reader: ReadableStreamDefaultReader<Uint8Array>
): AsyncGenerator<SSEFrame> {
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // SSE frames are separated by double newlines
    const parts = buffer.split("\n\n");
    // Keep the last incomplete part in the buffer
    buffer = parts.pop() ?? "";

    for (const part of parts) {
      const lines = part.split("\n");
      let event = "message";
      let data = "";

      for (const line of lines) {
        if (line.startsWith("event:")) {
          event = line.slice(6).trim();
        } else if (line.startsWith("data:")) {
          if (data) data += "\n";
          data += line.slice(5).trim();
        }
        // comment lines (starting with :) are ignored per spec
      }

      if (data) {
        yield { event, data };
      }
    }
  }

  // Flush remaining buffer
  if (buffer.trim()) {
    const lines = buffer.split("\n");
    let event = "message";
    let data = "";
    for (const line of lines) {
      if (line.startsWith("event:")) {
        event = line.slice(6).trim();
      } else if (line.startsWith("data:")) {
        if (data) data += "\n";
        data += line.slice(5).trim();
      }
    }
    if (data) {
      yield { event, data };
    }
  }
}

// ─── OpenAI-compatible parser ──────────────────────────────────────────

/** Convert internal StreamError to typed AppError for consumers. */
function _streamErrorToAppError(err: StreamError): AppError {
  if (err.status) {
    return errorFromStatus(err.status, err.message, {
      retryAfterSecs: err.rateLimited ? 30 : undefined,
    });
  }
  // No status → network/timeout errors, always retryable
  return { kind: "network", message: err.message };
}

// ─── Anthropic request builders ────────────────────────────────────────

/**
 * Convert MessagePayload[] to Anthropic Messages API content blocks.
 * Rules:
 * - system messages → extracted into `system[]` (handled by streamChat)
 * - user text → `{ type: "text", text }`
 * - image parts → `{ type: "image", source: { type: "base64", ... } }`
 * - assistant tool calls → `tool_use` blocks with stable IDs
 * - tool results → `user` message with `tool_result` blocks
 */
export function convertMessagesToAnthropicBlocks(
  messages: MessagePayload[]
): { system: unknown[]; messages: Record<string, unknown>[] } {
  const system: unknown[] = [];
  const result: Record<string, unknown>[] = [];

  for (const msg of messages) {
    if (msg.role === "system") {
      // Anthropic handles system prompts as a top-level parameter, not in messages.
      if (typeof msg.content === "string") {
        system.push({ type: "text", text: msg.content });
      }
      continue;
    }

    if (msg.role === "tool") {
      const tcId = (msg as any).tool_call_id || "";
      const contentText = typeof msg.content === "string" ? msg.content : "";
      result.push({
        role: "user",
        content: [{ type: "tool_result", tool_use_id: tcId, content: contentText }],
      });
      continue;
    }

    // ── Assistant ───────────────────────────────────────────────────
    if (msg.role === "assistant") {
      const toolCalls = (msg as any).tool_calls;
      if (toolCalls && Array.isArray(toolCalls) && toolCalls.length > 0) {
        const content: Record<string, unknown>[] = [];
        const textContent = typeof msg.content === "string" ? msg.content : "";
        if (textContent) {
          content.push({ type: "text", text: textContent });
        }
        for (const tc of toolCalls) {
          const tcName = tc.function?.name || tc.name || "unknown";
          const tcArgs = tc.function?.arguments
            ? (typeof tc.function.arguments === "string"
              ? JSON.parse(tc.function.arguments)
              : tc.function.arguments)
            : tc.input || {};
          content.push({
            type: "tool_use",
            id: tc.id || `tc_${crypto.randomUUID()}`,
            name: tcName,
            input: tcArgs,
          });
        }
        result.push({ role: "assistant", content });
      } else {
        const textContent = typeof msg.content === "string" ? msg.content : "";
        result.push({
          role: "assistant",
          content: textContent,
        });
      }
      continue;
    }

    // ── User ─────────────────────────────────────────────────────────
    if (msg.role === "user") {
      if (typeof msg.content === "string") {
        result.push({ role: "user", content: msg.content });
      } else if (Array.isArray(msg.content)) {
        const blocks: Record<string, unknown>[] = [];
        for (const part of msg.content) {
          if (part.type === "image_url" || (part as any).type === "image") {
            const img = part as any;
            let mediaType = "image/jpeg";
            let data = "";
            if (img.image_url?.url) {
              const url = img.image_url.url as string;
              if (url.startsWith("data:")) {
                const commaIdx = url.indexOf(",");
                mediaType = url.slice(5, url.indexOf(";")) || "image/jpeg";
                data = commaIdx >= 0 ? url.slice(commaIdx + 1) : "";
              }
            } else if (img.data) {
              data = img.data;
              mediaType = img.mime || "image/jpeg";
            }
            if (data) {
              blocks.push({
                type: "image",
                source: { type: "base64", media_type: mediaType, data },
              });
            }
          } else if (part.type === "text") {
            blocks.push({ type: "text", text: part.text || "" });
          }
        }
        result.push({ role: "user", content: blocks });
      }
      continue;
    }
  }

  return { system, messages: result };
}

/**
 * Convert OpenAI-style tool definitions to Anthropic tool format.
 */
export function convertToolsToAnthropicSchema(tools: unknown[]): unknown[] {
  return tools.map((tool: any) => ({
    name: tool.function?.name || tool.name || "",
    description: tool.function?.description || tool.description || "",
    input_schema: tool.function?.parameters || tool.input_schema || { type: "object", properties: {} },
  }));
}

// ─── Anthropic parser ──────────────────────────────────────────────────

export interface AnthropicParseState {
  /** Per-index accumulated partial tool-use JSON strings */
  toolArgsByIndex: Map<number, string>;
  /** Per-index tool names (set at content_block_start) */
  toolNameByIndex: Map<number, string>;
  /** Per-index call IDs (set at content_block_start) */
  callIdByIndex: Map<number, string>;
}

/**
 * Parse a single Anthropic SSE frame into a StreamChunk.
 * Uses accumulated `state` so that tool-call IDs are stable across
 * multiple `content_block_delta` frames for the same index.
 */
export function parseAnthropicFrame(
  event: string,
  data: string,
  state: AnthropicParseState
): StreamChunk | null {
  try {
    const parsed = JSON.parse(data);
    const type = parsed.type as string;

    switch (type) {
      case "message_start": {
        const chunk: StreamChunk = {};
        if (parsed.message?.usage) {
          chunk.usage = {
            prompt_tokens: parsed.message.usage.input_tokens ?? 0,
            completion_tokens: parsed.message.usage.output_tokens ?? 0,
          };
        }
        return chunk.usage ? chunk : null;
      }

      case "content_block_start": {
        const block = parsed.content_block;
        if (!block) return null;

        if (block.type === "text") {
          return { text: block.text || "" };
        }

        if (block.type === "thinking") {
          return { thinking: block.thinking || "" };
        }

        if (block.type === "tool_use") {
          const index = parsed.index ?? 0;
          state.callIdByIndex.set(index, block.id || `tc_${crypto.randomUUID()}`);
          state.toolNameByIndex.set(index, block.name || "");
          state.toolArgsByIndex.set(index, "");

          return {
            tool_call_delta: { index, call_id_part: block.id, tool_name_part: block.name },
            tool_call_deltas: [{ index, call_id_part: block.id, tool_name_part: block.name }],
          };
        }

        return null;
      }

      case "content_block_delta": {
        const delta = parsed.delta;
        if (!delta) return null;

        const blockType = delta.type as string;
        const index = parsed.index ?? 0;

        if (blockType === "text_delta") {
          return { text: delta.text || "" };
        }

        if (blockType === "thinking_delta") {
          return { thinking: delta.thinking || "" };
        }

        if (blockType === "input_json_delta") {
          const prev = state.toolArgsByIndex.get(index) || "";
          state.toolArgsByIndex.set(index, prev + (delta.partial_json || ""));
          return {
            tool_call_delta: { index, arguments_part: delta.partial_json || "" },
            tool_call_deltas: [{ index, arguments_part: delta.partial_json || "" }],
          };
        }

        return null;
      }

      case "content_block_stop":
        return null;

      case "message_delta": {
        const chunk: StreamChunk = {};
        if (parsed.usage) {
          chunk.usage = {
            prompt_tokens: parsed.usage.input_tokens ?? 0,
            completion_tokens: parsed.usage.output_tokens ?? 0,
          };
        }
        if (parsed.delta?.stop_reason === "end_turn" ||
            parsed.delta?.stop_reason === "max_tokens") {
          chunk.done = true;
        }
        return chunk;
      }

      case "message_stop":
        return { done: true };

      case "ping":
        return null;

      case "error":
        throw errorFromStatus(
          parsed.error?.status_code || 502,
          `Anthropic API error: ${parsed.error?.message || "Unknown error"}`
        );

      default:
        return null;
    }
  } catch (err: any) {
    if (err && (err as AppError).kind) throw err;
    return null;
  }
}

export async function* streamChat(
  payload: MessagePayload[] | { messages: MessagePayload[]; tools?: unknown[] },
  model: string,
  provider: ProviderConfig,
  signal?: AbortSignal
): AsyncGenerator<StreamChunk> {
  // Normalize payload: accept either raw messages array or { messages, tools } object
  const messages = Array.isArray(payload) ? payload : payload.messages;
  const tools = Array.isArray(payload) ? undefined : payload.tools;

  // Detect wire variant — OpenRouter ALWAYS uses OpenAI-compatible parser
  const wireVariant = detectWireVariant(provider);

  // Resolve API key: 1) stored, 2) provider env var, 3) fallback env vars
  let apiKey: string | undefined = provider.stored_api_key?.trim() || undefined;

  if (!apiKey) {
    if (wireVariant === "anthropic_native") {
      apiKey = await _getEnvKey(provider.env_key ?? "ANTHROPIC_API_KEY");
    } else {
      apiKey = await _getEnvKey(provider.env_key ?? `${provider.name.toUpperCase()}_API_KEY`);
      if (!apiKey) {
        apiKey = (await _getEnvKey("OPENROUTER_API_KEY")) || (await _getEnvKey("OPENAI_API_KEY"));
      }
    }
  }

  if (!apiKey) {
    throw errorFromStatus(
      401,
      `No API key found for provider "${provider.name}". Save a key in Settings → Models or set the \`${provider.env_key ?? `${provider.name.toUpperCase()}_API_KEY`}\` environment variable.`
    );
  }

  // Build request body based on wire variant
  let body: Record<string, unknown>;
  let endpoint: string;
  let headers: Record<string, string>;

  if (wireVariant === "anthropic_native") {
    const converted = convertMessagesToAnthropicBlocks(messages);
    body = {
      model,
      max_tokens: 4096,
      stream: true,
      messages: converted.messages,
    };
    if (converted.system.length > 0) {
      body.system = converted.system;
    }
    if (tools && tools.length > 0) {
      body.tools = convertToolsToAnthropicSchema(tools);
    }

    const baseUrl = provider.base_url.replace(/\/+$/, "");
    endpoint = `${baseUrl}/v1/messages`;
    headers = {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    };
  } else {
    body = {
      model,
      messages,
      stream: true,
    };
    if (_isOpenRouterProvider(provider)) {
      body.include_reasoning = true;
    }
    if (tools && tools.length > 0) {
      body.tools = tools;
    }

    const baseUrl = provider.base_url.replace(/\/+$/, "");
    endpoint = `${baseUrl}/chat/completions`;
    headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    };
  }

  // Create an abort controller that includes timeouts
  const ourAbort = new AbortController();
  const combinedSignal = _combineSignals(signal, ourAbort.signal);

  let connectionTimer: ReturnType<typeof setTimeout> | undefined;
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  let totalTimer: ReturnType<typeof setTimeout> | undefined;

  const clearTimers = () => {
    clearTimeout(connectionTimer);
    clearTimeout(idleTimer);
    clearTimeout(totalTimer);
  };

  // Connection timeout
  connectionTimer = setTimeout(() => {
    ourAbort.abort(new StreamError("Connection timed out after 30s", { retryable: true }));
  }, CONNECTION_TIMEOUT);

  // Total timeout
  totalTimer = setTimeout(() => {
    ourAbort.abort(new StreamError("Response timed out after 120s", { retryable: true }));
  }, TOTAL_TIMEOUT);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: combinedSignal,
    });

    clearTimeout(connectionTimer);
    connectionTimer = undefined;

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      const status = response.status;

      // Extract a useful detail string from the API response body
      let apiDetail = "";
      try {
        const parsed = JSON.parse(errText);
        apiDetail = parsed?.error?.message || parsed?.message || parsed?.error || "";
      } catch {
        apiDetail = errText.slice(0, 200);
      }

      const hasImages = messages.some(
        (m) => Array.isArray(m.content) && m.content.some((p) => (p as any).type === "image_url")
      );

      // Detect common provider errors
      let msg: string;
      if (status === 401 || status === 403) {
        msg = `Authentication failed for "${provider.name}". Check your API key.`;
      } else if (status === 429) {
        msg = `Rate limited by ${provider.name}. Waiting before retry...`;
      } else if (status >= 500) {
        msg = `${provider.name} returned a server error (${status}). Please try again.`;
      } else if (status === 404) {
        if (hasImages) {
          msg = `"${model}" does not support image attachments on ${provider.name}.`
            + (apiDetail ? ` (${apiDetail})` : " Try a vision-capable model.");
        } else {
          msg = `Model "${model}" not found at ${provider.name}. It may have been deprecated.`
            + (apiDetail ? ` (${apiDetail})` : "");
        }
      } else if (status === 400) {
        msg = apiDetail
          ? `Bad request to ${provider.name}: ${apiDetail}`
          : `Bad request to ${provider.name} (400). The payload may be malformed.`;
      } else {
        msg = apiDetail
          ? `API error ${status}: ${apiDetail}`
          : `API error ${status} from ${provider.name}.`;
      }

      throw errorFromStatus(status, msg);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error("No response body stream");

    const decoder = new TextDecoder();
    let buffer = "";
    let hasYielded = false;

    while (true) {
      // Reset idle timer on each received chunk
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        ourAbort.abort(new StreamError("No data received for 60s — connection went idle", { retryable: true }));
      }, IDLE_TIMEOUT);

      const { done, value } = await reader.read();
      if (done) break;

      hasYielded = true;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data: ")) continue;
        const data = trimmed.slice(6).trim();
        if (data === "[DONE]") {
          yield { done: true };
          return;
        }
        try {
          const parsed = JSON.parse(data);
          const chunk = parseOpenAIFrame(parsed);
          if (chunk) yield chunk;
        } catch {
          // Skip malformed JSON
        }
      }
    }
  } catch (err: any) {
    clearTimers();
    // Convert StreamError (internal abort reasons) to AppError
    if (err instanceof StreamError) {
      throw _streamErrorToAppError(err);
    }
    if (err.name === "AbortError") {
      const reason = ourAbort.signal.reason;
      if (reason instanceof StreamError) {
        throw _streamErrorToAppError(reason);
      }
      throw { kind: "cancelled", message: "Request cancelled" } satisfies AppError;
    }
    // Network errors (fetch throws TypeError)
    if (err instanceof TypeError || err.message?.includes("fetch")) {
      throw errorFromStatus(0, `Network error: ${err.message || "Connection failed"}`);
    }
    throw { kind: "unknown", message: `Stream error: ${err.message || "Unknown error"}` } satisfies AppError;
  } finally {
    clearTimers();
  }

  // Fallback done signal (should be unreachable — parsers emit { done: true })
  yield { done: true };
}

function _isOpenRouterProvider(provider: ProviderConfig): boolean {
  const name = provider.name.toLowerCase();
  const baseUrl = provider.base_url.toLowerCase();
  return name.includes("openrouter") || baseUrl.includes("openrouter.ai");
}

/**
 * Parse a single OpenAI-compatible SSE delta frame.
 * Extracted from the original _parseDelta — behaviour unchanged.
 */
export function parseOpenAIFrame(raw: Record<string, unknown>): StreamChunk | null {
  const parsed = raw as any;
  const choice = parsed.choices?.[0];
  if (!choice) return null;

  const delta = choice.delta ?? {};
  const chunk: StreamChunk = {};

  const rawContent = _deltaText(delta.content);
  if (rawContent) {
    // Some models (DeepSeek, Qwen) embed thinking inside <think>...</think>
    // tags in the content stream rather than a separate reasoning field.
    const raw = rawContent;
    const thinkOpen = raw.indexOf("<think>");
    const thinkClose = raw.indexOf("</think>");
    if (thinkOpen !== -1 && thinkClose === -1) {
      // Opening tag seen but not yet closed — everything after it is thinking
      chunk.thinking = raw.slice(thinkOpen + 7);
    } else if (thinkOpen === -1 && thinkClose !== -1) {
      // Closing tag: everything before is thinking, after is content
      chunk.thinking = raw.slice(0, thinkClose);
      const after = raw.slice(thinkClose + 8).trimStart();
      if (after) chunk.text = after;
    } else if (thinkOpen !== -1 && thinkClose !== -1) {
      // Both tags in the same chunk
      chunk.thinking = raw.slice(thinkOpen + 7, thinkClose);
      const after = raw.slice(thinkClose + 8).trimStart();
      if (after) chunk.text = after;
    } else {
      chunk.text = raw;
    }
  }

  // Reasoning / thinking trace extraction (explicit fields)
  const reasoningContent = _deltaText(delta.reasoning_content);
  if (reasoningContent) {
    chunk.thinking = reasoningContent;
  }
  const deltaReasoning = _deltaText(delta.reasoning);
  if (deltaReasoning && !chunk.thinking) {
    chunk.thinking = deltaReasoning;
  }
  const parsedReasoning = _deltaText(parsed.reasoning);
  if (parsedReasoning && !chunk.thinking) {
    chunk.thinking = parsedReasoning;
  }
  const reasoningDetails = _reasoningDetailsText(delta.reasoning_details) || _reasoningDetailsText(parsed.reasoning_details);
  if (reasoningDetails && !chunk.thinking) {
    chunk.thinking = reasoningDetails;
  }

  // Tool call delta extraction (OpenAI-compatible)
  // delta.tool_calls is an array of partial tool call objects
  if (delta.tool_calls && Array.isArray(delta.tool_calls)) {
    const deltas = [];
    for (const tc of delta.tool_calls) {
      deltas.push({
        index: tc.index ?? 0,
        call_id_part: tc.id,
        tool_name_part: tc.function?.name,
        arguments_part: tc.function?.arguments,
      });
    }
    chunk.tool_call_deltas = deltas;
    chunk.tool_call_delta = deltas[deltas.length - 1];
  }

  // Parse usage from the final chunk
  if (parsed.usage) {
    const usage = parsed.usage as any;
    chunk.usage = {
      prompt_tokens: usage.prompt_tokens ?? 0,
      completion_tokens: usage.completion_tokens ?? 0,
    };
  }

  if (choice.finish_reason === "stop" || choice.finish_reason === "length") {
    chunk.done = true;
  }

  return chunk.text || chunk.thinking || chunk.tool_call_delta || chunk.tool_call_deltas?.length || chunk.done || chunk.usage ? chunk : null;
}

function _reasoningDetailsText(value: unknown): string {
  if (!Array.isArray(value)) return "";
  return value.map((entry) => {
    if (!entry || typeof entry !== "object") return "";
    const record = entry as Record<string, unknown>;
    // OpenRouter may return encrypted reasoning details (not user-readable) so
    // only surface text/summary-style details in the Thinking UI.
    return _deltaText(record.text)
      || _deltaText(record.summary)
      || _deltaText(record.content)
      || _reasoningDetailsText(record.details)
      || _reasoningDetailsText(record.summaries);
  }).filter(Boolean).join("\n");
}

function _deltaText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value == null) return "";
  if (Array.isArray(value)) {
    return value.map(_deltaText).join("");
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.text === "string") return record.text;
    if (typeof record.content === "string") return record.content;
    if (typeof record.value === "string") return record.value;
    return "";
  }
  return String(value);
}

/**
 * Resolve an API key from environment variables via the Rust backend.
 *
 * Previously this read env vars directly from the browser/native sidecar,
 * which was unreliable. Now routes through a controlled Tauri command
 * (`get_env_var`) that only allows a whitelist of env var names.
 */
async function _getEnvKey(key: string): Promise<string | undefined> {
  try {
    const value = await Config.getEnvVar(key);
    if (value) return value;
  } catch {
    // fall through — the Tauri command will reject non-whitelisted keys
  }
  // Vite fallback for `npm run dev` / non-Tauri environments
  try {
    return (import.meta as any).env[`VITE_${key}`] ?? undefined;
  } catch {
    return undefined;
  }
}

function _combineSignals(...signals: (AbortSignal | undefined)[]): AbortSignal {
  const controller = new AbortController();
  for (const signal of signals) {
    if (!signal) continue;
    if (signal.aborted) {
      controller.abort(signal.reason);
      return controller.signal;
    }
    signal.addEventListener("abort", () => controller.abort(signal.reason), { once: true });
  }
  return controller.signal;
}

/**
 * Build message payload from a list of frontend messages.
 * Supports both legacy content-based messages and segment-based messages.
 */
export function buildPayload(messages: {
  role: string;
  content: { type: string; text?: string; data?: string; mime?: string }[];
  segments?: { type: string; content?: string; text?: string; tool_name?: string; arguments?: Record<string, unknown>; call_id?: string }[];
  thinking?: string;
  tool_call_id?: string;
}[]): MessagePayload[] {
  const result: MessagePayload[] = [];
  // Queue of call_ids from the most recent assistant tool_calls block.
  // Used to recover tool_call_id on legacy tool-result messages that were
  // saved before the tool_call_id field was added to the Message schema.
  let pendingCallIds: string[] = [];

  for (const m of messages) {
    // ── Tool result message ───────────────────────────────────────────────
    if (m.role === "tool") {
      const textPart = m.content.find((p) => p.type === "text");
      // Prefer stored tool_call_id; fall back to the next pending call_id
      // recovered from the preceding assistant tool_calls block.
      const callId = m.tool_call_id || pendingCallIds.shift() || "";
      result.push({
        role: "tool" as const,
        content: textPart?.text ?? "",
        tool_call_id: callId,
      } as any);
      continue;
    }

    // ── Assistant message ─────────────────────────────────────────────────
    if (m.role === "assistant") {
      const textParts: string[] = [];
      const toolCalls: { id: string; type: "function"; function: { name: string; arguments: string } }[] = [];

      if (m.segments && m.segments.length > 0) {
        for (const seg of m.segments) {
          if (seg.type === "content" && seg.text) textParts.push(seg.text);
          if (seg.type === "tool_call" && seg.call_id && seg.tool_name) {
            toolCalls.push({
              id: seg.call_id,
              type: "function",
              function: {
                name: seg.tool_name,
                arguments: JSON.stringify(seg.arguments ?? {}),
              },
            });
          }
        }
      } else {
        // Legacy path: no segments, use content array
        const textPart = m.content.find((p) => p.type === "text");
        if (textPart?.text) textParts.push(textPart.text);
      }

      if (toolCalls.length > 0) {
        // Populate the recovery queue for any following tool-result messages
        pendingCallIds = toolCalls.map((tc) => tc.id);
        result.push({
          role: "assistant" as const,
          content: textParts.join("\n") || null,
          tool_calls: toolCalls,
        } as any);
      } else {
        pendingCallIds = []; // not a tool-calling turn; reset queue
        result.push({
          role: "assistant" as const,
          content: textParts.join("\n") || "",
        });
      }
      continue;
    }

    // All other roles (user, system)
    result.push({
      role: m.role as "user" | "assistant" | "system",
      content: m.content.map((part) => {
        if (part.type === "image" && part.data) {
          const mime = part.mime || "image/jpeg";
          return {
            type: "image_url",
            image_url: { url: `data:${mime};base64,${part.data}` },
          };
        }
        return { type: "text", text: part.text ?? "" };
      }),
    });
  }

  return result;
}

/**
 * Build an OpenAI-compatible tool-calling payload.
 * Includes tool definitions, assistant tool_calls, and tool result messages.
 */
export function buildToolPayload(
  messages: MessagePayload[],
  toolDefs: { type: string; function: { name: string; description: string; parameters: unknown } }[]
): { messages: MessagePayload[]; tools: unknown[] } {
  return {
    messages,
    tools: toolDefs,
  };
}

/**
 * Assemble fragmented tool_call_delta chunks into complete tool calls.
 * Call this when streaming ends (done=true) to emit tool_call_complete events.
 */
export function assembleToolCalls(
  deltas: { index: number; call_id_part?: string; tool_name_part?: string; arguments_part?: string }[]
): { call_id: string; tool_name: string; arguments: Record<string, unknown> }[] {
  const byIndex: Map<number, { call_id: string; tool_name: string; argumentsRaw: string }> = new Map();

  for (const d of deltas) {
    const existing = byIndex.get(d.index);
    if (existing) {
      if (d.call_id_part) existing.call_id = d.call_id_part;
      if (d.tool_name_part) existing.tool_name = d.tool_name_part;
      if (d.arguments_part) existing.argumentsRaw += d.arguments_part;
    } else {
      byIndex.set(d.index, {
        call_id: d.call_id_part ?? "",
        tool_name: d.tool_name_part ?? "",
        argumentsRaw: d.arguments_part ?? "",
      });
    }
  }

  const results: { call_id: string; tool_name: string; arguments: Record<string, unknown> }[] = [];
  for (const [, assembled] of byIndex) {
    let args: Record<string, unknown> = {};
    try {
      args = JSON.parse(assembled.argumentsRaw || "{}");
    } catch {
      // Malformed tool-call arguments — surface the error rather than
      throw errorFromStatus(
        502,
        `Tool call "${assembled.tool_name}" has malformed arguments: ${assembled.argumentsRaw?.substring(0, 200)}`
      );
    }
    results.push({
      call_id: assembled.call_id,
      tool_name: assembled.tool_name,
      arguments: args,
    });
  }

  return results;
}
