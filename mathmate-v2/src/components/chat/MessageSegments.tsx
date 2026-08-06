import { useMemo } from "react";
import { renderMarkdown } from "../../lib/renderMarkdown";
import { sanitize } from "../../lib/sanitize";
import { extractInteractiveSegments } from "../../lib/interactiveSegments";
import type { MessageSegment } from "../../lib/types";
import VizRenderer from "../Visualization/VizRenderer";
import QuizRenderer from "../Quiz/QuizRenderer";
import FunctionGraph from "../Visualization/FunctionGraph";
import { ErrorBoundary } from "../ErrorBoundary";
import type { VizSegment, QuizSegment } from "../../lib/interactiveSegments";
import { ProcessBlock } from "./ProcessBlock";
import styles from "./MessageSegments.module.css";

interface MessageSegmentsProps {
  segments: MessageSegment[];
  isStreaming?: boolean;
  showProcessBlock?: boolean;
}

function renderMarkdownSegment(seg: ReturnType<typeof extractInteractiveSegments>[number], i: number) {
  if (seg.type === "html") {
    return (
      <div
        key={i}
        dangerouslySetInnerHTML={{
          __html: sanitize(renderMarkdown((seg as any).html)),
        }}
      />
    );
  }
  if (seg.type === "viz") {
    return <ErrorBoundary key={i}><VizRenderer segment={seg as VizSegment} /></ErrorBoundary>;
  }
  if (seg.type === "quiz") {
    return <ErrorBoundary key={i}><QuizRenderer segment={seg as QuizSegment} /></ErrorBoundary>;
  }
  return null;
}

export function MessageSegments({ segments, isStreaming, showProcessBlock = true }: MessageSegmentsProps) {
  const processSegments = segments.filter((s) => s.type !== "content");
  const contentSegments = segments.filter((s) => s.type === "content");

  // Collect completed graph tool calls to render inline below the process block.
  const inlineGraphs = useMemo(() => {
    const resultsByCallId = new Map(
      segments
        .filter((s): s is Extract<MessageSegment, { type: "tool_result" }> => s.type === "tool_result")
        .map((s) => [s.call_id, s])
    );
    return segments
      .filter(
        (s): s is Extract<MessageSegment, { type: "tool_call" }> =>
          s.type === "tool_call" && s.tool_name === "graph"
      )
      .flatMap((s) => {
        const result = resultsByCallId.get(s.call_id);
        if (!result || result.is_error) return [];
        const args = s.arguments as { expression?: string; xmin?: number; xmax?: number };
        const expr = args.expression ?? "";
        if (!expr) return [];
        return [
          {
            id: s.id,
            expr,
            xmin: String(args.xmin ?? -10),
            xmax: String(args.xmax ?? 10),
            title: expr,
          },
        ];
      });
  }, [segments]);

  return (
    <div className={styles.container}>
      {showProcessBlock && processSegments.length > 0 && (
        <ProcessBlock segments={processSegments} isStreaming={isStreaming} />
      )}
      {inlineGraphs.length > 0 && !isStreaming && (
        <div className={styles.content}>
          {inlineGraphs.map((g) => (
            <ErrorBoundary key={g.id}>
              <FunctionGraph
                expr={g.expr}
                xmin={g.xmin}
                xmax={g.xmax}
                title={g.title}
              />
            </ErrorBoundary>
          ))}
        </div>
      )}
      {contentSegments.map((seg) => {
        const text = (seg as Extract<MessageSegment, { type: "content" }>).text;
        const rendered = extractInteractiveSegments(text).map(renderMarkdownSegment);
        return (
          <div key={seg.id} className={styles.content}>
            <div className="markdown-body">{rendered}</div>
            {isStreaming && <StreamingDots />}
          </div>
        );
      })}
    </div>
  );
}

function StreamingDots() {
  return (
    <span className={styles.dots}>
      <span className="loading-dot" />
      <span className="loading-dot" style={{ animationDelay: "0.15s" }} />
      <span className="loading-dot" style={{ animationDelay: "0.3s" }} />
    </span>
  );
}
