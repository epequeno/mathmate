import type { SelectionRect } from "../../hooks/usePdfRegionSelect";

interface PdfRegionHighlightProps {
  overlayRef: React.RefObject<HTMLDivElement | null>;
  captureMode: boolean;
  dragging: boolean;
  selectionRect: SelectionRect | null;
  captureBox: { left: number; top: number; width: number; height: number };
  rendering: boolean;
  loading: boolean;
  overlayHandlers: {
    onPointerDown: (e: React.PointerEvent) => void;
    onPointerMove: (e: React.PointerEvent) => void;
    onPointerUp: (e: React.PointerEvent) => void;
  };
  captureSelection: (rect: { left: number; top: number; width: number; height: number }) => void;
  onCancelCaptureMode: () => void;
  onStartCaptureDrag: (e: React.PointerEvent, kind: "move" | "resize") => void;
  onCapturePointerMove: (e: React.PointerEvent) => void;
  onCapturePointerUp: (e: React.PointerEvent<HTMLDivElement>) => void;
  onCapturePointerCancel: (e: React.PointerEvent<HTMLDivElement>) => void;
}

export function PdfRegionHighlight({
  overlayRef,
  captureMode,
  dragging,
  selectionRect,
  captureBox,
  rendering,
  loading,
  overlayHandlers,
  captureSelection,
  onCancelCaptureMode,
  onStartCaptureDrag,
  onCapturePointerMove,
  onCapturePointerUp,
  onCapturePointerCancel,
}: PdfRegionHighlightProps) {
  const disabled = rendering || loading;

  return (
    <div
      ref={overlayRef}
      style={{
        position: "absolute",
        inset: 0,
        cursor: captureMode ? "default" : dragging ? "crosshair" : disabled ? "default" : "crosshair",
        zIndex: 10,
      }}
      {...(!captureMode ? overlayHandlers : {})}
    >
      {/* Selection rectangle visual (non-capture mode) */}
      {!captureMode && selectionRect && (
        <div
          style={{
            position: "absolute",
            left: selectionRect.left,
            top: selectionRect.top,
            width: selectionRect.width,
            height: selectionRect.height,
            border: "2px dashed rgba(59,130,246,0.8)",
            background: "rgba(59,130,246,0.1)",
            pointerEvents: "none",
            borderRadius: 2,
          }}
        />
      )}

      {/* Capture mode overlay */}
      {captureMode && (
        <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.18)" }}>
          {/* Draggable box */}
          <div
            onPointerDown={(e) => onStartCaptureDrag(e, "move")}
            onPointerMove={onCapturePointerMove}
            onPointerUp={onCapturePointerUp}
            onPointerCancel={onCapturePointerCancel}
            style={{
              position: "absolute",
              left: captureBox.left,
              top: captureBox.top,
              width: captureBox.width,
              height: captureBox.height,
              border: "2px solid var(--color-accent)",
              background: "rgba(255,255,255,0.08)",
              boxShadow: "0 0 0 9999px rgba(0,0,0,0.28)",
              cursor: "move",
            }}
          >
            {/* Action buttons */}
            <div
              style={{
                position: "absolute",
                left: 8,
                top: 8,
                display: "flex",
                gap: 6,
                padding: 6,
                borderRadius: 7,
                background: "rgba(0,0,0,0.72)",
                color: "#fff",
                fontSize: 11,
                pointerEvents: "auto",
              }}
            >
              <button
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  captureSelection(captureBox);
                  onCancelCaptureMode();
                }}
                style={{
                  padding: "4px 8px",
                  borderRadius: 5,
                  border: "none",
                  background: "var(--color-accent)",
                  color: "#fff",
                  fontFamily: "inherit",
                  fontSize: 11,
                  cursor: "pointer",
                }}
              >
                Take Screenshot
              </button>
              <button
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  onCancelCaptureMode();
                }}
                style={{
                  padding: "4px 8px",
                  borderRadius: 5,
                  border: "1px solid rgba(255,255,255,0.25)",
                  background: "transparent",
                  color: "#fff",
                  fontFamily: "inherit",
                  fontSize: 11,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
            </div>

            {/* Resize handle */}
            <div
              onPointerDown={(e) => {
                e.stopPropagation();
                onStartCaptureDrag(e, "resize");
              }}
              onPointerMove={onCapturePointerMove}
              onPointerUp={onCapturePointerUp}
              onPointerCancel={onCapturePointerCancel}
              style={{
                position: "absolute",
                right: -6,
                bottom: -6,
                width: 14,
                height: 14,
                borderRadius: 4,
                background: "var(--color-accent)",
                border: "2px solid #fff",
                cursor: "nwse-resize",
              }}
              title="Resize capture region"
            />
          </div>
        </div>
      )}
    </div>
  );
}