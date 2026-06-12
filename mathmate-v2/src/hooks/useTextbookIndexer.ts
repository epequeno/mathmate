import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "../lib/tauri";

interface IndexProgress {
  indexed: number;
  total: number;
}

interface UseTextbookIndexerOptions {
  textbookId: string;
  title?: string;
  /** The pdf.js document, once loaded (or null) */
  pdfDocument: any | null;
  /** Only run extraction when the viewer is visible */
  enabled: boolean;
}

interface UseTextbookIndexerReturn {
  status: "idle" | "checking" | "indexing" | "complete" | "error";
  progress: IndexProgress | null;
  error: string | null;
  /** Call to start indexing manually (auto-starts when enabled) */
  startIndexing: () => void;
}

/**
 * Hook that extracts text from a pdf.js document page-by-page and
 * sends it to the Rust backend to build the textbook search index.
 *
 * Extracts in batches of 10 pages to avoid blocking the UI.
 */
export function useTextbookIndexer({
  textbookId,
  title,
  pdfDocument,
  enabled,
}: UseTextbookIndexerOptions): UseTextbookIndexerReturn {
  const [status, setStatus] = useState<"idle" | "checking" | "indexing" | "complete" | "error">(
    "idle"
  );
  const [progress, setProgress] = useState<IndexProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cancelledRef = useRef(false);
  const indexingRef = useRef(false);

  // Check index status when document loads
  useEffect(() => {
    if (!enabled || !textbookId || !pdfDocument) return;
    if (!textbookId) return;

    let cancelled = false;
    setStatus("checking");

    invoke<any | null>("get_textbook_index_status", { textbookId })
      .then((meta) => {
        if (cancelled) return;
        if (meta?.status === "complete") {
          setStatus("complete");
          setProgress({ indexed: meta.indexed_pages, total: meta.total_pages });
        } else if (meta?.status === "indexing") {
          setStatus("indexing");
          setProgress({ indexed: meta.indexed_pages, total: meta.total_pages });
        } else {
          // Not indexed — ready to start
          setStatus("idle");
          setProgress(null);
        }
      })
      .catch(() => {
        if (cancelled) return;
        setStatus("idle");
      });

    return () => {
      cancelled = true;
    };
  }, [textbookId, pdfDocument, enabled]);

  const startIndexing = useCallback(async () => {
    if (!pdfDocument || indexingRef.current) return;

    indexingRef.current = true;
    cancelledRef.current = false;
    setStatus("indexing");
    setError(null);

    try {
      const totalPages = pdfDocument.numPages as number;
      const BATCH_SIZE = 10;
      let allExtracted: { page: number; text: string }[] = [];

      for (let startPage = 1; startPage <= totalPages; startPage += BATCH_SIZE) {
        if (cancelledRef.current) break;

        const endPage = Math.min(startPage + BATCH_SIZE - 1, totalPages);

        // Extract text for this batch
        const batchPromises: Promise<{ page: number; text: string }>[] = [];
        for (let p = startPage; p <= endPage; p++) {
          batchPromises.push(extractPageText(pdfDocument, p));
        }

        const batchResults = await Promise.all(batchPromises);
        allExtracted.push(...batchResults);

        // Send batch to Rust backend
        const isComplete = endPage >= totalPages;
        await invoke("index_textbook_pages", {
          textbookId,
          title: title ?? null,
          totalPages,
          pages: batchResults.map((r) => ({
            page: r.page,
            text: r.text,
          })),
          complete: isComplete,
        });

        setProgress({ indexed: Math.min(endPage, totalPages), total: totalPages });
        setStatus(isComplete ? "complete" : "indexing");

        // Small yield to allow UI updates
        await new Promise((r) => setTimeout(r, 0));
      }
    } catch (err: unknown) {
      const msg = typeof err === "string" ? err : "Failed to index textbook";
      setError(msg);
      setStatus("error");
    } finally {
      indexingRef.current = false;
    }
  }, [pdfDocument, textbookId, title]);

  // Auto-start indexing when status is "idle" and document is ready
  useEffect(() => {
    if (status === "idle" && pdfDocument && enabled && textbookId) {
      // Small delay to let the UI settle
      const timer = setTimeout(() => {
        if (!indexingRef.current) {
          startIndexing();
        }
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [status, pdfDocument, enabled, textbookId, startIndexing]);

  return { status, progress, error, startIndexing };
}

/**
 * Extract text content from a single PDF page using pdf.js.
 */
async function extractPageText(
  doc: any,
  pageNum: number
): Promise<{ page: number; text: string }> {
  const page = await doc.getPage(pageNum);
  const content = await page.getTextContent();

  // Concatenate text items with spacing
  const text = content.items
    .map((item: any) => item.str ?? "")
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  return { page: pageNum, text };
}