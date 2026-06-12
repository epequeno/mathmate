/**
 * Tests for the sanitize module — URL scheme allowlist + rel injection.
 */

import { describe, it, expect } from "vitest";
import { safeUrl } from "./sanitize";

// ─── safeUrl unit tests ───────────────────────────────────────────

describe("safeUrl", () => {
  // --- href tests ---
  it("allows https href", () => {
    expect(safeUrl("https://example.com/", "href")).toBe(
      "https://example.com/"
    );
  });

  it("allows http href", () => {
    expect(safeUrl("http://example.com/", "href")).toBe(
      "http://example.com/"
    );
  });

  it("allows mailto href", () => {
    expect(safeUrl("mailto:user@example.com", "href")).toBe(
      "mailto:user@example.com"
    );
  });

  it("allows relative href", () => {
    expect(safeUrl("/path/to/page", "href")).toBe("/path/to/page");
  });

  it("allows fragment-only href", () => {
    expect(safeUrl("#section", "href")).toBe("#section");
  });

  it("allows scheme-relative href", () => {
    expect(safeUrl("//example.com/asset", "href")).toBe(
      "//example.com/asset"
    );
  });

  it("strips javascript: href", () => {
    expect(safeUrl("javascript:alert(1)", "href")).toBeNull();
  });

  it("strips javascript: href with unicode obfuscation", () => {
    expect(safeUrl("\\u006aavascript:alert(1)", "href")).toBeNull();
  });

  it("strips vbscript: href", () => {
    expect(safeUrl("vbscript:msgbox(1)", "href")).toBeNull();
  });

  it("strips data: href (anchors never get data:)", () => {
    expect(
      safeUrl("data:text/html,<script>alert(1)</script>", "href")
    ).toBeNull();
  });

  it("strips file: href", () => {
    expect(safeUrl("file:///etc/passwd", "href")).toBeNull();
  });

  it("strips blob: href", () => {
    expect(safeUrl("blob:uuid", "href")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(safeUrl("", "href")).toBeNull();
  });

  it("passes through whitespace-only as relative-like", () => {
    // Whitespace without : is treated as relative/fragment, returned as-is
    expect(safeUrl("   ", "href")).toBe("   ");
  });

  // --- src tests ---
  it("allows data:image/png src", () => {
    expect(
      safeUrl(
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
        "src"
      )
    ).toBeTruthy();
  });

  it("allows data:image/jpeg src", () => {
    expect(
      safeUrl(
        "data:image/jpeg;base64,/9j/4AAQSkZJRg==",
        "src"
      )
    ).toBeTruthy();
  });

  it("allows data:image/gif src", () => {
    expect(
      safeUrl(
        "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
        "src"
      )
    ).toBeTruthy();
  });

  it("strips data:text/html src (non-image mime)", () => {
    expect(
      safeUrl("data:text/html,<script>alert(1)</script>", "src")
    ).toBeNull();
  });

  it("strips https: src (remote images blocked)", () => {
    expect(
      safeUrl("https://attacker.example/exfil.png", "src")
    ).toBeNull();
  });

  it("strips file: src", () => {
    expect(safeUrl("file:///etc/passwd", "src")).toBeNull();
  });

  it("allows asset: src (Tauri protocol)", () => {
    expect(safeUrl("asset://localhost/image.png", "src")).toBe(
      "asset://localhost/image.png"
    );
  });

  it("passes through unparseable string as relative-like", () => {
    // No colon → treated as relative URL, returned as-is
    expect(safeUrl("not-a-url at all \\x00 invalid", "src")).toBe("not-a-url at all \\x00 invalid");
  });
});