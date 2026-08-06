/**
 * Tests for toolFormat.ts
 *
 * Covers: formatToolCall, formatToolResult, formatToolInput, renderToolOutput
 */

import { describe, it, expect } from "vitest";
import {
  formatToolCall,
  formatToolResult,
  formatToolInput,
  renderToolOutput,
} from "./toolFormat";

// ─── formatToolCall ───────────────────────────────────────────────────────────

describe("formatToolCall", () => {
  it("vault_search — wraps query in quotes", () => {
    expect(formatToolCall("vault_search", { query: "integration" })).toBe(
      'Searched notes for "integration"'
    );
  });

  it("vault_search — truncates long query at 60 chars", () => {
    const longQuery = "a".repeat(80);
    const result = formatToolCall("vault_search", { query: longQuery });
    expect(result).toContain("…");
    // label + quotes + ellipsis should not exceed reasonable length
    expect(result.length).toBeLessThan(90);
  });

  it("vault_read — wraps path in quotes", () => {
    expect(formatToolCall("vault_read", { path: "notes/calc.md" })).toBe(
      'Read "notes/calc.md"'
    );
  });

  it("vault_write — wraps path in quotes", () => {
    expect(formatToolCall("vault_write", { path: "Study Logs/2026-06-05.md", content: "…" })).toBe(
      'Wrote "Study Logs/2026-06-05.md"'
    );
  });

  it("vault_list — no args needed", () => {
    expect(formatToolCall("vault_list", {})).toBe("Listed vault");
  });

  it("calculate — shows expression", () => {
    expect(formatToolCall("calculate", { expression: "2 + 2" })).toBe("Calculated 2 + 2");
  });

  it("calculate — truncates long expression", () => {
    const longExpr = "x".repeat(80);
    const result = formatToolCall("calculate", { expression: longExpr });
    expect(result).toContain("…");
  });

  it("graph — shows expression", () => {
    expect(formatToolCall("graph", { expression: "sin(x)", xmin: -3, xmax: 3 })).toBe(
      "Graphed sin(x)"
    );
  });

  it("get_current_date — no args", () => {
    expect(formatToolCall("get_current_date", {})).toBe("Got current date");
  });

  it("unknown tool — returns raw name unchanged", () => {
    expect(formatToolCall("mcp__memory__recall", { topic: "calculus" })).toBe(
      "mcp__memory__recall"
    );
  });
});

// ─── formatToolResult ─────────────────────────────────────────────────────────

describe("formatToolResult", () => {
  it("isError: true — always returns 'error' regardless of tool or result", () => {
    expect(formatToolResult("vault_search", { results: [1, 2, 3] }, true)).toBe("error");
    expect(formatToolResult("calculate", { value: 42 }, true)).toBe("error");
    expect(formatToolResult("unknown", null, true)).toBe("error");
  });

  it("vault_search — N results (plural)", () => {
    expect(
      formatToolResult("vault_search", { results: [{}, {}, {}, {}] }, false)
    ).toBe("4 results");
  });

  it("vault_search — 1 result (singular)", () => {
    expect(formatToolResult("vault_search", { results: [{}] }, false)).toBe("1 result");
  });

  it("vault_search — 0 results", () => {
    expect(formatToolResult("vault_search", { results: [] }, false)).toBe("0 results");
  });

  it("vault_read — reports char count", () => {
    expect(
      formatToolResult("vault_read", { content: "hello world" }, false)
    ).toBe("11 chars");
  });

  it("vault_read — empty content returns empty string", () => {
    expect(formatToolResult("vault_read", { content: "" }, false)).toBe("");
  });

  it("vault_write — updated: true", () => {
    expect(
      formatToolResult("vault_write", { path: "a.md", updated: true, bytes_written: 100 }, false)
    ).toBe("updated");
  });

  it("vault_write — created (no updated field)", () => {
    expect(
      formatToolResult("vault_write", { path: "a.md", bytes_written: 100 }, false)
    ).toBe("created");
  });

  it("vault_list — N files (plural)", () => {
    expect(
      formatToolResult("vault_list", { files: [{}, {}, {}] }, false)
    ).toBe("3 files");
  });

  it("vault_list — 1 file (singular)", () => {
    expect(formatToolResult("vault_list", { files: [{}] }, false)).toBe("1 file");
  });

  it("calculate — returns value as string", () => {
    expect(formatToolResult("calculate", { value: 1 }, false)).toBe("1");
    expect(formatToolResult("calculate", { value: 3.14159 }, false)).toBe("3.14159");
  });

  it("graph — reports point count", () => {
    const points = Array.from({ length: 200 }, (_, i) => [i, i]);
    expect(formatToolResult("graph", { points }, false)).toBe("200 pts");
  });

  it("get_current_date — returns date string", () => {
    expect(
      formatToolResult("get_current_date", { date: "2026-06-05", day_of_week: "Thursday" }, false)
    ).toBe("2026-06-05");
  });

  it("unknown tool — returns empty string", () => {
    expect(formatToolResult("mcp__memory__recall", { memories: [] }, false)).toBe("");
  });

  it("malformed result (non-object) — returns empty string without throwing", () => {
    expect(() => formatToolResult("vault_search", "oops", false)).not.toThrow();
    expect(formatToolResult("vault_search", "oops", false)).toBe("");
  });

  it("null result — returns empty string without throwing", () => {
    expect(() => formatToolResult("calculate", null, false)).not.toThrow();
    expect(formatToolResult("calculate", null, false)).toBe("");
  });
});

// ─── formatToolInput ──────────────────────────────────────────────────────────

describe("formatToolInput", () => {
  it("no args — name() format", () => {
    expect(formatToolInput("vault_list", {})).toBe("vault_list()");
    expect(formatToolInput("get_current_date", {})).toBe("get_current_date()");
  });

  it("string args — double-quoted values", () => {
    expect(formatToolInput("vault_search", { query: "integration" })).toBe(
      'vault_search({ query: "integration" })'
    );
  });

  it("numeric args — unquoted values", () => {
    expect(formatToolInput("graph", { expression: "sin(x)", xmin: -10, xmax: 10 })).toBe(
      'graph({ expression: "sin(x)", xmin: -10, xmax: 10 })'
    );
  });

  it("boolean args — unquoted", () => {
    expect(formatToolInput("some_tool", { enabled: true, count: 3 })).toBe(
      "some_tool({ enabled: true, count: 3 })"
    );
  });

  it("long string value — truncated with ellipsis inside quotes", () => {
    const longContent = "x".repeat(100);
    const result = formatToolInput("vault_write", { path: "a.md", content: longContent });
    expect(result).toContain('"x');
    expect(result).toContain("…");
    // should not exceed safe single-line length
    expect(result.length).toBeLessThan(200);
  });

  it("multiple args — all included in order", () => {
    const result = formatToolInput("vault_read", { path: "notes.md" });
    expect(result).toBe('vault_read({ path: "notes.md" })');
  });
});

// ─── renderToolOutput ─────────────────────────────────────────────────────────

describe("renderToolOutput", () => {
  // ── error state ──────────────────────────────────────────────────────────

  it("isError: true — returns error kind with message", () => {
    const out = renderToolOutput(
      "vault_search",
      { error: "Vault index not available" },
      true
    );
    expect(out.kind).toBe("error");
    if (out.kind === "error") {
      expect(out.message).toBe("Vault index not available");
    }
  });

  it("isError: true — non-object result still returns error kind", () => {
    const out = renderToolOutput("calculate", "something went wrong", true);
    expect(out.kind).toBe("error");
  });

  // ── vault_search ─────────────────────────────────────────────────────────

  it("vault_search — maps results to VaultSearchResult", () => {
    const out = renderToolOutput(
      "vault_search",
      {
        results: [
          { path: "calc/ibp.md", snippet: "integration by parts formula" },
          { path: "notes.md", snippet: "see section 3" },
        ],
      },
      false
    );
    expect(out.kind).toBe("vault_search");
    if (out.kind === "vault_search") {
      expect(out.results).toHaveLength(2);
      expect(out.results[0].filename).toBe("ibp.md");
      expect(out.results[0].snippet).toBe("integration by parts formula");
      expect(out.overflow).toBe(0);
    }
  });

  it("vault_search — caps at 5 results, sets overflow", () => {
    const results = Array.from({ length: 8 }, (_, i) => ({
      path: `note${i}.md`,
      snippet: "…",
    }));
    const out = renderToolOutput("vault_search", { results }, false);
    expect(out.kind).toBe("vault_search");
    if (out.kind === "vault_search") {
      expect(out.results).toHaveLength(5);
      expect(out.overflow).toBe(3);
    }
  });

  it("vault_search — zero results", () => {
    const out = renderToolOutput("vault_search", { results: [] }, false);
    expect(out.kind).toBe("vault_search");
    if (out.kind === "vault_search") {
      expect(out.results).toHaveLength(0);
      expect(out.overflow).toBe(0);
    }
  });

  // ── vault_read ────────────────────────────────────────────────────────────

  it("vault_read — extracts path, charCount, lineCount, preview", () => {
    const content = "line1\nline2\nline3";
    const out = renderToolOutput("vault_read", { path: "ibp.md", content }, false);
    expect(out.kind).toBe("vault_read");
    if (out.kind === "vault_read") {
      expect(out.path).toBe("ibp.md");
      expect(out.charCount).toBe(content.length);
      expect(out.lineCount).toBe(3);
      expect(out.preview).toBe(content);
    }
  });

  it("vault_read — preview capped at 10 lines", () => {
    const lines = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`);
    const content = lines.join("\n");
    const out = renderToolOutput("vault_read", { path: "a.md", content }, false);
    if (out.kind === "vault_read") {
      expect(out.preview.split("\n")).toHaveLength(10);
      expect(out.lineCount).toBe(20);
    }
  });

  // ── vault_write ───────────────────────────────────────────────────────────

  it("vault_write — created", () => {
    const out = renderToolOutput(
      "vault_write",
      { path: "new.md", bytes_written: 512 },
      false
    );
    expect(out.kind).toBe("vault_write");
    if (out.kind === "vault_write") {
      expect(out.updated).toBe(false);
      expect(out.bytes).toBe(512);
      expect(out.path).toBe("new.md");
    }
  });

  it("vault_write — updated", () => {
    const out = renderToolOutput(
      "vault_write",
      { path: "existing.md", bytes_written: 800, updated: true },
      false
    );
    if (out.kind === "vault_write") {
      expect(out.updated).toBe(true);
    }
  });

  // ── vault_list ────────────────────────────────────────────────────────────

  it("vault_list — groups by top-level directory", () => {
    const files = [
      { relative_path: "Calculus II/ibp.md" },
      { relative_path: "Calculus II/substitution.md" },
      { relative_path: "PROGRESS.md" },
    ];
    const out = renderToolOutput("vault_list", { files }, false);
    expect(out.kind).toBe("vault_list");
    if (out.kind === "vault_list") {
      expect(out.totalFiles).toBe(3);
      const dirGroup = out.groups.find((g) => g.label === "Calculus II/");
      expect(dirGroup?.count).toBe(2);
      const fileGroup = out.groups.find((g) => g.label === "PROGRESS.md");
      expect(fileGroup?.isDir).toBe(false);
    }
  });

  it("vault_list — caps at 6 groups, sets overflow", () => {
    const files = Array.from({ length: 10 }, (_, i) => ({
      relative_path: `note${i}.md`,
    }));
    const out = renderToolOutput("vault_list", { files }, false);
    if (out.kind === "vault_list") {
      expect(out.groups.length).toBeLessThanOrEqual(6);
      expect(out.overflow).toBeGreaterThan(0);
    }
  });

  // ── calculate ─────────────────────────────────────────────────────────────

  it("calculate — returns value as string", () => {
    const out = renderToolOutput("calculate", { value: 1 }, false);
    expect(out.kind).toBe("calculate");
    if (out.kind === "calculate") {
      expect(out.value).toBe("1");
    }
  });

  it("calculate — handles float", () => {
    const out = renderToolOutput("calculate", { value: 3.14159265 }, false);
    if (out.kind === "calculate") {
      expect(out.value).toBe("3.14159265");
    }
  });

  // ── graph ─────────────────────────────────────────────────────────────────

  it("graph — returns point count", () => {
    const points = Array.from({ length: 200 }, (_, i) => [i * 0.1, Math.sin(i * 0.1)]);
    const out = renderToolOutput("graph", { points }, false);
    expect(out.kind).toBe("graph");
    if (out.kind === "graph") {
      expect(out.pointCount).toBe(200);
    }
  });

  // ── get_current_date ──────────────────────────────────────────────────────

  it("get_current_date — returns date and day", () => {
    const out = renderToolOutput(
      "get_current_date",
      { date: "2026-06-05", day_of_week: "Thursday", iso: "2026-06-05T10:00:00Z" },
      false
    );
    expect(out.kind).toBe("get_current_date");
    if (out.kind === "get_current_date") {
      expect(out.date).toBe("2026-06-05");
      expect(out.dayOfWeek).toBe("Thursday");
    }
  });

  // ── fallback ──────────────────────────────────────────────────────────────

  it("unknown tool — returns raw_json kind", () => {
    const out = renderToolOutput(
      "mcp__memory__recall",
      { memories: [{ id: "m1", content: "IBP" }] },
      false
    );
    expect(out.kind).toBe("raw_json");
    if (out.kind === "raw_json") {
      expect(out.json).toContain("memories");
    }
  });

  it("null result for unknown tool — returns raw_json without throwing", () => {
    expect(() => renderToolOutput("mystery_tool", null, false)).not.toThrow();
    const out = renderToolOutput("mystery_tool", null, false);
    expect(out.kind).toBe("raw_json");
  });

  it("non-object result for known tool — falls back to raw_json", () => {
    const out = renderToolOutput("vault_search", "unexpected string", false);
    expect(out.kind).toBe("raw_json");
  });
});
