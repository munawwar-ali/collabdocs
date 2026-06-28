import Link from "next/link";
import { FileText } from "lucide-react";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 flex flex-col">
      {/* Header */}
      <header className="p-6">
        <Link href="/" className="inline-flex items-center gap-2 hover:opacity-80 transition-opacity">
          <FileText className="h-6 w-6 text-blue-600" />
          <span className="font-bold text-xl text-slate-900">CollabDocs</span>
        </Link>
      </header>

      {/* Content */}
      <main className="flex-1 flex items-center justify-center p-4">
        {children}
      </main>

      {/* Footer */}
      <footer className="p-6 text-center text-sm text-slate-500">
        Built by{" "}
        <a
          href="https://github.com/munawwar-ali"
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-slate-700 hover:underline"
        >
          Munawwar Ali
        </a>{" "}
        ·{" "}
        <a
          href="https://www.linkedin.com/in/munawwar-ali-developer/"
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-slate-700 hover:underline"
        >
          LinkedIn
        </a>
      </footer>
    </div>
  );
}
