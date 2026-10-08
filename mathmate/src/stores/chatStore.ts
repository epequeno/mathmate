import { create } from "zustand";
import type { Message, Session, SessionHeader } from "../lib/types";
import { makeMessage, makeSegment, makeSessionHeader } from "../lib/types";
import { buildPayload, buildToolPayload, streamChat, assembleToolCalls } from "../lib/providers";
import { toAppError, isRetryable } from "../lib/error";
import type { AppError } from "../lib/error";
import { runTurn } from "../lib/turn/orchestrator";
import type { TurnInput, TurnDeps, TurnEvent } from "../lib/turn/types";
import { useConfigStore } from "./configStore";
import { useProjectStore } from "./projectStore";
import { executeCommand } from "./commandStore";
import { wrapRetrievedMemories } from "../lib/memorySafety";
import { Sessions, Memory as MemoryApi, Tools as ToolsApi } from "../lib/api";

import {
  type TurnPhase,
  IDLE,
  latestText,
  latestThinking,
  currentSegments,
  isTurnActive,
  isStreaming,
  currentAbortController,
  currentTurnError,
} from "../lib/turn/phase";

// ─── ChatState ────────────────────────────────────────────────────────

interface ChatState {
  currentSession: Session | null;
  sessionList: SessionHeader[];
  archivedSessionList: SessionHeader[];
  loading: boolean;
  /** Turn phase FSM (Phase 15B) — single authoritative field for turn progress. */
  phase: TurnPhase;
  /** The input text captured at send time — used for auto-memory after the turn. */
  capturedInput: string;
  /** The live text accumulated during streaming. */
  streamedText: string;
  /** The live thinking trace accumulated during streaming. */
  streamedThinking: string;
  /** The live segments accumulated during streaming. */
  streamSegments: import("../lib/types").MessageSegment[];

  inputText: string;
  lastScrollTop: number;
  /** Currently selected model (can differ from session header during streaming) */
  model: string;
  /** Currently selected provider */
  provider: string;
  /** Vision capability warning (toast-level UI concern; outside the turn FSM) */
  visionWarning: string | null;

  // ─── Synapse / Memory ────────────────────────────
  retrievedMemories: import("../lib/types").MemoryItem[];
  memorySearchActive: boolean;
  memoryEnabled: boolean;

  // ─── Actions ───────────────────────────────────
  loadSessions: () => Promise<void>;
  loadArchivedSessions: () => Promise<void>;
  restoreLastSession: () => Promise<void>;
  openSession: (sessionId: string) => Promise<void>;
  newSession: (projectId?: string) => Promise<void>;
  /** Send the current `inputText`. Transitions `phase` through the FSM. */
  sendMessage: () => Promise<void>;
  /** Abort the in-flight turn. Reads `AbortController` from `phase`. */
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

  // ─── Memory actions ──────────────────────────────
  setMemoryEnabled: (enabled: boolean) => void;
  clearRetrievedMemories: () => void;
  clearVisionWarning: () => void;
}

// ─── Store ────────────────────────────────────────────────────────────

export const useChatStore = create<ChatState>((set, get) => ({
  currentSession: null,
  sessionList: [],
  archivedSessionList: [],
  loading: false,

  phase: IDLE,
  streamedText: "",
  streamedThinking: "",
  streamSegments: [],

  inputText: "",
  lastScrollTop: 0,
  model: "",
  provider: "",
  visionWarning: null,

  retrievedMemories: [],
  memorySearchActive: false,
  memoryEnabled: true,

  capturedInput: "",
  pendingImages: [],

  // ─── Session management ───────────────────────────────────────────

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
          set({
            currentSession: session,
            model: session.header.model || "",
            provider: session.header.provider || "",
          });
          // Sync currentProject with the restored session (mirrors openSession behaviour).
          const pid = session.header.project_id;
          if (pid) {
            const project = useProjectStore.getState().projects.find((p) => p.id === pid);
            if (project) useProjectStore.getState().setCurrentProject(project);
          }
          return;
        } catch {
          // Session file may have been deleted — fall through to new session
        }
      }
    } catch (err) {
      console.error("Failed to restore last session:", err);
    }
    get().newSession();
  },

  openSession: async (sessionId: string) => {
    try {
      const session = await Sessions.load(sessionId);
      set({
        currentSession: session,
        model: session.header.model || "",
        provider: session.header.provider || "",
      });
      const pid = session.header.project_id;
      if (pid) {
        const project = useProjectStore.getState().projects.find((p) => p.id === pid);
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
    // Fall back to the first available project if currentProject hasn't been
    // set yet (e.g. race between restoreLastSession and loadProjects on startup).
    const pid = projectId ?? currentProject?.id ?? projects[0]?.id;
    const project = projects.find((p) => p.id === pid) ?? currentProject ?? projects[0] ?? null;
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

  // ─── sendMessage — Phase FSM (Phase 15B) ──────────────────────────

  sendMessage: async () => {
    const { inputText, currentSession, pendingImages } = get();
    if (!inputText.trim() && pendingImages.length === 0) return;
    if (isTurnActive(get().phase)) return;

    // Handle slash commands
    if (inputText.startsWith("/")) {
      const result = executeCommand(inputText);
      if (currentSession) {
        if (result && typeof result === "object" && "segment" in result && result.segment) {
          // Segment-based command (e.g. /problem)
          const assistantMsg = makeMessage("assistant", "");
          assistantMsg.segments = [result.segment];
          try {
            const updated = await Sessions.append(currentSession.header.id, assistantMsg);
            set({ currentSession: updated, inputText: "" });
          } catch (err) {
            console.error("Failed to save command segment:", err);
            set({ inputText: "" });
          }
        } else if (result) {
          // Text-based command
          const assistantMsg = makeMessage("assistant", result as string);
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
      const { currentProject, projects } = useProjectStore.getState();
      // Prefer currentProject; fall back to first project to avoid creating
      // an orphaned session with no project_id (which won't appear in the sidebar).
      const lazyProject = currentProject ?? projects[0] ?? null;
      const header = makeSessionHeader({
        model: lazyProject?.default_model || model,
        provider,
        project_id: lazyProject?.id,
        tutor_style: lazyProject?.tutor_style,
      });
      try {
        const newS = await Sessions.create(header, null);
        set({ currentSession: newS });
        sessionId = newS.header.id;
        // Refresh the sidebar session list immediately so the new session
        // appears without waiting for turn-finish.
        get().loadSessions();
      } catch (err) {
        console.error("Failed to create session:", err);
        return;
      }
    }

    // Save user message (including pending images)
    const userMsg = makeMessage("user", inputText);
    const images = get().pendingImages;
    set({ pendingImages: [] });
    for (const img of images) {
      userMsg.content.push({ type: "image", mime: img.mime, data: img.data });
    }
    if (!inputText.trim() && images.length > 0) {
      userMsg.content = userMsg.content.filter(
        (p) => p.type !== "text" || (p.text ?? "").trim() !== "",
      );
    }
    try {
      const updated = await Sessions.append(sessionId, userMsg);
      set({ currentSession: updated, inputText: "" });
    } catch (err) {
      console.error("Failed to save user message:", err);
      return;
    }

    const sess = get().currentSession;
    if (!sess) return;

    Sessions.saveLast(sess.header.id).catch(() => {});

    // ─── Memory retrieval ────────────────────────────────────────
    let retrievedMemories: import("../lib/types").MemoryItem[] = [];
    if (get().memoryEnabled) {
      try {
        const memoryQuery = inputText.substring(0, 200);
        retrievedMemories = await MemoryApi.query(memoryQuery, 8);
      } catch (err) {
        console.error("[memory] Failed to query memories:", err);
      }
    }
    set({ retrievedMemories, memorySearchActive: false });

    // ─── Vision check ───────────────────────────────────────────────
    const selectedModel = get().model || sess.header.model || "";
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

    // ─── Build provider config ─────────────────────────────────────
    const configuredProviders = useConfigStore.getState().providers;
    const selectedProviderName = get().provider || sess.header.provider || configuredProviders[0]?.name;
    const provider = configuredProviders.find((p) => p.name === selectedProviderName) ?? configuredProviders[0];
    if (!provider) {
      const errMsg = makeMessage("assistant", "No API provider configured. Add one in Settings.");
      try {
        const updated = await Sessions.append(sess.header.id, errMsg);
        set({ currentSession: updated });
      } catch {}
      set({ phase: { kind: "errored", sessionId, partialSegments: [], error: { kind: "internal", message: "No provider" } } });
      return;
    }

    // ─── Build system prompt ───────────────────────────────────────
    const SYSTEM_INSTRUCTIONS = `
You are a clear math tutor. Your goal is to help the student learn, not just produce correct answers.

## Pedagogical approach
- You are a tutor, not a solver. When a student asks you to solve a problem or check their work, ask what they have tried first. If they have no attempt, prompt them to describe their approach or where they're stuck before helping.
- Prefer guiding questions and next-step hints over complete worked solutions. Give the next step, not the entire solution.
- When you do provide a step or solution, explain why it works — not just what to do.
- For conceptual questions ("what is...", "why does..."), explain directly and thoroughly. These are learning, not substitution.
- Show each step explicitly. If you are not confident in a computation or step, say so and suggest the student verify it.

## Math formatting (KaTeX-compatible, required)
- Use LaTeX for mathematical notation whenever possible.
- Always use KaTeX-compatible delimiters:
  - Inline math: $...$
  - Display math: $$...$$
- Prefer symbolic forms (\\frac, exponents, roots, Greek letters) over plain ASCII math.
- Keep math syntax KaTeX-friendly:
  - avoid uncommon/unsupported LaTeX macros and environments,
  - avoid raw HTML for equations,
  - do not emit \\(...\\) or \\[...\\] delimiters,
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

    if (retrievedMemories.length > 0) {
      const wrapped = wrapRetrievedMemories(
        retrievedMemories.map((m) => ({
          ...m,
          trust_score: (m as any).trust_score ?? 1.0,
        })),
      );
      if (wrapped.systemBlock) combinedSystemPrompt += `\n\n${wrapped.systemBlock}`;
      if (wrapped.lowTrustBlock) combinedSystemPrompt += `\n\n${wrapped.lowTrustBlock}`;
    }

    const project = useProjectStore.getState().currentProject;
    const tutorStyle = project?.tutor_style || sess.header.tutor_style || "";

    // Olympiad Coach override (Phase 16A)
    if (tutorStyle === "olympiad") {
      combinedSystemPrompt = `You are an experienced olympiad math coach. Your student is working on a competition problem.

Your coaching philosophy:
- Let the student struggle productively. Do not give solutions or hints unless explicitly asked.
- Ask probing questions: "What have you tried?", "What happens for small cases?", "Why does that step fail?"
- When the student asks for a hint, say "Let me give you a small nudge" and give only the minimum needed.
- Track what approaches have been tried. If a dead end has been visited, acknowledge it briefly.
- Celebrate genuine progress. Be encouraging without being dishonest about gaps.
- Never say "it is clear that" or "obviously" — nothing is obvious.

Tutor style: Olympiad Coach

${SYSTEM_INSTRUCTIONS}`;
    }

    if (project?.textbook_path) {
      combinedSystemPrompt += `

## Textbook Access
You have access to the textbook set for this project.
Use the \`search_textbook\` tool whenever the user asks about specific topics,
sections, exercises, or page numbers from their textbook.
Search the textbook to find relevant content before answering questions
about specific material.`;
    }

    const sysMsg = makeMessage("system", combinedSystemPrompt);
    const messagesWithSystem = [sysMsg, ...sess.messages];

    // ─── Prepare turn ──────────────────────────────────────────────
    const abortController = new AbortController();
    set({
      phase: { kind: "preparing", sessionId, capturedInput: inputText },
      capturedInput: inputText,
      streamedText: "",
      streamedThinking: "",
      streamSegments: [],
    });

    // ─── Fetch tool definitions ────────────────────────────────────
    let toolDefs: any[] = [];
    try {
      toolDefs = await ToolsApi.getDefinitions();
    } catch (err) {
      console.warn("[tools] Failed to load tool definitions:", err);
    }

    const turnInput: TurnInput = {
      sessionId: sess.header.id,
      messagesWithSystem,
      model: selectedModel,
      provider,
      toolDefinitions: toolDefs,
      signal: abortController.signal,
    };

    const deps: TurnDeps = {
      streamChat,
      appendMessage: async (sid, msg) => {
        const updated = await Sessions.append(sid, msg);
        set({ currentSession: updated });
        return updated as any;
      },
      loadSession: async (sid) => {
        const s = await Sessions.load(sid);
        set({ currentSession: s });
        return s as any;
      },
      executeTool: async (callId, toolName, args, projectId) => {
        return await ToolsApi.execute(callId, toolName, args, projectId);
      },
      buildPayload,
      buildToolPayload,
      assembleToolCalls,
      makeMessage: makeMessage as any,
      makeSegment: makeSegment as any,
      uid: () => crypto.randomUUID(),
      projectId: useProjectStore.getState().currentProject?.id,
    };

    // ─── Run turn with retry ─────────────────────────────────────────
    const maxRetries = 1;
    let attempt = 0;
    let lastError: AppError | null = null;

    while (attempt <= maxRetries) {
      try {
        for await (const event of runTurn(turnInput, deps)) {
          switch (event.kind) {
            case "status": {
              set({
                phase: {
                  kind: "streaming",
                  sessionId,
                  round: 0,
                  streamSegments: event.segments,
                  abortController,
                },
                streamedText: event.text,
                streamedThinking: event.thinking,
                streamSegments: event.segments,
              });
              break;
            }
            case "segments-changed":
              set({ streamSegments: event.segments });
              break;
            case "tool-round-started":
            case "tool-round-finished":
              // Round lifecycle — no UI update needed.
              break;
            case "turn-finished": {
              const currentSess = await Sessions.load(sessionId);
              set({
                currentSession: currentSess,
                phase: IDLE,
                streamedText: "",
                streamedThinking: "",
                streamSegments: [],
                retrievedMemories: [],
              });

              // Auto-store the question as memory
              if (get().memoryEnabled) {
                const userText = get().capturedInput ?? inputText;
                try {
                  const now = new Date().toISOString();
                  await MemoryApi.storeWithSafety(
                    {
                      id: crypto.randomUUID(),
                      session_id: sessionId,
                      source_type: "chat",
                      unit_type: "question",
                      content: userText.substring(0, 500),
                      score: 1.0,
                      created_at: now,
                      tags: ["auto", "question"],
                      provenance: sessionId,
                    },
                    "balanced",
                  );
                } catch {
                  // Non-fatal.
                }
              }

              get().loadSessions();
              return;
            }
            case "turn-aborted": {
              // User cancelled — orchestrator yields this before throwing.
              const partialText = event.partialText || "(cancelled)";
              const partialMsg = makeMessage("assistant", partialText);
              try {
                const updated = await Sessions.append(sessionId, partialMsg);
                set({ currentSession: updated });
              } catch {}
              set({
                phase: {
                  kind: "aborted",
                  sessionId,
                  partialSegments: event.partialSegments,
                  partialText,
                  partialThinking: event.partialThinking,
                },
                streamedText: "",
                streamedThinking: "",
                streamSegments: [],
              });
              return;
            }
            case "turn-error": {
              lastError = event.error;
              throw event.error;
            }
          }
        }
        return; // Generator completed normally.
      } catch (err: any) {
        const appErr = toAppError(err);

        // User-initiated cancellation
        if (abortController.signal.aborted || err?.name === "AbortError") {
          const partialText = latestText(get().phase) || "(cancelled)";
          const partialMsg = makeMessage("assistant", partialText);
          try {
            const updated = await Sessions.append(sessionId, partialMsg);
            set({ currentSession: updated });
          } catch {}
          set({
            phase: {
              kind: "aborted",
              sessionId,
              partialSegments: currentSegments(get().phase),
              partialText,
              partialThinking: latestThinking(get().phase),
            },
            streamedText: "",
            streamedThinking: "",
            streamSegments: [],
          });
          return;
        }

        lastError = appErr;

        if (isRetryable(appErr) && attempt < maxRetries) {
          const delay = Math.pow(2, attempt) * 1000;
          set({
            phase: {
              kind: "preparing",
              sessionId,
              capturedInput: inputText,
            },
          });
          await new Promise((r) => setTimeout(r, delay));
          attempt++;
          continue;
        }

        // Transition to errored phase and save error message
        set({
          phase: {
            kind: "errored",
            sessionId,
            partialSegments: currentSegments(get().phase),
            error: lastError!,
          },
          streamedText: "",
          streamedThinking: "",
          streamSegments: [],
        });

        const errMsg = makeMessage("assistant", `**Error**: ${lastError?.message ?? lastError}`);
        try {
          const updated = await Sessions.append(sessionId, errMsg);
          set({ currentSession: updated });
        } catch {}
        return;
      }
    }
  },

  cancelStream: () => {
    const ctrl = currentAbortController(get().phase);
    if (ctrl) ctrl.abort();
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
  },

  clearError: () => set({ phase: IDLE, streamedText: "", streamedThinking: "", streamSegments: [] }),

  setMemoryEnabled: (enabled: boolean) => set({ memoryEnabled: enabled }),

  clearRetrievedMemories: () => set({ retrievedMemories: [] }),

  clearVisionWarning: () => set({ visionWarning: null }),
}));

// ─── Convenience selectors (for callers) ────────────────────────────

export const selectPhase = (s: ChatState) => s.phase;
export const selectStreamedText = (s: ChatState) => s.streamedText;
export const selectStreamedThinking = (s: ChatState) => s.streamedThinking;
export const selectStreamSegments = (s: ChatState) => s.streamSegments;
export const selectVisionWarning = (s: ChatState) => s.visionWarning;
export const selectRetrievedMemories = (s: ChatState) => s.retrievedMemories;
export const selectMemoryEnabled = (s: ChatState) => s.memoryEnabled;