"use client";

/**
 * useServiceWorker
 *
 * Registers the Service Worker and sets up the Background Sync bridge.
 *
 * LIFECYCLE:
 * 1. Register sw.js on mount (browser caches it automatically)
 * 2. On SW message BACKGROUND_SYNC_TRIGGER → dispatch custom event
 *    so all active sync engines flush their queues
 * 3. On offline → register background sync tag so browser re-fires
 *    when connectivity returns (even if tab is closed)
 *
 * This hook is mounted once in the root layout.
 */

import { useEffect } from "react";

export function useServiceWorker() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) {
      console.log("[SW] Service workers not supported");
      return;
    }

    // Register the SW
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((registration) => {
        console.log("[SW] Registered:", registration.scope);

        // Check for updates periodically
        setInterval(() => registration.update(), 60 * 60 * 1000); // hourly
      })
      .catch((err) => {
        console.warn("[SW] Registration failed:", err);
      });

    // Listen for messages from the SW (background sync trigger)
    const handleSWMessage = (event: MessageEvent) => {
      if (event.data?.type === "BACKGROUND_SYNC_TRIGGER") {
        console.log("[SW] Background sync triggered by SW");
        // Dispatch event that all active sync engines listen to
        window.dispatchEvent(new CustomEvent("collabdocs:background-sync"));
      }
    };

    navigator.serviceWorker.addEventListener("message", handleSWMessage);

    // When going offline, register a background sync tag
    const handleOffline = () => {
      navigator.serviceWorker.ready
        .then((registration) => {
          // Background Sync API — fires sync event when back online
          if ("sync" in registration) {
            return (registration as ServiceWorkerRegistration & {
              sync: { register: (tag: string) => Promise<void> };
            }).sync.register("collabdocs-sync");
          }
        })
        .catch((err) => {
          console.warn("[SW] Background sync registration failed:", err);
        });
    };

    window.addEventListener("offline", handleOffline);

    return () => {
      navigator.serviceWorker.removeEventListener("message", handleSWMessage);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);
}
