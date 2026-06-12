import { create } from "zustand";
import type { Message, MessageSegment, Session, SessionHeader, StreamChunk } from "../lib/types";
import { makeMessage, makeSegment, makeSessionHeader } from "../lib/types";
import { buildPayload, buildToolPayload, streamChat, StreamError, assembleToolCalls } from "../lib/providers";
import { useConfigStore } from "./configStore";
import { useProjectStore } from "./projectStore";
import { executeCommand } from "./commandStore";
import { wrapRetrievedMemories } from "../lib/memorySafety";
import { Sessions, Memory as MemoryApi, Tools as ToolsApi } from "../lib/api";

interface ChatState {
  currentSession: Session | null;
  sessionList: SessionHeader[];
  archivedSessionList: SessionHeader[];
  loading: boolean;
  streaming: boolean;
  abortController: AbortController | null;
  streamedText: string;
  streamedThinking: string;
  inputText: string;
  lastScrollTop: number;
  /** Currently selected model (can differ from session header during streaming) */
  model: string;
  /** Currently selected provider */
  provider: string;
  error: string | null;

  /** Derived: current streaming content for rendering */
  streamingContent: string;
  /** Derived: current streaming thinking trace */
  streamingThinking: string;
  /** Live segment accumulation during streaming (Phase 12A) */
  streamSegments: MessageSegment[];
  // Vision warning
  visionWarning: string | null;

  // ─── Synapse / Memory ────────────────────────────
  /** Memories retrieved for the current/active query */
  retrievedMemories: import("../lib/types").MemoryItem[];
  /** Whether memory search is in progress */
  memorySearchActive: boolean;
  /** Whether memory context injection is enabled */
  memoryEnabled: boolean;

  loadSessions: () => Promise<void>;
  loadArchivedSessions: () => Promise<void>;
  restoreLastSession: () => Promise<void>;
  openSession: (sessionId: string) => Promise<void>;
  newSession: (projectId?: string) => Promise<void>;
  sendMessage: () => Promise<void>;
  cancelStream: () => void;
  setInputText: (text: string) => void;
  appendToCurrentMessage: (text: string) => void;
  archiveSession: (sessionId: string) => Promise<void>;
  unarchiveSession: (sessionId: string) => Promise<void>;
  renameSession: (sessionId: string, title: string) => Promise<void>;
  deleteSession: (sessionId: string) => Promise<void>;
  purgeSession: (sessionId: string) => Promise<void>;
  /** Images queued to be sent with the next message */
  pendingImages: { mime: string; data: string }[];
  attachImage: (base64: string, mime: string) => void;
  removePendingImage: (index: number) => void;
  setModel: (model: string) => void;
  setProvider: (provider: string) => void;
  updateSessionHeader: (overrides: Partial<SessionHeader>) => void;
  clearError: () => void;
  // ─── Synapse / Memory actions ────────────────
  setMemoryEnabled: (enabled: boolean) => void;
  clearRetrievedMemories: () => void;
  clearVisionWarning: () => void;
}


export const useChatStore = create<ChatState>((set, get) => ({
  currentSession: null,
  sessionList: [],
  archivedSessionList: [],
  loading: false,
  streaming: false,
  abortController: null,
  streamedText: "",
  streamedThinking: "",
  inputText: "",
  lastScrollTop: 0,
  model: "",
  provider: "",
  error: null,
  retrievedMemories: [],
  memorySearchActive: false,
  memoryEnabled: true,

  streamSegments: [],

  // Derived getters (computed in subscribe or consumers)
  get streamingContent() { return this.streamedText; },
  get streamingThinking() { return this.streamedThinking; },

  // Vision warning (non-blocking toast)
  visionWarning: null,
  pendingImages: [],

  loadSessions: async () => {
    try {
      const headers = await Sessions.list(null);
      set({ sessionList: headers });
    } catch (err) {
      console.error("Failed to list sessions:", err);
    }
  },

  loadArchivedSessions: async () => {
    try {
      const headers = await Sessions.listArchived(null);
      set({ archivedSessionList: headers });
    } catch (err) {
      console.error("Failed to list archived sessions:", err);
    }
  },

  restoreLastSession: async () => {
    try {
      const lastId = await Sessions.getLast();
      if (lastId) {
        try {
          const session = await Sessions.load(lastId);
          // Sync the picker's model/provider to match the restored session
          set({
            currentSession: session,
            model: session.header.model || "",
            provider: session.header.provider || "",
          });
          return;
        } catch {
          // Session file may have been deleted — fall through to new session
        }
      }
    } catch (err) {
      console.error("Failed to restore last session:", err);
    }
    // Create a new session if no last session found or failed to load
    get().newSession();
  },

  openSession: async (sessionId: string) => {
    try {
      const session = await Sessions.load(sessionId);
      // Sync the picker's model/provider to match the loaded session
      set({
        currentSession: session,
        model: session.header.model || "",
        provider: session.header.provider || "",
      });
      // Auto-set current project to match the session
      const pid = session.header.project_id;
      if (pid) {
        const project = useProjectStore.getState().projects.find(p => p.id === pid);
        if (project) useProjectStore.getState().setCurrentProject(project);
      }
      Sessions.saveLast(sessionId).catch(() => {});
    } catch (err) {
      console.error("Failed to load session:", err);
    }
  },

  newSession: async (projectId?: string) => {
    const model = useConfigStore.getState().providers[0]?.default_model ?? "";
    const provider = useConfigStore.getState().providers[0]?.name ?? "";
    const { projects, currentProject } = useProjectStore.getState();
    const pid = projectId ?? currentProject?.id;
    const project = projects.find(p => p.id === pid) ?? currentProject;
    const header = makeSessionHeader({
      model: project?.default_model || model,
      provider,
      project_id: pid,
      tutor_style: project?.tutor_style,
    });
    try {
      const session = await Sessions.create(header, null);
      if (project) useProjectStore.getState().setCurrentProject(project);
      set({
        currentSession: session,
        model: project?.default_model || model,
        provider,
      });
      Sessions.saveLast(session.header.id).catch(() => {});
      get().loadSessions();
    } catch (err) {
      console.error("Failed to create session:", err);
    }
  },

  sendMessage: async () => {
    const { inputText, currentSession, streaming, pendingImages } = get();
    if ((!inputText.trim() && pendingImages.length === 0) || streaming) return;

    // Handle slash commands
    if (inputText.startsWith("/")) {
      const result = executeCommand(inputText);
      if (result && currentSession) {
        const assistantMsg = makeMessage("assistant", result);
        try {
          const updated = await Sessions.append(currentSession.header.id, assistantMsg);
          set({ currentSession: updated, inputText: "" });
        } catch (err) {
          console.error("Failed to save command response:", err);
          set({ inputText: "" });
        }
      } else {
        set({ inputText: "" });
      }
      return;
    }

    // Create or reuse session
    let sessionId: string;
    if (currentSession) {
      sessionId = currentSession.header.id;
    } else {
      const model = useConfigStore.getState().providers[0]?.default_model ?? "";
      const provider = useConfigStore.getState().providers[0]?.name ?? "";
      const currentProject = useProjectStore.getState().currentProject;
      const projectId = currentProject?.id;
      const tutorStyle = currentProject?.tutor_style;
      const header = makeSessionHeader({
        model: currentProject?.default_model || model,
        provider,
        project_id: projectId,
        tutor_style: tutorStyle,
      });
      try {
        const newS = await Sessions.create(header, null);
        set({ currentSession: newS });
        sessionId = newS.header.id;
      } catch (err) {
        console.error("Failed to create session:", err);
        return;
      }
    }

    // Save user message — include any pending image attachments
    const userMsg = makeMessage("user", inputText);
    // Consume pending images from the store
    const images = get().pendingImages;
    set({ pendingImages: [] });
    for (const img of images) {
      userMsg.content.push({ type: "image", mime: img.mime, data: img.data });
    }
    // Drop the empty text part when the user typed nothing (image-only message)
    if (!inputText.trim() && images.length > 0) {
      userMsg.content = userMsg.content.filter((p) => p.type !== "text" || (p.text ?? "").trim() !== "");
    }
    try {
      const updated = await Sessions.append(sessionId, userMsg);
      set({ currentSession: updated, inputText: "" });
    } catch (err) {
      console.error("Failed to save user message:", err);
      return;
    }

    // Get current session
    const sess = get().currentSession;
    if (!sess) return;

    // Save last session
    Sessions.saveLast(sess.header.id).catch(() => {});

    // ─── Synapse memory retrieval ─────────────────
    // Query relevant memories to inject as context for the model
    let retrievedMemories: import("../lib/types").MemoryItem[] = [];
    const { memoryEnabled } = get();
    if (memoryEnabled) {
      try {
        const memoryQuery = inputText.substring(0, 200);
        retrievedMemories = await MemoryApi.query(memoryQuery, 8);
      } catch (err) {
        console.error("[synapse] Failed to query memories:", err);
      }
    }
    set({ retrievedMemories, memorySearchActive: false });

    // Start streaming
    const abortController = new AbortController();
    set({ streaming: true, abortController, streamedText: "", streamedThinking: "", streamSegments: [], error: null });

    const configuredProviders = useConfigStore.getState().providers;
    // Explicit picker selection wins over session-stored model — this prevents
    // the Rust append_message response (which returns the on-disk session header)
    // from silently overriding a model the user switched to mid-session.
    const selectedProviderName = get().provider || sess.header.provider || configuredProviders[0]?.name;
    const provider = configuredProviders.find((p) => p.name === selectedProviderName) ?? configuredProviders[0];

    if (!provider) {
      set({ streaming: false, abortController: null });
      const errMsg = makeMessage("assistant", "No API provider configured. Add one in Settings.");
      try {
        const updated = await Sessions.append(sess.header.id, errMsg);
        set({ currentSession: updated });
      } catch {}
      return;
    }

    const selectedModel = get().model || sess.header.model || provider.default_model;

    // ─── Vision capability check ──────────────────
    // If the user attached images and we know the model doesn't support vision,
    // surface a clear warning but still attempt the send — the provider error
    // will be the definitive answer.
    const hasImageParts = userMsg.content.some((p) => p.type === "image");
    if (hasImageParts) {
      const catalog = useConfigStore.getState().modelCatalog;
      const catalogEntry = catalog?.models.find((m) => m.id === selectedModel);
      if (catalogEntry && !catalogEntry.supports_vision) {
        set({ visionWarning: `"${selectedModel}" does not support images. Switch to a vision-capable model.` });
      } else {
        set({ visionWarning: null });
      }
    } else {
      set({ visionWarning: null });
    }

    // ─── Interactive tag system prompt ───────────────
    // Teach the model about visualization and quiz tags that the frontend renders natively.
    const SYSTEM_INSTRUCTIONS = `
Answer as a clear math tutor.

## Math formatting (KaTeX-compatible, required)
- Use LaTeX for mathematical notation whenever possible.
- Always use KaTeX-compatible delimiters:
  - Inline math: $...$
  - Display math: $$...$$
- Prefer symbolic forms (\\frac, exponents, roots, Greek letters) over plain ASCII math.
- Keep math syntax KaTeX-friendly:
  - avoid uncommon/unsupported LaTeX macros and environments,
  - avoid raw HTML for equations,
  - do not emit \(...\) or \[...\] delimiters,
  - do not wrap equations in backticks/code blocks.
- Avoid duplicate mixed notation for the same equation (don't show both plain-text and LaTeX versions). Use the LaTeX version only.

## Interactive components (strict)
- Do NOT include <mathmate-viz> or <mathmate-quiz> by default.
- Only use these tags if the user explicitly asks for a graph/visualization, quiz, or practice exercise.
- For normal explanation requests, return plain explanatory text + LaTeX only.`;

    const appConfig = useConfigStore.getState().appConfig;
    const userSystemPrompt = appConfig?.chat?.system_prompt?.trim() || "";
    let combinedSystemPrompt = userSystemPrompt
      ? `${userSystemPrompt}\n\n${SYSTEM_INSTRUCTIONS}`
      : SYSTEM_INSTRUCTIONS;

    // Inject retrieved memory context into the system prompt
    // using the safety wrapper (size caps, trust bucketing, preamble)
    if (retrievedMemories.length > 0) {
      const wrapped = wrapRetrievedMemories(
        retrievedMemories.map((m) => ({
          ...m,
          trust_score: (m as any).trust_score ?? 1.0,
        })),
      );

      if (wrapped.systemBlock) {
        combinedSystemPrompt += `

${wrapped.systemBlock}`;
      }
      if (wrapped.lowTrustBlock) {
        combinedSystemPrompt += `

${wrapped.lowTrustBlock}`;
      }

      if (import.meta.env.DEV) {
        console.debug(
          `[memory] truncated: ${wrapped.truncatedCount}, included: ${wrapped.includedCount}, totalBytes: ${wrapped.totalBytes}, excluded: ${wrapped.excludedCount}`,
        );
      }
    }

    // Inject textbook context into the system prompt
    const project = useProjectStore.getState().currentProject;
    if (project?.textbook_path) {
      combinedSystemPrompt += `

## Textbook Access
You have access to the textbook set for this project.
Use the \`search_textbook\` tool whenever the user asks about specific topics,
sections, exercises, or page numbers from their textbook.
Search the textbook to find relevant content before answering questions
about specific material. This is especially useful when the user references
section numbers (e.g., "Section 5.2"), exercise numbers, or specific topics
covered in the course.`;
    }

    const sysMsg = makeMessage("system", combinedSystemPrompt);
    // sess.messages already includes userMsg (returned from append_message).
    // Do NOT concat userMsg again — that duplicates it in the payload.
    const messagesWithSystem = [sysMsg, ...sess.messages];

    // Stream with auto-retry
    const maxRetries = 1;
    let attempt = 0;
    let lastError: string | null = null;

    while (attempt <= maxRetries) {
      try {
        const payload = buildPayload(messagesWithSystem);

        // ─── Multi-round tool loop (Phase 12B) ───────────
        const MAX_TOOL_ROUNDS = 3;
        const TOOL_TIMEOUT_MS = 8000;
        const MAX_STREAMED_BYTES = 1_048_576; // 1 MB cap per accumulated string
        let toolRound = 0;
        let finalSession = sess;

        // Fetch tool definitions from Rust
        let toolDefs: any[] = [];
        try {
          toolDefs = await ToolsApi.getDefinitions();
        } catch (err) {
          console.warn("[tools] Failed to load tool definitions:", err);
        }

        // Build the conversation messages for the loop
        let conversationMessages = [...payload];

        while (toolRound <= MAX_TOOL_ROUNDS) {
          let accumulatedText = "";
          let accumulatedThinking = "";
          let accumulatedSegments: MessageSegment[] = [];
          const toolCallDeltas: { index: number; call_id_part?: string; tool_name_part?: string; arguments_part?: string }[] = [];

          // Create a mutable content segment for streaming text
          let contentSegmentId: string | null = null;
          let thinkingSegmentId: string | null = null;

          const updateSegments = () => {
            const segs: MessageSegment[] = [];
            if (accumulatedThinking) {
              if (!thinkingSegmentId) thinkingSegmentId = crypto.randomUUID();
              segs.push({
                id: thinkingSegmentId,
                ts: new Date().toISOString(),
                type: "thinking",
                content: accumulatedThinking,
              });
            }
            if (accumulatedText) {
              if (!contentSegmentId) contentSegmentId = crypto.randomUUID();
              segs.push({
                id: contentSegmentId,
                ts: new Date().toISOString(),
                type: "content",
                text: accumulatedText,
              });
            }
            accumulatedSegments = segs;
            set({ streamSegments: segs });
          };

          // Build payload with tools (if available and not first round with only text)
          const streamPayload = toolDefs.length > 0
            ? buildToolPayload(conversationMessages, toolDefs)
            : { messages: conversationMessages };

          for await (const chunk of streamChat(
            streamPayload,
            selectedModel,
            provider,
            abortController.signal
          )) {
            if (chunk.text) {
              accumulatedText += chunk.text;
              if (accumulatedText.length > MAX_STREAMED_BYTES) {
                throw new StreamError("Response exceeded 1 MB limit", { status: 502, retryable: false });
              }
              set({ streamedText: accumulatedText });
              updateSegments();
            }
            if (chunk.thinking) {
              accumulatedThinking += chunk.thinking;
              if (accumulatedThinking.length > MAX_STREAMED_BYTES) {
                throw new StreamError("Thinking trace exceeded 1 MB limit", { status: 502, retryable: false });
              }
              set({ streamedThinking: accumulatedThinking });
              updateSegments();
            }
            const incomingToolDeltas = chunk.tool_call_deltas ?? (chunk.tool_call_delta ? [chunk.tool_call_delta] : []);
            if (incomingToolDeltas.length > 0) {
              toolCallDeltas.push(...incomingToolDeltas);
            }
            if (chunk.done) break;
          }

          // Assemble fragmented tool calls into complete calls
          const assembledCalls = assembleToolCalls(toolCallDeltas);

          // If no tool calls, this is the final response — break the loop
          if (assembledCalls.length === 0) {
            const finalText = accumulatedText || "(no response)";
            const assistantMsg = makeMessage("assistant", finalText);
            assistantMsg.segments = accumulatedSegments;
            if (accumulatedThinking) {
              assistantMsg.thinking = accumulatedThinking;
            }

            const updated = await Sessions.append(sess.header.id, assistantMsg);
            finalSession = updated;
            break;
          }

          // ─── Tool calls present: execute them ───────────
          toolRound++;

          // Add tool call segments to the timeline
          for (const tc of assembledCalls) {
            accumulatedSegments.push(
              makeSegment({
                type: "tool_call",
                tool_name: tc.tool_name,
                arguments: tc.arguments,
                call_id: tc.call_id,
                status: "running",
              })
            );
          }
          set({ streamSegments: [...accumulatedSegments] });

          // Save the assistant message with tool call segments
          const assistantWithTools = makeMessage("assistant", accumulatedText || "");
          assistantWithTools.segments = [...accumulatedSegments];
          if (accumulatedThinking) {
            assistantWithTools.thinking = accumulatedThinking;
          }
          const updatedAfterTools = await Sessions.append(sess.header.id, assistantWithTools);
          finalSession = updatedAfterTools;

          // Execute each tool call
          const toolResults: { call_id: string; result: unknown; is_error: boolean }[] = [];
          const currentProjectId = useProjectStore.getState().currentProject?.id;

          for (const tc of assembledCalls) {
            try {
              // Add timeout via AbortController-like pattern
              const resultPromise = ToolsApi.execute(
                tc.call_id,
                tc.tool_name,
                tc.arguments,
                currentProjectId,
              );

              const timeoutPromise = new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error("Tool execution timed out")), TOOL_TIMEOUT_MS)
              );

              const result = await Promise.race([resultPromise, timeoutPromise]);
              toolResults.push(result);

              // Add tool result segment to timeline
              accumulatedSegments.push(
                makeSegment({
                  type: "tool_result",
                  call_id: tc.call_id,
                  result: result.result,
                  is_error: result.is_error,
                })
              );
            } catch (err: any) {
              // Tool execution failed (timeout or error)
              toolResults.push({
                call_id: tc.call_id,
                result: { error: err.message || "Tool execution failed" },
                is_error: true,
              });
              accumulatedSegments.push(
                makeSegment({
                  type: "tool_result",
                  call_id: tc.call_id,
                  result: { error: err.message || "Tool execution failed" },
                  is_error: true,
                })
              );
            }
          }

          // Mark all tool_call segments as done/error based on results
          const resultMap = new Map(toolResults.map((r) => [r.call_id, r]));
          for (const seg of accumulatedSegments) {
            if (seg.type === "tool_call") {
              const r = resultMap.get((seg as any).call_id);
              (seg as any).status = r ? (r.is_error ? "error" : "completed") : "completed";
            }
          }

          // Update segments with completed tool results
          set({ streamSegments: [...accumulatedSegments] });

          // Save tool result messages with tool_call_id persisted on the message
          for (const tr of toolResults) {
            const toolResultMsg = makeMessage("tool" as any, JSON.stringify(tr.result));
            toolResultMsg.tool_call_id = tr.call_id;
            await Sessions.append(sess.header.id, toolResultMsg);
          }
          finalSession = await Sessions.load(sess.header.id);

          // Build conversation messages for the next round
          // Include assistant tool_calls + tool results
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

          // Reset streaming state for the next round
          set({ streamedText: "", streamedThinking: "" });

          // Continue the loop for the next round
        }
        if (toolRound > MAX_TOOL_ROUNDS) {
          const assistantMsg = makeMessage(
            "assistant",
            `Stopped after ${MAX_TOOL_ROUNDS} tool rounds without a final answer.`
          );
          const updated = await Sessions.append(sess.header.id, assistantMsg);
          finalSession = updated;
        }
        const memEnabled = get().memoryEnabled;
        set({
          currentSession: finalSession,
          streaming: false,
          abortController: null,
          streamedText: "",
          streamedThinking: "",
          streamSegments: [],
          error: null,
          retrievedMemories: [], // Clear retrieval indicator after response
        });

        // ─── Auto-store session memories ────────
        if (memEnabled) {
          // Store the user's question as a memory for future retrieval
          try {
            const now = new Date().toISOString();
            await MemoryApi.storeWithSafety(
              {
                id: crypto.randomUUID(),
                session_id: sess.header.id,
                source_type: "chat",
                unit_type: "question",
                content: inputText.substring(0, 500),
                score: 1.0,
                created_at: now,
                tags: ["auto", "question"],
                provenance: sess.header.id,
              },
              "balanced"
            );
          } catch (err) {
            console.error("[synapse] Failed to store session memory:", err);
          }
        }

        get().loadSessions();
        return; // Success — exit the retry loop
      } catch (err: any) {
        lastError = err.message || String(err);

        // User-initiated cancellation — never retry
        if (abortController.signal.aborted || err.name === "AbortError") {
          const partialText = get().streamedText || "(cancelled)";
          const partialMsg = makeMessage("assistant", partialText);
          try {
            const updated = await Sessions.append(sess.header.id, partialMsg);
            set({ currentSession: updated });
          } catch {}
          set({
            streaming: false,
            abortController: null,
            streamedText: "",
            streamedThinking: "",
            streamSegments: [],
            error: null,
          });
          return;
        }

        // Only retry on StreamError with retryable flag
        const isRetryable = err instanceof StreamError ? err.retryable : false;

        if (attempt < maxRetries && isRetryable) {
          const delay = Math.pow(2, attempt) * 1000; // 2s, then 4s
          set({ error: `Retrying... (attempt ${attempt + 1}/${maxRetries})` });
          await new Promise((r) => setTimeout(r, delay));
          attempt++;
          continue;
        }

        // Not retryable or out of retries — surface the error.
        //
        // Current error UX (dual-surface):
        // 1. Store `error` field → rendered as inline error banner in ChatPage
        //    (immediate, dismissible notification for operational errors).
        // 2. Assistant error message → persisted in session history so the
        //    user sees the error context on session reload.
        //
        // TODO (14E.1): consolidate into a single `<ErrorBanner>` with
        // kind-specific icons and retry actions. The session-history
        // persistence should use a non-assistant message type.

        // Set error on store for the error banner
        set({ error: lastError, streaming: false, abortController: null, streamSegments: [] });

        const errMsg = makeMessage("assistant", `**Error**: ${lastError}`);
        try {
          const updated = await Sessions.append(sess.header.id, errMsg);
          set({ currentSession: updated });
        } catch {}
        return;
      }
    }
  },

  cancelStream: () => {
    const { abortController } = get();
    if (abortController) {
      abortController.abort();
    }
  },

  setInputText: (text: string) => set({ inputText: text }),

  appendToCurrentMessage: (text: string) => {
    set((s) => ({ inputText: s.inputText + text }));
  },

  archiveSession: async (sessionId: string) => {
    try {
      await Sessions.archive(sessionId);
      const { currentSession } = get();
      if (currentSession?.header.id === sessionId) {
        set({ currentSession: null });
      }
      get().loadSessions();
      get().loadArchivedSessions();
    } catch (err) {
      console.error("Failed to archive session:", err);
    }
  },

  unarchiveSession: async (sessionId: string) => {
    try {
      await Sessions.unarchive(sessionId);
      get().loadSessions();
      get().loadArchivedSessions();
    } catch (err) {
      console.error("Failed to unarchive session:", err);
    }
  },

  renameSession: async (sessionId: string, title: string) => {
    try {
      const updated = await Sessions.rename(sessionId, title);
      set({ currentSession: updated });
      get().loadSessions();
    } catch (err) {
      console.error("Failed to rename session:", err);
    }
  },

  deleteSession: async (sessionId: string) => {
    try {
      await Sessions.delete(sessionId);
      const { currentSession } = get();
      if (currentSession?.header.id === sessionId) {
        set({ currentSession: null });
      }
      get().loadSessions();
    } catch (err) {
      console.error("Failed to delete session:", err);
    }
  },

  purgeSession: async (sessionId: string) => {
    try {
      await Sessions.purge(sessionId);
      const { currentSession } = get();
      if (currentSession?.header.id === sessionId) {
        set({ currentSession: null });
      }
      get().loadArchivedSessions();
    } catch (err) {
      console.error("Failed to purge session:", err);
    }
  },

  attachImage: (base64: string, mime: string) => {
    set((s) => ({ pendingImages: [...s.pendingImages, { mime, data: base64 }] }));
  },

  removePendingImage: (index: number) => {
    set((s) => ({ pendingImages: s.pendingImages.filter((_, i) => i !== index) }));
  },

  setModel: (model: string) => set({ model }),

  setProvider: (provider: string) => set({ provider }),

  updateSessionHeader: (overrides: Partial<SessionHeader>) => {
    const { currentSession } = get();
    if (!currentSession) return;
    const updated: Session = {
      ...currentSession,
      header: { ...currentSession.header, ...overrides },
    };
    set({ currentSession: updated });
    // TODO: Add a dedicated update_session_header Tauri command when needed
  },

  clearError: () => set({ error: null }),

  // ─── Synapse / Memory actions ────────────────
  setMemoryEnabled: (enabled: boolean) => set({ memoryEnabled: enabled }),

  clearRetrievedMemories: () => set({ retrievedMemories: [] }),

  clearVisionWarning: () => set({ visionWarning: null }),
}));
