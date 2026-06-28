import Link from "next/link";
import { WifiOff, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function OfflinePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex flex-col items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-10 max-w-md w-full text-center space-y-6">
        {/* Icon */}
        <div className="h-16 w-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto">
          <WifiOff className="h-8 w-8 text-slate-400" />
        </div>

        {/* Copy */}
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-slate-900">You&apos;re offline</h1>
          <p className="text-slate-500 text-sm leading-relaxed">
            CollabDocs saves all your work locally in the browser. You can
            keep editing any document you&apos;ve previously opened — changes
            will sync automatically when you reconnect.
          </p>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-3">
          <Button onClick={() => window.location.reload()} className="w-full">
            Try again
          </Button>
          <Button variant="outline" asChild className="w-full">
            <Link href="/dashboard">
              Go to my documents
            </Link>
          </Button>
        </div>

        {/* Brand */}
        <div className="flex items-center justify-center gap-1.5 text-xs text-slate-400 pt-2">
          <FileText className="h-3.5 w-3.5" />
          <span>CollabDocs — works offline, always</span>
        </div>
      </div>
    </div>
  );
}
