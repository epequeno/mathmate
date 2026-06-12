import { useCallback, useEffect, useRef, useState } from "react";
import { usePdfRenderer } from "../hooks/usePdfRenderer";
import type { PdfBookmark } from "../hooks/usePdfRenderer";
import { usePdfRegionSelect } from "../hooks/usePdfRegionSelect";
import { useTextbookIndexer } from "../hooks/useTextbookIndexer";

interface PdfViewerProps {
  pdfUrl: string | null;
  projectId?: string;
  /** Stable textbook ID for search index (optional — enables indexing) */
  textbookId?: string;
  /** Textbook title for index metadata */
  textbookTitle?: string;
  onCapture: (base64: string, mime: string) => void;
  /** Called when a capture-error string should be shown */
  onError: (msg: string | null) => void;
}

function loadPersisted(projectId: string, key: string, fallback: number): number {
  try {
    const raw = localStorage.getItem(`mathmate-book-${key}-${projectId}`);
    if (raw !== null) {
      const val = parseFloat(raw);
      if (!isNaN(val) && val > 0) return val;
    }
  } catch {}
  return fallback;
}

function savePersisted(projectId: string, key: string, val: number) {
  try {
    localStorage.setItem(`mathmate-book-${key}-${projectId}`, String(val));
  } catch {}
}

export default function PdfViewer({ pdfUrl, projectId, textbookId, textbookTitle, onCapture, onError }: PdfViewerProps) {
  // Restore persisted page and zoom for this project
  const initialPage = projectId ? loadPersisted(projectId, "page", 1) : 1;
  const initialScale = projectId ? loadPersisted(projectId, "zoom", 1.0) : 1.0;

  const {
    canvasRef,
    pdfDocument,
    numPages,
    pageNumber,
    scale,
    rendering,
    loading,
    bookmarks,
    loadingBookmarks,
    error: renderError,
    goToPage,
    setScale,
    zoomIn,
    zoomOut,
    getCanvasBoundingRect,
  } = usePdfRenderer(pdfUrl, initialPage, initialScale);

  // Persist page and zoom on change
  useEffect(() => {
    if (projectId && pdfUrl) {
      savePersisted(projectId, "page", pageNumber);
    }
  }, [pageNumber, projectId, pdfUrl]);

  useEffect(() => {
    if (projectId && pdfUrl) {
      savePersisted(projectId, "zoom", scale);
    }
  }, [scale, projectId, pdfUrl]);

  const {
    overlayRef,
    dragging,
    selectionRect,
    captureSelection,
    overlayHandlers,
  } = usePdfRegionSelect({
    canvasRef,
    disabled: rendering || loading,
    onCapture,
  });

  // Forward render errors
  useEffect(() => {
    onError(renderError);
  }, [renderError, onError]);

  // ── Textbook indexing ──

  const indexer = useTextbookIndexer({
    textbookId: textbookId ?? "",
    title: textbookTitle,
    pdfDocument,
    enabled: !!textbookId && !!pdfDocument && !loading,
  });

  // ── Page input / bookmarks ──

  const pageInputRef = useRef<HTMLInputElement>(null);
  const [pageInputValue, setPageInputValue] = useState("");
  const [pageInputError, setPageInputError] = useState<string | null>(null);
  const [showBookmarks, setShowBookmarks] = useState(false);
  const [captureMode, setCaptureMode] = useState(false);
  const [captureBox, setCaptureBox] = useState({ left: 80, top: 80, width: 320, height: 220 });
  const captureDragRef = useRef<
    | null
    | {
        kind: "move" | "resize";
        startX: number;
        startY: number;
        startBox: { left: number; top: number; width: number; height: number };
      }
  >(null);

  const submitPageInput = useCallback(() => {
    const val = parseInt(pageInputValue.trim(), 10);
    if (isNaN(val)) {
      setPageInputError("Enter a page number.");
      return;
    }
    if (val < 1 || val > numPages) {
      setPageInputError(`Page must be between 1 and ${numPages}.`);
      return;
    }
    goToPage(val);
    setPageInputValue("");
    setPageInputError(null);
  }, [goToPage, numPages, pageInputValue]);

  const handlePageInputKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        submitPageInput();
      } else if (e.key === "Escape") {
        setPageInputValue("");
        setPageInputError(null);
      }
    },
    [submitPageInput],
  );

  const bookmarkCount = countBookmarks(bookmarks);
  const errorColor = "var(--color-red)";

  const startCaptureMode = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (canvas) {
      const canvasRect = canvas.getBoundingClientRect();
      const containerRect = container?.getBoundingClientRect();

      // Place the initial capture box in the currently visible portion of the
      // PDF page, not the center of the full page. This matters when the user is
      // zoomed in or scrolled to a lower/right section of a large page.
      const visibleLeft = containerRect ? Math.max(0, containerRect.left - canvasRect.left) : 0;
      const visibleTop = containerRect ? Math.max(0, containerRect.top - canvasRect.top) : 0;
      const visibleRight = containerRect
        ? Math.min(canvas.clientWidth, containerRect.right - canvasRect.left)
        : canvas.clientWidth;
      const visibleBottom = containerRect
        ? Math.min(canvas.clientHeight, containerRect.bottom - canvasRect.top)
        : canvas.clientHeight;
      const visibleWidth = Math.max(80, visibleRight - visibleLeft);
      const visibleHeight = Math.max(80, visibleBottom - visibleTop);

      const width = Math.max(80, Math.min(360, visibleWidth - 32, canvas.clientWidth));
      const height = Math.max(80, Math.min(240, visibleHeight - 32, canvas.clientHeight));
      setCaptureBox({
        left: Math.max(0, Math.min(visibleLeft + (visibleWidth - width) / 2, canvas.clientWidth - width)),
        top: Math.max(0, Math.min(visibleTop + (visibleHeight - height) / 2, canvas.clientHeight - height)),
        width,
        height,
      });
    }
    setCaptureMode(true);
  }, [canvasRef]);

  const updateCaptureBox = useCallback(
    (nextBox: { left: number; top: number; width: number; height: number }) => {
      const canvas = canvasRef.current;
      const canvasWidth = canvas?.clientWidth ?? 0;
      const canvasHeight = canvas?.clientHeight ?? 0;
      const minSize = 40;
      const width = Math.max(minSize, Math.min(nextBox.width, Math.max(minSize, canvasWidth - nextBox.left)));
      const height = Math.max(minSize, Math.min(nextBox.height, Math.max(minSize, canvasHeight - nextBox.top)));
      const left = Math.max(0, Math.min(nextBox.left, Math.max(0, canvasWidth - width)));
      const top = Math.max(0, Math.min(nextBox.top, Math.max(0, canvasHeight - height)));
      setCaptureBox({ left, top, width, height });
    },
    [canvasRef],
  );

  const handleCapturePointerMove = useCallback(
    (e: React.PointerEvent) => {
      const drag = captureDragRef.current;
      if (!drag) return;
      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;
      if (drag.kind === "move") {
        updateCaptureBox({
          ...drag.startBox,
          left: drag.startBox.left + dx,
          top: drag.startBox.top + dy,
        });
      } else {
        updateCaptureBox({
          ...drag.startBox,
          width: drag.startBox.width + dx,
          height: drag.startBox.height + dy,
        });
      }
    },
    [updateCaptureBox],
  );

  const finishCaptureDrag = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    captureDragRef.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
  }, []);

  // ── Fit Width ──

  const fitWidthRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const applyFitWidth = useCallback(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    fitWidthRef.current = true;

    // Measure available width inside the scroll container (subtract padding)
    const availableWidth = container.clientWidth - 32; // 16px padding each side
    if (availableWidth <= 0) return;

    // canvas.style.width = viewport.width px = naturalPageWidth * scale
    // So naturalPageWidth = cssWidth / scale
    // We want: naturalPageWidth * newScale = availableWidth
    // => newScale = availableWidth / naturalPageWidth = availableWidth * scale / cssWidth
    const cssWidth = parseFloat(canvas.style.width);
    if (!cssWidth || cssWidth <= 0) return;

    const newScale = (availableWidth / cssWidth) * scale;
    setScale(newScale);
  }, [canvasRef, scale, setScale]);

  const handleFitWidth = useCallback(() => {
    fitWidthRef.current = true;
    applyFitWidth();
  }, [applyFitWidth]);

  // Disable fit width on manual zoom
  const handleZoomIn = useCallback(() => {
    fitWidthRef.current = false;
    zoomIn();
  }, [zoomIn]);

  const handleZoomOut = useCallback(() => {
    fitWidthRef.current = false;
    zoomOut();
  }, [zoomOut]);

  // Re-apply fit width on container resize when enabled
  useEffect(() => {
    if (!fitWidthRef.current) return;

    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(() => {
      applyFitWidth();
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [applyFitWidth]);

  // ── Zoom level display helper ──

  const zoomPercent = Math.round(scale * 100);

  // ── Render ──

  if (!pdfUrl) {
    return null;
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* ── Toolbar ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "6px 16px",
          borderBottom: "1px solid var(--color-border)",
          background: "var(--color-bg-elevated)",
          flexShrink: 0,
        }}
      >
        {/* Page navigation */}
        <button
          onClick={() => goToPage(pageNumber - 1)}
          disabled={pageNumber <= 1 || loading || rendering}
          title="Previous page"
          style={{
            padding: "4px 8px",
            border: "1px solid var(--color-border)",
            borderRadius: 5,
            background: "transparent",
            color: pageNumber <= 1 ? "var(--color-text-tertiary)" : "var(--color-text-secondary)",
            cursor: pageNumber <= 1 ? "default" : "pointer",
            fontSize: 14,
            fontFamily: "inherit",
            display: "flex",
            alignItems: "center",
            opacity: loading || rendering ? 0.5 : 1,
          }}
        >
          ‹
        </button>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            submitPageInput();
          }}
          title={pageInputError ?? "Type a page number and press Enter"}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            fontSize: 13,
            color: pageInputError ? errorColor : "var(--color-text-secondary)",
            whiteSpace: "nowrap",
            fontWeight: 500,
          }}
        >
          <span>Page</span>
          <input
            ref={pageInputRef}
            type="text"
            inputMode="numeric"
            value={pageInputValue}
            placeholder={String(pageNumber)}
            onChange={(e) => {
              setPageInputValue(e.target.value);
              setPageInputError(null);
            }}
            onKeyDown={handlePageInputKeyDown}
            style={{
              width: 48,
              textAlign: "center",
              padding: "2px 4px",
              borderRadius: 4,
              border: `1px solid ${pageInputError ? errorColor : "var(--color-border)"}`,
              background: "var(--color-surface)",
              color: "var(--color-text-primary)",
              fontSize: 12,
              fontFamily: "inherit",
              outline: "none",
            }}
          />
          <span>/ {numPages}</span>
          <button
            type="submit"
            disabled={loading || rendering || !pageInputValue.trim()}
            style={{
              padding: "3px 7px",
              border: "1px solid var(--color-border)",
              borderRadius: 5,
              background: "transparent",
              color: "var(--color-text-secondary)",
              cursor: loading || rendering || !pageInputValue.trim() ? "default" : "pointer",
              fontSize: 11,
              fontFamily: "inherit",
              opacity: loading || rendering || !pageInputValue.trim() ? 0.5 : 1,
            }}
          >
            Go
          </button>
        </form>

        <button
          onClick={() => goToPage(pageNumber + 1)}
          disabled={pageNumber >= numPages || loading || rendering}
          title="Next page"
          style={{
            padding: "4px 8px",
            border: "1px solid var(--color-border)",
            borderRadius: 5,
            background: "transparent",
            color: pageNumber >= numPages ? "var(--color-text-tertiary)" : "var(--color-text-secondary)",
            cursor: pageNumber >= numPages ? "default" : "pointer",
            fontSize: 14,
            fontFamily: "inherit",
            display: "flex",
            alignItems: "center",
            opacity: loading || rendering ? 0.5 : 1,
          }}
        >
          ›
        </button>

        <div style={{ width: 1, height: 20, background: "var(--color-border)", margin: "0 4px" }} />

        <button
          onClick={() => setShowBookmarks((value) => !value)}
          disabled={loading || loadingBookmarks || bookmarkCount === 0}
          title={bookmarkCount === 0 ? "This PDF does not expose bookmarks" : "Show PDF bookmarks"}
          style={{
            padding: "4px 10px",
            border: "1px solid var(--color-border)",
            borderRadius: 5,
            background: showBookmarks ? "var(--color-accent)" : "transparent",
            color: showBookmarks ? "#fff" : "var(--color-text-secondary)",
            cursor: loading || loadingBookmarks || bookmarkCount === 0 ? "default" : "pointer",
            fontSize: 11,
            fontFamily: "inherit",
            fontWeight: showBookmarks ? 600 : 400,
            opacity: loading || loadingBookmarks || bookmarkCount === 0 ? 0.5 : 1,
          }}
        >
          {loadingBookmarks ? "Loading bookmarks…" : `Bookmarks${bookmarkCount ? ` (${bookmarkCount})` : ""}`}
        </button>

        {/* Textbook indexing progress */}
        {indexer.status === "indexing" && indexer.progress && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              padding: "4px 10px",
              borderRadius: 5,
              background: "rgba(234,179,8,0.1)",
              border: "1px solid rgba(234,179,8,0.3)",
              fontSize: 11,
              color: "rgb(180,130,20)",
              whiteSpace: "nowrap",
            }}
            title="Indexing textbook for AI search"
          >
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: "rgb(234,179,8)",
                animation: "pulse 1.5s ease-in-out infinite",
                display: "inline-block",
              }}
            />
            Indexing… {indexer.progress.indexed}/{indexer.progress.total}
          </div>
        )}
        {indexer.status === "complete" && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              padding: "4px 8px",
              fontSize: 11,
              color: "rgb(34,197,94)",
            }}
            title="Textbook indexed for AI search"
          >
            ✓ Search ready
          </div>
        )}
        {indexer.status === "error" && (
          <div
            style={{
              padding: "4px 8px",
              fontSize: 11,
              color: "rgb(239,68,68)",
            }}
            title={indexer.error ?? "Indexing failed"}
          >
            ! Index error
          </div>
        )}

        <button
          onClick={startCaptureMode}
          disabled={loading || rendering}
          title="Select a screenshot region"
          style={{
            padding: "4px 10px",
            border: "1px solid var(--color-border)",
            borderRadius: 5,
            background: captureMode ? "var(--color-accent)" : "transparent",
            color: captureMode ? "#fff" : "var(--color-text-secondary)",
            cursor: loading || rendering ? "default" : "pointer",
            fontSize: 11,
            fontFamily: "inherit",
            fontWeight: captureMode ? 600 : 400,
            opacity: loading || rendering ? 0.5 : 1,
          }}
        >
          Capture Region
        </button>

        <div style={{ width: 1, height: 20, background: "var(--color-border)", margin: "0 4px" }} />

        {/* Zoom controls */}
        <button
          onClick={handleZoomOut}
          disabled={loading || rendering}
          title="Zoom out"
          style={{
            padding: "4px 8px",
            border: "1px solid var(--color-border)",
            borderRadius: 5,
            background: "transparent",
            color: "var(--color-text-secondary)",
            cursor: "pointer",
            fontSize: 13,
            fontFamily: "inherit",
            display: "flex",
            alignItems: "center",
            opacity: loading || rendering ? 0.5 : 1,
          }}
        >
          −
        </button>

        <span style={{ fontSize: 12, color: "var(--color-text-tertiary)", minWidth: 38, textAlign: "center" }}>
          {zoomPercent}%
        </span>

        <button
          onClick={handleZoomIn}
          disabled={loading || rendering}
          title="Zoom in"
          style={{
            padding: "4px 8px",
            border: "1px solid var(--color-border)",
            borderRadius: 5,
            background: "transparent",
            color: "var(--color-text-secondary)",
            cursor: "pointer",
            fontSize: 13,
            fontFamily: "inherit",
            display: "flex",
            alignItems: "center",
            opacity: loading || rendering ? 0.5 : 1,
          }}
        >
          +
        </button>

        <button
          onClick={handleFitWidth}
          disabled={loading || rendering}
          title="Fit width"
          style={{
            padding: "4px 10px",
            border: "1px solid var(--color-border)",
            borderRadius: 5,
            background: fitWidthRef.current ? "var(--color-accent)" : "transparent",
            color: fitWidthRef.current ? "#fff" : "var(--color-text-secondary)",
            cursor: "pointer",
            fontSize: 11,
            fontFamily: "inherit",
            fontWeight: fitWidthRef.current ? 600 : 400,
            opacity: loading || rendering ? 0.5 : 1,
          }}
        >
          Fit Width
        </button>

        {/* Loading / Rendering indicator */}
        {(loading || rendering) && (
          <span style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginLeft: "auto" }}>
            {loading ? "Loading PDF…" : "Rendering…"}
          </span>
        )}
      </div>

      {/* ── Body: optional bookmarks + viewer area ── */}
      <div style={{ flex: 1, minHeight: 0, display: "flex", overflow: "hidden" }}>
        {showBookmarks && bookmarkCount > 0 && (
          <aside
            style={{
              width: 300,
              flexShrink: 0,
              overflow: "auto",
              borderRight: "1px solid var(--color-border)",
              background: "var(--color-bg-elevated)",
              padding: "10px 8px",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "0 4px 8px",
                fontSize: 12,
                fontWeight: 600,
                color: "var(--color-text-secondary)",
              }}
            >
              <span>Bookmarks</span>
              <button
                onClick={() => setShowBookmarks(false)}
                style={{
                  border: "none",
                  background: "transparent",
                  color: "var(--color-text-tertiary)",
                  cursor: "pointer",
                  fontSize: 16,
                  lineHeight: 1,
                }}
                title="Hide bookmarks"
              >
                ×
              </button>
            </div>
            <BookmarkList
              bookmarks={bookmarks}
              currentPage={pageNumber}
              onNavigate={(targetPage) => {
                goToPage(targetPage);
                setPageInputValue("");
                setPageInputError(null);
              }}
            />
          </aside>
        )}

        {/* ── Viewer area (scrollable) ── */}
        <div
          ref={containerRef}
          style={{
            flex: 1,
            overflow: "auto",
            padding: 16,
            background: "var(--color-bg)",
            position: "relative",
          }}
        >
          <div
            style={{
              position: "relative",
              display: "table",        /* shrink-wraps to canvas size while allowing margin: auto to center it */
              margin: "0 auto",        /* centers when narrower than container; left-aligns when wider so scroll works */
              boxShadow: "0 2px 12px rgba(0,0,0,0.15)",
              borderRadius: 2,
              overflow: "hidden",
            }}
          >
          {/* PDF canvas */}
          <canvas
            ref={canvasRef}
            style={{
              display: "block",
              // Canvas CSS size is set dynamically by the renderer
            }}
          />

          {/* Selection overlay — transparent div over the canvas */}
          <div
            ref={overlayRef}
            style={{
              position: "absolute",
              inset: 0,
              cursor: captureMode ? "default" : dragging ? "crosshair" : rendering || loading ? "default" : "crosshair",
              zIndex: 10,
            }}
            {...(!captureMode ? overlayHandlers : {})}
          >
            {/* Selection rectangle visual */}
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
            {captureMode && (
              <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.18)" }}>
                <div
                  onPointerDown={(e) => {
                    captureDragRef.current = {
                      kind: "move",
                      startX: e.clientX,
                      startY: e.clientY,
                      startBox: captureBox,
                    };
                    e.currentTarget.setPointerCapture(e.pointerId);
                  }}
                  onPointerMove={handleCapturePointerMove}
                  onPointerUp={finishCaptureDrag}
                  onPointerCancel={finishCaptureDrag}
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
                        setCaptureMode(false);
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
                        setCaptureMode(false);
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
                  <div
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      captureDragRef.current = {
                        kind: "resize",
                        startX: e.clientX,
                        startY: e.clientY,
                        startBox: captureBox,
                      };
                      e.currentTarget.setPointerCapture(e.pointerId);
                    }}
                    onPointerMove={handleCapturePointerMove}
                    onPointerUp={finishCaptureDrag}
                    onPointerCancel={finishCaptureDrag}
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
          </div>
        </div>
      </div>

      {/* ── Capture hint ── */}
      {pdfUrl && !loading && !rendering && (
        <div
          style={{
            padding: "4px 16px",
            fontSize: 11,
            color: "var(--color-text-tertiary)",
            borderTop: "1px solid var(--color-border)",
            textAlign: "center",
          }}
        >
          {captureMode
            ? "Move/resize the capture box, then click Take Screenshot."
            : "Use Capture Region to attach a PDF screenshot to your chat message."}
        </div>
      )}
    </div>
  );
}

function countBookmarks(bookmarks: PdfBookmark[]): number {
  return bookmarks.reduce((total, bookmark) => total + 1 + countBookmarks(bookmark.items), 0);
}

function BookmarkList({
  bookmarks,
  currentPage,
  onNavigate,
  depth = 0,
}: {
  bookmarks: PdfBookmark[];
  currentPage: number;
  onNavigate: (pageNumber: number) => void;
  depth?: number;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {bookmarks.map((bookmark) => {
        const isCurrent = bookmark.pageNumber === currentPage;
        const canNavigate = bookmark.pageNumber !== null;
        return (
          <div key={bookmark.id} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <button
              onClick={() => {
                if (bookmark.pageNumber !== null) onNavigate(bookmark.pageNumber);
              }}
              disabled={!canNavigate}
              title={canNavigate ? `Go to page ${bookmark.pageNumber}` : "Bookmark destination is not a page"}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
                width: "100%",
                padding: `5px 6px 5px ${6 + depth * 14}px`,
                border: "none",
                borderRadius: 6,
                background: isCurrent ? "var(--color-accent-selected)" : "transparent",
                color: canNavigate ? "var(--color-text-primary)" : "var(--color-text-tertiary)",
                cursor: canNavigate ? "pointer" : "default",
                fontFamily: "inherit",
                fontSize: 12,
                textAlign: "left",
              }}
            >
              <span
                style={{
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  fontWeight: depth === 0 ? 600 : 400,
                }}
              >
                {bookmark.title}
              </span>
              {bookmark.pageNumber !== null && (
                <span style={{ flexShrink: 0, color: "var(--color-text-tertiary)", fontSize: 11 }}>
                  {bookmark.pageNumber}
                </span>
              )}
            </button>
            {bookmark.items.length > 0 && (
              <BookmarkList
                bookmarks={bookmark.items}
                currentPage={currentPage}
                onNavigate={onNavigate}
                depth={depth + 1}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}