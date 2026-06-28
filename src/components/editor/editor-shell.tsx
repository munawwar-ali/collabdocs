"use client";

/**
 * EditorShell
 *
 * The top-level client component for the editor page.
 * Orchestrates:
 * - Yjs document lifecycle (useYDoc)
 * - Title editing
 * - Sync status display
 * - Collaborator presence
 * - Version history panel
 * - Share/member management dialog
 * - AI assistant panel
 * - Offline/online transitions
 *
 * RENDER STRATEGY:
 * 1. Before IndexedDB is ready → skeleton loader (no layout shift)
 * 2. After IndexedDB ready    → full editor (from local state, 0 network)
 * 3. Background              → WebSocket connects, remote changes merge in
 */

import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Share2,
  History,
  Sparkles,
  FileText,
  GitFork,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useYDoc } from "@/hooks/use-ydoc";
import { CollaborativeEditor } from "./collaborative-editor";
import { SyncStatusBadge } from "@/components/collaboration/sync-status-badge";
import { CollaboratorAvatars } from "@/components/collaboration/collaborator-avatars";
import { VersionHistoryPanel } from "@/components/version-history/version-history-panel";
import { ShareDialog } from "@/components/editor/share-dialog";
import { AiAssistantPanel } from "@/components/editor/ai-assistant-panel";
import { DocumentTitleInput } from "@/components/editor/document-title-input";
import { KeyboardShortcutsButton } from "@/components/editor/keyboard-shortcuts";
import { OfflineBanner } from "@/components/collaboration/offline-banner";
import type { DocumentRole } from "@/types";
import type { Editor } from "@tiptap/react";

interface EditorShellProps {
  documentId: string;
  documentTitle: string;
  userRole: DocumentRole;
  userId: string;
  userName: string;
  userImage: string | null;
}

export function EditorShell({
  documentId,
  documentTitle,
  userRole,
  userId,
  userName,
  userImage,
}: EditorShellProps) {
  const [title, setTitle] = useState(documentTitle);
  const [isSavingTitle, setIsSavingTitle] = useState(false);
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [showAI, setShowAI] = useState(false);
  const [tiptapEditor, setTiptapEditor] = useState<Editor | null>(null);

  const isReadOnly = userRole === "viewer";

  // ── Yjs doc + WebSocket + IndexedDB ──────────────────────────
  const { doc, provider, syncStatus, isLocalReady, awareness, collaborators } =
    useYDoc({
      documentId,
      userId,
      userName,
      userImage,
      userRole,
    });

  // ── Title save ────────────────────────────────────────────────
  const handleTitleSave = useCallback(
    async (newTitle: string) => {
      if (newTitle === title || isReadOnly) return;
      setIsSavingTitle(true);
      try {
        const res = await fetch(`/api/documents/${documentId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: newTitle }),
        });
        if (res.ok) setTitle(newTitle);
      } catch {
        // Non-fatal: title will be re-fetched on next load
      } finally {
        setIsSavingTitle(false);
      }
    },
    [documentId, title, isReadOnly]
  );

  // ── Keyboard shortcuts ────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey) {
        if (e.key === "H") { e.preventDefault(); setShowVersionHistory((v) => !v); }
        if (e.key === "I") { e.preventDefault(); setShowAI((v) => !v); }
        if (e.key === "S") { e.preventDefault(); setShowShare((v) => !v); }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // ── Skeleton loader (before IndexedDB hydrates) ───────────────
  if (!isLocalReady || !doc) {
    return (
      <div className="min-h-screen flex flex-col bg-white">
        <EditorHeader
          title={title}
          isSavingTitle={false}
          isReadOnly={true}
          syncStatus="offline"
          collaborators={[]}
          onShowVersionHistory={() => {}}
          onShowShare={() => {}}
          onShowAI={() => {}}
          documentId={documentId}
          userRole={userRole}
        />
        <div className="flex-1 flex items-start justify-center pt-16 px-4">
          <div className="w-full max-w-4xl space-y-4 animate-pulse">
            <div className="h-8 bg-slate-100 rounded w-3/4" />
            <div className="h-4 bg-slate-100 rounded w-full" />
            <div className="h-4 bg-slate-100 rounded w-5/6" />
            <div className="h-4 bg-slate-100 rounded w-4/6" />
            <div className="h-4 bg-slate-100 rounded w-full" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-white">
      {/* Offline/reconnecting banner */}
      <OfflineBanner />

      {/* Header */}
      <EditorHeader
        title={title}
        isSavingTitle={isSavingTitle}
        isReadOnly={isReadOnly}
        syncStatus={syncStatus}
        collaborators={collaborators}
        onTitleSave={handleTitleSave}
        onShowVersionHistory={() => setShowVersionHistory(true)}
        onShowShare={() => setShowShare(true)}
        onShowAI={() => setShowAI((v) => !v)}
        documentId={documentId}
        userRole={userRole}
      />

      {/* Main area: editor + optional side panels */}
      <div className="flex-1 flex overflow-hidden">
        {/* Editor */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <CollaborativeEditor
            doc={doc}
            provider={provider}
            isReadOnly={isReadOnly}
            onEditorReady={setTiptapEditor}
          />
        </div>

        {/* AI panel (slide-in from right) */}
        {showAI && (
          <div className="w-80 border-l bg-slate-50 flex flex-col overflow-hidden">
            <AiAssistantPanel
              editor={tiptapEditor}
              documentId={documentId}
              onClose={() => setShowAI(false)}
            />
          </div>
        )}
      </div>

      {/* Version history panel (slide-over) */}
      {showVersionHistory && doc && (
        <VersionHistoryPanel
          documentId={documentId}
          doc={doc}
          userId={userId}
          userRole={userRole}
          onClose={() => setShowVersionHistory(false)}
        />
      )}

      {/* Share dialog */}
      {showShare && (
        <ShareDialog
          documentId={documentId}
          onClose={() => setShowShare(false)}
        />
      )}

      {/* Footer */}
      <footer className="border-t bg-white py-2 px-4">
        <div className="flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-1">
            <FileText className="h-3 w-3" />
            <span>CollabDocs · Built by</span>
            <span className="font-medium text-slate-600">Munawwar Ali</span>
          </div>
          <div className="flex items-center gap-3">
            <a href="https://github.com/munawwar-ali" target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 hover:text-slate-600 transition-colors">
              <GitFork className="h-3 w-3" /> GitHub
            </a>
            <a href="https://www.linkedin.com/in/munawwar-ali-developer/" target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 hover:text-slate-600 transition-colors">
              <ExternalLink className="h-3 w-3" /> LinkedIn
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

// ── Editor Header ─────────────────────────────────────────────────

interface EditorHeaderProps {
  title: string;
  isSavingTitle: boolean;
  isReadOnly: boolean;
  syncStatus: import("@/types").SyncStatus;
  collaborators: import("@/types").AwarenessState[];
  onTitleSave?: (title: string) => void;
  onShowVersionHistory: () => void;
  onShowShare: () => void;
  onShowAI: () => void;
  documentId: string;
  userRole: DocumentRole;
}

function EditorHeader({
  title,
  isSavingTitle,
  isReadOnly,
  syncStatus,
  collaborators,
  onTitleSave,
  onShowVersionHistory,
  onShowShare,
  onShowAI,
  userRole,
}: EditorHeaderProps) {
  return (
    <header className="h-14 border-b bg-white flex items-center px-4 gap-3 sticky top-0 z-30">
      {/* Back to dashboard */}
      <Link href="/dashboard">
        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Back to dashboard">
          <ArrowLeft className="h-4 w-4" />
        </Button>
      </Link>

      {/* Document title */}
      <div className="flex-1 min-w-0">
        <DocumentTitleInput
          title={title}
          isReadOnly={isReadOnly}
          isSaving={isSavingTitle}
          onSave={onTitleSave}
        />
      </div>

      {/* Right side controls */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Sync status */}
        <SyncStatusBadge status={syncStatus} />

        {/* Collaborator avatars */}
        <CollaboratorAvatars collaborators={collaborators} />

        {/* Keyboard shortcuts */}
        <KeyboardShortcutsButton />

        {/* AI assistant */}
        <Button
          variant="ghost"
          size="sm"
          onClick={onShowAI}
          className="gap-1.5 hidden sm:flex"
          title="AI Assistant (Ctrl+Shift+I)"
        >
          <Sparkles className="h-4 w-4 text-purple-500" />
          <span className="text-xs">AI</span>
        </Button>

        {/* Version history */}
        <Button
          variant="ghost"
          size="sm"
          onClick={onShowVersionHistory}
          className="gap-1.5 hidden sm:flex"
          title="Version History (Ctrl+Shift+H)"
        >
          <History className="h-4 w-4" />
          <span className="text-xs hidden md:inline">History</span>
        </Button>

        {/* Share — only owners can manage members */}
        {userRole === "owner" && (
          <Button
            size="sm"
            onClick={onShowShare}
            className="gap-1.5"
            title="Share (Ctrl+Shift+S)"
          >
            <Share2 className="h-4 w-4" />
            <span className="hidden sm:inline">Share</span>
          </Button>
        )}
      </div>
    </header>
  );
}
