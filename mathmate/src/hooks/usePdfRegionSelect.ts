import { useRef, useState, useCallback, useEffect } from "react";

export interface SelectionRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface UsePdfRegionSelectOptions {
  /** Reference to the PDF canvas element */
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  /** Whether selection is disabled while page renders */
  disabled: boolean;
  /** Called with the captured image data as base64 (without prefix) */
  onCapture: (base64: string, mime: string) => void;
}

interface UsePdfRegionSelectReturn {
  /** Reference for the transparent overlay aligned to the PDF canvas */
  overlayRef: React.RefObject<HTMLDivElement | null>;
  /** Whether the user is currently dragging a selection */
  dragging: boolean;
  /** Current selection rectangle in CSS coordinates (during drag) */
  selectionRect: SelectionRect | null;
  /** Capture an overlay-local rectangle from the PDF canvas */
  captureSelection: (rect: SelectionRect) => void;
  /** Handlers to spread onto the selection overlay element */
  overlayHandlers: {
    onPointerDown: (e: React.PointerEvent) => void;
    onPointerMove: (e: React.PointerEvent) => void;
    onPointerUp: (e: React.PointerEvent) => void;
  };
}

const MIN_SELECTION_SIZE_PX = 20;
const MAX_LONGEST_SIDE = 2048;
const MAX_ENCODED_BYTES = 6_000_000; // ~6 MB

/**
 * Manages drag-to-select region capture on a PDF canvas.
 *
 * Handles:
 * - Pointer event state machine (idle → dragging → captured/error)
 * - CSS-to-canvas coordinate mapping with HiDPI scaling
 * - Size caps and downscaling
 * - Escape-key cancellation
 */
export function usePdfRegionSelect({
  canvasRef,
  disabled,
  onCapture,
}: UsePdfRegionSelectOptions): UsePdfRegionSelectReturn {
  const [dragging, setDragging] = useState(false);
  const [selectionRect, setSelectionRect] = useState<SelectionRect | null>(null);
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const capturingRef = useRef(false);

  // ── Escape key cancels selection ──

  useEffect(() => {
    if (!dragging) return;

    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setDragging(false);
        setSelectionRect(null);
        dragStart.current = null;
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [dragging]);

  const captureRegion = useCallback(
    (rect: SelectionRect) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const bounds = canvas.getBoundingClientRect();

      // CSS → backing-store pixel coordinates
      const backScaleX = canvas.width / bounds.width;
      const backScaleY = canvas.height / bounds.height;

      let sx = Math.round((rect.left - bounds.left) * backScaleX);
      let sy = Math.round((rect.top - bounds.top) * backScaleY);
      let sw = Math.round(rect.width * backScaleX);
      let sh = Math.round(rect.height * backScaleY);

      // Clamp to canvas bounds
      sx = Math.max(0, Math.min(sx, canvas.width));
      sy = Math.max(0, Math.min(sy, canvas.height));
      sw = Math.max(1, Math.min(sw, canvas.width - sx));
      sh = Math.max(1, Math.min(sh, canvas.height - sy));

      // Read pixel data
      let imageData = ctx.getImageData(sx, sy, sw, sh);

      // ── Downscale if longest side exceeds limit ──
      let outputWidth = sw;
      let outputHeight = sh;
      if (Math.max(sw, sh) > MAX_LONGEST_SIDE) {
        const ratio = MAX_LONGEST_SIDE / Math.max(sw, sh);
        outputWidth = Math.round(sw * ratio);
        outputHeight = Math.round(sh * ratio);

        // Use an offscreen canvas for resizing
        const tempCanvas = document.createElement("canvas");
        tempCanvas.width = outputWidth;
        tempCanvas.height = outputHeight;
        const tempCtx = tempCanvas.getContext("2d")!;
        // Put the original image data onto a temporary canvas at full size,
        // then drawImage into the target size (browser does the downscale)
        const srcCanvas = document.createElement("canvas");
        srcCanvas.width = sw;
        srcCanvas.height = sh;
        const srcCtx = srcCanvas.getContext("2d")!;
        srcCtx.putImageData(imageData, 0, 0);
        tempCtx.drawImage(srcCanvas, 0, 0, outputWidth, outputHeight);
        imageData = tempCtx.getImageData(0, 0, outputWidth, outputHeight);
      }

      // ── Encode to PNG ──
      const outCanvas = document.createElement("canvas");
      outCanvas.width = outputWidth;
      outCanvas.height = outputHeight;
      const outCtx = outCanvas.getContext("2d")!;
      outCtx.putImageData(imageData, 0, 0);

      outCanvas.toBlob(
        (blob) => {
          if (!blob) {
            return;
          }

          // Check encoded size
          if (blob.size > MAX_ENCODED_BYTES) {
            return;
          }

          const reader = new FileReader();
          reader.onloadend = () => {
            const result = reader.result as string;
            // Strip data:*;base64, prefix
            const commaIdx = result.indexOf(",");
            const base64 = commaIdx !== -1 ? result.slice(commaIdx + 1) : result;

            capturingRef.current = false;
            onCapture(base64, "image/png");
          };
          reader.onerror = () => {
            capturingRef.current = false;
          };
          reader.readAsDataURL(blob);
        },
        "image/png",
        0.92,
      );
    },
    [canvasRef, onCapture],
  );

  const captureSelection = useCallback(
    (rect: SelectionRect) => {
      const overlay = overlayRef.current;
      if (!overlay || capturingRef.current) return;

      const overlayRect = overlay.getBoundingClientRect();
      if (rect.width < MIN_SELECTION_SIZE_PX || rect.height < MIN_SELECTION_SIZE_PX) return;

      capturingRef.current = true;
      captureRegion({
        left: rect.left + overlayRect.left,
        top: rect.top + overlayRect.top,
        width: rect.width,
        height: rect.height,
      });
    },
    [captureRegion],
  );

  // ── Pointer handlers ──

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (disabled || capturingRef.current) return;

      // Only primary button
      if (e.button !== 0) return;

      const overlay = overlayRef.current;
      if (!overlay) return;

      const overlayRect = overlay.getBoundingClientRect();
      dragStart.current = {
        x: e.clientX - overlayRect.left,
        y: e.clientY - overlayRect.top,
      };
      setDragging(true);
      setSelectionRect({
        left: dragStart.current.x,
        top: dragStart.current.y,
        width: 0,
        height: 0,
      });

      // Capture pointer for reliable tracking
      overlay.setPointerCapture(e.pointerId);
    },
    [disabled],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging || !dragStart.current) return;

      const overlay = overlayRef.current;
      if (!overlay) return;

      const overlayRect = overlay.getBoundingClientRect();
      const cx = e.clientX - overlayRect.left;
      const cy = e.clientY - overlayRect.top;

      const left = Math.min(dragStart.current.x, cx);
      const top = Math.min(dragStart.current.y, cy);
      const width = Math.abs(cx - dragStart.current.x);
      const height = Math.abs(cy - dragStart.current.y);

      setSelectionRect({ left, top, width, height });
    },
    [dragging],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging || !dragStart.current) return;

      setDragging(false);

      const overlay = overlayRef.current;
      if (!overlay) return;

      const overlayRect = overlay.getBoundingClientRect();
      const cx = e.clientX - overlayRect.left;
      const cy = e.clientY - overlayRect.top;

      const left = Math.min(dragStart.current.x, cx);
      const top = Math.min(dragStart.current.y, cy);
      const width = Math.abs(cx - dragStart.current.x);
      const height = Math.abs(cy - dragStart.current.y);

      dragStart.current = null;
      setSelectionRect(null);

      // Ignore micro-drags
      if (width < MIN_SELECTION_SIZE_PX || height < MIN_SELECTION_SIZE_PX) return;

      capturingRef.current = true;
      captureRegion({
        left: left + overlayRect.left,
        top: top + overlayRect.top,
        width,
        height,
      });
    },
    [dragging, captureRegion],
  );

  return {
    overlayRef,
    dragging,
    selectionRect,
    captureSelection,
    overlayHandlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
    },
  };
}