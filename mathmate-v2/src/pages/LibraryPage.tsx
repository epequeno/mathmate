import { useState, useEffect, useCallback } from "react";
import { Textbook } from "../lib/api";
import type { TextbookCatalogEntry } from "../lib/types";
import { subjectLabel, subjectColor } from "../lib/textbookLicenses";
import { useProjectStore } from "../stores/projectStore";
import TextbookCatalogCard from "../components/TextbookCatalogCard";
import TextbookDetailsPanel from "../components/TextbookDetailsPanel";
import {
  Search,
  X,
  CheckCircle,
  AlertTriangle,
  Loader2,
  ChevronDown,
} from "lucide-react";
import { toAppError } from "../lib/error";

/**
 * All subjects, grouped so users see core math first, then olympiad topics.
 * "all" is a virtual filter meaning no subject restriction.
 */
const CORE_SUBJECTS = [
  "calculus",
  "linear-algebra",
  "algebra",
  "differential-equations",
  "discrete-math",
  "statistics",
  "probability",
  "number-theory",
  "abstract-algebra",
  "real-analysis",
  "geometry",
] as const;

const OLYMPIAD_SUBJECTS = [
  "olympiad-general",
  "olympiad-algebra",
  "olympiad-geometry",
  "olympiad-number-theory",
  "olympiad-combinatorics",
] as const;

const ALL_SUBJECTS = [...CORE_SUBJECTS, ...OLYMPIAD_SUBJECTS, "other"] as const;

export default function LibraryPage() {
  const currentProject = useProjectStore((s) => s.currentProject);
  const [entries, setEntries] = useState<TextbookCatalogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [subjectFilter, setSubjectFilter] = useState<string>("all");
  const [showAllFilters, setShowAllFilters] = useState(false);
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
      .catch((err: unknown) => {
        setError(toAppError(err).message);
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
      const matchesRec = entry.recommended_for?.some((r) =>
        r.toLowerCase().includes(q),
      );
      if (
        !matchesTitle &&
        !matchesAuthor &&
        !matchesSubject &&
        !matchesDesc &&
        !matchesRec
      ) {
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
        await Textbook.download(entry.id);
        if (currentProject) {
          await useProjectStore.getState().loadProjects();
        }
        setSuccessMsg(
          `"${entry.title}" downloaded successfully! Check the Book tab.`,
        );
        setTimeout(() => setSuccessMsg(null), 5000);
      } catch (err: unknown) {
        setErrorMsg(toAppError(err).message);
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

  // Decide which pills to show (core set + "More" toggle, or all)
  const visiblePills = showAllFilters ? ALL_SUBJECTS : CORE_SUBJECTS.slice(0, 5);
  // Only show "More" when there are additional subjects to reveal
  const hasMore = !showAllFilters;

  // Count subjects that actually have entries (for hiding empty pills)
  const subjectCounts = new Map<string, number>();
  for (const entry of entries) {
    subjectCounts.set(entry.subject, (subjectCounts.get(entry.subject) ?? 0) + 1);
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        overflow: "hidden",
      }}
    >
      {/* ── Header ── */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          padding: "24px 32px 0",
          gap: 16,
          flexShrink: 0,
        }}
      >
        {/* Title row */}
        <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
          <span
            style={{
              fontSize: 22,
              fontWeight: 700,
              color: "var(--color-text-primary)",
              letterSpacing: "-0.02em",
            }}
          >
            Library
          </span>
          <span
            style={{
              fontSize: 13,
              color: "var(--color-text-tertiary)",
            }}
          >
            {entries.length} free textbooks
          </span>
        </div>

        {/* Search + filter row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          {/* Search input */}
          <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
            <Search
              size={14}
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
                padding: "8px 10px 8px 32px",
                borderRadius: 8,
                border: "1px solid var(--color-border)",
                background: "var(--color-surface, var(--color-bg))",
                color: "var(--color-text-primary)",
                fontSize: 13,
                fontFamily: "inherit",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                style={{
                  position: "absolute",
                  right: 8,
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--color-text-tertiary)",
                  display: "flex",
                  padding: 2,
                }}
              >
                <X size={12} />
              </button>
            )}
          </div>

          {/* Subject filter pills */}
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {/* "All" pill */}
            <button
              onClick={() => setSubjectFilter("all")}
              style={{
                padding: "5px 12px",
                borderRadius: 6,
                border:
                  subjectFilter === "all"
                    ? "1px solid var(--color-text-primary)"
                    : "1px solid var(--color-border)",
                background:
                  subjectFilter === "all"
                    ? "var(--color-text-primary)"
                    : "transparent",
                color:
                  subjectFilter === "all"
                    ? "var(--color-bg)"
                    : "var(--color-text-secondary)",
                fontSize: 11,
                fontWeight: subjectFilter === "all" ? 600 : 500,
                fontFamily: "inherit",
                cursor: "pointer",
                transition: "background 0.1s, border-color 0.1s",
              }}
            >
              All
            </button>

            {visiblePills.map((subj) => {
              // Skip subjects with no entries
              if (!subjectCounts.has(subj)) return null;
              const color = subjectColor(subj);
              const active = subjectFilter === subj;
              return (
                <button
                  key={subj}
                  onClick={() => setSubjectFilter(subj)}
                  style={{
                    padding: "5px 12px",
                    borderRadius: 6,
                    border: active
                      ? `1px solid ${color}`
                      : "1px solid var(--color-border)",
                    background: active ? color : "transparent",
                    color: active ? "#fff" : color,
                    fontSize: 11,
                    fontWeight: active ? 600 : 500,
                    fontFamily: "inherit",
                    cursor: "pointer",
                    transition: "background 0.1s, border-color 0.1s",
                  }}
                >
                  {subjectLabel(subj)}
                </button>
              );
            })}

            {hasMore && (
              <button
                onClick={() => setShowAllFilters(true)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 3,
                  padding: "5px 12px",
                  borderRadius: 6,
                  border: "1px solid var(--color-border)",
                  background: "transparent",
                  color: "var(--color-text-tertiary)",
                  fontSize: 11,
                  fontWeight: 500,
                  fontFamily: "inherit",
                  cursor: "pointer",
                }}
              >
                More
                <ChevronDown size={10} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Status messages ── */}
      {successMsg && (
        <div
          style={{
            padding: "6px 32px",
            background: "rgba(34,197,94,0.08)",
            color: "rgb(34,197,94)",
            fontSize: 12,
            borderBottom: "1px solid var(--color-border)",
            display: "flex",
            alignItems: "center",
            gap: 6,
            flexShrink: 0,
            marginTop: 8,
          }}
        >
          <CheckCircle size={13} />
          {successMsg}
        </div>
      )}
      {errorMsg && (
        <div
          style={{
            padding: "6px 32px",
            background: "rgba(239,68,68,0.08)",
            color: "rgb(239,68,68)",
            fontSize: 12,
            borderBottom: "1px solid var(--color-border)",
            display: "flex",
            alignItems: "center",
            gap: 6,
            flexShrink: 0,
            marginTop: 8,
          }}
        >
          <AlertTriangle size={13} />
          {errorMsg}
        </div>
      )}

      {/* ── Body ── */}
      <div style={{ flex: 1, overflow: "auto", padding: "20px 32px 32px" }}>
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
            <Loader2
              size={16}
              style={{ animation: "spin 0.8s linear infinite" }}
            />
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
            <AlertTriangle
              size={24}
              strokeWidth={1.2}
              style={{ color: "rgb(234,179,8)" }}
            />
            <span
              style={{
                fontSize: 13,
                color: "var(--color-text-secondary)",
              }}
            >
              Could not load textbook catalog
            </span>
            <span
              style={{
                fontSize: 11,
                color: "var(--color-text-tertiary)",
                maxWidth: 400,
                textAlign: "center",
              }}
            >
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
            <Search
              size={24}
              strokeWidth={1.2}
              style={{ opacity: 0.3 }}
            />
            <span
              style={{
                fontSize: 13,
                color: "var(--color-text-secondary)",
              }}
            >
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
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 24,
            }}
          >
            {Array.from(subjectGroups.entries()).map(
              ([subject, groupEntries]) => (
                <div key={subject}>
                  {/* Section header */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "baseline",
                      gap: 8,
                      marginBottom: 12,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: subjectColor(subject),
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                      }}
                    >
                      {subjectLabel(subject)}
                    </span>
                    <span
                      style={{
                        fontSize: 11,
                        color: "var(--color-text-tertiary)",
                        fontWeight: 400,
                      }}
                    >
                      ({groupEntries.length})
                    </span>
                    <div
                      style={{
                        flex: 1,
                        height: 1,
                        background: "var(--color-border)",
                      }}
                    />
                  </div>
                  {/* Card grid */}
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "repeat(auto-fill, minmax(280px, 1fr))",
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
              ),
            )}
          </div>
        )}
      </div>

      {/* Textbook details panel overlay */}
      {selectedEntry && (
        <TextbookDetailsPanel
          entry={selectedEntry}
          onClose={() => setSelectedEntry(null)}
        />
      )}
    </div>
  );
}
