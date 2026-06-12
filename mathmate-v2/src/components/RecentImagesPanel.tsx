import { useEffect, useState, useCallback } from "react";
import { X, FolderOpen, ImagePlus, RefreshCw } from "lucide-react";
import { invoke } from "../lib/tauri";

interface RecentImageEntry {
  path: string;
  filename: string;
  modified_at: number; // unix seconds
  size_bytes: number;
}

interface ThumbnailState {
  b64: string | null;
  loading: boolean;
  error: boolean;
}

interface RecentImagesPanelProps {
  onAttach: (b64: string, mime: string) => void;
  onClose: () => void;
  onBrowse: () => void;
}

function mimeFromPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "png";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  return "image/png";
}

function timeAgo(unixSec: number): string {
  const diff = Math.floor(Date.now() / 1000) - unixSec;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function RecentImagesPanel({ onAttach, onClose, onBrowse }: RecentImagesPanelProps) {
  const [images, setImages] = useState<RecentImageEntry[]>([]);
  const [thumbnails, setThumbnails] = useState<Record<string, ThumbnailState>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attaching, setAttaching] = useState(false);

  const loadImages = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSelected(new Set());
    try {
      const entries = await invoke<RecentImageEntry[]>("list_recent_images", { limit: 30 });
      setImages(entries);
      // Kick off thumbnail loading
      setThumbnails({});
      entries.forEach((entry) => loadThumbnail(entry.path));
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadThumbnail = useCallback(async (path: string) => {
    setThumbnails((prev) => ({ ...prev, [path]: { b64: null, loading: true, error: false } }));
    try {
      const b64 = await invoke<string>("read_user_selected_file", { path });
      setThumbnails((prev) => ({ ...prev, [path]: { b64, loading: false, error: false } }));
    } catch {
      setThumbnails((prev) => ({ ...prev, [path]: { b64: null, loading: false, error: true } }));
    }
  }, []);

  useEffect(() => { loadImages(); }, [loadImages]);

  const toggleSelect = (path: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const handleAttach = async () => {
    if (selected.size === 0) return;
    setAttaching(true);
    try {
      for (const path of selected) {
        const thumb = thumbnails[path];
        // Re-use already-loaded data; otherwise fetch now
        const b64 = thumb?.b64 ?? await invoke<string>("read_user_selected_file", { path });
        onAttach(b64, mimeFromPath(path));
      }
      onClose();
    } finally {
      setAttaching(false);
    }
  };

  return (
    <div
      style={{
        position: "absolute",
        bottom: "100%",
        left: 0,
        right: 0,
        marginBottom: 6,
        background: "var(--color-bg-elevated)",
        border: "1px solid var(--color-border)",
        borderRadius: 12,
        boxShadow: "0 8px 32px rgba(0,0,0,0.35)",
        display: "flex",
        flexDirection: "column",
        maxHeight: 420,
        zIndex: 50,
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 14px 8px",
          borderBottom: "1px solid var(--color-border)",
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-primary)" }}>
          Recent Images
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <button
            onClick={loadImages}
            title="Refresh"
            style={headerBtn}
          >
            <RefreshCw size={13} />
          </button>
          <button onClick={onClose} style={headerBtn} title="Close">
            <X size={13} />
          </button>
        </div>
      </div>

      {/* Image list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "6px 0" }}>
        {loading && (
          <div style={{ padding: "24px 0", textAlign: "center", color: "var(--color-text-tertiary)", fontSize: 12 }}>
            Scanning recent images…
          </div>
        )}

        {!loading && error && (
          <div style={{ padding: "16px 14px", color: "var(--color-red, #ef4444)", fontSize: 12 }}>
            {error}
          </div>
        )}

        {!loading && !error && images.length === 0 && (
          <div style={{ padding: "24px 14px", textAlign: "center", color: "var(--color-text-tertiary)", fontSize: 12 }}>
            No recent images found on Desktop, Downloads, or Screenshots.
          </div>
        )}

        {!loading && images.map((img) => {
          const thumb = thumbnails[img.path];
          const isSelected = selected.has(img.path);

          return (
            <div
              key={img.path}
              onClick={() => toggleSelect(img.path)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "6px 14px",
                cursor: "pointer",
                background: isSelected ? "var(--color-accent-subtle)" : "transparent",
                borderLeft: `3px solid ${isSelected ? "var(--color-accent)" : "transparent"}`,
                transition: "background 0.1s",
              }}
              onMouseEnter={(e) => {
                if (!isSelected) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.04)";
              }}
              onMouseLeave={(e) => {
                if (!isSelected) (e.currentTarget as HTMLElement).style.background = "transparent";
              }}
            >
              {/* Thumbnail */}
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 6,
                  overflow: "hidden",
                  flexShrink: 0,
                  background: "var(--color-surface)",
                  border: `1px solid ${isSelected ? "var(--color-accent)" : "var(--color-border)"}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {thumb?.loading && (
                  <div style={{ width: 14, height: 14, border: "2px solid var(--color-border)", borderTopColor: "var(--color-accent)", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                )}
                {thumb?.b64 && (
                  <img
                    src={`data:${mimeFromPath(img.path)};base64,${thumb.b64}`}
                    alt={img.filename}
                    style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                  />
                )}
                {thumb?.error && (
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ opacity: 0.3 }}>
                    <rect x="2" y="2" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.2"/>
                    <path d="M8 5v4M8 10.5v.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                  </svg>
                )}
              </div>

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 500,
                    color: isSelected ? "var(--color-accent-light)" : "var(--color-text-primary)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {img.filename}
                </div>
                <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginTop: 2 }}>
                  {timeAgo(img.modified_at)} · {fmtSize(img.size_bytes)}
                </div>
              </div>

              {/* Selected checkmark */}
              {isSelected && (
                <div
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: "50%",
                    background: "var(--color-accent)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path d="M2 5l2.5 2.5L8 3" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div
        style={{
          display: "flex",
          gap: 8,
          padding: "10px 14px",
          borderTop: "1px solid var(--color-border)",
          flexShrink: 0,
        }}
      >
        <button
          onClick={onBrowse}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            padding: "7px 12px",
            borderRadius: 7,
            border: "1px solid var(--color-border)",
            background: "transparent",
            color: "var(--color-text-secondary)",
            fontSize: 12,
            fontFamily: "inherit",
            cursor: "pointer",
            flexShrink: 0,
          }}
          title="Open file picker to browse all files"
        >
          <FolderOpen size={13} />
          Browse…
        </button>

        <button
          onClick={handleAttach}
          disabled={selected.size === 0 || attaching}
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            padding: "7px 12px",
            borderRadius: 7,
            border: "none",
            background: selected.size > 0 ? "var(--color-accent)" : "var(--color-surface)",
            color: selected.size > 0 ? "#fff" : "var(--color-text-tertiary)",
            fontSize: 12,
            fontWeight: 600,
            fontFamily: "inherit",
            cursor: selected.size > 0 ? "pointer" : "default",
            transition: "background 0.15s, color 0.15s",
          }}
        >
          <ImagePlus size={13} />
          {attaching
            ? "Attaching…"
            : selected.size > 0
            ? `Attach ${selected.size} image${selected.size > 1 ? "s" : ""}`
            : "Select an image"}
        </button>
      </div>
    </div>
  );
}

const headerBtn: React.CSSProperties = {
  background: "none",
  border: "none",
  cursor: "pointer",
  color: "var(--color-text-tertiary)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 4,
  borderRadius: 5,
};
