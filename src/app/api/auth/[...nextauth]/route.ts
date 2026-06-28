/**
 * Auth.js catch-all route handler.
 * Handles: /api/auth/signin, /api/auth/signout, /api/auth/callback/google, etc.
 */
import { handlers } from "@/lib/auth";

export const { GET, POST } = handlers;
