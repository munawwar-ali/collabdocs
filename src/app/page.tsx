import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  FileText, Wifi, WifiOff, Users, Clock,
  Sparkles, Shield, ArrowRight, GitFork, ExternalLink, Check,
} from "lucide-react";

const FEATURES = [
  {
    icon: <WifiOff className="h-5 w-5 text-blue-600" />,
    title: "Works Offline",
    desc: "Open, edit, and save documents with zero network requests. Your browser is the primary source of truth.",
    bg: "bg-blue-50",
  },
  {
    icon: <Wifi className="h-5 w-5 text-green-600" />,
    title: "Smart Background Sync",
    desc: "When you reconnect, CRDT-based conflict resolution merges everyone's changes — no data lost, ever.",
    bg: "bg-green-50",
  },
  {
    icon: <Users className="h-5 w-5 text-purple-600" />,
    title: "Real-Time Collaboration",
    desc: "See collaborator cursors live. Owner, Editor and Viewer roles enforced end-to-end.",
    bg: "bg-purple-50",
  },
  {
    icon: <Clock className="h-5 w-5 text-orange-600" />,
    title: "Version Time-Travel",
    desc: "Save named snapshots and restore any past state — safely, without corrupting active collaborators.",
    bg: "bg-orange-50",
  },
  {
    icon: <Sparkles className="h-5 w-5 text-pink-600" />,
    title: "AI Writing Assistant",
    desc: "Continue writing, fix grammar, translate, or summarise — all streamed in real time via Groq.",
    bg: "bg-pink-50",
  },
  {
    icon: <Shield className="h-5 w-5 text-slate-600" />,
    title: "Secure by Default",
    desc: "Row-level security, JWT auth, payload size limits and rate limiting baked in from day one.",
    bg: "bg-slate-50",
  },
];

const HOW_IT_WORKS = [
  { step: "1", title: "Open a document", desc: "Loaded instantly from IndexedDB — zero network requests blocking the UI." },
  { step: "2", title: "Edit offline or online", desc: "Every keystroke is a Yjs CRDT operation persisted locally in milliseconds." },
  { step: "3", title: "Reconnect & sync", desc: "Background sync engine flushes your queue; remote changes merge in automatically." },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Nav */}
      <nav className="border-b bg-white/90 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2" aria-label="CollabDocs home">
            <FileText className="h-5 w-5 text-blue-600" aria-hidden="true" />
            <span className="font-bold text-slate-900">CollabDocs</span>
          </Link>
          <div className="flex items-center gap-2">
            <Link href="/login">
              <Button variant="ghost" size="sm">Sign in</Button>
            </Link>
            <Link href="/register">
              <Button size="sm">Get started free</Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-4 pt-20 pb-16 text-center">
        <div className="inline-flex items-center gap-2 bg-blue-50 text-blue-700 text-xs font-semibold px-3 py-1.5 rounded-full mb-6 border border-blue-100">
          <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" aria-hidden="true" />
          Local-First · Real-Time · Conflict-Free
        </div>

        <h1 className="text-5xl sm:text-6xl font-extrabold text-slate-900 leading-tight mb-5 tracking-tight">
          Collaborate on docs
          <span className="block text-blue-600">even without internet</span>
        </h1>

        <p className="text-lg text-slate-500 max-w-2xl mx-auto mb-8 leading-relaxed">
          CollabDocs is a local-first document editor built on{" "}
          <strong className="text-slate-700">Yjs CRDTs</strong>. Edit offline seamlessly,
          sync automatically when back online, and never lose a keystroke to a merge conflict.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center mb-6">
          <Link href="/register">
            <Button size="lg" className="gap-2 px-8 shadow-md shadow-blue-200">
              Start writing for free
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          </Link>
          <Link href="/login">
            <Button size="lg" variant="outline" className="px-8">
              Sign in
            </Button>
          </Link>
        </div>

        {/* Trust badges */}
        <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-slate-500">
          {["No credit card required", "Works offline", "Open source friendly"].map((t) => (
            <span key={t} className="flex items-center gap-1.5">
              <Check className="h-3.5 w-3.5 text-green-500" aria-hidden="true" />
              {t}
            </span>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="bg-slate-50 border-y py-16">
        <div className="max-w-6xl mx-auto px-4">
          <h2 className="text-2xl font-bold text-center text-slate-900 mb-10">
            How local-first works
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
            {HOW_IT_WORKS.map((item) => (
              <div key={item.step} className="text-center">
                <div className="h-10 w-10 rounded-full bg-blue-600 text-white font-bold text-lg flex items-center justify-center mx-auto mb-3">
                  {item.step}
                </div>
                <h3 className="font-semibold text-slate-900 mb-1">{item.title}</h3>
                <p className="text-slate-500 text-sm leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-6xl mx-auto px-4 py-16">
        <h2 className="text-2xl font-bold text-center text-slate-900 mb-10">
          Everything you need
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-xl border border-slate-200 p-5 hover:shadow-md transition-shadow bg-white">
              <div className={`h-9 w-9 rounded-lg ${f.bg} flex items-center justify-center mb-3`}>
                {f.icon}
              </div>
              <h3 className="font-semibold text-slate-900 mb-1.5">{f.title}</h3>
              <p className="text-slate-500 text-sm leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="bg-blue-600 py-14">
        <div className="max-w-xl mx-auto px-4 text-center">
          <h2 className="text-2xl font-bold text-white mb-3">
            Ready to write without limits?
          </h2>
          <p className="text-blue-100 mb-6 text-sm">
            Free forever. No credit card. Works the moment you open a document.
          </p>
          <Link href="/register">
            <Button size="lg" variant="secondary" className="gap-2 shadow-lg">
              Create your account
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t bg-white py-8">
        <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <FileText className="h-4 w-4 text-blue-500" aria-hidden="true" />
            <span>CollabDocs · Built by</span>
            <span className="font-semibold text-slate-800">Munawwar Ali</span>
          </div>
          <div className="flex items-center gap-4">
            <a href="https://github.com/munawwar-ali" target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 transition-colors">
              <GitFork className="h-4 w-4" aria-hidden="true" />
              GitHub
            </a>
            <a href="https://www.linkedin.com/in/munawwar-ali-developer/" target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 transition-colors">
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
              LinkedIn
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
