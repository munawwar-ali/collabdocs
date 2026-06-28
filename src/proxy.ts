/**
 * Next.js Middleware — Route Protection
 *
 * Runs on every request BEFORE it reaches the page or API route.
 * This is the first line of defense for authentication.
 *
 * ROUTE MATRIX:
 * - /login, /register          → public (redirect to dashboard if already authed)
 * - /api/auth/**               → public (Auth.js handles its own auth)
 * - /api/auth/register         → public (sign-up endpoint)
 * - /dashboard, /editor/**     → protected (redirect to /login if not authed)
 * - /api/documents/**, /api/sync/**, /api/ai/** → protected (return 401)
 * - /                          → public (landing page)
 */

import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { LIMITS } from "@/lib/security";

// Routes that require authentication
const PROTECTED_ROUTES = ["/dashboard", "/editor", "/documents"];

// API routes that require authentication
const PROTECTED_API_ROUTES = ["/api/documents", "/api/sync", "/api/ai"];

// Auth routes — redirect to dashboard if already logged in
const AUTH_ROUTES = ["/login", "/register"];

export default auth((req: NextRequest & { auth: { user?: { id?: string } } | null }) => {
  const { pathname } = req.nextUrl;

  // ── Global OOM guard: reject oversized bodies on all API routes ─────
  // Content-Length can be spoofed but provides a fast-path rejection.
  // Actual body size is re-checked in each route handler.
  if (pathname.startsWith("/api/")) {
    const contentLength = req.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > LIMITS.MAX_BODY_BYTES) {
      return NextResponse.json(
        { error: "Request payload is too large" },
        { status: 413 }
      );
    }
  }

  const session = req.auth;
  const isAuthenticated = !!session?.user?.id;

  // ── Protected API routes → 401 if not authenticated ──────────
  if (PROTECTED_API_ROUTES.some((route) => pathname.startsWith(route))) {
    if (!isAuthenticated) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }
    return NextResponse.next();
  }

  // ── Auth pages → redirect to dashboard if already logged in ──
  if (AUTH_ROUTES.some((route) => pathname.startsWith(route))) {
    if (isAuthenticated) {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }
    return NextResponse.next();
  }

  // ── Protected pages → redirect to login if not authenticated ─
  if (PROTECTED_ROUTES.some((route) => pathname.startsWith(route))) {
    if (!isAuthenticated) {
      const loginUrl = new URL("/login", req.url);
      loginUrl.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(loginUrl);
    }
    return NextResponse.next();
  }

  return NextResponse.next();
});

export const config = {
  // Run middleware on all routes except static files and Next.js internals
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
