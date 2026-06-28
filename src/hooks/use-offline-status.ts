"use client";

/**
 * useOfflineStatus
 *
 * Reactively tracks the browser's online/offline state.
 * Returns { isOnline, wasOffline } so the UI can show a
 * "Back online — syncing changes" banner when reconnecting.
 */

import { useState, useEffect } from "react";

export function useOfflineStatus() {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );
  const [wasOffline, setWasOffline] = useState(false);

  useEffect(() => {
    function handleOnline() {
      setIsOnline(true);
      // wasOffline stays true briefly so UI can show "syncing" banner
      setTimeout(() => setWasOffline(false), 5000);
    }

    function handleOffline() {
      setIsOnline(false);
      setWasOffline(true);
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return { isOnline, wasOffline };
}
