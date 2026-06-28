"use client";

/**
 * SessionProvider wraps the app so client components can call `useSession()`.
 * This is a thin pass-through — the real session is fetched server-side in
 * the root layout and passed as `session` prop.
 */
import { SessionProvider as NextAuthSessionProvider } from "next-auth/react";
import type { Session } from "next-auth";

export function SessionProvider({
  children,
  session,
}: {
  children: React.ReactNode;
  session: Session | null;
}) {
  return (
    <NextAuthSessionProvider session={session}>
      {children}
    </NextAuthSessionProvider>
  );
}
