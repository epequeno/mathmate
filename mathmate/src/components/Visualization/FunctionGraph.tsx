import { useRef, useEffect, memo } from "react";
import { safeEvalNumberOrNaN } from "../../lib/safeMath";

// Dynamic import to avoid blocking render — Plotly is ~5MB
let Plotly: any = null;
let plotlyPromise: Promise<any> | null = null;

async function getPlotly(): Promise<any> {
  if (!Plotly) {
    if (!plotlyPromise) {
      plotlyPromise = import("plotly.js-dist-min");
    }
    Plotly = await plotlyPromise;
  }
  return Plotly;
}

interface FunctionGraphProps {
  expr: string;
  xmin?: string;
  xmax?: string;
  ymin?: string;
  ymax?: string;
  title?: string;
}

/**
 * Renders a 2D function graph using Plotly.
 * Lazy-loads Plotly on first render (not on import).
 */
const FunctionGraph = memo(function FunctionGraph({
  expr,
  xmin = "-5",
  xmax = "5",
  ymin,
  ymax,
  title,
}: FunctionGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const plotRef = useRef<any>(null);

  useEffect(() => {
    let cancelled = false;
    const container = containerRef.current;
    if (!container) return;

    (async () => {
      const PL = await getPlotly();
      if (cancelled || !container) return;

      const xMin = parseFloat(xmin);
      const xMax = parseFloat(xmax);
      const step = (xMax - xMin) / 400;
      const xValues: number[] = [];
      const yValues: number[] = [];

      for (let x = xMin; x <= xMax; x += step) {
        xValues.push(x);
        yValues.push(safeEvalNumberOrNaN(expr, { x }));
      }

      const layout: any = {
        margin: { l: 40, r: 10, t: title ? 30 : 10, b: 40 },
        xaxis: {
          range: [xMin, xMax],
          showgrid: true,
          gridcolor: "rgba(127,127,127,0.15)",
          zerolinecolor: "rgba(127,127,127,0.3)",
          zerolinewidth: 1,
        },
        yaxis: {
          range: ymin && ymax ? [parseFloat(ymin), parseFloat(ymax)] : undefined,
          showgrid: true,
          gridcolor: "rgba(127,127,127,0.15)",
          zerolinecolor: "rgba(127,127,127,0.3)",
          zerolinewidth: 1,
        },
        paper_bgcolor: "transparent",
        plot_bgcolor: "transparent",
        font: { color: "var(--color-text-secondary, #666)" },
        title: title ? { text: title, font: { size: 13 } } : undefined,
        hovermode: "x",
        dragmode: false,
      };

      const config = {
        responsive: true,
        displayModeBar: false,
        scrollZoom: false,
        staticPlot: false,
      };

      const trace = {
        x: xValues,
        y: yValues,
        type: "scatter" as const,
        mode: "lines" as const,
        line: { color: "var(--color-accent, #4f46e5)", width: 2.5 },
        hoverinfo: "x+y" as const,
      };

      if (plotRef.current) {
        await PL.react(container, [trace], layout, config);
      } else {
        plotRef.current = await PL.newPlot(container, [trace], layout, config);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [expr, xmin, xmax, ymin, ymax, title]);

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: 300,
        borderRadius: 8,
        border: "1px solid var(--color-border)",
        overflow: "hidden",
        margin: "8px 0",
      }}
    />
  );
});

export default FunctionGraph;