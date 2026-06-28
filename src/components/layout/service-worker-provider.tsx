"use client";

import { useServiceWorker } from "@/hooks/use-service-worker";

/**
 * Mounts the Service Worker registration side-effect.
 * Renders nothing — purely a hook carrier so SW runs once at root.
 */
export function ServiceWorkerProvider() {
  useServiceWorker();
  return null;
}
