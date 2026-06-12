import { useState, useRef, useCallback, useEffect } from "react";
import { LATEX_CATEGORIES, searchSnippets, getSnippetsByCategory, fillTemplate, LaTeXSnippet } from "../lib/latexSnippets";

interface LaTeXPaletteProps {
  onInsert: (latex: string) => void;
  onClose: () => void;
  /** Optional selected text to wrap */
  selectedText?: string;
}

export default function LaTeXPalette({ onInsert, onClose, selectedText }: LaTeXPaletteProps) {
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState(LATEX_CATEGORIES[0]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const isSearching = query.trim().length > 0;
  const results = isSearching
    ? searchSnippets(query)
    : getSnippetsByCategory(activeCategory);

  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query, activeCategory]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((i) => Math.max(i - 1, 0));
          break;
        case "Enter":
          e.preventDefault();
          if (results[selectedIndex]) {
            handleInsert(results[selectedIndex]);
          }
          break;
        case "Escape":
          e.preventDefault();
          onClose();
          break;
      }
    },
    [results, selectedIndex]
  );

  const handleInsert = useCallback(
    (snippet: LaTeXSnippet) => {
      const latex = fillTemplate(snippet.template, selectedText);
      onInsert(latex);
      onClose();
    },
    [onInsert, onClose, selectedText]
  );

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div
        style={paletteStyle}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search */}
        <div style={{ padding: "8px 10px", borderBottom: "1px solid var(--color-border)" }}>
          <input
            ref={searchInputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search LaTeX snippets..."
            style={searchInputStyle}
          />
        </div>

        {isSearching ? (
          /* Search results */
          <div style={{ flex: 1, overflow: "auto" }}>
            {results.length === 0 ? (
              <div style={{ padding: 16, textAlign: "center", color: "var(--color-text-tertiary)", fontSize: 13 }}>
                No snippets found for "{query}"
              </div>
            ) : (
              results.map((snippet, i) => (
                <SnippetRow
                  key={snippet.id}
                  snippet={snippet}
                  selected={i === selectedIndex}
                  onClick={() => handleInsert(snippet)}
                />
              ))
            )}
          </div>
        ) : (
          /* Category + snippet grid */
          <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
            {/* Category sidebar */}
            <div style={categorySidebarStyle}>
              {LATEX_CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  style={{
                    ...categoryButtonStyle,
                    background: cat === activeCategory ? "var(--color-accent-subtle)" : "transparent",
                    color: cat === activeCategory ? "var(--color-accent)" : "var(--color-text-secondary)",
                    fontWeight: cat === activeCategory ? 600 : 400,
                  }}
                >
                  {cat}
                </button>
              ))}
            </div>
            {/* Snippets */}
            <div style={{ flex: 1, overflow: "auto", padding: 4 }}>
              {results.map((snippet) => (
                <SnippetRow
                  key={snippet.id}
                  snippet={snippet}
                  onClick={() => handleInsert(snippet)}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SnippetRow({
  snippet,
  selected,
  onClick,
}: {
  snippet: LaTeXSnippet;
  selected?: boolean;
  onClick: () => void;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        padding: "6px 10px",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: 8,
        background: selected ? "var(--color-accent-subtle)" : "transparent",
        borderLeft: selected ? "2px solid var(--color-accent)" : "2px solid transparent",
      }}
      onMouseEnter={(e) => {
        if (!selected) (e.currentTarget as HTMLElement).style.background = "var(--color-surface)";
      }}
      onMouseLeave={(e) => {
        if (!selected) (e.currentTarget as HTMLElement).style.background = "transparent";
      }}
    >
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: "var(--color-text-primary)" }}>
          {snippet.title}
        </div>
        <code style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>
          {snippet.example}
        </code>
      </div>
      <div
        style={{
          fontSize: 11,
          color: "var(--color-text-tertiary)",
          whiteSpace: "nowrap",
          maxWidth: 180,
          overflow: "hidden",
          textOverflow: "ellipsis",
          fontFamily: "'SF Mono', Menlo, monospace",
        }}
      >
        {snippet.template}
      </div>
    </div>
  );
}

// ─── Styles ─────────────────────────────────────

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 100,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "rgba(0,0,0,0.3)",
};

const paletteStyle: React.CSSProperties = {
  width: 640,
  height: 480,
  maxHeight: "80vh",
  background: "var(--color-bg-elevated)",
  border: "1px solid var(--color-border)",
  borderRadius: 12,
  boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
};

const searchInputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 12px",
  border: "1px solid var(--color-border)",
  borderRadius: 8,
  background: "var(--color-bg)",
  color: "var(--color-text-primary)",
  fontSize: 13,
  fontFamily: "inherit",
  outline: "none",
};

const categorySidebarStyle: React.CSSProperties = {
  width: 130,
  minWidth: 130,
  borderRight: "1px solid var(--color-border)",
  overflow: "auto",
  padding: 4,
};

const categoryButtonStyle: React.CSSProperties = {
  width: "100%",
  padding: "6px 10px",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: 12,
  textAlign: "left",
  background: "transparent",
  color: "var(--color-text-secondary)",
  fontFamily: "inherit",
};
