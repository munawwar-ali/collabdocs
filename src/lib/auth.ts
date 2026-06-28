/**
 * Auth.js v5 Configuration
 *
 * Supports two authentication strategies:
 * 1. Google OAuth — one-click sign-in, no password management
 * 2. Credentials — email + bcrypt-hashed password (stored in users.password_hash)
 *
 * The Drizzle adapter persists sessions and OAuth accounts to PostgreSQL,
 * so users stay logged in across server restarts and deployments.
 *
 * SECURITY NOTES:
 * - Passwords are hashed with bcrypt (cost factor 12) — never stored in plaintext
 * - JWT strategy is used for session tokens (stateless, scales horizontally)
 * - Session token is httpOnly cookie — inaccessible to JavaScript
 * - AUTH_SECRET must be set in production (crashes intentionally if missing)
 */

import NextAuth from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db } from "@/db";
import { users, accounts, sessions, verificationTokens } from "@/db/schema";

export const { handlers, auth, signIn, signOut } = NextAuth({
  // Drizzle adapter — persists OAuth accounts & sessions to PostgreSQL
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),

  // JWT strategy — stateless sessions, no DB hit on every request
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },

  providers: [
    // ── Google OAuth ────────────────────────────────────────────
    GoogleProvider({
      clientId: process.env.AUTH_GOOGLE_ID!,
      clientSecret: process.env.AUTH_GOOGLE_SECRET!,
      authorization: {
        params: {
          // Request offline access for refresh tokens
          access_type: "offline",
          prompt: "consent",
        },
      },
    }),

    // ── Email + Password ─────────────────────────────────────────
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },

      async authorize(credentials) {
        // Validate inputs exist
        if (!credentials?.email || !credentials?.password) {
          throw new Error("Email and password are required");
        }

        const email = String(credentials.email).toLowerCase().trim();
        const password = String(credentials.password);

        // Look up user by email
        const [user] = await db
          .select({
            id: users.id,
            email: users.email,
            name: users.name,
            image: users.image,
            passwordHash: users.passwordHash,
            isActive: users.isActive,
          })
          .from(users)
          .where(eq(users.email, email))
          .limit(1);

        // User not found — use generic message to prevent email enumeration
        if (!user) {
          throw new Error("Invalid email or password");
        }

        // Account is deactivated
        if (!user.isActive) {
          throw new Error("Account is disabled. Please contact support.");
        }

        // OAuth-only user trying to use credentials
        if (!user.passwordHash) {
          throw new Error(
            "This account uses Google sign-in. Please sign in with Google."
          );
        }

        // Verify password
        const passwordMatch = await bcrypt.compare(password, user.passwordHash);
        if (!passwordMatch) {
          throw new Error("Invalid email or password");
        }

        // Return the user object — Auth.js will create a JWT from this
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
        };
      },
    }),
  ],

  // ── Callbacks ───────────────────────────────────────────────────
  callbacks: {
    /**
     * JWT callback — runs when token is created or refreshed.
     * We embed the user ID into the token so we don't need a DB
     * lookup on every authenticated request.
     */
    async jwt({ token, user }) {
      if (user?.id) {
        token.id = user.id;
      }
      return token;
    },

    /**
     * Session callback — shapes what `auth()` returns to the app.
     * Never put sensitive data (passwordHash, etc.) here.
     */
    async session({ session, token }) {
      if (token.id && session.user) {
        session.user.id = token.id as string;
      }
      return session;
    },
  },

  // ── Custom pages ────────────────────────────────────────────────
  pages: {
    signIn: "/login",
    error: "/auth/error",
  },

  // ── Debug ───────────────────────────────────────────────────────
  debug: process.env.NODE_ENV === "development",
});
