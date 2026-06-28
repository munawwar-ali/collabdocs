import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { SessionProvider } from "@/components/layout/session-provider";
import { ServiceWorkerProvider } from "@/components/layout/service-worker-provider";
import { ToastProvider } from "@/components/ui/toast";
import { SkipToContent } from "@/components/layout/skip-to-content";
import "./globals.css";

export const metadata: Metadata = {
  title: "CollabDocs — Local-First Collaborative Editor",
  description:
    "A real-time, offline-capable document editor with deterministic conflict resolution and granular version control.",
  keywords: ["document editor", "collaboration", "offline-first", "real-time"],
  authors: [{ name: "Munawwar Ali" }],
  manifest: "/manifest.json",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await auth();

  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased min-h-screen bg-background font-sans">
        <SessionProvider session={session}>
          <SkipToContent />
          <ToastProvider>
            <ServiceWorkerProvider />
            {children}
          </ToastProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
