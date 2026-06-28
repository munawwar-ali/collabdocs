/**
 * Unit Tests: Utility Functions
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  cn,
  formatRelativeTime,
  truncate,
  generateUserColor,
  sleep,
  backoffDelay,
} from "@/lib/utils";

// ── cn (classnames) ───────────────────────────────────────────────

describe("cn", () => {
  it("merges class names", () => {
    expect(cn("foo", "bar")).toBe("foo bar");
  });

  it("handles conditional classes", () => {
    expect(cn("base", false && "skip", "include")).toBe("base include");
  });

  it("resolves Tailwind conflicts (later wins)", () => {
    // tailwind-merge should resolve conflicting utilities
    expect(cn("px-4", "px-6")).toBe("px-6");
  });

  it("handles undefined/null gracefully", () => {
    expect(cn("base", undefined, null, "end")).toBe("base end");
  });
});

// ── formatRelativeTime ────────────────────────────────────────────

describe("formatRelativeTime", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "just now" for recent timestamp', () => {
    const now = new Date("2026-01-01T11:59:45Z"); // 15s ago
    expect(formatRelativeTime(now)).toBe("just now");
  });

  it("returns minutes for timestamps within an hour", () => {
    const thirtyMinsAgo = new Date("2026-01-01T11:30:00Z");
    expect(formatRelativeTime(thirtyMinsAgo)).toBe("30m ago");
  });

  it("returns hours for timestamps within a day", () => {
    const threeHoursAgo = new Date("2026-01-01T09:00:00Z");
    expect(formatRelativeTime(threeHoursAgo)).toBe("3h ago");
  });

  it("returns days for timestamps within a week", () => {
    const threeDaysAgo = new Date("2025-12-29T12:00:00Z");
    expect(formatRelativeTime(threeDaysAgo)).toBe("3d ago");
  });

  it("accepts string dates", () => {
    const result = formatRelativeTime("2026-01-01T11:59:45Z");
    expect(result).toBe("just now");
  });
});

// ── truncate ─────────────────────────────────────────────────────

describe("truncate", () => {
  it("returns string unchanged if within limit", () => {
    expect(truncate("Hello", 10)).toBe("Hello");
  });

  it("truncates with ellipsis when over limit", () => {
    expect(truncate("Hello World", 8)).toBe("Hello...");
  });

  it("handles exact boundary", () => {
    expect(truncate("Hello", 5)).toBe("Hello");
  });

  it("handles empty string", () => {
    expect(truncate("", 10)).toBe("");
  });
});

// ── generateUserColor ─────────────────────────────────────────────

describe("generateUserColor", () => {
  it("returns an HSL color string", () => {
    const color = generateUserColor("user-123");
    expect(color).toMatch(/^hsl\(\d+,\s*70%,\s*45%\)$/);
  });

  it("is deterministic — same userId always gives same color", () => {
    const color1 = generateUserColor("user-abc");
    const color2 = generateUserColor("user-abc");
    expect(color1).toBe(color2);
  });

  it("produces different colors for different userIds", () => {
    const color1 = generateUserColor("user-aaa");
    const color2 = generateUserColor("user-bbb");
    // This could theoretically collide but is very unlikely
    expect(color1).not.toBe(color2);
  });
});

// ── sleep ─────────────────────────────────────────────────────────

describe("sleep", () => {
  it("resolves after the specified time", async () => {
    vi.useFakeTimers();
    const promise = sleep(1000);
    vi.advanceTimersByTime(1000);
    await expect(promise).resolves.toBeUndefined();
    vi.useRealTimers();
  });
});

// ── backoffDelay ──────────────────────────────────────────────────

describe("backoffDelay", () => {
  it("doubles delay on each attempt", () => {
    expect(backoffDelay(0)).toBe(1000);  // 1000 * 2^0
    expect(backoffDelay(1)).toBe(2000);  // 1000 * 2^1
    expect(backoffDelay(2)).toBe(4000);  // 1000 * 2^2
    expect(backoffDelay(3)).toBe(8000);  // 1000 * 2^3
  });

  it("caps at max delay", () => {
    expect(backoffDelay(10)).toBe(30000); // Would be 1024s, capped at 30s
  });

  it("respects custom base and max", () => {
    expect(backoffDelay(0, 500, 5000)).toBe(500);
    expect(backoffDelay(5, 500, 5000)).toBe(5000); // capped
  });
});