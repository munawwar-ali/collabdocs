import Link from "next/link";
import { FileQuestion } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="text-center space-y-5 max-w-sm">
        <div className="h-16 w-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto">
          <FileQuestion className="h-8 w-8 text-slate-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 mb-1">Page not found</h1>
          <p className="text-slate-500 text-sm">
            This document doesn&apos;t exist or you don&apos;t have access to it.
          </p>
        </div>
        <div className="flex gap-3 justify-center">
          <Button asChild>
            <Link href="/dashboard">Back to dashboard</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/">Home</Link>
          </Button>
        </div>
        {/* Footer attribution */}
        <p className="text-xs text-slate-400 pt-4">
          CollabDocs · Built by{" "}
          <a href="https://github.com/munawwar-ali" target="_blank" rel="noopener noreferrer"
            className="underline hover:text-slate-600">Munawwar Ali</a>
          {" "}·{" "}
          <a href="https://www.linkedin.com/in/munawwar-ali-developer/" target="_blank" rel="noopener noreferrer"
            className="underline hover:text-slate-600">LinkedIn</a>
        </p>
      </div>
    </div>
  );
}
