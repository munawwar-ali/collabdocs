/**
 * CollabDocs Service Worker
 *
 * Implements a layered caching strategy for offline-first operation.
 *
 * CACHING STRATEGY:
 *
 * 1. App Shell (Cache-First)
 *    Next.js static assets (_next/static/**) are cached permanently.
 *    These never change between deploys — they have content hashes in URLs.
 *
 * 2. Pages (Stale-While-Revalidate)
 *    HTML pages are served from cache instantly, then updated in background.
 *    Users always see the app even offline.
 *
 * 3. API routes (Network-First with offline fallback)
 *    /api/** goes to network first. If offline, returns cached response
 *    where available (e.g. GET /api/documents returns last known list).
 *    POST/PATCH/DELETE are queued in Background Sync for when online.
 *
 * 4. WebSocket connections
 *    Service Workers cannot intercept WebSocket — handled by useYDoc.
 *
 * BACKGROUND SYNC:
 *    When a sync push fails offline, we register a Background Sync tag.
 *    The browser will re-fire the 'sync' event when connectivity returns,
 *    even if the tab is closed. The event handler drains the IDB queue.
 *
 * CACHE VERSIONING:
 *    Increment CACHE_VERSION on each deploy to invalidate stale caches.
 */

const CACHE_VERSION = "v1";
const SHELL_CACHE = `collabdocs-shell-${CACHE_VERSION}`;
const PAGES_CACHE = `collabdocs-pages-${CACHE_VERSION}`;
const API_CACHE = `collabdocs-api-${CACHE_VERSION}`;

// ── App shell assets to pre-cache on install ─────────────────────
const SHELL_ASSETS = [
  "/",
  "/dashboard",
  "/offline",
];

// ── Install: pre-cache app shell ──────────────────────────────────
self.addEventListener("install", (event) => {
  console.log(`[SW] Installing ${CACHE_VERSION}`);

  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => {
        console.log("[SW] App shell cached");
        // Activate immediately without waiting for old SW to finish
        return self.skipWaiting();
      })
      .catch((err) => {
        // Non-fatal: some shell assets may not be available at install time
        console.warn("[SW] Shell pre-cache partial failure:", err);
      })
  );
});

// ── Activate: clean up old caches ─────────────────────────────────
self.addEventListener("activate", (event) => {
  console.log(`[SW] Activating ${CACHE_VERSION}`);

  event.waitUntil(
    Promise.all([
      // Delete caches from previous versions
      caches.keys().then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) =>
                key.startsWith("collabdocs-") &&
                key !== SHELL_CACHE &&
                key !== PAGES_CACHE &&
                key !== API_CACHE
            )
            .map((key) => {
              console.log(`[SW] Deleting old cache: ${key}`);
              return caches.delete(key);
            })
        )
      ),
      // Take control of all clients immediately
      self.clients.claim(),
    ])
  );
});

// ── Fetch: intercept and serve from cache ─────────────────────────
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin requests
  if (url.origin !== self.location.origin) return;

  // Skip non-GET for API routes (mutations handled by sync engine)
  if (url.pathname.startsWith("/api/") && request.method !== "GET") {
    return; // Let the request pass through normally
  }

  // Skip WebSocket upgrades
  if (request.headers.get("upgrade") === "websocket") return;

  // ── Next.js static assets: Cache-First ────────────────────────
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request, SHELL_CACHE));
    return;
  }

  // ── Next.js image optimisation: Cache-First ───────────────────
  if (url.pathname.startsWith("/_next/image")) {
    event.respondWith(cacheFirst(request, SHELL_CACHE));
    return;
  }

  // ── GET API routes: Network-First with cache fallback ─────────
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(networkFirstApi(request));
    return;
  }

  // ── Pages: Stale-While-Revalidate ─────────────────────────────
  event.respondWith(staleWhileRevalidate(request));
});

// ── Caching strategies ────────────────────────────────────────────

/**
 * Cache-First: serve from cache, only fetch if not cached.
 * Best for: static assets with content-hashed URLs.
 */
async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response("Offline — asset not cached", { status: 503 });
  }
}

/**
 * Stale-While-Revalidate: serve cached instantly, update in background.
 * Best for: HTML pages where speed matters more than freshness.
 */
async function staleWhileRevalidate(request) {
  const cache = await caches.open(PAGES_CACHE);
  const cached = await cache.match(request);

  // Fetch in background regardless
  const fetchPromise = fetch(request)
    .then((response) => {
      if (response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null);

  // Return cached immediately, or wait for network if not cached
  if (cached) return cached;

  const response = await fetchPromise;
  if (response) return response;

  // Both cache and network failed — return offline page
  const offlinePage = await cache.match("/offline");
  return (
    offlinePage ??
    new Response(
      `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Offline — CollabDocs</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body { font-family: system-ui, sans-serif; display: flex; align-items: center;
         justify-content: center; min-height: 100vh; margin: 0; background: #f8fafc; }
  .card { text-align: center; padding: 2rem; background: white; border-radius: 1rem;
          border: 1px solid #e2e8f0; max-width: 400px; }
  h1 { color: #0f172a; margin: 0 0 0.5rem; }
  p { color: #64748b; margin: 0 0 1.5rem; }
  button { background: #3b82f6; color: white; border: none; padding: 0.75rem 1.5rem;
           border-radius: 0.5rem; cursor: pointer; font-size: 1rem; }
  button:hover { background: #2563eb; }
</style>
</head>
<body>
<div class="card">
  <h1>You're offline</h1>
  <p>CollabDocs saves your work locally. You can keep editing — 
     changes will sync when you're back online.</p>
  <button onclick="window.location.reload()">Try again</button>
</div>
</body>
</html>`,
      {
        status: 200,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      }
    )
  );
}

/**
 * Network-First for API routes: try network, fall back to cache.
 * Caches GET responses for offline reading.
 */
async function networkFirstApi(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(API_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Network failed — try cache
    const cache = await caches.open(API_CACHE);
    const cached = await cache.match(request);
    if (cached) {
      // Add a header so the app knows this is stale cached data
      const headers = new Headers(cached.headers);
      headers.set("X-From-Cache", "true");
      return new Response(cached.body, {
        status: cached.status,
        statusText: cached.statusText,
        headers,
      });
    }

    return new Response(
      JSON.stringify({ error: "Offline — no cached response available" }),
      {
        status: 503,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}

// ── Background Sync ───────────────────────────────────────────────
/**
 * The browser fires this event when connectivity is restored,
 * even if the tab was closed. We use it to trigger a sync flush.
 *
 * The actual queue management is in src/lib/crdt/indexeddb.ts —
 * the SW just signals that we're back online.
 */
self.addEventListener("sync", (event) => {
  console.log(`[SW] Background sync fired: ${event.tag}`);

  if (event.tag === "collabdocs-sync") {
    event.waitUntil(
      // Notify all open clients to flush their queues
      self.clients.matchAll({ type: "window" }).then((clients) => {
        for (const client of clients) {
          client.postMessage({ type: "BACKGROUND_SYNC_TRIGGER" });
        }
      })
    );
  }
});

// ── Push notifications (future feature placeholder) ───────────────
self.addEventListener("push", () => {
  // Placeholder for future: notify collaborators of new comments, etc.
});

// ── Message handler ───────────────────────────────────────────────
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }

  if (event.data?.type === "REGISTER_SYNC") {
    // Client is asking us to register a background sync
    if ("serviceWorker" in navigator && "SyncManager" in window) {
      self.registration.sync
        .register("collabdocs-sync")
        .catch((err) => console.warn("[SW] Sync registration failed:", err));
    }
  }
});
