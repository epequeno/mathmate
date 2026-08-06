import type { RefObject } from "react";

interface PdfPageCanvasProps {
  canvasRef: RefObject<HTMLCanvasElement | null>;
}

/**
 * PdfPageCanvas renders a single PDF page onto a canvas element.
 * The canvas dimensions are managed by usePdfRenderer; this component
 * just provides the DOM node with correct display semantics.
 */
export function PdfPageCanvas({ canvasRef }: PdfPageCanvasProps) {
  return (
    <canvas
      ref={canvasRef}
      style={{
        display: "block",
        // Canvas CSS size is set dynamically by usePdfRenderer
      }}
    />
  );
}