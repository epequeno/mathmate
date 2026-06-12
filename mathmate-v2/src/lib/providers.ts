import type { ProviderConfig } from "../stores/configStore";
import type { StreamChunk } from "./types";

export interface MessagePayload {
  role: "user" | "assistant" | "system";
  content: string | { type: string; text?: string; image_url?: { url: string } }[];
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

/**
 * Stream chat completion from an OpenAI-compatible endpoint.
 * Yields text and thinking chunks as they arrive.
 * Supports optional tool definitions for function calling.
 */
export async function* streamChat(
  payload: MessagePayload[] | { messages: MessagePayload[]; tools?: unknown[] },
  model: string,
  provider: ProviderConfig,
  signal?: AbortSignal
): AsyncGenerator<StreamChunk> {
  // Normalize payload: accept either raw messages array or { messages, tools } object
  const messages = Array.isArray(payload) ? payload : payload.messages;
  const tools = Array.isArray(payload) ? undefined : payload.tools;

  const body: Record<string, unknown> = {
    model,
    messages,
    stream: true,
  };

  // OpenRouter only streams model reasoning/thinking fields when the client
  // opts in. MathMate's parser/UI already preserves those fields as plain
  // text; this ensures reasoning-capable OpenRouter models actually emit them.
  if (_isOpenRouterProvider(provider)) {
    body.include_reasoning = true;
  }

  // Include tool definitions if present
  if (tools && tools.length > 0) {
    body.tools = tools;
  }

  // Detect Anthropic-style provider
  const isAnthropic = provider.base_url.includes("anthropic") || provider.name.toLowerCase().includes("claude");

  // Preferred order:
  // 1) Provider key saved in Settings (stored in ~/.mathmate/models.json)
  // 2) Provider-specific env var
  // 3) OpenRouter/OpenAI env fallback for OpenAI-compatible endpoints
  let apiKey: string | undefined = provider.stored_api_key?.trim() || undefined;

  if (!apiKey) {
    if (isAnthropic) {
      apiKey = await _getEnvKey(provider.env_key ?? "ANTHROPIC_API_KEY");
    } else {
      apiKey = await _getEnvKey(provider.env_key ?? `${provider.name.toUpperCase()}_API_KEY`);
      if (!apiKey) {
        apiKey = (await _getEnvKey("OPENROUTER_API_KEY")) || (await _getEnvKey("OPENAI_API_KEY"));
      }
    }
  }

  if (!apiKey) {
    throw new StreamError(
      `No API key found for provider "${provider.name}". Save a key in Settings → Models or set the \`${provider.env_key ?? `${provider.name.toUpperCase()}_API_KEY`}\` environment variable.`,
      { retryable: true }
    );
  }

  // Determine endpoint URL
  const baseUrl = provider.base_url.replace(/\/+$/, "");
  const endpoint = isAnthropic
    ? `${baseUrl}/v1/messages`
    : `${baseUrl}/chat/completions`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };
  if (isAnthropic) {
    headers["anthropic-version"] = "2023-06-01";
    body.max_tokens = body.max_tokens ?? 4096;
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
      const retryable = status >= 500 || status === 429;
      const rateLimited = status === 429;

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

      throw new StreamError(msg, { status, retryable, rateLimited });
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
          const chunk = _parseDelta(parsed, isAnthropic);
          if (chunk) yield chunk;
        } catch {
          // Skip malformed JSON
        }
      }
    }
  } catch (err: any) {
    clearTimers();
    // Re-throw StreamErrors as-is, wrap everything else
    if (err instanceof StreamError) throw err;
    if (err.name === "AbortError") {
      const reason = ourAbort.signal.reason;
      if (reason instanceof StreamError) throw reason;
      throw new StreamError("Request cancelled", { retryable: true });
    }
    // Network errors (fetch throws TypeError)
    const isNetworkError = err instanceof TypeError || err.message?.includes("fetch");
    throw new StreamError(
      isNetworkError ? `Network error: ${err.message || "Connection failed"}` : `Stream error: ${err.message || "Unknown error"}`,
      { retryable: isNetworkError }
    );
  } finally {
    clearTimers();
  }

  yield { done: true };
}

function _isOpenRouterProvider(provider: ProviderConfig): boolean {
  const name = provider.name.toLowerCase();
  const baseUrl = provider.base_url.toLowerCase();
  return name.includes("openrouter") || baseUrl.includes("openrouter.ai");
}

function _parseDelta(parsed: any, _isAnthropic: boolean): StreamChunk | null {
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
    chunk.usage = {
      prompt_tokens: parsed.usage.prompt_tokens ?? 0,
      completion_tokens: parsed.usage.completion_tokens ?? 0,
    };
  }

  if (choice.finish_reason === "stop" || choice.finish_reason === "length") {
    chunk.done = true;
  }

  return chunk.text || chunk.thinking || chunk.tool_call_delta || chunk.tool_call_deltas?.length || chunk.done ? chunk : null;
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
    const { invoke } = await import("./tauri");
    const value = await invoke<string | null>("get_env_var", { key });
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
      // silently executing with empty/default args.
      throw new StreamError(
        `Tool call "${assembled.tool_name}" has malformed arguments: ${assembled.argumentsRaw?.substring(0, 200)}`,
        { status: 502, retryable: false }
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
