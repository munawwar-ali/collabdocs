"use client";

/**
 * ShareDialog — Invite members and manage roles.
 */

import { useState, useEffect } from "react";
import { X, UserPlus, Loader2, Crown, PenLine, Eye, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface Member {
  userId: string;
  name: string | null;
  email: string;
  image: string | null;
  role: "owner" | "editor" | "viewer";
}

interface ShareDialogProps {
  documentId: string;
  onClose: () => void;
}

const ROLE_ICONS = { owner: Crown, editor: PenLine, viewer: Eye };
const ROLE_LABELS = { owner: "Owner", editor: "Editor", viewer: "Viewer" };

export function ShareDialog({ documentId, onClose }: ShareDialogProps) {
  const [members, setMembers] = useState<Member[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"editor" | "viewer">("editor");
  const [isInviting, setIsInviting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetchMembers();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentId]);

  async function fetchMembers() {
    try {
      const res = await fetch(`/api/documents/${documentId}/members`);
      const json = await res.json() as { data: Member[] };
      setMembers(json.data);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsInviting(true);
    try {
      const res = await fetch(`/api/documents/${documentId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });
      const json = await res.json() as { error?: string };
      if (!res.ok) { setError(json.error ?? "Failed to invite"); return; }
      setInviteEmail("");
      await fetchMembers();
    } catch {
      setError("Something went wrong");
    } finally {
      setIsInviting(false);
    }
  }

  async function handleRemove(targetUserId: string) {
    await fetch(`/api/documents/${documentId}/members`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetUserId }),
    });
    await fetchMembers();
  }

  async function handleRoleChange(targetUserId: string, role: "editor" | "viewer") {
    await fetch(`/api/documents/${documentId}/members`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetUserId, role }),
    });
    await fetchMembers();
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Share document</DialogTitle>
          <DialogDescription>Invite collaborators by email</DialogDescription>
        </DialogHeader>

        {/* Invite form */}
        <form onSubmit={handleInvite} className="space-y-3">
          {error && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded">{error}</p>
          )}
          <div className="space-y-1">
            <Label htmlFor="invite-email">Email address</Label>
            <Input
              id="invite-email"
              type="email"
              placeholder="colleague@example.com"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              required
            />
          </div>
          <div className="flex gap-2">
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as "editor" | "viewer")}
              className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
              aria-label="Role"
            >
              <option value="editor">Editor</option>
              <option value="viewer">Viewer</option>
            </select>
            <Button type="submit" disabled={isInviting || !inviteEmail} className="flex-1 gap-2">
              {isInviting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
              Invite
            </Button>
          </div>
        </form>

        {/* Members list */}
        <div className="space-y-2 mt-2">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
            Members
          </p>
          {isLoading ? (
            <div className="h-24 animate-pulse bg-slate-100 rounded" />
          ) : (
            members.map((m) => {
              const RoleIcon = ROLE_ICONS[m.role];
              const initials = m.name?.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2) ?? "?";
              return (
                <div key={m.userId} className="flex items-center gap-3 py-1.5">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={m.image ?? undefined} />
                    <AvatarFallback className="text-xs bg-blue-100 text-blue-700">{initials}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{m.name ?? m.email}</p>
                    <p className="text-xs text-slate-500 truncate">{m.email}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    {m.role === "owner" ? (
                      <span className="flex items-center gap-1 text-xs text-amber-700 font-medium">
                        <RoleIcon className="h-3 w-3" /> Owner
                      </span>
                    ) : (
                      <>
                        <select
                          value={m.role}
                          onChange={(e) => handleRoleChange(m.userId, e.target.value as "editor" | "viewer")}
                          className="text-xs border rounded px-1.5 py-0.5 bg-white"
                          aria-label={`Role for ${m.name ?? m.email}`}
                        >
                          <option value="editor">Editor</option>
                          <option value="viewer">Viewer</option>
                        </select>
                        <Button
                          variant="ghost" size="icon"
                          className="h-7 w-7 text-slate-400 hover:text-red-500"
                          onClick={() => handleRemove(m.userId)}
                          aria-label={`Remove ${m.name ?? m.email}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
