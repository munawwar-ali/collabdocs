import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { FileText, LayoutDashboard, Settings, LogOut, GitFork, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { SignOutButton } from "@/components/layout/sign-out-button";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const user = session.user;
  const initials = user.name
    ? user.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : user.email?.[0]?.toUpperCase() ?? "?";

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      {/* Top nav */}
      <header className="h-14 border-b bg-white flex items-center px-4 gap-4 sticky top-0 z-40">
        <Link href="/dashboard" className="flex items-center gap-2 mr-4">
          <FileText className="h-5 w-5 text-blue-600" />
          <span className="font-bold text-slate-900">CollabDocs</span>
        </Link>

        <nav className="flex items-center gap-1 flex-1">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/dashboard" className="gap-2">
              <LayoutDashboard className="h-4 w-4" />
              <span className="hidden sm:inline">Dashboard</span>
            </Link>
          </Button>
        </nav>

        {/* User menu */}
        <div className="flex items-center gap-2">
          <Avatar className="h-8 w-8">
            <AvatarImage src={user.image ?? undefined} alt={user.name ?? "User"} />
            <AvatarFallback className="text-xs bg-blue-100 text-blue-700">
              {initials}
            </AvatarFallback>
          </Avatar>
          <span className="text-sm text-slate-700 hidden sm:block font-medium">
            {user.name ?? user.email}
          </span>
          <SignOutButton />
        </div>
      </header>

      {/* Page content */}
      <main id="main-content" className="flex-1 max-w-6xl w-full mx-auto px-4 py-8">
        {children}
      </main>

      {/* Footer */}
      <footer className="border-t bg-white py-4">
        <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500">
          <div className="flex items-center gap-1">
            <FileText className="h-3 w-3" />
            <span>CollabDocs · Built by</span>
            <span className="font-semibold text-slate-700">Munawwar Ali</span>
          </div>
          <div className="flex items-center gap-3">
            <a
              href="https://github.com/munawwar-ali"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 hover:text-slate-800 transition-colors"
            >
              <GitFork className="h-3 w-3" />
              GitHub
            </a>
            <a
              href="https://www.linkedin.com/in/munawwar-ali-developer/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 hover:text-slate-800 transition-colors"
            >
              <ExternalLink className="h-3 w-3" />
              LinkedIn
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
