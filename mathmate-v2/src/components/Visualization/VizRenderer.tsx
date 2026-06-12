import { memo } from "react";
import FunctionGraph from "./FunctionGraph";
import type { VizSegment } from "../../lib/interactiveSegments";

interface VizRendererProps {
  segment: VizSegment;
}

/**
 * Routes visualization segments to the appropriate Plotly component.
 */
const VizRenderer = memo(function VizRenderer({ segment }: VizRendererProps) {
  switch (segment.kind) {
    case "function":
      return (
        <FunctionGraph
          expr={segment.attrs.expr || segment.attrs.expression || ""}
          xmin={segment.attrs.xmin}
          xmax={segment.attrs.xmax}
          ymin={segment.attrs.ymin}
          ymax={segment.attrs.ymax}
          title={segment.attrs.title}
        />
      );

    case "surface":
      return <GenericVizPlaceholder type="3D Surface" />;

    case "parametric":
      return <GenericVizPlaceholder type="Parametric Curve" />;

    case "scatter":
      return <GenericVizPlaceholder type="Scatter Plot" />;

    case "bar":
      return <GenericVizPlaceholder type="Bar Chart" />;

    default:
      return <GenericVizPlaceholder type={segment.kind} />;
  }
});

function GenericVizPlaceholder({ type }: { type: string }) {
  return (
    <div
      style={{
        padding: "16px 20px",
        margin: "8px 0",
        borderRadius: 8,
        border: "1px dashed var(--color-border)",
        background: "var(--color-surface)",
        textAlign: "center",
        fontSize: 13,
        color: "var(--color-text-tertiary)",
      }}
    >
      {type} visualization
      <span style={{ display: "block", fontSize: 11, marginTop: 4, opacity: 0.6 }}>
        (coming soon — Plotly supports this natively)
      </span>
    </div>
  );
}

export default VizRenderer;