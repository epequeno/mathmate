import { useState, useEffect, useCallback } from "react";
import { Textbook } from "../lib/api";
import type { TextbookCatalogEntry, DownloadResult } from "../lib/types";
import { subjectLabel, subjectColor } from "../lib/textbookLicenses";
import { useProjectStore } from "../stores/projectStore";
import TextbookCatalogCard from "./TextbookCatalogCard";
import TextbookDetailsPanel from "./TextbookDetailsPanel";
import { Search, X, Download, CheckCircle, AlertTriangle, Loader2 } from "lucide-react";

interface TextbookCatalogProps {
  onClose: () => void;
}

const SUBJECTS = [
  "all",
  "calculus",
  "linear-algebra",
  "algebra",
  "differential-equations",
  "discrete-math",
  "statistics",
  "probability",
  "other",
] as const;

export default function TextbookCatalog({ onClose }: TextbookCatalogProps) {
  const currentProject = useProjectStore((s) => s.currentProject);
  const updateProject = useProjectStore((s) => s.updateProject);

  const [entries, setEntries] = useState<TextbookCatalogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [subjectFilter, setSubjectFilter] = useState<string>("all");
  const [downloading, setDownloading] = useState<Set<string>>(new Set());
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<TextbookCatalogEntry | null>(null);

  // Load catalog
  useEffect(() => {
    setLoading(true);
    setError(null);
    Textbook.listCatalog()
      .then((catalog) => {
        setEntries(catalog);
        setLoading(false);
      })
      .catch((err: string) => {
        setError(err);
        setLoading(false);
      });
  }, []);

  // Filter entries
  const filtered = entries.filter((entry) => {
    if (subjectFilter !== "all" && entry.subject !== subjectFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const matchesTitle = entry.title.toLowerCase().includes(q);
      const matchesAuthor = entry.authors.some((a) => a.toLowerCase().includes(q));
      const matchesSubject = subjectLabel(entry.subject).toLowerCase().includes(q);
      const matchesDesc = entry.description.toLowerCase().includes(q);
      const matchesRec = entry.recommended_for?.some((r) => r.toLowerCase().includes(q));
      if (!matchesTitle && !matchesAuthor && !matchesSubject && !matchesDesc && !matchesRec) {
        return false;
      }
    }
    return true;
  });

  // Group by subject for display
  const subjectGroups = new Map<string, TextbookCatalogEntry[]>();
  for (const entry of filtered) {
    const group = subjectGroups.get(entry.subject) ?? [];
    group.push(entry);
    subjectGroups.set(entry.subject, group);
  }

  const handleDownload = useCallback(
    async (entry: TextbookCatalogEntry) => {
      if (downloading.has(entry.id)) return;

      setDownloading((prev) => new Set(prev).add(entry.id));
      setErrorMsg(null);
      setSuccessMsg(null);

      try {
        const result = await Textbook.download(entry.id);

        // Refresh project store if we updated the textbook path
        if (currentProject) {
          await useProjectStore.getState().loadProjects();
        }

        setSuccessMsg(`"${entry.title}" downloaded successfully! Check the Book tab.`);
        setTimeout(() => setSuccessMsg(null), 5000);
      } catch (err: unknown) {
        const msg = typeof err === "string" ? err : "Download failed. Please try again.";
        setErrorMsg(msg);
        setTimeout(() => setErrorMsg(null), 8000);
      } finally {
        setDownloading((prev) => {
          const next = new Set(prev);
          next.delete(entry.id);
          return next;
        });
      }
    },
    [downloading, currentProject],
  );

  // ── Render ──

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        background: "rgba(0,0,0,0.35)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        style={{
          width: "90%",
          maxWidth: 960,
          height: "85vh",
          maxHeight: 800,
          borderRadius: 12,
          background: "var(--color-bg)",
          border: "1px solid var(--color-border)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
        }}
      >
        {/* ── Header ── */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "16px 20px",
            borderBottom: "1px solid var(--color-border)",
            flexShrink: 0,
          }}
        >
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontSize: 16, fontWeight: 600, color: "var(--color-text-primary)" }}>
              Free Textbook Catalog
            </span>
            <span style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>
              {entries.length} open-source textbooks — browse, download, and start studying
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--color-text-tertiary)",
              display: "flex",
              padding: 4,
              borderRadius: 6,
            }}
            title="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* ── Search / Filters ── */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 20px",
            borderBottom: "1px solid var(--color-border)",
            flexShrink: 0,
          }}
        >
          <div style={{ position: "relative", flex: 1 }}>
            <Search
              size={13}
              style={{
                position: "absolute",
                left: 10,
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--color-text-tertiary)",
                pointerEvents: "none",
              }}
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search titles, authors, subjects…"
              style={{
                width: "100%",
                padding: "7px 10px 7px 30px",
                borderRadius: 6,
                border: "1px solid var(--color-border)",
                background: "var(--color-surface)",
                color: "var(--color-text-primary)",
                fontSize: 12,
                fontFamily: "inherit",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {SUBJECTS.map((subj) => (
              <button
                key={subj}
                onClick={() => setSubjectFilter(subj)}
                style={{
                  padding: "4px 10px",
                  borderRadius: 6,
                  border: `1px solid ${
                    subjectFilter === subj ? "var(--color-accent)" : "var(--color-border)"
                  }`,
                  background:
                    subjectFilter === subj ? "var(--color-accent)" : "var(--color-surface)",
                  color:
                    subjectFilter === subj
                      ? "#fff"
                      : subj === "all"
                        ? "var(--color-text-secondary)"
                        : subjectColor(subj),
                  fontSize: 11,
                  fontWeight: subjectFilter === subj ? 600 : 400,
                  fontFamily: "inherit",
                  cursor: "pointer",
                  transition: "background 0.1s, border-color 0.1s",
                }}
              >
                {subj === "all" ? "All" : subjectLabel(subj)}
              </button>
            ))}
          </div>
        </div>

        {/* ── Status messages ── */}
        {successMsg && (
          <div
            style={{
              padding: "6px 20px",
              background: "rgba(34,197,94,0.08)",
              color: "rgb(34,197,94)",
              fontSize: 12,
              borderBottom: "1px solid var(--color-border)",
              display: "flex",
              alignItems: "center",
              gap: 6,
              flexShrink: 0,
            }}
          >
            <CheckCircle size={13} />
            {successMsg}
          </div>
        )}
        {errorMsg && (
          <div
            style={{
              padding: "6px 20px",
              background: "rgba(239,68,68,0.08)",
              color: "rgb(239,68,68)",
              fontSize: 12,
              borderBottom: "1px solid var(--color-border)",
              display: "flex",
              alignItems: "center",
              gap: 6,
              flexShrink: 0,
            }}
          >
            <AlertTriangle size={13} />
            {errorMsg}
          </div>
        )}

        {/* ── Body ── */}
        <div style={{ flex: 1, overflow: "auto", padding: "16px 20px" }}>
          {loading && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                height: 200,
                color: "var(--color-text-tertiary)",
                fontSize: 13,
              }}
            >
              <Loader2 size={16} style={{ animation: "spin 0.8s linear infinite" }} />
              Loading catalog…
            </div>
          )}

          {error && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                height: 200,
              }}
            >
              <AlertTriangle size={24} strokeWidth={1.2} style={{ color: "rgb(234,179,8)" }} />
              <span style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>
                Could not load textbook catalog
              </span>
              <span style={{ fontSize: 11, color: "var(--color-text-tertiary)", maxWidth: 400, textAlign: "center" }}>
                {error}
              </span>
            </div>
          )}

          {!loading && !error && filtered.length === 0 && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                height: 200,
                color: "var(--color-text-tertiary)",
              }}
            >
              <Search size={24} strokeWidth={1.2} style={{ opacity: 0.3 }} />
              <span style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>
                No textbooks match your search
              </span>
              <button
                onClick={() => {
                  setSearch("");
                  setSubjectFilter("all");
                }}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--color-accent)",
                  fontSize: 11,
                  fontFamily: "inherit",
                  textDecoration: "underline",
                }}
              >
                Clear filters
              </button>
            </div>
          )}

          {!loading && !error && filtered.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              {Array.from(subjectGroups.entries()).map(([subject, groupEntries]) => (
                <div key={subject}>
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: subjectColor(subject),
                      marginBottom: 10,
                      textTransform: "uppercase",
                      letterSpacing: "0.04em",
                    }}
                  >
                    {subjectLabel(subject)}
                    <span style={{ color: "var(--color-text-tertiary)", fontWeight: 400, marginLeft: 6 }}>
                      ({groupEntries.length})
                    </span>
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                      gap: 12,
                    }}
                  >
                    {groupEntries.map((entry) => (
                      <div
                        key={entry.id}
                        onClick={() => setSelectedEntry(entry)}
                        style={{ cursor: "pointer" }}
                      >
                        <TextbookCatalogCard
                          entry={entry}
                          downloading={downloading.has(entry.id)}
                          onDownload={handleDownload}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Textbook details panel overlay */}
      {selectedEntry && (
        <TextbookDetailsPanel entry={selectedEntry} onClose={() => setSelectedEntry(null)} />
      )}
    </div>
  );
}