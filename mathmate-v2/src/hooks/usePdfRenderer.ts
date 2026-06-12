import { useEffect, useRef, useState, useCallback } from "react";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import type { PDFDocumentProxy, PDFPageProxy, RenderTask, PDFDocumentLoadingTask } from "pdfjs-dist";

type PdfOutlineNode = {
  title: string;
  bold?: boolean;
  italic?: boolean;
  dest: string | Array<unknown> | null;
  url?: string | null;
  items?: PdfOutlineNode[];
};

export interface PdfBookmark {
  id: string;
  title: string;
  pageNumber: number | null;
  items: PdfBookmark[];
}

// Set the worker source once at module level
GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

export interface PdfRenderState {
  /** The canvas element that receives rendered pages */
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  /** The pdf.js document proxy, once loaded (null before/after) */
  pdfDocument: PDFDocumentProxy | null;
  /** Total number of pages in the document */
  numPages: number;
  /** Currently displayed page number (1-indexed) */
  pageNumber: number;
  /** Current render scale */
  scale: number;
  /** Whether a render is in progress */
  rendering: boolean;
  /** Whether the document is loading */
  loading: boolean;
  /** Resolved PDF outline/bookmarks, when available */
  bookmarks: PdfBookmark[];
  /** Whether bookmarks are being resolved */
  loadingBookmarks: boolean;
  /** Error message, if any */
  error: string | null;
  /** Navigate to a specific page */
  goToPage: (n: number) => void;
  /** Set zoom scale directly */
  setScale: (s: number) => void;
  /** Zoom in by a factor */
  zoomIn: () => void;
  /** Zoom out by a factor */
  zoomOut: () => void;
  /** Get the current effective backing-store dimensions */
  getCanvasDims: () => { width: number; height: number } | null;
  /** Get the CSS bounding rect of the canvas */
  getCanvasBoundingRect: () => DOMRect | null;
}

const MIN_SCALE = 0.25;
const MAX_SCALE = 5.0;
const ZOOM_STEP = 0.25;
const MAX_CACHED_DOCUMENTS = 3;

type CachedPdfDocument = {
  doc: PDFDocumentProxy;
  bookmarks?: PdfBookmark[];
  lastUsed: number;
};

const pdfDocumentCache = new Map<string, CachedPdfDocument>();

function pruneDocumentCache(activeUrl: string) {
  const staleEntries = [...pdfDocumentCache.entries()]
    .filter(([url]) => url !== activeUrl)
    .sort((a, b) => b[1].lastUsed - a[1].lastUsed)
    .slice(MAX_CACHED_DOCUMENTS - 1);

  for (const [url, cached] of staleEntries) {
    cached.doc.cleanup().catch(() => {});
    pdfDocumentCache.delete(url);
  }
}

function isRefProxy(value: unknown): value is { num: number; gen: number } {
  return (
    typeof value === "object" &&
    value !== null &&
    "num" in value &&
    "gen" in value &&
    typeof (value as { num: unknown }).num === "number" &&
    typeof (value as { gen: unknown }).gen === "number"
  );
}

async function resolveDestPageNumber(doc: PDFDocumentProxy, dest: string | Array<unknown> | null): Promise<number | null> {
  const explicitDest = typeof dest === "string" ? await doc.getDestination(dest) : dest;
  if (!explicitDest || explicitDest.length === 0) return null;

  const pageRef = explicitDest[0];
  if (typeof pageRef === "number") {
    // pdf.js destinations use zero-based page indexes for numeric refs.
    return pageRef + 1;
  }
  if (isRefProxy(pageRef)) {
    return (await doc.getPageIndex(pageRef)) + 1;
  }
  return null;
}

async function resolveBookmarks(doc: PDFDocumentProxy, nodes: PdfOutlineNode[] | null): Promise<PdfBookmark[]> {
  if (!nodes) return [];

  const walk = async (outlineNodes: PdfOutlineNode[], prefix: string): Promise<PdfBookmark[]> =>
    Promise.all(
      outlineNodes.map(async (node, index) => ({
        id: `${prefix}-${index}`,
        title: node.title || "Untitled bookmark",
        pageNumber: node.url ? null : await resolveDestPageNumber(doc, node.dest).catch(() => null),
        items: await walk(node.items ?? [], `${prefix}-${index}`),
      })),
    );

  return walk(nodes, "bookmark");
}

/**
 * Manages PDF document loading, page rendering, and zoom lifecycle.
 *
 * Uses a monotonically increasing render token to discard stale async
 * completions from rapid page/zoom changes.
 */
export function usePdfRenderer(
  pdfUrl: string | null,
  initialPage = 1,
  initialScale = 1.0,
): PdfRenderState {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const loadingTaskRef = useRef<PDFDocumentLoadingTask | null>(null);
  const docRef = useRef<PDFDocumentProxy | null>(null);
  const renderTokenRef = useRef(0);
  const pendingRenderRef = useRef<RenderTask | null>(null);

  const [numPages, setNumPages] = useState(0);
  const [pageNumber, setPageNumber] = useState(initialPage);
  const [scale, setScaleState] = useState(initialScale);
  const [rendering, setRendering] = useState(false);
  const [loading, setLoading] = useState(false);
  const [bookmarks, setBookmarks] = useState<PdfBookmark[]>([]);
  const [loadingBookmarks, setLoadingBookmarks] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pdfDocumentState, setPdfDocumentState] = useState<PDFDocumentProxy | null>(null);
  // Incremented each time a document finishes loading, so the render effect fires.
  const [docVersion, setDocVersion] = useState(0);

  // ── Document loading ──────────────────────────────────────

  useEffect(() => {
    if (!pdfUrl) return;

    let cancelled = false;
    setLoading(true);
    setLoadingBookmarks(false);
    setBookmarks([]);
    setError(null);

    // Clean up previous in-flight loading task. Loaded documents are retained in
    // a tiny module-level LRU cache so returning to the Book tab does not need
    // to parse the same PDF again.
    if (loadingTaskRef.current) {
      loadingTaskRef.current.destroy().catch(() => {});
      loadingTaskRef.current = null;
    }
    docRef.current = null;

    const attachDocument = (doc: PDFDocumentProxy, cached?: CachedPdfDocument) => {
      docRef.current = doc;
      cached?.bookmarks && setBookmarks(cached.bookmarks);
      setPdfDocumentState(doc);
      setNumPages(doc.numPages);
      setLoading(false);
      setDocVersion((v) => v + 1);

      // Clamp initial page to valid range
      const clamped = Math.max(1, Math.min(initialPage, doc.numPages));
      setPageNumber(clamped);

      if (cached?.bookmarks) return;

      setLoadingBookmarks(true);
      doc
        .getOutline()
        .then((outline) => resolveBookmarks(doc, outline as PdfOutlineNode[] | null))
        .then((resolvedBookmarks) => {
          if (!cancelled && docRef.current === doc) {
            setBookmarks(resolvedBookmarks);
            const cacheEntry = pdfDocumentCache.get(pdfUrl);
            if (cacheEntry?.doc === doc) {
              cacheEntry.bookmarks = resolvedBookmarks;
            }
          }
        })
        .catch(() => {
          if (!cancelled && docRef.current === doc) {
            setBookmarks([]);
          }
        })
        .finally(() => {
          if (!cancelled && docRef.current === doc) {
            setLoadingBookmarks(false);
          }
        });
    };

    const cached = pdfDocumentCache.get(pdfUrl);
    if (cached && !(cached.doc as unknown as { destroyed?: boolean }).destroyed) {
      cached.lastUsed = Date.now();
      pruneDocumentCache(pdfUrl);
      attachDocument(cached.doc, cached);
      return () => {
        cancelled = true;
        setPdfDocumentState(null);
        docRef.current = null;
      };
    }
    if (cached) {
      pdfDocumentCache.delete(pdfUrl);
    }

    const loadingTask = getDocument({ url: pdfUrl });
    loadingTaskRef.current = loadingTask;

    loadingTask.promise
      .then((doc) => {
        if (cancelled) {
          doc.cleanup().catch(() => {});
          return;
        }
        if (loadingTaskRef.current === loadingTask) {
          loadingTaskRef.current = null;
        }
        pdfDocumentCache.set(pdfUrl, { doc, lastUsed: Date.now() });
        pruneDocumentCache(pdfUrl);
        attachDocument(doc);
      })
      .catch((err: Error) => {
        if (loadingTaskRef.current === loadingTask) {
          loadingTaskRef.current = null;
        }
        if (cancelled) return;
        setError(`Failed to load PDF: ${err.message}`);
        setLoading(false);
      });

    return () => {
      cancelled = true;
      setPdfDocumentState(null);
      if (loadingTaskRef.current) {
        loadingTaskRef.current.destroy().catch(() => {});
        loadingTaskRef.current = null;
      }
      docRef.current = null;
    };
  }, [pdfUrl]);

  // ── Page rendering ────────────────────────────────────────

  const renderPage = useCallback(
    (pageNum: number, renderScale: number) => {
      const doc = docRef.current;
      const canvas = canvasRef.current;
      if (!doc || !canvas) return;

      // Bump render token
      const token = ++renderTokenRef.current;

      // Cancel any pending render
      if (pendingRenderRef.current) {
        pendingRenderRef.current.cancel();
        pendingRenderRef.current = null;
      }

      setRendering(true);
      setError(null);

      doc
        .getPage(pageNum)
        .then((page: PDFPageProxy) => {
          if (token !== renderTokenRef.current) {
            page.cleanup();
            return;
          }

          const viewport = page.getViewport({ scale: renderScale });

          // Get the canvas context's backing-store pixel ratio for HiDPI
          const ctx = canvas.getContext("2d")!;
          const dpr = window.devicePixelRatio || 1;

          // Set canvas backing-store size
          canvas.width = viewport.width * dpr;
          canvas.height = viewport.height * dpr;

          // Set canvas CSS display size
          canvas.style.width = `${viewport.width}px`;
          canvas.style.height = `${viewport.height}px`;

          // Render the PDF into the HiDPI backing store while keeping the
          // element's CSS size in normal screen pixels. Do not also scale the
          // canvas context here: pdf.js applies this transform during render.
          ctx.setTransform(1, 0, 0, 1, 0, 0);

          // pdfjs-dist v6 requires `canvas` in RenderParameters
          const renderTask = page.render({
            canvas,
            canvasContext: ctx,
            viewport,
            transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
          });
          pendingRenderRef.current = renderTask;

          return renderTask.promise.then(() => {
            if (token !== renderTokenRef.current) {
              // Stale render — ignore
              return;
            }
            pendingRenderRef.current = null;
            setRendering(false);
            page.cleanup();
          });
        })
        .catch((err: Error) => {
          if (token !== renderTokenRef.current) return;
          // Only surface non-cancellation errors
          if (err.name !== "RenderingCancelledException") {
            setError(`Failed to render page: ${err.message}`);
          }
          pendingRenderRef.current = null;
          setRendering(false);
        });
    },
    [],
  );

  // Trigger re-render when page, scale, or document version changes.
  // docVersion increments after the async document load completes so this
  // effect fires even though docRef is a ref (not tracked by React).
  useEffect(() => {
    if (!docRef.current || !canvasRef.current) return;
    renderPage(pageNumber, scale);
  }, [pageNumber, scale, docVersion, renderPage]);

  // ── Navigation helpers ────────────────────────────────────

  const goToPage = useCallback(
    (n: number) => {
      const clamped = Math.max(1, Math.min(n, numPages));
      if (clamped !== pageNumber) {
        setPageNumber(clamped);
      }
    },
    [numPages, pageNumber],
  );

  const setScale = useCallback((s: number) => {
    setScaleState(Math.max(MIN_SCALE, Math.min(MAX_SCALE, s)));
  }, []);

  const zoomIn = useCallback(() => {
    setScaleState((prev) => Math.min(MAX_SCALE, +(prev + ZOOM_STEP).toFixed(2)));
  }, []);

  const zoomOut = useCallback(() => {
    setScaleState((prev) => Math.max(MIN_SCALE, +(prev - ZOOM_STEP).toFixed(2)));
  }, []);

  const getCanvasDims = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    return { width: canvas.width, height: canvas.height };
  }, []);

  const getCanvasBoundingRect = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    return canvas.getBoundingClientRect();
  }, []);

  return {
    canvasRef,
    pdfDocument: pdfDocumentState,
    numPages,
    pageNumber,
    scale,
    rendering,
    loading,
    bookmarks,
    loadingBookmarks,
    error,
    goToPage,
    setScale,
    zoomIn,
    zoomOut,
    getCanvasDims,
    getCanvasBoundingRect,
  };
}