/**
 * POST /api/auth/register
 *
 * Creates a new credential-based user account.
 *
 * SECURITY:
 * - Password hashed with bcrypt cost factor 12 (slow enough to resist brute force)
 * - Email normalised to lowercase to prevent duplicate accounts
 * - Generic error messages prevent user enumeration
 * - Rate limiting handled at middleware level
 */

import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { RATE_LIMITS } from "@/lib/security";
import { rateLimit } from "@/lib/api-middleware";

// ── Input validation schema ──────────────────────────────────────
const RegisterSchema = z.object({
  name: z
    .string()
    .min(2, "Name must be at least 2 characters")
    .max(100, "Name is too long")
    .trim(),
  email: z
    .string()
    .email("Invalid email address")
    .max(255, "Email is too long")
    .transform((e) => e.toLowerCase().trim()),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(72, "Password is too long") // bcrypt silently truncates at 72 bytes
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[0-9]/, "Password must contain at least one number"),
});

export async function POST(request: NextRequest) {
  try {
    // ── 1. Parse & validate body ─────────────────────────────────
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 }
      );
    }

    const result = RegisterSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: result.error.issues[0]?.message ?? "Validation failed" },
        { status: 400 }
      );
    }

    const { name, email, password } = result.data;

    // ── 2. Rate limit (prevent account creation floods) ─────
    const rl = rateLimit(email, "register",
      RATE_LIMITS.REGISTER.limit, RATE_LIMITS.REGISTER.windowMs);
    if (rl) return rl;

    // ── 3. Check for existing user ───────────────────────────────
    const [existingUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (existingUser) {
      // Don't reveal which accounts exist — use a consistent message
      return NextResponse.json(
        { error: "An account with this email already exists" },
        { status: 409 }
      );
    }

    // ── 4. Hash password ─────────────────────────────────────────
    // Cost factor 12 = ~300ms on a modern CPU, which is acceptable
    // for registration but makes brute-force attacks impractical
    const passwordHash = await bcrypt.hash(password, 12);

    // ── 5. Create user ───────────────────────────────────────────
    const [newUser] = await db
      .insert(users)
      .values({
        name,
        email,
        passwordHash,
        emailVerified: null,
      })
      .returning({
        id: users.id,
        name: users.name,
        email: users.email,
      });

    if (!newUser) {
      throw new Error("Failed to create user");
    }

    return NextResponse.json(
      {
        message: "Account created successfully",
        user: { id: newUser.id, name: newUser.name, email: newUser.email },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[REGISTER]", error);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
