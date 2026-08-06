import { useCallback, useRef, useState } from "react";

interface PdfNavigationBarProps {
  pageNumber: number;
  numPages: number;
  scale: number;
  loading: boolean;
  rendering: boolean;
  loadingBookmarks: boolean;
  bookmarkCount: number;
  showBookmarks: boolean;
  indexingStatus: "idle" | "checking" | "indexing" | "complete" | "error";
  indexingProgress: { indexed: number; total: number } | null | undefined;
  indexingError?: string | null;
  captureMode: boolean;
  onPrevPage: () => void;
  onNextPage: () => void;
  onGoToPage: (n: number) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitWidth: () => void;
  onToggleBookmarks: () => void;
  onToggleCaptureMode: () => void;
}

export function PdfNavigationBar({
  pageNumber,
  numPages,
  scale,
  loading,
  rendering,
  loadingBookmarks,
  bookmarkCount,
  showBookmarks,
  indexingStatus,
  indexingProgress,
  indexingError,
  captureMode,
  onPrevPage,
  onNextPage,
  onGoToPage,
  onZoomIn,
  onZoomOut,
  onFitWidth,
  onToggleBookmarks,
  onToggleCaptureMode,
}: PdfNavigationBarProps) {
  const pageInputRef = useRef<HTMLInputElement>(null);
  const [pageInputValue, setPageInputValue] = useState("");
  const [pageInputError, setPageInputError] = useState<string | null>(null);
  const zoomPercent = Math.round(scale * 100);
  const errorColor = "var(--color-red)";

  const submitPageInput = useCallback(() => {
    const val = parseInt(pageInputValue.trim(), 10);
    if (isNaN(val)) { setPageInputError("Enter a page number."); return; }
    if (val < 1 || val > numPages) { setPageInputError(`Page must be between 1 and ${numPages}.`); return; }
    onGoToPage(val);
    setPageInputValue("");
    setPageInputError(null);
  }, [onGoToPage, numPages, pageInputValue]);

  const disabled = loading || rendering;

  return (
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
      {/* Prev */}
      <NavBtn onClick={onPrevPage} disabled={pageNumber <= 1 || disabled} title="Previous page">‹</NavBtn>

      {/* Page input */}
      <form
        onSubmit={(e) => { e.preventDefault(); submitPageInput(); }}
        title={pageInputError ?? "Type a page number and press Enter"}
        style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 13, color: pageInputError ? errorColor : "var(--color-text-secondary)", whiteSpace: "nowrap", fontWeight: 500 }}
      >
        <span>Page</span>
        <input
          ref={pageInputRef}
          type="text"
          inputMode="numeric"
          value={pageInputValue}
          placeholder={String(pageNumber)}
          onChange={(e) => { setPageInputValue(e.target.value); setPageInputError(null); }}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); submitPageInput(); }
            if (e.key === "Escape") { setPageInputValue(""); setPageInputError(null); }
          }}
          style={{
            width: 48, textAlign: "center", padding: "2px 4px", borderRadius: 4,
            border: `1px solid ${pageInputError ? errorColor : "var(--color-border)"}`,
            background: "var(--color-surface)", color: "var(--color-text-primary)", fontSize: 12, fontFamily: "inherit", outline: "none",
          }}
        />
        <span>/ {numPages}</span>
        <NavBtn type="submit" disabled={disabled || !pageInputValue.trim()} title="Go">Go</NavBtn>
      </form>

      {/* Next */}
      <NavBtn onClick={onNextPage} disabled={pageNumber >= numPages || disabled} title="Next page">›</NavBtn>

      <Divider />

      {/* Bookmarks */}
      <NavBtn
        onClick={onToggleBookmarks}
        disabled={disabled || loadingBookmarks || bookmarkCount === 0}
        active={showBookmarks}
        title={bookmarkCount === 0 ? "No bookmarks" : "Toggle bookmarks"}
      >
        {loadingBookmarks ? "Loading…" : `Bookmarks${bookmarkCount ? ` (${bookmarkCount})` : ""}`}
      </NavBtn>

      {/* Indexing status */}
      <IndexingStatus status={indexingStatus} progress={indexingProgress} error={indexingError} />

      {/* Capture */}
      <NavBtn onClick={onToggleCaptureMode} disabled={disabled} active={captureMode}>
        Capture Region
      </NavBtn>

      <Divider />

      {/* Zoom */}
      <NavBtn onClick={onZoomOut} disabled={disabled} title="Zoom out">−</NavBtn>
      <span style={{ fontSize: 12, color: "var(--color-text-tertiary)", minWidth: 38, textAlign: "center" }}>{zoomPercent}%</span>
      <NavBtn onClick={onZoomIn} disabled={disabled} title="Zoom in">+</NavBtn>
      <NavBtn onClick={onFitWidth} disabled={disabled} title="Fit width">Fit Width</NavBtn>

      {/* Loading indicator */}
      {(loading || rendering) && (
        <span style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginLeft: "auto" }}>
          {loading ? "Loading PDF…" : "Rendering…"}
        </span>
      )}
    </div>
  );
}

function NavBtn({
  onClick,
  disabled = false,
  active = false,
  title,
  type,
  children,
}: {
  onClick?: () => void;
  disabled?: boolean;
  active?: boolean;
  title?: string;
  type?: "submit";
  children: React.ReactNode;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        padding: "4px 8px",
        border: "1px solid var(--color-border)",
        borderRadius: 5,
        background: active ? "var(--color-accent)" : "transparent",
        color: active ? "#fff" : disabled ? "var(--color-text-tertiary)" : "var(--color-text-secondary)",
        cursor: disabled ? "default" : "pointer",
        fontSize: 11,
        fontFamily: "inherit",
        fontWeight: active ? 600 : 400,
        opacity: disabled ? 0.5 : 1,
        display: "flex",
        alignItems: "center",
      }}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <div style={{ width: 1, height: 20, background: "var(--color-border)", margin: "0 4px" }} />;
}

function IndexingStatus({
  status,
  progress,
  error,
}: {
  status: "idle" | "checking" | "indexing" | "complete" | "error";
  progress?: { indexed: number; total: number } | null;
  error?: string | null;
}) {
  if (status === "idle") return null;
  if (status === "indexing" && progress) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 5, background: "rgba(234,179,8,0.1)", border: "1px solid rgba(234,179,8,0.3)", fontSize: 11, color: "rgb(180,130,20)", whiteSpace: "nowrap" }}>
        <PulseDot />
        Indexing… {progress.indexed}/{progress.total}
      </div>
    );
  }
  if (status === "complete") {
    return <div style={{ padding: "4px 8px", fontSize: 11, color: "rgb(34,197,94)" }} title="Textbook indexed for AI search">✓ Search ready</div>;
  }
  if (status === "error") {
    return <div style={{ padding: "4px 8px", fontSize: 11, color: "rgb(239,68,68)" }} title={error ?? "Index error"}>! Index error</div>;
  }
  return null;
}

function PulseDot() {
  return (
    <span style={{ width: 10, height: 10, borderRadius: "50%", background: "rgb(234,179,8)", animation: "pulse 1.5s ease-in-out infinite", display: "inline-block" }} />
  );
}