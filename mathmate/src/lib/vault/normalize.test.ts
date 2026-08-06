// ─── Vault Normalizer Tests ───────────────────────────────────────────
// Verifies that both Synapse and Legacy response shapes are correctly
// normalized to the shared Vault* types.
//
// See: Implementation_Phase14D_VaultBackend.md §D.3

import { describe, it, expect } from "vitest";
import {
  normalizeList,
  normalizeSearch,
  normalizeNote,
  normalizeBacklinks,
} from "./normalize";

// ─── normalizeList ────────────────────────────────────────────────────

describe("normalizeList", () => {
  it("handles raw array from Synapse", () => {
    const raw = [
      { path: "notes/math.md", title: "Math Notes" },
      { path: "notes/physics.md", title: "Physics" },
    ];
    const result = normalizeList(raw);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ path: "notes/math.md", title: "Math Notes" });
  });

  it("handles Synapse object envelope { notes: [...] }", () => {
    const raw = {
      notes: [
        { path: "a.md", title: "A" },
        { path: "b.md", title: "B" },
      ],
    };
    const result = normalizeList(raw);
    expect(result).toHaveLength(2);
    expect(result[0].path).toBe("a.md");
  });

  it("infers title from path when missing", () => {
    const raw = [{ path: "notes/calculus.md" }];
    const result = normalizeList(raw);
    expect(result[0].title).toBe("calculus");
  });

  it("handles empty input gracefully", () => {
    expect(normalizeList(null)).toEqual([]);
    expect(normalizeList(undefined)).toEqual([]);
    expect(normalizeList({})).toEqual([]);
    expect(normalizeList([])).toEqual([]);
  });
});

// ─── normalizeSearch ──────────────────────────────────────────────────

describe("normalizeSearch", () => {
  it("handles raw array with snippets", () => {
    const raw = [
      { path: "a.md", title: "A", snippet: "snippet A" },
      { path: "b.md", title: "B", snippet: "snippet B" },
    ];
    const result = normalizeSearch(raw);
    expect(result).toHaveLength(2);
    expect(result[0].snippet).toBe("snippet A");
  });

  it("handles Synapse object envelope { results: [...] }", () => {
    const raw = {
      results: [
        { path: "a.md", title: "A", snippet: "s1" },
      ],
    };
    const result = normalizeSearch(raw);
    expect(result).toHaveLength(1);
    expect(result[0].snippet).toBe("s1");
  });

  it("defaults snippet to empty string", () => {
    const raw = [{ path: "a.md", title: "A" }];
    const result = normalizeSearch(raw);
    expect(result[0].snippet).toBe("");
  });

  it("handles empty input", () => {
    expect(normalizeSearch(null)).toEqual([]);
    expect(normalizeSearch({})).toEqual([]);
  });
});

// ─── normalizeNote ────────────────────────────────────────────────────

describe("normalizeNote", () => {
  it("maps all fields from Synapse note_read", () => {
    const raw = {
      path: "notes/calc.md",
      title: "Calculus",
      body: "# Hello\n\nContent here.",
      frontmatter: { tags: ["math"] },
    };
    const result = normalizeNote(raw);
    expect(result.path).toBe("notes/calc.md");
    expect(result.title).toBe("Calculus");
    expect(result.body).toBe("# Hello\n\nContent here.");
    expect(result.frontmatter).toEqual({ tags: ["math"] });
  });

  it("infers title from path when missing", () => {
    const raw = { path: "notes/algebra.md", body: "Content" };
    const result = normalizeNote(raw);
    expect(result.title).toBe("algebra");
  });
});

// ─── normalizeBacklinks ───────────────────────────────────────────────

describe("normalizeBacklinks", () => {
  it("maps Synapse backlinks shape", () => {
    const raw = {
      backlinks: ["notes/ref.md", "notes/other.md"],
      forward_links: [
        { target: "notes/x.md", title: "X", exists: true },
        { target: "notes/y.md", title: "Y", exists: false },
      ],
    };
    const result = normalizeBacklinks(raw);
    expect(result.backlinks).toEqual([
      { path: "notes/ref.md", title: "ref" },
      { path: "notes/other.md", title: "other" },
    ]);
    expect(result.forward_links).toEqual([
      { path: "notes/x.md", title: "X", exists: true },
      { path: "notes/y.md", title: "Y", exists: false },
    ]);
  });

  it("appends .md extension when missing", () => {
    const raw = {
      backlinks: ["notes/noext"],
      forward_links: [],
    };
    const result = normalizeBacklinks(raw);
    expect(result.backlinks[0].path).toBe("notes/noext.md");
  });

  it("handles null/missing arrays", () => {
    expect(normalizeBacklinks({})).toEqual({
      backlinks: [],
      forward_links: [],
    });
  });
});
