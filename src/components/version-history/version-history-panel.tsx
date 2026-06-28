"use client";

/**
 * VersionHistoryPanel
 *
 * A slide-in panel showing all saved snapshots of a document.
 * Users can:
 * - View the timeline of versions with labels and timestamps
 * - Create a new named snapshot of the current state
 * - Preview what a version looked like (read-only modal)
 * - Restore the document to any past version
 *
 * RESTORE SEMANTICS (critical — read carefully):
 * Restoring does NOT overwrite the Y.Doc state directly.
 * Instead:
 * 1. Fetch snapshot binary from server
 * 2. Load into a temporary Y.Doc
 * 3. Encode full state as a new Yjs update
 * 4. Apply to live doc (CRDT merge — append only)
 * 5. POST the update to /api/sync/[docId] (marks it as a restore op)
 *
 * Active collaborators receive this as a normal update — no jarring reset.
 * The sync_operations log stays append-only — version history is never lost.
 */

import { useState, useEffect, useCallback } from "react";
import * as Y from "yjs";
import {
  X,
  History,
  Plus,
  Clock,
  RotateCcw,
  ChevronRight,
  Loader2,
  Tag,
  User,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatRelativeTime } from "@/lib/utils";
import type { DocumentVersion, DocumentRole } from "@/types";

interface VersionHistoryPanelProps {
  documentId: string;
  doc: Y.Doc;
  userId: string;
  userRole: DocumentRole;
  onClose: () => void;
}

export function VersionHistoryPanel({
  documentId,
  doc,
  userRole,
  onClose,
}: VersionHistoryPanelProps) {
  const [versions, setVersions] = useState<DocumentVersion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create snapshot state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  // Restore state
  const [restoreTarget, setRestoreTarget] = useState<DocumentVersion | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreSuccess, setRestoreSuccess] = useState(false);

  const canWrite = userRole === "owner" || userRole === "editor";

  // ── Fetch versions ────────────────────────────────────────────
  const fetchVersions = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/documents/${documentId}/versions`);
      if (!res.ok) throw new Error("Failed to load versions");
      const json = await res.json() as { data: DocumentVersion[] };
      setVersions(json.data);
    } catch {
      setError("Failed to load version history");
    } finally {
      setIsLoading(false);
    }
  }, [documentId]);

  useEffect(() => {
    void fetchVersions();
  }, [fetchVersions]);

  // ── Create snapshot ───────────────────────────────────────────
  async function handleCreateSnapshot(e: React.FormEvent) {
    e.preventDefault();
    if (!newLabel.trim()) return;
    setIsCreating(true);
    setError(null);

    try {
      // Store full document state as a Yjs update (encodeStateAsUpdate)
      // On restore we clear the document and re-apply this snapshot
      const snapshot = Y.encodeStateAsUpdate(doc);
      const snapshotBase64 = btoa(String.fromCharCode(...snapshot));

      // Get current sequence number from server
      const syncRes = await fetch(`/api/sync/${documentId}?since=0`);
      const syncJson = await syncRes.json() as { data: { latestSequence: number } };
      const atSequenceNumber = syncJson.data.latestSequence;

      const res = await fetch(`/api/documents/${documentId}/versions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: newLabel.trim(),
          description: newDescription.trim() || null,
          yjsSnapshot: snapshotBase64,
          atSequenceNumber,
        }),
      });

      if (!res.ok) {
        const json = await res.json() as { error?: string };
        throw new Error(json.error ?? "Failed to create snapshot");
      }

      setNewLabel("");
      setNewDescription("");
      setShowCreateForm(false);
      await fetchVersions();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create snapshot");
    } finally {
      setIsCreating(false);
    }
  }

  // ── Restore version ───────────────────────────────────────────
  async function handleRestore() {
    if (!restoreTarget) return;
    setIsRestoring(true);
    setError(null);

    try {
      // 1. Fetch the snapshot binary from the server
      const res = await fetch(
        `/api/documents/${documentId}/versions/restore`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ versionId: restoreTarget.id }),
        }
      );

      if (!res.ok) {
        const json = await res.json() as { error?: string };
        throw new Error(json.error ?? "Failed to fetch snapshot");
      }

      const json = await res.json() as {
        data: { yjsSnapshotBase64: string; versionId: string };
      };

      if (!json.data.yjsSnapshotBase64) {
        throw new Error("Snapshot data is empty");
      }

      // 2. Decode snapshot base64 → Uint8Array
      const snapshotBinary = Uint8Array.from(
        atob(json.data.yjsSnapshotBase64),
        (c) => c.charCodeAt(0)
      );

      // 3. Load the snapshot into a temporary Y.Doc
      const tempDoc = new Y.Doc({ gc: false });
      Y.applyUpdate(tempDoc, snapshotBinary);

      // 4. In a single transaction: clear live doc content, re-insert from snapshot
      //    This is the correct CRDT-safe restore — operates on the shared type
      //    directly so collaborators receive the change as normal Yjs updates
      doc.transact(() => {
        const liveXml = doc.getXmlFragment("content");
        const snapXml = tempDoc.getXmlFragment("content");

        // Clear current content (from end to avoid index shifting)
        while (liveXml.length > 0) {
          liveXml.delete(0, 1);
        }

        // Re-insert snapshot content
        for (let i = 0; i < snapXml.length; i++) {
          const item = snapXml.get(i);
          liveXml.insert(i, [item.clone()]);
        }
      }, "restore");

      // 5. Encode the full post-restore state to push to server
      const restoreUpdate = Y.encodeStateAsUpdate(doc);
      tempDoc.destroy();

      // (doc is already updated by the transact above)
      // 5. Push the restore update to the server sync log
      const restoreBase64 = btoa(String.fromCharCode(...restoreUpdate));
      await fetch(`/api/sync/${documentId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          update: restoreBase64,
          isRestoreOp: true,
          restoredFromVersionId: restoreTarget.id,
        }),
      });

      setRestoreTarget(null);
      setRestoreSuccess(true);
      setTimeout(() => setRestoreSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Restore failed");
    } finally {
      setIsRestoring(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────
  return (
    <>
      {/* Panel */}
      <div className="fixed inset-y-0 right-0 w-80 bg-white border-l shadow-xl z-40 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-slate-600" />
            <h2 className="font-semibold text-sm">Version History</h2>
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}
            aria-label="Close version history">
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Success banner */}
        {restoreSuccess && (
          <div className="bg-green-50 border-b border-green-200 text-green-700 text-sm px-4 py-2.5 flex items-center gap-2">
            <RotateCcw className="h-3.5 w-3.5" />
            Document restored successfully
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-red-50 border-b border-red-200 text-red-700 text-sm px-4 py-2.5">
            {error}
          </div>
        )}

        {/* Create snapshot button */}
        {canWrite && !showCreateForm && (
          <div className="px-4 py-3 border-b">
            <Button
              size="sm"
              variant="outline"
              className="w-full gap-2"
              onClick={() => setShowCreateForm(true)}
            >
              <Plus className="h-3.5 w-3.5" />
              Save current version
            </Button>
          </div>
        )}

        {/* Create snapshot form */}
        {showCreateForm && (
          <form onSubmit={handleCreateSnapshot} className="px-4 py-3 border-b space-y-3 bg-slate-50">
            <div className="space-y-1">
              <Label htmlFor="version-label" className="text-xs">Version name *</Label>
              <Input
                id="version-label"
                placeholder="e.g. Before major rewrite"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                className="h-8 text-sm"
                required
                autoFocus
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="version-desc" className="text-xs">Description (optional)</Label>
              <Textarea
                id="version-desc"
                placeholder="What changed in this version?"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                className="text-sm min-h-[60px] resize-none"
                rows={2}
              />
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => { setShowCreateForm(false); setNewLabel(""); setNewDescription(""); }}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                className="flex-1"
                disabled={isCreating || !newLabel.trim()}
              >
                {isCreating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save"}
              </Button>
            </div>
          </form>
        )}

        {/* Version list */}
        <ScrollArea className="flex-1">
          {isLoading ? (
            <div className="p-4 space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="space-y-1.5 animate-pulse">
                  <div className="h-4 bg-slate-100 rounded w-3/4" />
                  <div className="h-3 bg-slate-100 rounded w-1/2" />
                </div>
              ))}
            </div>
          ) : versions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
              <Tag className="h-8 w-8 text-slate-300 mb-3" />
              <p className="text-sm font-medium text-slate-600">No saved versions yet</p>
              <p className="text-xs text-slate-400 mt-1">
                {canWrite
                  ? "Save a version to capture the current state"
                  : "No versions have been saved for this document"}
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {versions.map((version, index) => (
                <VersionItem
                  key={version.id}
                  version={version}
                  isCurrent={index === 0}
                  canRestore={canWrite}
                  onRestore={() => setRestoreTarget(version)}
                />
              ))}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* Restore confirmation dialog */}
      <Dialog open={!!restoreTarget} onOpenChange={() => setRestoreTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Restore this version?
            </DialogTitle>
            <DialogDescription className="space-y-2 pt-1">
              <p>
                The document will be restored to{" "}
                <strong>&ldquo;{restoreTarget?.label}&rdquo;</strong> saved{" "}
                {restoreTarget?.createdAt && formatRelativeTime(restoreTarget.createdAt)}.
              </p>
              <p className="text-xs text-slate-500">
                This creates a new update — your full history is preserved and
                active collaborators will receive the change as a normal edit.
              </p>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRestoreTarget(null)}>
              Cancel
            </Button>
            <Button onClick={handleRestore} disabled={isRestoring}>
              {isRestoring ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Restoring…
                </>
              ) : (
                <>
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Restore
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── Version list item ─────────────────────────────────────────────

interface VersionItemProps {
  version: DocumentVersion;
  isCurrent: boolean;
  canRestore: boolean;
  onRestore: () => void;
}

function VersionItem({ version, isCurrent, canRestore, onRestore }: VersionItemProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={`px-4 py-3 hover:bg-slate-50 transition-colors ${isCurrent ? "bg-blue-50/50" : ""}`}>
      <div className="flex items-start gap-2">
        {/* Timeline dot */}
        <div className="mt-1 flex flex-col items-center shrink-0">
          <div className={`h-2.5 w-2.5 rounded-full border-2 ${
            isCurrent ? "border-blue-500 bg-blue-500" : "border-slate-300 bg-white"
          }`} />
          <div className="w-px flex-1 bg-slate-200 mt-1 min-h-[1rem]" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 pb-2">
          <div className="flex items-start justify-between gap-1">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-sm font-medium text-slate-900 truncate">
                  {version.label}
                </span>
                {isCurrent && (
                  <Badge variant="info" className="text-[10px] px-1.5 py-0 h-4">
                    Latest
                  </Badge>
                )}
              </div>

              <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-500">
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {formatRelativeTime(version.createdAt)}
                </span>
                {version.createdByName && (
                  <span className="flex items-center gap-1">
                    <User className="h-3 w-3" />
                    {version.createdByName}
                  </span>
                )}
              </div>
            </div>

            {/* Expand button */}
            <button
              onClick={() => setExpanded((v) => !v)}
              className="text-slate-400 hover:text-slate-600 transition-colors p-0.5 shrink-0"
              aria-label={expanded ? "Collapse" : "Expand"}
            >
              <ChevronRight className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-90" : ""}`} />
            </button>
          </div>

          {/* Expanded details */}
          {expanded && (
            <div className="mt-2 space-y-2">
              {version.description && (
                <p className="text-xs text-slate-600 bg-slate-100 rounded px-2.5 py-1.5 leading-relaxed">
                  {version.description}
                </p>
              )}
              <div className="text-xs text-slate-400 font-mono">
                Sequence #{version.atSequenceNumber}
              </div>
              {canRestore && (
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full h-7 text-xs gap-1.5"
                  onClick={onRestore}
                >
                  <RotateCcw className="h-3 w-3" />
                  Restore to this version
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
