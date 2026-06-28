"use client";

/**
 * OfflineBanner
 *
 * Shown at the top of the editor when:
 * - User goes offline → "You're offline. Editing locally."
 * - User comes back online → "Back online — syncing changes…"
 *
 * The banner auto-dismisses 5 seconds after reconnection.
 */

import { WifiOff, Wifi, Loader2 } from "lucide-react";
import { useOfflineStatus } from "@/hooks/use-offline-status";
import { cn } from "@/lib/utils";

export function OfflineBanner() {
  const { isOnline, wasOffline } = useOfflineStatus();

  // Don't show anything when stably online
  if (isOnline && !wasOffline) return null;

  return (
    <div
      role="status"
      aria-live="assertive"
      className={cn(
        "flex items-center justify-center gap-2 py-2 px-4 text-sm font-medium transition-all duration-300",
        !isOnline
          ? "bg-slate-800 text-white"
          : "bg-green-600 text-white"
      )}
    >
      {!isOnline ? (
        <>
          <WifiOff className="h-4 w-4 shrink-0" />
          <span>
            You&apos;re offline. Your edits are saved locally and will sync when
            you reconnect.
          </span>
        </>
      ) : (
        <>
          <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
          <Wifi className="h-4 w-4 shrink-0" />
          <span>Back online — syncing your changes…</span>
        </>
      )}
    </div>
  );
}
