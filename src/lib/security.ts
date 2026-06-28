/**
 * Security Configuration & Validators
 *
 * Single source of truth for all security-related constants and
 * reusable Zod schemas. Every API route imports from here.
 *
 * THREAT MODEL:
 * 1. OOM via giant payloads     → MAX_PAYLOAD_BYTES + content-length check
 * 2. SQL injection              → Drizzle ORM parameterised queries (always)
 * 3. XSS via stored content     → Yjs binary (not HTML); TipTap sanitises
 * 4. CSRF                       → Auth.js handles; SameSite cookies
 * 5. Brute force auth           → bcrypt cost 12; rate limiter on /login
 * 6. Privilege escalation       → Role checked on every mutating query
 * 7. Tenant data leak           → RLS policies + ORM scoping
 * 8. Replay attacks             → Sequence numbers; idempotent CRDT ops
 * 9. Malformed Yjs payloads     → Binary length + header check
 * 10. DoS via flood of requests  → Per-user rate limits per endpoint
 */

import { z } from "zod";

// ── Payload size limits ──────────────────────────────────────────

export const LIMITS = {
  /** Hard cap on any request body (1 MB) */
  MAX_BODY_BYTES: 1 * 1024 * 1024,

  /** Max Yjs binary update size after base64 decode (512 KB) */
  MAX_YJS_UPDATE_BYTES: 512 * 1024,

  /** Max snapshot size (1 MB — full doc state) */
  MAX_SNAPSHOT_BYTES: 1 * 1024 * 1024,

  /** Document title */
  MAX_TITLE_LENGTH: 500,

  /** Version label */
  MAX_LABEL_LENGTH: 200,

  /** Version description */
  MAX_DESCRIPTION_LENGTH: 2000,

  /** User name */
  MAX_NAME_LENGTH: 100,

  /** Password (bcrypt silently truncates at 72) */
  MAX_PASSWORD_LENGTH: 72,

  /** Min password length */
  MIN_PASSWORD_LENGTH: 8,
} as const;

// ── Rate limit presets ───────────────────────────────────────────

export const RATE_LIMITS = {
  /** Sync push: high frequency (live typing) */
  SYNC_PUSH: { limit: 120, windowMs: 60_000 },

  /** Version create: occasional */
  VERSION_CREATE: { limit: 20, windowMs: 60_000 },

  /** Member invite: rare */
  MEMBER_INVITE: { limit: 10, windowMs: 60_000 },

  /** Auth register: very rare — strict */
  REGISTER: { limit: 5, windowMs: 15 * 60_000 },

  /** Document create */
  DOCUMENT_CREATE: { limit: 30, windowMs: 60_000 },

  /** AI assistant */
  AI_ASSIST: { limit: 20, windowMs: 60_000 },
} as const;

// ── Reusable Zod schemas ─────────────────────────────────────────

/** Safe document title */
export const TitleSchema = z
  .string()
  .min(1, "Title cannot be empty")
  .max(LIMITS.MAX_TITLE_LENGTH, `Title cannot exceed ${LIMITS.MAX_TITLE_LENGTH} characters`)
  .transform((t) => t.trim())
  .refine((t) => t.length > 0, "Title cannot be blank");

/** Version label */
export const LabelSchema = z
  .string()
  .min(1, "Label is required")
  .max(LIMITS.MAX_LABEL_LENGTH, `Label cannot exceed ${LIMITS.MAX_LABEL_LENGTH} characters`)
  .transform((l) => l.trim());

/** Optional description */
export const DescriptionSchema = z
  .string()
  .max(LIMITS.MAX_DESCRIPTION_LENGTH, `Description cannot exceed ${LIMITS.MAX_DESCRIPTION_LENGTH} characters`)
  .optional()
  .nullable();

/** Email — normalised to lowercase */
export const EmailSchema = z
  .string()
  .email("Invalid email address")
  .max(255, "Email is too long")
  .transform((e) => e.toLowerCase().trim());

/** UUID — for IDs passed in request bodies */
export const UUIDSchema = z.string().uuid("Invalid ID format");

/** Document role that can be assigned (owner cannot be assigned) */
export const AssignableRoleSchema = z.enum(["editor", "viewer"], {
  message: "Role must be 'editor' or 'viewer'",
});

/** Base64-encoded Yjs update */
export const YjsUpdateSchema = z
  .string()
  .min(4, "Update payload is too short")
  .max(
    Math.ceil(LIMITS.MAX_YJS_UPDATE_BYTES * 1.34),
    "Update payload is too large"
  )
  .refine((s) => {
    // Validate it's valid base64
    try {
      return /^[A-Za-z0-9+/]*={0,2}$/.test(s);
    } catch {
      return false;
    }
  }, "Update must be valid base64");

/** Base64-encoded Yjs snapshot (larger limit than updates) */
export const YjsSnapshotSchema = z
  .string()
  .min(4, "Snapshot data is too short")
  .max(
    Math.ceil(LIMITS.MAX_SNAPSHOT_BYTES * 1.34),
    "Snapshot is too large"
  );

/** Non-negative integer for sequence numbers */
export const SequenceNumberSchema = z
  .number()
  .int("Sequence number must be an integer")
  .min(0, "Sequence number must be non-negative");

// ── Yjs binary validation ────────────────────────────────────────

/**
 * Validate that a Buffer contains a plausibly valid Yjs update.
 *
 * Full structural validation is expensive (O(n) parse), so we do
 * a quick sanity check:
 * - Minimum 2 bytes (Yjs update header is at least 1 varint)
 * - Maximum size enforced separately
 *
 * The WS server does deeper validation by actually applying the
 * update to a Y.Doc in a try/catch.
 */
export function isPlausibleYjsUpdate(buffer: Buffer): boolean {
  if (buffer.byteLength < 2) return false;
  if (buffer.byteLength > LIMITS.MAX_YJS_UPDATE_BYTES) return false;
  // Yjs updates always start with a non-zero byte (client ID varint)
  if (buffer[0] === 0 && buffer[1] === 0) return false;
  return true;
}

/**
 * Validate that a Buffer is a plausible Yjs snapshot.
 * Snapshots are full state updates — same format but larger allowed.
 */
export function isPlausibleYjsSnapshot(buffer: Buffer): boolean {
  if (buffer.byteLength < 2) return false;
  if (buffer.byteLength > LIMITS.MAX_SNAPSHOT_BYTES) return false;
  return true;
}

// ── Security headers ─────────────────────────────────────────────

/**
 * Add security headers to an API response.
 * Next.js config adds them globally, but we add here for defence in depth.
 */
export function addSecurityHeaders(headers: Headers): void {
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Cache-Control", "no-store");
}

// ── Input sanitisation ───────────────────────────────────────────

/**
 * Strip any HTML from a string. Used for fields that might be
 * displayed as HTML (labels, descriptions, titles).
 * TipTap content is Yjs binary so XSS is not a concern there.
 */
export function stripHtml(input: string): string {
  // Remove script/style elements entirely including their content
  let result = input.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
  result = result.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
  // Remove remaining HTML tags (keep inner text of safe elements)
  result = result.replace(/<[^>]*>/g, "");
  return result.trim();
}

/**
 * Validate that a string contains no null bytes (SQL injection vector).
 */
export function hasNullBytes(input: string): boolean {
  return input.includes("\0");
}
