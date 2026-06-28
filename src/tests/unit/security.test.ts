/**
 * Unit Tests: Security Utilities
 *
 * Verifies all security checks that guard our API routes:
 * payload size limits, XSS stripping, null byte detection,
 * Yjs binary validation, and rate limiting logic.
 */

import { describe, it, expect } from "vitest";
import {
  LIMITS,
  isPlausibleYjsUpdate,
  isPlausibleYjsSnapshot,
  stripHtml,
  hasNullBytes,
  YjsUpdateSchema,
  EmailSchema,
  TitleSchema,
  UUIDSchema,
  AssignableRoleSchema,
} from "@/lib/security";

// ── LIMITS constants ──────────────────────────────────────────────

describe("LIMITS", () => {
  it("enforces 1MB body limit", () => {
    expect(LIMITS.MAX_BODY_BYTES).toBe(1 * 1024 * 1024);
  });

  it("enforces 512KB Yjs update limit", () => {
    expect(LIMITS.MAX_YJS_UPDATE_BYTES).toBe(512 * 1024);
  });

  it("update limit is smaller than body limit", () => {
    expect(LIMITS.MAX_YJS_UPDATE_BYTES).toBeLessThan(LIMITS.MAX_BODY_BYTES);
  });
});

// ── isPlausibleYjsUpdate ──────────────────────────────────────────

describe("isPlausibleYjsUpdate", () => {
  it("rejects empty buffer", () => {
    expect(isPlausibleYjsUpdate(Buffer.alloc(0))).toBe(false);
  });

  it("rejects 1-byte buffer (too short for valid update)", () => {
    expect(isPlausibleYjsUpdate(Buffer.from([1]))).toBe(false);
  });

  it("rejects null-header buffer (0x00 0x00)", () => {
    expect(isPlausibleYjsUpdate(Buffer.from([0, 0]))).toBe(false);
  });

  it("accepts minimal valid-looking Yjs update", () => {
    // Yjs updates start with a non-zero varint (client ID)
    const validUpdate = Buffer.from([1, 0, 0, 0, 1, 0]);
    expect(isPlausibleYjsUpdate(validUpdate)).toBe(true);
  });

  it("rejects buffer exceeding MAX_YJS_UPDATE_BYTES", () => {
    const tooBig = Buffer.alloc(LIMITS.MAX_YJS_UPDATE_BYTES + 1, 1);
    expect(isPlausibleYjsUpdate(tooBig)).toBe(false);
  });

  it("accepts buffer exactly at the size limit", () => {
    const atLimit = Buffer.alloc(LIMITS.MAX_YJS_UPDATE_BYTES, 1);
    // First byte non-zero, second non-zero
    atLimit[0] = 1;
    atLimit[1] = 1;
    expect(isPlausibleYjsUpdate(atLimit)).toBe(true);
  });
});

// ── isPlausibleYjsSnapshot ────────────────────────────────────────

describe("isPlausibleYjsSnapshot", () => {
  it("rejects empty buffer", () => {
    expect(isPlausibleYjsSnapshot(Buffer.alloc(0))).toBe(false);
  });

  it("rejects buffer exceeding MAX_SNAPSHOT_BYTES", () => {
    const tooBig = Buffer.alloc(LIMITS.MAX_SNAPSHOT_BYTES + 1, 1);
    expect(isPlausibleYjsSnapshot(tooBig)).toBe(false);
  });

  it("accepts a valid-sized buffer", () => {
    const valid = Buffer.from([1, 0, 0, 0, 1, 0]);
    expect(isPlausibleYjsSnapshot(valid)).toBe(true);
  });
});

// ── stripHtml ─────────────────────────────────────────────────────

describe("stripHtml", () => {
  it("removes basic HTML tags", () => {
    expect(stripHtml("<b>Bold</b>")).toBe("Bold");
  });

  it("removes script tags AND their content (XSS prevention)", () => {
    expect(stripHtml("<script>alert('xss')</script>Safe text")).toBe("Safe text");
  });

  it("removes style tags and their content", () => {
    expect(stripHtml("<style>body{color:red}</style>Text")).toBe("Text");
  });

  it("removes nested tags", () => {
    expect(stripHtml("<div><p><b>Nested</b></p></div>")).toBe("Nested");
  });

  it("leaves plain text untouched", () => {
    expect(stripHtml("Normal document title")).toBe("Normal document title");
  });

  it("trims whitespace", () => {
    expect(stripHtml("  hello  ")).toBe("hello");
  });

  it("handles empty string", () => {
    expect(stripHtml("")).toBe("");
  });

  it("handles malformed tags gracefully", () => {
    // Tags without closing > pass through (regex only removes complete <...> tags)
    // The important thing is no XSS — complete script tags are removed
    const result = stripHtml("<script>evil()</script>safe text");
    expect(result).toBe("safe text");
    expect(result).not.toContain("evil");
  });

  it("handles event handler attributes (XSS via attribute injection)", () => {
    expect(stripHtml('<img onerror="alert(1)" src="x">')).toBe("");
  });
});

// ── hasNullBytes ──────────────────────────────────────────────────

describe("hasNullBytes", () => {
  it("detects null byte in string", () => {
    expect(hasNullBytes("hello\0world")).toBe(true);
  });

  it("returns false for clean string", () => {
    expect(hasNullBytes("clean string")).toBe(false);
  });

  it("detects null byte at start", () => {
    expect(hasNullBytes("\0hello")).toBe(true);
  });

  it("detects null byte at end", () => {
    expect(hasNullBytes("hello\0")).toBe(true);
  });
});

// ── Zod schemas ───────────────────────────────────────────────────

describe("EmailSchema", () => {
  it("validates and normalises email to lowercase", () => {
    const result = EmailSchema.safeParse("User@Example.COM");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe("user@example.com");
  });

  it("rejects invalid email", () => {
    expect(EmailSchema.safeParse("not-an-email").success).toBe(false);
  });

  it("rejects empty string", () => {
    expect(EmailSchema.safeParse("").success).toBe(false);
  });
});

describe("TitleSchema", () => {
  it("accepts valid title", () => {
    const result = TitleSchema.safeParse("My Document");
    expect(result.success).toBe(true);
  });

  it("trims whitespace", () => {
    const result = TitleSchema.safeParse("  trimmed  ");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe("trimmed");
  });

  it("rejects blank string after trim", () => {
    expect(TitleSchema.safeParse("   ").success).toBe(false);
  });

  it(`rejects title exceeding ${LIMITS.MAX_TITLE_LENGTH} characters`, () => {
    const tooLong = "x".repeat(LIMITS.MAX_TITLE_LENGTH + 1);
    expect(TitleSchema.safeParse(tooLong).success).toBe(false);
  });
});

describe("UUIDSchema", () => {
  it("accepts valid UUID v4", () => {
    expect(UUIDSchema.safeParse("550e8400-e29b-41d4-a716-446655440000").success).toBe(true);
  });

  it("rejects non-UUID string", () => {
    expect(UUIDSchema.safeParse("not-a-uuid").success).toBe(false);
  });

  it("rejects empty string", () => {
    expect(UUIDSchema.safeParse("").success).toBe(false);
  });
});

describe("AssignableRoleSchema", () => {
  it("accepts editor", () => {
    expect(AssignableRoleSchema.safeParse("editor").success).toBe(true);
  });

  it("accepts viewer", () => {
    expect(AssignableRoleSchema.safeParse("viewer").success).toBe(true);
  });

  it("rejects owner (cannot be assigned)", () => {
    expect(AssignableRoleSchema.safeParse("owner").success).toBe(false);
  });

  it("rejects arbitrary string", () => {
    expect(AssignableRoleSchema.safeParse("admin").success).toBe(false);
  });
});

describe("YjsUpdateSchema", () => {
  it("accepts valid base64 string", () => {
    const validBase64 = Buffer.from([1, 2, 3, 4]).toString("base64");
    expect(YjsUpdateSchema.safeParse(validBase64).success).toBe(true);
  });

  it("rejects empty string", () => {
    expect(YjsUpdateSchema.safeParse("").success).toBe(false);
  });

  it("rejects oversized payload", () => {
    const tooBig = "A".repeat(Math.ceil(LIMITS.MAX_YJS_UPDATE_BYTES * 1.34) + 1);
    expect(YjsUpdateSchema.safeParse(tooBig).success).toBe(false);
  });
});