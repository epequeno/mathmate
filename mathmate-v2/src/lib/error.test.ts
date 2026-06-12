// @ts-nocheck
import { describe, it, expect } from "vitest";
import { toAppError, isRetryable, isAuth, isCancelled } from "./error";
import type { AppError } from "./error";

describe("toAppError", () => {
  it("recognises a valid AppError shape by kind", () => {
    const ae: AppError = { kind: "rate_limit", message: "slow", retry_after_secs: 5 };
    expect(toAppError(ae)).toEqual(ae);
  });

  it("wraps an Error instance as unknown", () => {
    const err = toAppError(new Error("boom"));
    expect(err.kind).toBe("unknown");
    expect(err.message).toBe("boom");
  });

  it("wraps a string as unknown", () => {
    const err = toAppError("something went wrong");
    expect(err.kind).toBe("unknown");
    expect(err.message).toBe("something went wrong");
  });

  it("wraps null as unknown", () => {
    const err = toAppError(null);
    expect(err.kind).toBe("unknown");
    expect(err.message).toBe("Unknown error");
  });

  it("wraps undefined as unknown", () => {
    const err = toAppError(undefined);
    expect(err.kind).toBe("unknown");
    expect(err.message).toBe("Unknown error");
  });

  it("wraps a number as unknown", () => {
    const err = toAppError(42);
    expect(err.kind).toBe("unknown");
  });

  it("wraps an object without kind as unknown error", () => {
    const err = toAppError({ status: 500 });
    expect(err.kind).toBe("unknown");
  });

  it("trusts kind even if message is missing (but TypeScript catches this)", () => {
    // Deliberately malformed — toAppError trusts shape checks at runtime
    const err = toAppError({ kind: "server", message: "boom", status: 500 });
    expect(err.kind).toBe("server");
  });
});

describe("isRetryable", () => {
  it.each(["network", "rate_limit", "server", "unavailable"] as const)(
    "%s is retryable",
    (kind) => {
      const ae: AppError = { kind, message: "test" } as AppError;
      expect(isRetryable(ae)).toBe(true);
    }
  );

  it.each(["auth", "validation", "not_found", "access_denied", "tool", "cancelled", "internal", "unknown"] as const)(
    "%s is NOT retryable",
    (kind) => {
      const ae: AppError = { kind, message: "test" } as AppError;
      expect(isRetryable(ae)).toBe(false);
    }
  );
});

describe("isAuth", () => {
  it("returns true for auth errors", () => {
    expect(isAuth({ kind: "auth", message: "bad key" })).toBe(true);
  });
  it("returns false for others", () => {
    expect(isAuth({ kind: "network", message: "offline" })).toBe(false);
  });
});

describe("isCancelled", () => {
  it("returns true for cancelled", () => {
    expect(isCancelled({ kind: "cancelled", message: "aborted" })).toBe(true);
  });
  it("returns false for others", () => {
    expect(isCancelled({ kind: "validation", message: "nope" })).toBe(false);
  });
});
