/**
 * IndexedDB Persistence Layer
 *
 * Every CollabDocs document is persisted locally in IndexedDB via
 * y-indexeddb. This is the foundation of local-first architecture:
 * the browser's IndexedDB is the PRIMARY source of truth.
 *
 * HOW IT WORKS:
 * - y-indexeddb creates an IndexedDB database per document
 * - Every Yjs update is written to IndexedDB synchronously with the edit
 * - On load, the document is restored from IndexedDB FIRST — zero network
 * - Server sync happens in the background, never blocking the UI
 *
 * STORAGE KEYS:
 * - DB name: `collabdocs-${documentId}`
 * - Each DB stores: document updates, state vectors, metadata
 *
 * MEMORY MANAGEMENT:
 * - y-indexeddb auto-compacts stored updates (merges deltas into one)
 * - We enforce a max-documents limit to prevent unbounded storage growth
 * - LRU eviction removes the least-recently-used document when over limit
 */

"use client";

import { IndexeddbPersistence } from "y-indexeddb";
import * as Y from "yjs";

// Max documents to keep in IndexedDB (LRU eviction after this)
const MAX_LOCAL_DOCUMENTS = 20;
const DB_PREFIX = "collabdocs-";
const LRU_STORE_KEY = "collabdocs-lru-order";

// ── Persistence lifecycle ────────────────────────────────────────

/**
 * Create and attach an IndexedDB persistence provider to a Y.Doc.
 *
 * Returns a promise that resolves once the local state is fully loaded.
 * After this resolves, the doc is populated from IndexedDB and the
 * editor can render — completely without network.
 */
export function createLocalPersistence(
  documentId: string,
  doc: Y.Doc
): {
  provider: IndexeddbPersistence;
  synced: Promise<void>;
} {
  const dbName = `${DB_PREFIX}${documentId}`;
  const provider = new IndexeddbPersistence(dbName, doc);

  // Track LRU order for eviction
  void updateLruOrder(documentId);

  const synced = new Promise<void>((resolve) => {
    provider.on("synced", () => {
      resolve();
    });
  });

  return { provider, synced };
}

/**
 * Destroy the IndexedDB persistence for a document.
 * Called when a document is deleted or when evicting from LRU cache.
 */
export async function destroyLocalPersistence(
  documentId: string
): Promise<void> {
  const dbName = `${DB_PREFIX}${documentId}`;

  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(dbName);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => {
      // Database is still open somewhere — resolve anyway
      console.warn(`[IDB] Delete blocked for ${dbName}`);
      resolve();
    };
  });
}

// ── LRU tracking ────────────────────────────────────────────────

/**
 * Update the LRU order when a document is accessed.
 * If we're over the document limit, evict the least-recently-used one.
 */
async function updateLruOrder(documentId: string): Promise<void> {
  try {
    const raw = localStorage.getItem(LRU_STORE_KEY);
    let order: string[] = raw ? (JSON.parse(raw) as string[]) : [];

    // Move this doc to front (most recently used)
    order = [documentId, ...order.filter((id) => id !== documentId)];

    // Evict if over limit
    if (order.length > MAX_LOCAL_DOCUMENTS) {
      const evicted = order.splice(MAX_LOCAL_DOCUMENTS);
      for (const id of evicted) {
        console.log(`[IDB] Evicting document from local storage: ${id}`);
        await destroyLocalPersistence(id);
      }
    }

    localStorage.setItem(LRU_STORE_KEY, JSON.stringify(order));
  } catch {
    // localStorage may be unavailable (private browsing) — non-fatal
  }
}

/**
 * Get list of documents currently stored locally.
 */
export function getLocalDocumentIds(): string[] {
  try {
    const raw = localStorage.getItem(LRU_STORE_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

/**
 * Estimate total IndexedDB storage used by CollabDocs (bytes).
 * Uses the StorageManager API where available.
 */
export async function estimateStorageUsage(): Promise<{
  used: number;
  quota: number;
} | null> {
  if (!navigator.storage?.estimate) return null;
  try {
    const estimate = await navigator.storage.estimate();
    return {
      used: estimate.usage ?? 0,
      quota: estimate.quota ?? 0,
    };
  } catch {
    return null;
  }
}

// ── Sync queue persistence ───────────────────────────────────────

/**
 * The sync queue stores Yjs updates that couldn't be sent to the server
 * (because the user was offline). We persist the queue in IndexedDB so
 * it survives page refreshes.
 *
 * Queue structure per document:
 *   Key: `sq-${documentId}` in localStorage (metadata)
 *   The actual binary updates are stored in a dedicated IDB store
 */

const SYNC_QUEUE_DB = "collabdocs-sync-queue";
const SYNC_QUEUE_STORE = "pending-updates";

interface PendingUpdate {
  id: string;
  documentId: string;
  update: Uint8Array;
  timestamp: number;
  retries: number;
}

/**
 * Open (or create) the sync queue IndexedDB.
 */
function openSyncQueueDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(SYNC_QUEUE_DB, 1);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(SYNC_QUEUE_STORE)) {
        const store = db.createObjectStore(SYNC_QUEUE_STORE, {
          keyPath: "id",
        });
        store.createIndex("documentId", "documentId", { unique: false });
        store.createIndex("timestamp", "timestamp", { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Enqueue a pending Yjs update for background sync.
 */
export async function enqueuePendingUpdate(
  documentId: string,
  update: Uint8Array
): Promise<void> {
  const db = await openSyncQueueDb();

  const entry: PendingUpdate = {
    id: `${documentId}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    documentId,
    update,
    timestamp: Date.now(),
    retries: 0,
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction(SYNC_QUEUE_STORE, "readwrite");
    tx.objectStore(SYNC_QUEUE_STORE).add(entry);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

/**
 * Get all pending updates for a document.
 */
export async function getPendingUpdates(
  documentId: string
): Promise<PendingUpdate[]> {
  const db = await openSyncQueueDb();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(SYNC_QUEUE_STORE, "readonly");
    const index = tx.objectStore(SYNC_QUEUE_STORE).index("documentId");
    const request = index.getAll(documentId);
    request.onsuccess = () => {
      db.close();
      const results = (request.result as PendingUpdate[]).sort(
        (a, b) => a.timestamp - b.timestamp
      );
      resolve(results);
    };
    request.onerror = () => { db.close(); reject(request.error); };
  });
}

/**
 * Remove a successfully synced update from the queue.
 */
export async function removePendingUpdate(id: string): Promise<void> {
  const db = await openSyncQueueDb();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(SYNC_QUEUE_STORE, "readwrite");
    tx.objectStore(SYNC_QUEUE_STORE).delete(id);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

/**
 * Increment retry count for a failed update.
 */
export async function incrementRetryCount(id: string): Promise<void> {
  const db = await openSyncQueueDb();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(SYNC_QUEUE_STORE, "readwrite");
    const store = tx.objectStore(SYNC_QUEUE_STORE);
    const getReq = store.get(id);

    getReq.onsuccess = () => {
      const entry = getReq.result as PendingUpdate | undefined;
      if (entry) {
        entry.retries++;
        store.put(entry);
      }
    };

    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export type { PendingUpdate };
