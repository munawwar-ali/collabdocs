/**
 * API Middleware Utilities
 *
 * Reusable guards for every API route:
 * - Payload size enforcement (OOM protection)
 * - Zod validation wrapper
 * - Standardised error responses
 * - Simple in-memory rate limiter (per user, per endpoint)
 */

import { NextRequest, NextResponse } from "next/server";
import { z, ZodSchema } from "zod";

// ── Constants (re-exported from security.ts for backward compat) ──
export { LIMITS } from "@/lib/security";
export const MAX_PAYLOAD_BYTES = 1 * 1024 * 1024; // 1 MB hard limit
export const MAX_TITLE_LENGTH = 500;
export const MAX_LABEL_LENGTH = 200;
export const MAX_DESCRIPTION_LENGTH = 2000;

// ── Standardised API responses ───────────────────────────────────

export function ok<T>(data: T, status = 200): NextResponse {
  return NextResponse.json({ data }, { status });
}

export function created<T>(data: T): NextResponse {
  return NextResponse.json({ data }, { status: 201 });
}

export function badRequest(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 400 });
}

export function unauthorized(message = "Authentication required"): NextResponse {
  return NextResponse.json({ error: message }, { status: 401 });
}

export function forbidden(message = "Access denied"): NextResponse {
  return NextResponse.json({ error: message }, { status: 403 });
}

export function notFound(message = "Not found"): NextResponse {
  return NextResponse.json({ error: message }, { status: 404 });
}

export function conflict(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 409 });
}

export function payloadTooLarge(): NextResponse {
  return NextResponse.json(
    { error: `Payload exceeds maximum size of ${MAX_PAYLOAD_BYTES / 1024}KB` },
    { status: 413 }
  );
}

export function tooManyRequests(): NextResponse {
  return NextResponse.json(
    { error: "Too many requests. Please slow down." },
    { status: 429 }
  );
}

export function serverError(error: unknown): NextResponse {
  // Log full error server-side but never expose internals to client
  console.error("[API ERROR]", error);
  return NextResponse.json(
    { error: "An unexpected error occurred" },
    { status: 500 }
  );
}

// ── Payload size guard ───────────────────────────────────────────

/**
 * Reject requests whose Content-Length exceeds MAX_PAYLOAD_BYTES.
 * This is a defence against OOM attacks where a malicious client
 * sends a giant sync payload to crash the server.
 *
 * NOTE: Content-Length can be spoofed, so we also enforce limits
 * when reading the body (see parseJsonBody).
 */
export function checkPayloadSize(request: NextRequest): NextResponse | null {
  const contentLength = request.headers.get("content-length");
  if (contentLength && parseInt(contentLength, 10) > MAX_PAYLOAD_BYTES) {
    return payloadTooLarge();
  }
  return null;
}

/**
 * Parse JSON body with a hard size cap.
 * Returns [data, null] on success or [null, errorResponse] on failure.
 */
export async function parseJsonBody<T>(
  request: NextRequest,
  schema: ZodSchema<T>
): Promise<[T, null] | [null, NextResponse]> {
  // Check Content-Length header first (fast path)
  const sizeError = checkPayloadSize(request);
  if (sizeError) return [null, sizeError];

  // Read body as text and enforce size limit on actual bytes
  let text: string;
  try {
    // Read as ArrayBuffer to count actual bytes, not characters
    const buffer = await request.arrayBuffer();
    if (buffer.byteLength > MAX_PAYLOAD_BYTES) {
      return [null, payloadTooLarge()];
    }
    text = new TextDecoder().decode(buffer);
  } catch {
    return [null, badRequest("Failed to read request body")];
  }

  // Parse JSON
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return [null, badRequest("Invalid JSON")];
  }

  // Validate schema
  const result = schema.safeParse(raw);
  if (!result.success) {
    const message = result.error.issues[0]?.message ?? "Validation failed";
    return [null, badRequest(message)];
  }

  return [result.data, null];
}

// ── In-memory rate limiter ───────────────────────────────────────

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

// Map of "userId:endpoint" → rate limit state
const rateLimitStore = new Map<string, RateLimitEntry>();

// Clean up expired entries every 5 minutes to prevent memory leak
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.resetAt < now) rateLimitStore.delete(key);
  }
}, 5 * 60 * 1000);

/**
 * Simple sliding-window rate limiter.
 *
 * @param userId  - The authenticated user's ID
 * @param endpoint - Identifier for the endpoint (e.g. "sync", "ai")
 * @param limit   - Max requests allowed in the window
 * @param windowMs - Window duration in milliseconds
 * @returns null if allowed, NextResponse (429) if rate limited
 */
export function rateLimit(
  userId: string,
  endpoint: string,
  limit: number,
  windowMs: number
): NextResponse | null {
  const key = `${userId}:${endpoint}`;
  const now = Date.now();

  const entry = rateLimitStore.get(key);

  if (!entry || entry.resetAt < now) {
    // New window
    rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
    return null;
  }

  if (entry.count >= limit) {
    return tooManyRequests();
  }

  entry.count++;
  return null;
}

// ── Route error boundary ─────────────────────────────────────────

/**
 * Wrap an API handler to catch unhandled errors and return clean 500s.
 * Also translates known error messages to appropriate HTTP status codes.
 */
export function withErrorBoundary(
  handler: (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<NextResponse>
) {
  return async (
    req: NextRequest,
    ctx: { params: Promise<Record<string, string>> }
  ): Promise<NextResponse> => {
    try {
      return await handler(req, ctx);
    } catch (error) {
      if (error instanceof Error) {
        // Translate known domain errors to HTTP codes
        if (error.message === "Unauthorized") return unauthorized();
        if (error.message === "Access denied") return forbidden();
        if (error.message.includes("not found")) return notFound(error.message);
        if (error.message.includes("Only owners")) return forbidden(error.message);
        if (error.message.includes("Viewers cannot")) return forbidden(error.message);
        if (error.message.includes("already a member")) return conflict(error.message);
        if (error.message.includes("already exists")) return conflict(error.message);
      }
      return serverError(error);
    }
  };
}
