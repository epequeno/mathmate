/**
 * ProcessBlock.tsx
 *
 * Unified collapsible container wrapping all pre-answer activity in an
 * assistant message: reasoning traces and tool calls, in chronological order.
 *
 * Handles two structural cases:
 *   Case A — Pure tool calling (no thinking segments)
 *   Case B — Reasoning with embedded tool calls (interleaved)
 *
 * The block auto-expands during streaming and collapses when done.
 * The final content segment(s) are always rendered outside this component.
 */

import { useState, useEffect, useMemo } from "react";
import { Loader2, ChevronRight, ChevronDown } from "lucide-react";
import type { MessageSegment } from "../../lib/types";
import {
  formatToolCall,
  formatToolResult,
  formatToolInput,
  renderToolOutput,
  type ToolOutputData,
  type VaultSearchResult,
  type VaultListGroup,
} from "../../lib/toolFormat";

// ─── Public API ──────────────────────────────────────────────────────────────

interface ProcessBlockProps {
  /** All non-content segments from the message, in chronological order. */
  segments: MessageSegment[];
  isStreaming?: boolean;
}

export function ProcessBlock({ segments, isStreaming }: ProcessBlockProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Auto-expand when streaming starts
  useEffect(() => {
    if (isStreaming) setIsExpanded(true);
  }, [isStreaming]);

  // Collapse shortly after streaming ends
  useEffect(() => {
    if (!isStreaming) {
      const t = setTimeout(() => setIsExpanded(false), 400);
      return () => clearTimeout(t);
    }
  }, [isStreaming]);

  const entries = useMemo(() => pairToolSegments(segments), [segments]);
  const header = buildHeaderLabel(segments, isStreaming);

  if (entries.length === 0) return null;

  return (
    <div
      style={{
        border: "1px solid var(--color-border)",
        borderRadius: 8,
        overflow: "hidden",
        marginBottom: 8,
      }}
    >
      {/* ── Header ───────────────────────────────────────────────── */}
      <button
        onClick={() => !isStreaming && setIsExpanded((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 7,
          width: "100%",
          padding: "7px 12px",
          background: "var(--color-surface)",
          border: "none",
          cursor: isStreaming ? "default" : "pointer",
          textAlign: "left",
        }}
      >
        {isStreaming ? (
          <Loader2
            size={12}
            style={{
              color: "var(--color-text-tertiary)",
              animation: "spin 1s linear infinite",
              flexShrink: 0,
            }}
          />
        ) : isExpanded ? (
          <ChevronDown size={12} style={{ color: "var(--color-text-tertiary)", flexShrink: 0 }} />
        ) : (
          <ChevronRight size={12} style={{ color: "var(--color-text-tertiary)", flexShrink: 0 }} />
        )}
        <span
          style={{
            fontSize: 12,
            fontWeight: 500,
            color: "var(--color-text-secondary)",
          }}
        >
          {header}
        </span>
      </button>

      {/* ── Body (animated) ─────────────────────────────────────── */}
      <div
        style={{
          maxHeight: isExpanded ? 600 : 0,
          overflow: isExpanded ? "auto" : "hidden",
          transition: "max-height 0.25s ease",
        }}
      >
        <div style={{ padding: "6px 0" }}>
          {entries.map((entry, i) =>
            entry.type === "thinking" ? (
              <ThinkingRow key={entry.segment.id} content={entry.segment.content} />
            ) : (
              <ToolRow
                key={entry.call.id}
                call={entry.call}
                result={entry.result}
                isLast={i === entries.length - 1}
                isStreaming={isStreaming}
              />
            )
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Header label ────────────────────────────────────────────────────────────

function buildHeaderLabel(segments: MessageSegment[], isStreaming?: boolean): string {
  if (isStreaming) {
    const lastSeg = segments[segments.length - 1];
    if (lastSeg?.type === "tool_call" && lastSeg.status === "running") return "Working…";
    return "Thinking…";
  }

  const hasThinking = segments.some((s) => s.type === "thinking");
  const toolCalls = segments.filter((s) => s.type === "tool_call");
  const n = toolCalls.length;

  if (hasThinking && n > 0) return `Reasoning · ${n} tool call${n !== 1 ? "s" : ""}`;
  if (hasThinking) return "Reasoning";
  return `Used ${n} tool${n !== 1 ? "s" : ""}`;
}

// ─── pairToolSegments ────────────────────────────────────────────────────────

type ThinkingEntry = {
  type: "thinking";
  segment: Extract<MessageSegment, { type: "thinking" }>;
};

type ToolEntry = {
  type: "tool";
  call: Extract<MessageSegment, { type: "tool_call" }>;
  result?: Extract<MessageSegment, { type: "tool_result" }>;
};

type ProcessEntry = ThinkingEntry | ToolEntry;

/**
 * Walk segments in order, pairing each tool_call with its matching tool_result
 * (by call_id). thinking segments pass through as-is. tool_result segments that
 * have already been merged are skipped.
 */
function pairToolSegments(segments: MessageSegment[]): ProcessEntry[] {
  // Build a lookup of results by call_id for O(1) pairing
  const resultsByCallId = new Map<
    string,
    Extract<MessageSegment, { type: "tool_result" }>
  >();
  for (const seg of segments) {
    if (seg.type === "tool_result") {
      resultsByCallId.set(seg.call_id, seg);
    }
  }

  const entries: ProcessEntry[] = [];
  const usedResultIds = new Set<string>();

  for (const seg of segments) {
    if (seg.type === "thinking") {
      entries.push({ type: "thinking", segment: seg });
    } else if (seg.type === "tool_call") {
      const result = resultsByCallId.get(seg.call_id);
      if (result) usedResultIds.add(result.id);
      entries.push({ type: "tool", call: seg, result });
    }
    // tool_result segments are consumed above — skip standalone ones
  }

  return entries;
}

// ─── ThinkingRow ─────────────────────────────────────────────────────────────

function ThinkingRow({ content }: { content: string }) {
  return (
    <div
      style={{
        margin: "2px 12px",
        padding: "3px 10px",
        borderLeft: "2px solid var(--color-border)",
      }}
    >
      <p
        style={{
          margin: 0,
          fontSize: 12,
          fontStyle: "italic",
          color: "var(--color-text-secondary)",
          lineHeight: 1.5,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {content}
      </p>
    </div>
  );
}

// ─── ToolRow ─────────────────────────────────────────────────────────────────

interface ToolRowProps {
  call: Extract<MessageSegment, { type: "tool_call" }>;
  result?: Extract<MessageSegment, { type: "tool_result" }>;
  isLast?: boolean;
  isStreaming?: boolean;
}

function ToolRow({ call, result, isStreaming }: ToolRowProps) {
  const [expanded, setExpanded] = useState(false);

  // Derive effective status — a "running" status on a finished message means
  // it was saved before the status-update landed, treat as completed.
  const effectiveStatus =
    call.status === "running" && !isStreaming ? "completed" : call.status;
  const isRunning = effectiveStatus === "running";
  const isError = effectiveStatus === "error" || result?.is_error === true;

  const label = formatToolCall(call.tool_name, call.arguments);
  const summary = result
    ? formatToolResult(call.tool_name, result.result, result.is_error)
    : isRunning
    ? ""
    : "";

  const outputData: ToolOutputData | null = result
    ? renderToolOutput(call.tool_name, result.result, result.is_error)
    : null;

  const inputStr = formatToolInput(call.tool_name, call.arguments);

  return (
    <div>
      {/* ── Collapsed row ──────────────────────────────────────── */}
      <button
        onClick={() => result && setExpanded((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          width: "100%",
          padding: "5px 12px",
          background: "none",
          border: "none",
          cursor: result ? "pointer" : "default",
          textAlign: "left",
        }}
      >
        <StatusIcon status={effectiveStatus} isError={isError} />

        <span
          style={{
            fontSize: 12,
            color: "var(--color-text-primary)",
            flex: 1,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {label}
        </span>

        {summary && (
          <span
            style={{
              fontSize: 11,
              color: isError ? "var(--color-red)" : "var(--color-text-tertiary)",
              flexShrink: 0,
            }}
          >
            {summary}
          </span>
        )}

        {result && (
          expanded ? (
            <ChevronDown size={10} style={{ color: "var(--color-text-tertiary)", flexShrink: 0 }} />
          ) : (
            <ChevronRight size={10} style={{ color: "var(--color-text-tertiary)", flexShrink: 0 }} />
          )
        )}
      </button>

      {/* ── Expanded detail ─────────────────────────────────────── */}
      {expanded && outputData && (
        <div
          style={{
            background: "var(--color-bg-elevated)",
            borderTop: "1px solid var(--color-border)",
            borderBottom: "1px solid var(--color-border)",
            padding: "8px 12px 10px 12px",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          {/* INPUT */}
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <SectionLabel>Input</SectionLabel>
            <code
              style={{
                fontFamily: "'Fira Code', 'SF Mono', Menlo, monospace",
                fontSize: 11,
                color: "var(--color-text-secondary)",
                background: "var(--color-surface)",
                borderRadius: 4,
                padding: "4px 8px",
                display: "block",
                wordBreak: "break-all",
              }}
            >
              {inputStr}
            </code>
          </div>

          {/* OUTPUT */}
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <SectionLabel>
              Output{outputData.kind === "raw_json" ? " (raw JSON)" : ""}
            </SectionLabel>
            <ToolOutputRenderer data={outputData} />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── StatusIcon ──────────────────────────────────────────────────────────────

function StatusIcon({
  status,
  isError,
}: {
  status: string;
  isError: boolean;
}) {
  if (status === "running") {
    return (
      <Loader2
        size={13}
        style={{
          color: "var(--color-accent)",
          animation: "spin 1s linear infinite",
          flexShrink: 0,
        }}
      />
    );
  }
  if (isError) {
    return (
      <svg width="13" height="13" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
        <circle cx="7" cy="7" r="6" stroke="var(--color-red)" strokeWidth="1.5" />
        <path d="M7 4.5V7.5M7 9.5V9.6" stroke="var(--color-red)" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
      <circle cx="7" cy="7" r="6" stroke="#22c55e" strokeWidth="1.5" />
      <path d="M4.5 7L6.2 8.7L9.5 5.5" stroke="#22c55e" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ─── SectionLabel ────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 600,
        color: "var(--color-text-tertiary)",
        letterSpacing: "0.06em",
        textTransform: "uppercase",
      }}
    >
      {children}
    </span>
  );
}

// ─── ToolOutputRenderer ──────────────────────────────────────────────────────

function ToolOutputRenderer({ data }: { data: ToolOutputData }) {
  switch (data.kind) {
    case "vault_search":
      return <VaultSearchOutput results={data.results} overflow={data.overflow} />;
    case "vault_read":
      return <VaultReadOutput data={data} />;
    case "vault_write":
      return <VaultWriteOutput data={data} />;
    case "vault_list":
      return <VaultListOutput data={data} />;
    case "calculate":
      return <CalculateOutput value={data.value} />;
    case "graph":
      return <GraphOutput pointCount={data.pointCount} />;
    case "get_current_date":
      return <DateOutput date={data.date} dayOfWeek={data.dayOfWeek} />;
    case "error":
      return <ErrorOutput message={data.message} raw={data.raw} />;
    case "raw_json":
      return <RawJsonOutput json={data.json} />;
  }
}

// ─── Per-tool output renderers ───────────────────────────────────────────────

const tileStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 6,
  padding: "5px 8px",
  background: "var(--color-surface)",
  borderRadius: 4,
};

const filenameStyle: React.CSSProperties = {
  fontFamily: "system-ui, sans-serif",
  fontSize: 11,
  fontWeight: 500,
  color: "var(--color-text-primary)",
};

const snippetStyle: React.CSSProperties = {
  fontFamily: "system-ui, sans-serif",
  fontSize: 11,
  color: "var(--color-text-secondary)",
  lineHeight: "16px",
  marginTop: 1,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

function FileIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ flexShrink: 0, marginTop: 1 }}>
      <rect x="1" y="1" width="8" height="8" rx="1.5" stroke="var(--color-text-tertiary)" strokeWidth="1" />
      <path d="M3 4h4M3 6h2.5" stroke="var(--color-text-tertiary)" strokeWidth="1" strokeLinecap="round" />
    </svg>
  );
}

function VaultSearchOutput({ results, overflow }: { results: VaultSearchResult[]; overflow: number }) {
  if (results.length === 0) {
    return (
      <p style={{ margin: 0, fontSize: 11, color: "var(--color-text-tertiary)", fontStyle: "italic" }}>
        No matches found
      </p>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {results.map((r, i) => (
        <div key={i} style={tileStyle}>
          <FileIcon />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={filenameStyle}>{r.filename}</div>
            {r.snippet && <div style={snippetStyle}>{r.snippet}</div>}
          </div>
        </div>
      ))}
      {overflow > 0 && (
        <span style={{ fontSize: 10, color: "var(--color-text-tertiary)", padding: "2px 4px" }}>
          + {overflow} more result{overflow !== 1 ? "s" : ""}
        </span>
      )}
    </div>
  );
}

function VaultReadOutput({ data }: { data: Extract<ToolOutputData, { kind: "vault_read" }> }) {
  return (
    <div
      style={{
        background: "var(--color-surface)",
        borderRadius: 4,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "5px 8px",
          borderBottom: "1px solid var(--color-border)",
        }}
      >
        <FileIcon />
        <span style={filenameStyle}>{data.path}</span>
        <span
          style={{
            marginLeft: "auto",
            fontSize: 10,
            color: "var(--color-text-tertiary)",
            flexShrink: 0,
          }}
        >
          {data.charCount.toLocaleString()} chars · {data.lineCount} lines
        </span>
      </div>
      <pre
        style={{
          margin: 0,
          padding: "6px 8px",
          fontFamily: "'Fira Code', 'SF Mono', Menlo, monospace",
          fontSize: 10,
          color: "var(--color-text-secondary)",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          lineHeight: "15px",
          maxHeight: 120,
          overflow: "auto",
        }}
      >
        {data.preview}
      </pre>
    </div>
  );
}

function VaultWriteOutput({ data }: { data: Extract<ToolOutputData, { kind: "vault_write" }> }) {
  return (
    <div
      style={{
        ...tileStyle,
        alignItems: "center",
      }}
    >
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0 }}>
        <path d="M2 6.5L4.5 9L10 3" stroke="#22c55e" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div>
        <div style={filenameStyle}>{data.path}</div>
        <div style={{ fontSize: 10, color: "var(--color-text-tertiary)" }}>
          {data.updated ? "Updated" : "Created"} · {data.bytes.toLocaleString()} bytes
        </div>
      </div>
    </div>
  );
}

function VaultListOutput({ data }: { data: Extract<ToolOutputData, { kind: "vault_list" }> }) {
  return (
    <div style={{ background: "var(--color-surface)", borderRadius: 4, padding: "6px 8px", display: "flex", flexDirection: "column", gap: 3 }}>
      <div style={{ ...filenameStyle, marginBottom: 2 }}>
        {data.totalFiles} note{data.totalFiles !== 1 ? "s" : ""}
      </div>
      {data.groups.map((g: VaultListGroup, i: number) => (
        <div key={i} style={{ fontSize: 10, color: "var(--color-text-secondary)", display: "flex", gap: 4 }}>
          <span>{g.isDir ? "📁" : "📄"}</span>
          <span>{g.label}{g.isDir ? ` · ${g.count} file${g.count !== 1 ? "s" : ""}` : ""}</span>
        </div>
      ))}
      {data.overflow > 0 && (
        <span style={{ fontSize: 10, color: "var(--color-text-tertiary)" }}>
          + {data.overflow} more…
        </span>
      )}
    </div>
  );
}

function CalculateOutput({ value }: { value: string }) {
  return (
    <div style={{ ...tileStyle, alignItems: "baseline", gap: 8 }}>
      <span
        style={{
          fontFamily: "'Fira Code', 'SF Mono', Menlo, monospace",
          fontSize: 22,
          fontWeight: 600,
          color: "var(--color-text-primary)",
          letterSpacing: "-0.02em",
        }}
      >
        {value}
      </span>
      <span style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>(numeric)</span>
    </div>
  );
}

function GraphOutput({ pointCount }: { pointCount: number }) {
  return (
    <div style={{ ...tileStyle, alignItems: "center" }}>
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <path d="M1 11 Q3.5 3 7 7 Q10.5 11 13 3" stroke="var(--color-accent)" strokeWidth="1.5" strokeLinecap="round" fill="none" />
      </svg>
      <span style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>
        {pointCount} point{pointCount !== 1 ? "s" : ""} computed
      </span>
    </div>
  );
}

function DateOutput({ date, dayOfWeek }: { date: string; dayOfWeek: string }) {
  return (
    <div style={{ ...tileStyle, flexDirection: "column", gap: 1 }}>
      <span
        style={{
          fontFamily: "'Fira Code', 'SF Mono', Menlo, monospace",
          fontSize: 18,
          fontWeight: 600,
          color: "var(--color-text-primary)",
        }}
      >
        {date}
      </span>
      {dayOfWeek && (
        <span style={{ fontSize: 10, color: "var(--color-text-tertiary)" }}>{dayOfWeek}</span>
      )}
    </div>
  );
}

function ErrorOutput({ message, raw }: { message: string; raw: string }) {
  return (
    <pre
      style={{
        margin: 0,
        fontFamily: "'Fira Code', 'SF Mono', Menlo, monospace",
        fontSize: 11,
        color: "var(--color-red)",
        background: "var(--color-error-bg)",
        borderRadius: 4,
        padding: "6px 8px",
        overflow: "auto",
        maxHeight: 120,
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
      }}
    >
      {message || raw}
    </pre>
  );
}

function RawJsonOutput({ json }: { json: string }) {
  return (
    <pre
      style={{
        margin: 0,
        fontFamily: "'Fira Code', 'SF Mono', Menlo, monospace",
        fontSize: 10,
        color: "var(--color-text-secondary)",
        background: "var(--color-surface)",
        borderRadius: 4,
        padding: "6px 8px",
        overflow: "auto",
        maxHeight: 160,
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        lineHeight: "15px",
      }}
    >
      {json}
    </pre>
  );
}
