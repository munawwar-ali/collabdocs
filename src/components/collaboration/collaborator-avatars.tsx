"use client";

/**
 * CollaboratorAvatars
 *
 * Shows avatars of active collaborators in real time.
 * Stacks up to 4 avatars with a "+N" overflow indicator.
 */

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { AwarenessState } from "@/types";

interface CollaboratorAvatarsProps {
  collaborators: AwarenessState[];
}

export function CollaboratorAvatars({ collaborators }: CollaboratorAvatarsProps) {
  if (collaborators.length === 0) return null;

  const visible = collaborators.slice(0, 4);
  const overflow = collaborators.length - visible.length;

  return (
    <div
      className="flex items-center"
      aria-label={`${collaborators.length} active collaborator${collaborators.length > 1 ? "s" : ""}`}
    >
      <div className="flex -space-x-2">
        {visible.map((c, i) => {
          const initials = c.user.name
            ? c.user.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
            : "?";

          return (
            <Avatar
              key={`${c.user.id}-${i}`}
              className="h-7 w-7 border-2 border-white ring-1 ring-slate-200"
              title={c.user.name}
            >
              <AvatarImage src={c.user.image ?? undefined} alt={c.user.name} />
              <AvatarFallback
                style={{ backgroundColor: c.user.color, color: "#fff" }}
                className="text-[10px] font-semibold"
              >
                {initials}
              </AvatarFallback>
            </Avatar>
          );
        })}

        {overflow > 0 && (
          <div
            className="h-7 w-7 rounded-full border-2 border-white bg-slate-200 flex items-center justify-center text-[10px] font-semibold text-slate-600 ring-1 ring-slate-200"
            title={`${overflow} more collaborator${overflow > 1 ? "s" : ""}`}
          >
            +{overflow}
          </div>
        )}
      </div>

      <span className="ml-2 text-xs text-slate-500 hidden sm:inline">
        {collaborators.length === 1
          ? `${collaborators[0]?.user.name ?? "Someone"} is here`
          : `${collaborators.length} collaborators`}
      </span>
    </div>
  );
}
