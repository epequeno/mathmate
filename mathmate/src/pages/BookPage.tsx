import { useState, useEffect, useCallback } from "react";
import { useProjectStore } from "../stores/projectStore";
import { useChatStore } from "../stores/chatStore";
import { useNavigate, useOutletContext } from "react-router-dom";
import {
  Textbook,
  getBookStreamInfo,
  projectTextbookStreamUrl,
  textbookPathRevision,
  type BookStreamInfo,
} from "../lib/api/textbook";
import PdfViewer from "../components/PdfViewer";
import { FolderOpen, Settings2, AlertTriangle, CheckCircle } from "lucide-react";

interface OutletCtx {
  openProjectSettings?: () => void;
}

// ── Module-level promise: fetch stream info once per app session ─────────
// This avoids calling get_book_stream_info on every project switch.
let streamInfoPromise: Promise<BookStreamInfo> | null = null;

function getOrFetchStreamInfo(): Promise<BookStreamInfo> {
  if (!streamInfoPromise) {
    streamInfoPromise = getBookStreamInfo().catch((err) => {
      // Reset on failure so a retry will attempt again
      streamInfoPromise = null;
      throw err;
    });
  }
  return streamInfoPromise;
}

export default function BookPage() {
  const currentProject = useProjectStore((s) => s.currentProject);
  const attachImage = useChatStore((s) => s.attachImage);
  const navigate = useNavigate();
  const { openProjectSettings } = useOutletContext<OutletCtx>();

  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [capturedMsg, setCapturedMsg] = useState<string | null>(null);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [textbookId, setTextbookId] = useState<string | null>(null);

  // ── Load textbook URL via local HTTP stream server ──

  useEffect(() => {
    if (!currentProject?.textbook_path) {
      setPdfUrl(null);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    // Extract stable identifiers so TS can narrow types inside the async closure
    const projectId = currentProject.id;
    const textbookPath = currentProject.textbook_path;

    // Build the stream URL
    (async () => {
      try {
        const info = await getOrFetchStreamInfo();
        if (cancelled) return;

        const revision = textbookPathRevision(textbookPath);
        const url = projectTextbookStreamUrl(
          info,
          projectId,
          revision,
        );
        if (cancelled) return;
        setPdfUrl(url);
        setLoading(false);

        // Derive stable textbook ID for search indexing
        Textbook.deriveId(textbookPath)
          .then((id) => {
            if (!cancelled) setTextbookId(id);
          })
          .catch(() => {
            // Non-critical — indexing won't be available
          });
      } catch (err: unknown) {
        if (cancelled) return;
        const msg =
          typeof err === "string"
            ? err
            : "Failed to connect to book stream server";
        setError(msg);
        setPdfUrl(null);
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currentProject?.id, currentProject?.textbook_path]);

  // ── Capture handler: attach image and navigate to chat ──

  const handleCapture = useCallback(
    (base64: string, mime: string) => {
      try {
        attachImage(base64, mime);
        setCapturedMsg("Image captured! Navigating to Chat…");
        setCaptureError(null);
        setTimeout(() => {
          navigate("/chat");
        }, 300);
      } catch (err) {
        setCaptureError("Failed to attach captured image. Please try again.");
        setCapturedMsg(null);
      }
    },
    [attachImage, navigate],
  );

  const handleError = useCallback((msg: string | null) => {
    if (msg) {
      setCaptureError(msg);
    }
  }, []);

  // Clear transient messages
  useEffect(() => {
    if (capturedMsg) {
      const t = setTimeout(() => setCapturedMsg(null), 4000);
      return () => clearTimeout(t);
    }
  }, [capturedMsg]);

  useEffect(() => {
    if (captureError) {
      const t = setTimeout(() => setCaptureError(null), 8000);
      return () => clearTimeout(t);
    }
  }, [captureError]);

  // ── Empty state (no textbook) ──

  if (!currentProject?.textbook_path) {
    return (
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
          color: "var(--color-text-tertiary)",
          padding: 40,
        }}
      >
        <FolderOpen size={40} strokeWidth={1.2} style={{ opacity: 0.3 }} />
        <div style={{ fontSize: 14, fontWeight: 500, color: "var(--color-text-secondary)" }}>
          No textbook set
        </div>
        <div
          style={{
            fontSize: 13,
            textAlign: "center",
            maxWidth: 320,
            lineHeight: 1.5,
            color: "var(--color-text-tertiary)",
          }}
        >
          Set a textbook PDF in Project Settings to browse and capture regions directly in MathMate.
        </div>
        {openProjectSettings && (
          <button
            onClick={openProjectSettings}
            style={{
              marginTop: 4,
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 16px",
              borderRadius: 8,
              border: "1px solid var(--color-border)",
              background: "var(--color-surface)",
              color: "var(--color-text-secondary)",
              fontSize: 13,
              fontFamily: "inherit",
              cursor: "pointer",
            }}
          >
            <Settings2 size={14} />
            Open Project Settings
          </button>
        )}
      </div>
    );
  }

  // ── Loading state ──

  if (loading) {
    return (
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--color-text-tertiary)",
          fontSize: 13,
        }}
      >
        Loading PDF…
      </div>
    );
  }

  // ── Error state ──

  if (error) {
    return (
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          padding: 40,
        }}
      >
        <AlertTriangle size={28} strokeWidth={1.2} style={{ color: "rgb(234,179,8)", opacity: 0.6 }} />
        <div style={{ fontSize: 14, fontWeight: 500, color: "var(--color-text-secondary)" }}>
          Could not load textbook
        </div>
        <div
          style={{
            fontSize: 13,
            color: "var(--color-text-tertiary)",
            maxWidth: 400,
            textAlign: "center",
            lineHeight: 1.5,
            wordBreak: "break-word",
          }}
        >
          {error}
        </div>
        <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginTop: 4 }}>
          Textbook path: {currentProject.textbook_path}
        </div>
        {openProjectSettings && (
          <button
            onClick={openProjectSettings}
            style={{
              marginTop: 4,
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 16px",
              borderRadius: 8,
              border: "1px solid var(--color-border)",
              background: "var(--color-surface)",
              color: "var(--color-text-secondary)",
              fontSize: 13,
              fontFamily: "inherit",
              cursor: "pointer",
            }}
          >
            <Settings2 size={14} />
            Open Project Settings
          </button>
        )}
      </div>
    );
  }

  // ── Main viewer ──

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Toolbar header */}
      <div
        style={{
          background: "var(--color-bg-elevated)",
          borderBottom: "1px solid var(--color-border)",
          height: 62,
          display: "flex",
          alignItems: "center",
          padding: "0 20px",
          gap: 10,
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontSize: 16,
            fontWeight: 600,
            color: "var(--color-text-primary)",
            letterSpacing: "-0.01em",
            flex: 1,
          }}
        >
          Book
        </span>
        <span
          style={{
            fontSize: 11,
            color: "var(--color-text-tertiary)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            maxWidth: 320,
            direction: "rtl",
            textAlign: "left",
          }}
        >
          {currentProject.textbook_path}
        </span>
      </div>

      {/* Capture success banner */}
      {capturedMsg && (
        <div
          style={{
            padding: "6px 16px",
            background: "rgba(34,197,94,0.08)",
            color: "rgb(34,197,94)",
            fontSize: 12,
            borderBottom: "1px solid var(--color-border)",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <CheckCircle size={13} />
          {capturedMsg}
        </div>
      )}

      {/* Capture error banner */}
      {captureError && (
        <div
          style={{
            padding: "6px 16px",
            background: "rgba(239,68,68,0.08)",
            color: "rgb(239,68,68)",
            fontSize: 12,
            borderBottom: "1px solid var(--color-border)",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <AlertTriangle size={13} />
          {captureError}
        </div>
      )}

      {/* PDF Viewer */}
      <PdfViewer
        pdfUrl={pdfUrl}
        projectId={currentProject?.id}
        textbookId={textbookId ?? undefined}
        onCapture={handleCapture}
        onError={handleError}
      />
    </div>
  );
}