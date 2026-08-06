/**
 * PdfViewer — shell component
 * Orchestrates pdf.js rendering, region selection, and textbook indexing.
 * Sub-components: PdfPageCanvas, PdfNavigationBar, PdfRegionHighlight.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { usePdfRenderer } from "../../hooks/usePdfRenderer";
import type { PdfBookmark } from "../../hooks/usePdfRenderer";
import { usePdfRegionSelect } from "../../hooks/usePdfRegionSelect";
import { useTextbookIndexer } from "../../hooks/useTextbookIndexer";
import { PdfPageCanvas } from "./PdfPageCanvas";
import { PdfNavigationBar } from "./PdfNavigationBar";
import { PdfRegionHighlight } from "./PdfRegionHighlight";
import styles from "./PdfViewer.module.css";

interface PdfViewerProps {
  pdfUrl: string | null;
  projectId?: string;
  textbookId?: string;
  textbookTitle?: string;
  onCapture: (base64: string, mime: string) => void;
  onError: (msg: string | null) => void;
}

// ── Local storage helpers ──────────────────────────────────────────────────

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

// ── Fit-width state ────────────────────────────────────────────────────────

function useFitWidth(ref: React.RefObject<HTMLDivElement | null>, canvasRef: React.RefObject<HTMLCanvasElement | null>, scale: number, setScale: (s: number) => void) {
  const fitWidthRef = useRef(false);

  const applyFitWidth = useCallback(() => {
    const container = ref.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;
    fitWidthRef.current = true;
    const availableWidth = container.clientWidth - 32;
    if (availableWidth <= 0) return;
    const cssWidth = parseFloat(canvas.style.width);
    if (!cssWidth || cssWidth <= 0) return;
    const newScale = (availableWidth / cssWidth) * scale;
    setScale(newScale);
  }, [ref, canvasRef, scale, setScale]);

  // Re-apply on resize when fit-width is active
  useEffect(() => {
    if (!fitWidthRef.current) return;
    const container = ref.current;
    if (!container) return;
    const observer = new ResizeObserver(() => { applyFitWidth(); });
    observer.observe(container);
    return () => observer.disconnect();
  }, [ref, applyFitWidth]);

  return { fitWidthRef, applyFitWidth };
}

// ── Main component ─────────────────────────────────────────────────────────

export default function PdfViewer({
  pdfUrl,
  projectId,
  textbookId,
  textbookTitle,
  onCapture,
  onError,
}: PdfViewerProps) {
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
  } = usePdfRenderer(pdfUrl, initialPage, initialScale);

  const containerRef = useRef<HTMLDivElement>(null);

  // Persist page/zoom
  useEffect(() => {
    if (projectId && pdfUrl) savePersisted(projectId, "page", pageNumber);
  }, [pageNumber, projectId, pdfUrl]);

  useEffect(() => {
    if (projectId && pdfUrl) savePersisted(projectId, "zoom", scale);
  }, [scale, projectId, pdfUrl]);

  // Forward render errors
  useEffect(() => { onError(renderError); }, [renderError, onError]);

  // Fit-width
  const { fitWidthRef, applyFitWidth } = useFitWidth(containerRef, canvasRef, scale, setScale);

  const handleFitWidth = useCallback(() => {
    fitWidthRef.current = true;
    applyFitWidth();
  }, [applyFitWidth]);

  const handleZoomIn = useCallback(() => { fitWidthRef.current = false; zoomIn(); }, [zoomIn]);
  const handleZoomOut = useCallback(() => { fitWidthRef.current = false; zoomOut(); }, [zoomOut]);

  // ── Region selection ──
  const {
    overlayRef,
    dragging,
    selectionRect,
    captureSelection,
    overlayHandlers,
  } = usePdfRegionSelect({ canvasRef, disabled: rendering || loading, onCapture });

  // ── Textbook indexing ──
  const indexer = useTextbookIndexer({
    textbookId: textbookId ?? "",
    title: textbookTitle,
    pdfDocument,
    enabled: !!textbookId && !!pdfDocument && !loading,
  });

  // ── UI state ──
  const [showBookmarks, setShowBookmarks] = useState(false);
  const [captureMode, setCaptureMode] = useState(false);
  const [captureBox, setCaptureBox] = useState({ left: 80, top: 80, width: 320, height: 220 });
  const captureDragRef = useRef<{
    kind: "move" | "resize";
    startX: number;
    startY: number;
    startBox: { left: number; top: number; width: number; height: number };
  } | null>(null);

  const startCaptureMode = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas) return;
    const canvasRect = canvas.getBoundingClientRect();
    const containerRect = container?.getBoundingClientRect();
    const visibleLeft = containerRect ? Math.max(0, containerRect.left - canvasRect.left) : 0;
    const visibleTop = containerRect ? Math.max(0, containerRect.top - canvasRect.top) : 0;
    const visibleRight = containerRect ? Math.min(canvas.clientWidth, containerRect.right - canvasRect.left) : canvas.clientWidth;
    const visibleBottom = containerRect ? Math.min(canvas.clientHeight, containerRect.bottom - canvasRect.top) : canvas.clientHeight;
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
    setCaptureMode(true);
  }, [canvasRef]);

  const updateCaptureBox = useCallback((nextBox: { left: number; top: number; width: number; height: number }) => {
    const canvas = canvasRef.current;
    const canvasWidth = canvas?.clientWidth ?? 0;
    const canvasHeight = canvas?.clientHeight ?? 0;
    const minSize = 40;
    setCaptureBox({
      left: Math.max(0, Math.min(nextBox.left, Math.max(0, canvasWidth - minSize))),
      top: Math.max(0, Math.min(nextBox.top, Math.max(0, canvasHeight - minSize))),
      width: Math.max(minSize, Math.min(nextBox.width, canvasWidth)),
      height: Math.max(minSize, Math.min(nextBox.height, canvasHeight)),
    });
  }, [canvasRef]);

  const handleCapturePointerMove = useCallback((e: React.PointerEvent) => {
    const drag = captureDragRef.current;
    if (!drag) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (drag.kind === "move") {
      updateCaptureBox({ ...drag.startBox, left: drag.startBox.left + dx, top: drag.startBox.top + dy });
    } else {
      updateCaptureBox({ ...drag.startBox, width: drag.startBox.width + dx, height: drag.startBox.height + dy });
    }
  }, [updateCaptureBox]);

  const finishCaptureDrag = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    captureDragRef.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
  }, []);

  const onStartCaptureDrag = useCallback((e: React.PointerEvent, kind: "move" | "resize") => {
    captureDragRef.current = { kind, startX: e.clientX, startY: e.clientY, startBox: captureBox };
    e.currentTarget.setPointerCapture(e.pointerId);
  }, [captureBox]);

  const bookmarkCount = bookmarks.reduce((total: number, bm: PdfBookmark) => total + 1 + countBookmarks(bm.items), 0);

  if (!pdfUrl) return null;

  return (
    <div className={styles.container}>
      <PdfNavigationBar
        pageNumber={pageNumber}
        numPages={numPages}
        scale={scale}
        loading={loading}
        rendering={rendering}
        loadingBookmarks={loadingBookmarks}
        bookmarkCount={bookmarkCount}
        showBookmarks={showBookmarks}
        indexingStatus={indexer.status as "idle" | "checking" | "indexing" | "complete" | "error"}
        indexingProgress={indexer.progress ?? undefined}
        indexingError={indexer.error}
        captureMode={captureMode}
        onPrevPage={() => goToPage(pageNumber - 1)}
        onNextPage={() => goToPage(pageNumber + 1)}
        onGoToPage={goToPage}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onFitWidth={handleFitWidth}
        onToggleBookmarks={() => setShowBookmarks((v) => !v)}
        onToggleCaptureMode={startCaptureMode}
      />

      <div className={styles.body}>
        {/* Bookmarks sidebar */}
        {showBookmarks && bookmarkCount > 0 && (
          <aside className={styles.bookmarksSidebar}>
            <div className={styles.bookmarksHeader}>
              <span>Bookmarks</span>
              <button onClick={() => setShowBookmarks(false)} className={styles.bookmarksClose} title="Hide bookmarks">×</button>
            </div>
            <BookmarkList
              bookmarks={bookmarks}
              currentPage={pageNumber}
              onNavigate={(targetPage) => { goToPage(targetPage); }}
            />
          </aside>
        )}

        {/* Scrollable viewer area */}
        <div ref={containerRef} className={styles.viewerArea}>
          <div className={styles.pageWrapper}>
            <PdfPageCanvas canvasRef={canvasRef} />
            <PdfRegionHighlight
              overlayRef={overlayRef}
              captureMode={captureMode}
              dragging={dragging}
              selectionRect={selectionRect}
              captureBox={captureBox}
              rendering={rendering}
              loading={loading}
              overlayHandlers={overlayHandlers}
              captureSelection={captureSelection}
              onCancelCaptureMode={() => setCaptureMode(false)}
              onStartCaptureDrag={onStartCaptureDrag}
              onCapturePointerMove={handleCapturePointerMove}
              onCapturePointerUp={finishCaptureDrag}
              onCapturePointerCancel={finishCaptureDrag}
            />
          </div>
        </div>
      </div>

      {/* Capture hint */}
      {pdfUrl && !loading && !rendering && (
        <div className={styles.captureHint}>
          {captureMode
            ? "Move/resize the capture box, then click Take Screenshot."
            : "Use Capture Region to attach a PDF screenshot to your chat message."}
        </div>
      )}
    </div>
  );
}

// ── Bookmark helpers ───────────────────────────────────────────────────────

function countBookmarks(bookmarks: PdfBookmark[]): number {
  return bookmarks.reduce((total, bm) => total + 1 + countBookmarks(bm.items), 0);
}

function BookmarkList({ bookmarks, currentPage, onNavigate, depth = 0 }: {
  bookmarks: PdfBookmark[];
  currentPage: number;
  onNavigate: (pageNumber: number) => void;
  depth?: number;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {bookmarks.map((bm) => {
        const isCurrent = bm.pageNumber === currentPage;
        const canNavigate = bm.pageNumber !== null;
        return (
          <div key={bm.id} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <button
              onClick={() => { if (bm.pageNumber !== null) onNavigate(bm.pageNumber); }}
              disabled={!canNavigate}
              title={canNavigate ? `Go to page ${bm.pageNumber}` : "No page destination"}
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
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: depth === 0 ? 600 : 400 }}>
                {bm.title}
              </span>
              {bm.pageNumber !== null && (
                <span style={{ flexShrink: 0, color: "var(--color-text-tertiary)", fontSize: 11 }}>{bm.pageNumber}</span>
              )}
            </button>
            {bm.items.length > 0 && (
              <BookmarkList bookmarks={bm.items} currentPage={currentPage} onNavigate={onNavigate} depth={depth + 1} />
            )}
          </div>
        );
      })}
    </div>
  );
}