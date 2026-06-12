import { useEffect, useState, useMemo, useCallback } from "react";
import { X, Search, Trash2, FileText } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useChatStore } from "../stores/chatStore";
import { useConfigStore } from "../stores/configStore";
import { useMemoryStore } from "../stores/memoryStore";
import { useVaultStore } from "../stores/vaultStore";
import type { Message, MessageSegment } from "../lib/types";
import { Vault as VaultApi } from "../lib/api";

interface ContextPanelProps {
  onClose: () => void;
}

// ─── Token helpers ────────────────────────────────────────────────────────────

function estimateTokens(text: string): number {
  return Math.round(text.length / 4);
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toLocaleString();
}

function fmtContextMax(n: number): string {
  if (n >= 1_000_000) return `${Math.round(n / 1_000_000)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return String(n);
}

function fmtCost(n: number): string {
  if (n === 0) return "$0.00";
  if (n < 0.0001) return `$${n.toFixed(6)}`;
  if (n < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(4)}`;
}

function fmtRate(perToken: number): string {
  const perM = perToken * 1_000_000;
  return `$${perM.toFixed(2)}/M`;
}

function computeDuration(start: string, end: string): string {
  try {
    const diff = new Date(end).getTime() - new Date(start).getTime();
    if (diff < 0) return "—";
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "< 1 min";
    if (mins < 60) return `${mins}m`;
    return `${Math.floor(mins / 60)}h ${mins % 60}m`;
  } catch {
    return "—";
  }
}

// ─── Derived session stats ────────────────────────────────────────────────────

function useSessionStats(messages: Message[]) {
  return useMemo(() => {
    let promptChars = 0;
    let completionChars = 0;
    let reasoningChars = 0;

    const toolCalls: { tool_name: string; args: string; call_id: string }[] = [];
    const attachments: { name: string; sizeKb: number; msgIndex: number }[] = [];
    const perMessage: { preview: string; tokens: number; role: string }[] = [];

    messages.forEach((msg, idx) => {
      const textLen = msg.content
        .filter((p) => p.type === "text")
        .reduce((acc, p) => acc + (p.text?.length ?? 0), 0);

      if (msg.role === "user") {
        promptChars += textLen;
        // Collect image attachments
        msg.content.filter((p) => p.type === "image").forEach((p) => {
          const sizeKb = p.data ? Math.round((p.data.length * 3) / 4 / 1024) : 0;
          attachments.push({ name: `image-${idx + 1}.png`, sizeKb, msgIndex: idx + 1 });
        });
      } else if (msg.role === "assistant") {
        completionChars += textLen;
        if (msg.thinking) reasoningChars += msg.thinking.length;
      }

      // Collect tool calls from segments
      (msg.segments ?? []).forEach((seg: MessageSegment) => {
        if (seg.type === "tool_call") {
          const firstArgVal = Object.values(seg.arguments ?? {})[0];
          const args = typeof firstArgVal === "string" ? firstArgVal : JSON.stringify(seg.arguments ?? {}).slice(0, 40);
          toolCalls.push({ tool_name: seg.tool_name, args, call_id: seg.call_id });
        }
        if (seg.type === "thinking") {
          reasoningChars += seg.content?.length ?? 0;
        }
      });

      // Per-message token row
      if (msg.role !== "system") {
        const preview = msg.content.find((p) => p.type === "text")?.text ?? "";
        perMessage.push({
          role: msg.role,
          preview: preview.slice(0, 40),
          tokens: estimateTokens(preview),
        });
      }
    });

    const promptTokens = estimateTokens("x".repeat(promptChars));
    const completionTokens = estimateTokens("x".repeat(completionChars));
    const reasoningTokens = estimateTokens("x".repeat(reasoningChars));
    const totalTokens = promptTokens + completionTokens + reasoningTokens;

    return { promptTokens, completionTokens, reasoningTokens, totalTokens, toolCalls, attachments, perMessage };
  }, [messages]);
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ContextPanel({ onClose }: ContextPanelProps) {
  const currentSession = useChatStore((s) => s.currentSession);
  const model = useChatStore((s) => s.model);
  const modelCatalog = useConfigStore((s) => s.modelCatalog);
  const loadCachedModelCatalog = useConfigStore((s) => s.loadCachedModelCatalog);
  const { memories, queryMemories, forgetMemory } = useMemoryStore();
  const [memoryQuery, setMemoryQuery] = useState("");
  const navigate = useNavigate();
  const { synapseRunning } = useVaultStore();
  const [relatedNotes, setRelatedNotes] = useState<{ path: string; title: string }[]>([]);
  const [relatedLoading, setRelatedLoading] = useState(false);

  // Debounced related-notes search on last 3 user messages.
  // Sanitize query for FTS5: strip special characters that break FTS5 syntax.
  const relatedQuery = useMemo(() => {
    if (!currentSession) return "";
    const userMessages = currentSession.messages
      .filter((m) => m.role === "user")
      .slice(-3)
      .map((m) => m.content.filter((p) => p.type === "text").map((p) => p.text).join(" "))
      .join(" ")
      .slice(0, 200);
    // Strip FTS5-special characters, keep only alphanumeric and spaces
    return userMessages.replace(/[^\w\s-]/g, "").replace(/\s+/g, " ").trim();
  }, [currentSession?.messages?.length]);

  useEffect(() => {
    if (!synapseRunning || !relatedQuery.trim()) {
      setRelatedNotes([]);
      return;
    }
    const timer = setTimeout(async () => {
      setRelatedLoading(true);
      try {
        const raw = await VaultApi.synapseCall<unknown>("note_search", { query: relatedQuery, limit: 5 });
        const entries = Array.isArray(raw) ? raw : (raw as Record<string, unknown>).results ?? [];
        setRelatedNotes(
          (entries as { path: string; title: string }[]).map((n) => ({
            path: n.path,
            title: n.title || n.path.split("/").pop()?.replace(/\.md$/i, "") || n.path,
          }))
        );
      } catch {
        setRelatedNotes([]);
      } finally {
        setRelatedLoading(false);
      }
    }, 1500);
    return () => clearTimeout(timer);
  }, [relatedQuery, synapseRunning]);

  useEffect(() => {
    queryMemories("", 10);
    loadCachedModelCatalog();
  }, []);

  const messages = currentSession?.messages ?? [];
  const { promptTokens, completionTokens, reasoningTokens, totalTokens, toolCalls, attachments, perMessage } =
    useSessionStats(messages);

  // Look up model context window and pricing from catalog
  const activeModelId = currentSession?.header.model ?? model ?? "";
  const catalogEntry = useMemo(
    () => modelCatalog?.models.find((m) => m.id === activeModelId),
    [modelCatalog, activeModelId]
  );
  const contextMax = catalogEntry?.context_length ?? 128_000;
  const usagePct = contextMax > 0 ? Math.min((totalTokens / contextMax) * 100, 100) : 0;

  // Estimate session cost
  const promptRate = parseFloat(catalogEntry?.pricing?.prompt ?? "0");
  const completionRate = parseFloat(catalogEntry?.pricing?.completion ?? "0");
  const sessionCost = promptTokens * promptRate + completionTokens * completionRate;

  const sessionDuration = currentSession
    ? computeDuration(currentSession.header.created_at, currentSession.header.updated_at)
    : "—";

  const userCount = messages.filter((m) => m.role === "user").length;
  const assistantCount = messages.filter((m) => m.role === "assistant").length;

  // Bar fill colour: green → yellow → red as context fills
  const barColor =
    usagePct > 85 ? "var(--color-red, #ef4444)" : usagePct > 60 ? "#f59e0b" : "var(--color-accent)";

  return (
    <div
      style={{
        width: 280,
        minWidth: 280,
        background: "var(--color-bg-elevated)",
        borderLeft: "1px solid var(--color-border)",
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "hidden",
      }}
    >
      {/* ── Header ── */}
      <div
        style={{
          padding: "12px 16px",
          borderBottom: "1px solid var(--color-border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 14, fontWeight: 600, color: "var(--color-text-primary)" }}>
          Context
        </span>
        <button
          onClick={onClose}
          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-text-tertiary)", display: "flex", padding: 2 }}
        >
          <X size={14} />
        </button>
      </div>

      <div style={{ flex: 1, overflowY: "auto" }}>

        {/* ── Context Window ── */}
        <PanelSection>
          <SectionHeader
            left="Context Window"
            right={
              <span style={{ fontFamily: "var(--font-mono, monospace)", fontSize: 11 }}>
                {fmtContextMax(contextMax)}
              </span>
            }
          />
          {/* Progress bar */}
          <div
            style={{
              height: 6,
              borderRadius: 3,
              background: "var(--color-surface)",
              overflow: "hidden",
              margin: "8px 0 6px",
            }}
          >
            <div
              style={{
                width: `${usagePct}%`,
                height: "100%",
                borderRadius: 3,
                background: barColor,
                transition: "width 0.4s ease",
              }}
            />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <span style={{ fontSize: 18, fontWeight: 600, color: "var(--color-text-primary)", letterSpacing: "-0.02em" }}>
              {fmtTokens(totalTokens)}
            </span>
            <span style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>
              {usagePct < 0.1 ? "<0.1" : usagePct.toFixed(1)}% used
            </span>
          </div>
          <span style={{ fontSize: 11, color: "var(--color-text-tertiary)", display: "block", marginTop: 2 }}>
            tokens used this session
          </span>
          {/* Session meta */}
          <div style={{ display: "flex", gap: 12, marginTop: 10, flexWrap: "wrap" }}>
            <MetaChip label="msgs" value={String(messages.length)} />
            <MetaChip label="user" value={String(userCount)} />
            <MetaChip label="asst" value={String(assistantCount)} />
            <MetaChip label="time" value={sessionDuration} />
          </div>
        </PanelSection>

        {/* ── Token Breakdown ── */}
        <PanelSection>
          <SectionHeader left="Tokens" />
          <TokenRow label="Prompt" value={promptTokens} color="var(--color-accent)" />
          <TokenRow label="Completion" value={completionTokens} color="#22c55e" />
          {reasoningTokens > 0 && (
            <TokenRow label="Reasoning" value={reasoningTokens} color="#a78bfa" />
          )}
          {/* Stacked proportion bar */}
          {totalTokens > 0 && (
            <StackedBar
              segments={[
                { value: promptTokens, color: "var(--color-accent)" },
                { value: completionTokens, color: "#22c55e" },
                { value: reasoningTokens, color: "#a78bfa" },
              ]}
              total={totalTokens}
            />
          )}
        </PanelSection>

        {/* ── Session Cost ── */}
        {(promptRate > 0 || completionRate > 0) && (
          <PanelSection>
            <SectionHeader left="Session Cost" />
            <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 4 }}>
              <span style={{ fontSize: 22, fontWeight: 600, color: "var(--color-text-primary)", letterSpacing: "-0.02em" }}>
                {fmtCost(sessionCost)}
              </span>
              <span style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>USD</span>
            </div>
            <span style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginTop: 4, display: "block" }}>
              {fmtRate(promptRate)} in · {fmtRate(completionRate)} out
            </span>
          </PanelSection>
        )}

        {/* ── Related Notes ── */}
        {currentSession && synapseRunning && (
          <PanelSection>
            <SectionHeader left="Related Notes" />
            {relatedLoading ? (
              <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", padding: "4px 0" }}>
                Searching…
              </div>
            ) : relatedNotes.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 4 }}>
                {relatedNotes.slice(0, 5).map((note, i) => (
                  <button
                    key={note.path}
                    onClick={() => {
                      useVaultStore.getState().navigateToNote(note.path);
                      navigate('/vault');
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "4px 6px",
                      borderRadius: 4,
                      border: "none",
                      background: "transparent",
                      cursor: "pointer",
                      fontSize: 11,
                      color: "var(--color-accent-light)",
                      textAlign: "left",
                      width: "100%",

                    }}
                  >
                    <FileText size={11} style={{ flexShrink: 0 }} />
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {note.title || note.path.split('/').pop()?.replace(/\.md$/i, '')}
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
          </PanelSection>
        )}

        {/* ── Tool Calls ── */}
        {toolCalls.length > 0 && (
          <PanelSection>
            <SectionHeader left="Tool Calls" right={<span>{toolCalls.length} this session</span>} />
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
              {toolCalls.slice(-6).map((tc, i) => (
                <div key={tc.call_id || i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                  <span style={{ color: "var(--color-accent)", marginTop: 2, flexShrink: 0 }}>
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
                      <path d="M1 9L9 1M9 1H4M9 1V6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" fill="none"/>
                    </svg>
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 500, color: "var(--color-text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {tc.tool_name}
                    </div>
                    {tc.args && (
                      <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {tc.args}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </PanelSection>
        )}

        {/* ── Attachments ── */}
        {attachments.length > 0 && (
          <PanelSection>
            <SectionHeader left="Attachments" />
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
              {attachments.map((att, i) => (
                <div key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ color: "var(--color-text-tertiary)", flexShrink: 0 }}>
                    <rect x="2" y="1" width="12" height="14" rx="2" stroke="currentColor" strokeWidth="1.2"/>
                    <circle cx="6" cy="6" r="1" fill="currentColor"/>
                    <path d="M2 11l3-3 2 2 3-4 4 5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" fill="none"/>
                  </svg>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 500, color: "var(--color-text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {att.name}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>
                      {att.sizeKb > 0 ? `${att.sizeKb} KB · ` : ""}added in msg {att.msgIndex}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </PanelSection>
        )}

        {/* ── Per Message ── */}
        {perMessage.length > 0 && (
          <PanelSection>
            <SectionHeader left="Per Message" />
            <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 6 }}>
              {perMessage.slice(-6).map((m, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span
                    style={{
                      width: 5,
                      height: 5,
                      borderRadius: "50%",
                      background: m.role === "user" ? "var(--color-accent)" : "#22c55e",
                      flexShrink: 0,
                    }}
                  />
                  <span
                    style={{
                      flex: 1,
                      fontSize: 11,
                      color: "var(--color-text-secondary)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {m.preview || "(no text)"}
                  </span>
                  <span style={{ fontSize: 11, color: "var(--color-text-tertiary)", flexShrink: 0 }}>
                    {m.tokens.toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </PanelSection>
        )}

        {/* ── Memory Engine ── */}
        <PanelSection>
          <SectionHeader left="Memory" />
          <div style={{ display: "flex", gap: 4, marginTop: 6, marginBottom: 8 }}>
            <div style={{ flex: 1, position: "relative" }}>
              <Search size={11} style={{ position: "absolute", left: 7, top: "50%", transform: "translateY(-50%)", color: "var(--color-text-tertiary)", pointerEvents: "none" }} />
              <input
                type="text"
                value={memoryQuery}
                onChange={(e) => setMemoryQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && queryMemories(memoryQuery, 20)}
                placeholder="Search memories…"
                style={{
                  width: "100%",
                  padding: "5px 8px 5px 24px",
                  border: "1px solid var(--color-border)",
                  borderRadius: 6,
                  background: "var(--color-surface)",
                  color: "var(--color-text-primary)",
                  fontSize: 11,
                  fontFamily: "inherit",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>
            <button
              onClick={() => queryMemories(memoryQuery, 20)}
              style={{
                padding: "5px 10px",
                border: "none",
                borderRadius: 6,
                background: "var(--color-accent)",
                color: "#fff",
                cursor: "pointer",
                fontSize: 11,
                fontFamily: "inherit",
                flexShrink: 0,
              }}
            >
              Go
            </button>
          </div>
          {memories.length === 0 ? (
            <p style={{ fontSize: 11, color: "var(--color-text-tertiary)", textAlign: "center", padding: "8px 0" }}>
              No memories stored yet.
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {memories.slice(0, 8).map((m) => (
                <div
                  key={m.id}
                  style={{ padding: "6px 8px", background: "var(--color-surface)", borderRadius: 6 }}
                >
                  <p
                    style={{
                      fontSize: 11,
                      color: "var(--color-text-primary)",
                      lineHeight: 1.4,
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                      marginBottom: 3,
                    }}
                  >
                    {m.content}
                  </p>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 10, color: "var(--color-text-tertiary)" }}>
                      score {m.score.toFixed(1)}
                    </span>
                    <button
                      onClick={() => forgetMemory(m.id)}
                      style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-red, #ef4444)", display: "flex", padding: 0 }}
                      title="Forget"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </PanelSection>

      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function PanelSection({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--color-border)" }}>
      {children}
    </div>
  );
}

function SectionHeader({ left, right }: { left: string; right?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
      <span
        style={{
          fontSize: 10,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.07em",
          color: "var(--color-text-tertiary)",
        }}
      >
        {left}
      </span>
      {right && (
        <span style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>{right}</span>
      )}
    </div>
  );
}

function TokenRow({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "3px 0" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ width: 8, height: 8, borderRadius: 2, background: color, display: "inline-block", flexShrink: 0 }} />
        <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>{label}</span>
      </div>
      <span style={{ fontSize: 12, color: "var(--color-text-primary)", fontWeight: 500 }}>
        {value.toLocaleString()}
      </span>
    </div>
  );
}

function StackedBar({ segments, total }: { segments: { value: number; color: string }[]; total: number }) {
  return (
    <div style={{ display: "flex", height: 4, borderRadius: 2, overflow: "hidden", marginTop: 8, gap: 1 }}>
      {segments.filter((s) => s.value > 0).map((s, i) => (
        <div
          key={i}
          style={{
            flex: s.value / total,
            background: s.color,
            borderRadius: 2,
          }}
        />
      ))}
    </div>
  );
}

function MetaChip({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-primary)" }}>{value}</span>
      <span style={{ fontSize: 10, color: "var(--color-text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</span>
    </div>
  );
}
