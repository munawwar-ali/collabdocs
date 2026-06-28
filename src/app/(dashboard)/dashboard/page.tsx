"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  FileText,
  Plus,
  Trash2,
  Users,
  Clock,
  Loader2,
  Crown,
  PenLine,
  Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatRelativeTime } from "@/lib/utils";
import { DocumentCardSkeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import type { DocumentWithRole } from "@/types";

const ROLE_CONFIG = {
  owner: { icon: Crown, label: "Owner", class: "bg-amber-100 text-amber-800" },
  editor: { icon: PenLine, label: "Editor", class: "bg-blue-100 text-blue-800" },
  viewer: { icon: Eye, label: "Viewer", class: "bg-slate-100 text-slate-700" },
} as const;

export default function DashboardPage() {
  const router = useRouter();
  const [documents, setDocuments] = useState<DocumentWithRole[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DocumentWithRole | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  // ── Fetch documents ───────────────────────────────────────────
  const fetchDocuments = useCallback(async () => {
    try {
      const res = await fetch("/api/documents");
      if (!res.ok) throw new Error("Failed to fetch documents");
      const json = await res.json() as { data: DocumentWithRole[] };
      setDocuments(json.data);
    } catch {
      setError("Failed to load documents");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchDocuments();
  }, [fetchDocuments]);

  // ── Create document ───────────────────────────────────────────
  async function handleCreate() {
    setIsCreating(true);
    try {
      const res = await fetch("/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Untitled Document" }),
      });
      if (!res.ok) throw new Error("Failed to create document");
      const json = await res.json() as { data: { id: string } };
      router.push(`/editor/${json.data.id}`);
    } catch {
      setError("Failed to create document. Please try again.");
      toast("Failed to create document", "error");
      setIsCreating(false);
    }
  }

  // ── Delete document ───────────────────────────────────────────
  async function handleDelete() {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await fetch(`/api/documents/${deleteTarget.id}`, { method: "DELETE" });
      setDocuments((prev) => prev.filter((d) => d.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch {
      setError("Failed to delete document.");
    } finally {
      setIsDeleting(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────
  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">My Documents</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              {documents.length} document{documents.length !== 1 ? "s" : ""}
            </p>
          </div>
          <Button onClick={handleCreate} disabled={isCreating} className="gap-2">
            {isCreating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            New document
          </Button>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-md">
            {error}
          </div>
        )}

        {/* Loading */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <DocumentCardSkeleton key={i} />
            ))}
          </div>
        ) : documents.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="h-16 w-16 rounded-full bg-blue-50 flex items-center justify-center mb-4">
              <FileText className="h-8 w-8 text-blue-400" />
            </div>
            <h2 className="text-lg font-semibold text-slate-900 mb-1">
              No documents yet
            </h2>
            <p className="text-slate-500 text-sm mb-6 max-w-xs">
              Create your first document and start collaborating — it works
              offline too.
            </p>
            <Button onClick={handleCreate} disabled={isCreating} className="gap-2">
              {isCreating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Create first document
            </Button>
          </div>
        ) : (
          /* Document grid */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {documents.map((doc) => {
              const roleConfig = ROLE_CONFIG[doc.role];
              const RoleIcon = roleConfig.icon;

              return (
                <Card
                  key={doc.id}
                  className="group hover:shadow-md transition-shadow cursor-pointer border-slate-200"
                  onClick={() => router.push(`/editor/${doc.id}`)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      router.push(`/editor/${doc.id}`);
                    }
                  }}
                  aria-label={`Open ${doc.title}`}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText className="h-4 w-4 text-blue-500 shrink-0" />
                        <CardTitle className="text-base truncate">
                          {doc.title}
                        </CardTitle>
                      </div>
                      {/* Delete button — only for owners */}
                      {doc.role === "owner" && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteTarget(doc);
                          }}
                          className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-500"
                          aria-label={`Delete ${doc.title}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-3">
                    {/* Role badge */}
                    <span
                      className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${roleConfig.class}`}
                    >
                      <RoleIcon className="h-3 w-3" />
                      {roleConfig.label}
                    </span>

                    {/* Metadata */}
                    <div className="flex items-center gap-3 text-xs text-slate-500">
                      <span className="flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {doc.memberCount}{" "}
                        {doc.memberCount === 1 ? "member" : "members"}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatRelativeTime(doc.updatedAt)}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete document?</DialogTitle>
            <DialogDescription>
              &ldquo;{deleteTarget?.title}&rdquo; will be permanently deleted.
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Delete"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
