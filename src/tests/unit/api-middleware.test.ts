/**
 * Unit Tests: API Middleware
 * Tests rate limiter, payload size checks, and response helpers.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { rateLimit } from "@/lib/api-middleware";

// ── rateLimit ─────────────────────────────────────────────────────

describe("rateLimit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("allows requests under the limit", () => {
    // 5 requests, limit is 10 — all should pass
    for (let i = 0; i < 5; i++) {
      const result = rateLimit("user-1", "test-endpoint-a", 10, 60_000);
      expect(result).toBeNull();
    }
  });

  it("blocks requests that exceed the limit", () => {
    const userId = "user-exceed";
    const endpoint = "test-endpoint-b";

    // Use up the limit
    for (let i = 0; i < 3; i++) {
      rateLimit(userId, endpoint, 3, 60_000);
    }

    // Next request should be blocked
    const result = rateLimit(userId, endpoint, 3, 60_000);
    expect(result).not.toBeNull();
    expect(result?.status).toBe(429);
  });

  it("resets after the window expires", () => {
    const userId = "user-reset";
    const endpoint = "test-endpoint-c";

    // Exhaust the limit
    for (let i = 0; i < 3; i++) {
      rateLimit(userId, endpoint, 3, 1000);
    }
    expect(rateLimit(userId, endpoint, 3, 1000)?.status).toBe(429);

    // Advance time past the window
    vi.advanceTimersByTime(1001);

    // Should be allowed again
    expect(rateLimit(userId, endpoint, 3, 1000)).toBeNull();
  });

  it("isolates limits per user", () => {
    // User A exhausts their limit
    for (let i = 0; i < 3; i++) {
      rateLimit("user-a", "shared-endpoint", 3, 60_000);
    }
    expect(rateLimit("user-a", "shared-endpoint", 3, 60_000)?.status).toBe(429);

    // User B should not be affected
    expect(rateLimit("user-b", "shared-endpoint", 3, 60_000)).toBeNull();
  });

  it("isolates limits per endpoint", () => {
    // Exhaust limit on endpoint-x
    for (let i = 0; i < 3; i++) {
      rateLimit("user-iso", "endpoint-x", 3, 60_000);
    }
    expect(rateLimit("user-iso", "endpoint-x", 3, 60_000)?.status).toBe(429);

    // endpoint-y should be independent
    expect(rateLimit("user-iso", "endpoint-y", 3, 60_000)).toBeNull();
  });
});