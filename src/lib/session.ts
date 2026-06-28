/**
 * Server-Side Auth Helpers
 *
 * Thin wrappers around Auth.js `auth()` for use in:
 * - Server Components (RSC)
 * - API Route handlers
 * - Server Actions
 *
 * Never import from this file in client components — use the
 * `useSession()` hook from next-auth/react instead.
 */

import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

/**
 * Get the current session in a Server Component or API route.
 * Returns null if the user is not authenticated.
 */
export async function getCurrentSession() {
  const session = await auth();
  return session;
}

/**
 * Get the current user ID. Throws if not authenticated.
 * Use this in API routes after middleware has already verified auth.
 */
export async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }
  return session.user.id;
}

/**
 * API route helper: get user ID or return a 401 response.
 *
 * Usage in API routes:
 *   const { userId, response } = await getAuthOrUnauthorized();
 *   if (response) return response; // early return on 401
 *   // userId is guaranteed to be a string here
 */
export async function getAuthOrUnauthorized(): Promise<
  { userId: string; response: null } | { userId: null; response: NextResponse }
> {
  const session = await auth();
  if (!session?.user?.id) {
    return {
      userId: null,
      response: NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      ),
    };
  }
  return { userId: session.user.id, response: null };
}
