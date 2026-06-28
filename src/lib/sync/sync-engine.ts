"use client";

/**
 * Background Sync Engine
 *
 * Manages the offline-to-online transition for a document.
 *
 * PROBLEM IT SOLVES:
 * When a user edits offline, their Yjs updates are:
 * 1. Applied to the local Y.Doc immediately (user sees changes)
 * 2. Persisted to IndexedDB (survives page refresh)
 * 3. Queued in the sync queue (pending server delivery)
 *
 * When connectivity returns, this engine:
 * 1. Detects the reconnect (online event + WS sync event)
 * 2. Pulls any remote changes from the server (via HTTP, not WS)
 * 3. Flushes the local queue to the server in order
 * 4. Applies remote updates to the local Y.Doc (CRDT merge)
 *
 * WHY HTTP FOR PULL, WS FOR PUSH:
 * The WebSocket provider (y-websocket) handles live push automatically.
 * But for the initial reconnect catch-up, we use HTTP because:
 * - More reliable for large payloads
 * - Easier to implement retry logic
 * - Gives us explicit control over the sync order
 *
 * CONFLICT RESOLUTION:
 * There are no "conflicts" in the traditional sense — Yjs CRDTs
 * guarantee convergence. Concurrent edits always produce the same
 * merged result regardless of order. The only thing that matters
 * is that all updates are eventually applied.
 */

import * as Y from "yjs";
import {
  getPendingUpdates,
  removePendingUpdate,
  incrementRetryCount,
  enqueuePendingUpdate,
  type PendingUpdate,
} from "@/lib/crdt/indexeddb";
import { decodeUpdateBase64 } from "@/lib/crdt/yjs-utils";
import { backoffDelay, sleep } from "@/lib/utils";

const MAX_RETRIES = 5;
const BATCH_SIZE = 10; // Send at most 10 pending ops per flush cycle

// ── Sync engine state ────────────────────────────────────────────

interface SyncEngineState {
  documentId: string;
  doc: Y.Doc;
  isFlushing: boolean;
  lastSyncedSequence: number;
  onStatusChange?: (status: "syncing" | "synced" | "pending" | "offline") => void;
}

/**
 * Create a sync engine for a document.
 * Returns controls to start, stop, and manually trigger sync.
 */
export function createSyncEngine(
  documentId: string,
  doc: Y.Doc,
  onStatusChange?: SyncEngineState["onStatusChange"]
) {
  const state: SyncEngineState = {
    documentId,
    doc,
    isFlushing: false,
    lastSyncedSequence: 0,
    onStatusChange,
  };

  // ── Online/offline event listeners ─────────────────────────────
  function handleOnline() {
    console.log(`[Sync] Online — scheduling flush for ${documentId}`);
    void flushQueue(state);
  }

  function handleReconnected(e: Event) {
    const detail = (e as CustomEvent<{ documentId: string }>).detail;
    if (detail.documentId === documentId) {
      console.log(`[Sync] WS reconnected — flushing queue for ${documentId}`);
      void pullRemoteChanges(state);
      void flushQueue(state);
    }
  }

  window.addEventListener("online", handleOnline);
  window.addEventListener("collabdocs:reconnected", handleReconnected);

  // Also flush when SW fires background-sync (works even when tab was closed)
  const handleBgSync = () => void flushQueue(state);
  window.addEventListener("collabdocs:background-sync", handleBgSync);

  // ── Track local changes for the queue ──────────────────────────
  // Every Yjs update that originates locally (not from WS) gets queued
  // so we can replay it if the WS was offline.
  const handleDocUpdate = (update: Uint8Array, origin: unknown) => {
    // "ws-provider" origin = came from server, don't re-queue
    if (origin === "ws-provider" || origin === "indexeddb") return;
    if (!navigator.onLine) {
      void enqueuePendingUpdate(documentId, update);
      state.onStatusChange?.("pending");
    }
  };

  doc.on("update", handleDocUpdate);

  // Initial flush if already online
  if (navigator.onLine) {
    setTimeout(() => void flushQueue(state), 2000);
  }

  return {
    /** Manually trigger a sync flush */
    flush: () => flushQueue(state),
    /** Pull remote changes without flushing local queue */
    pull: () => pullRemoteChanges(state),
    /** Destroy all listeners */
    destroy: () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("collabdocs:reconnected", handleReconnected);
      doc.off("update", handleDocUpdate);
    },
  };
}

// ── Pull remote changes ───────────────────────────────────────────

/**
 * Pull all server updates since our last known sequence number.
 * The server returns Yjs binary updates; we apply them to the local doc.
 * CRDTs handle merging — no conflict resolution logic needed.
 */
async function pullRemoteChanges(state: SyncEngineState): Promise<void> {
  try {
    const res = await fetch(
      `/api/sync/${state.documentId}?since=${state.lastSyncedSequence}`,
      {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      }
    );

    if (!res.ok) {
      console.warn(`[Sync] Pull failed: ${res.status}`);
      return;
    }

    const json = await res.json() as {
      data: {
        updates: { sequenceNumber: number; yjsUpdateBase64: string }[];
        latestSequence: number;
      };
    };

    const { updates, latestSequence } = json.data;

    if (updates.length === 0) return;

    console.log(`[Sync] Applying ${updates.length} remote updates`);

    // Apply each update to our local doc — Yjs CRDT handles merging
    Y.transact(state.doc, () => {
      for (const op of updates) {
        const update = decodeUpdateBase64(op.yjsUpdateBase64);
        Y.applyUpdate(state.doc, update, "server-sync");
      }
    });

    state.lastSyncedSequence = latestSequence;
    console.log(`[Sync] Synced to sequence ${latestSequence}`);
  } catch (err) {
    console.error("[Sync] Pull error:", err);
  }
}

// ── Flush local queue ─────────────────────────────────────────────

/**
 * Flush pending offline updates to the server.
 *
 * ORDERING GUARANTEE:
 * Updates are sorted by timestamp and sent in order.
 * This ensures the server's sync_operations log reflects the
 * correct edit sequence even if multiple batches arrive.
 *
 * IDEMPOTENCY:
 * The server assigns sequence numbers atomically. If a flush
 * partially succeeds (some ops sent, then connection drops),
 * the remaining ops in the queue will be retried. The already-
 * applied ops won't cause duplicates because Yjs updates are
 * idempotent — applying the same update twice is a no-op.
 */
async function flushQueue(state: SyncEngineState): Promise<void> {
  if (state.isFlushing) return; // Prevent concurrent flushes
  if (!navigator.onLine) return;

  const pending = await getPendingUpdates(state.documentId);
  if (pending.length === 0) {
    state.onStatusChange?.("synced");
    return;
  }

  state.isFlushing = true;
  state.onStatusChange?.("syncing");
  console.log(`[Sync] Flushing ${pending.length} pending ops for ${state.documentId}`);

  try {
    // Process in batches to avoid large payloads
    const batches = chunk(pending, BATCH_SIZE);

    for (const batch of batches) {
      await processBatch(state, batch);
    }

    state.onStatusChange?.("synced");
  } catch (err) {
    console.error("[Sync] Flush error:", err);
    state.onStatusChange?.("pending");
  } finally {
    state.isFlushing = false;
  }
}

async function processBatch(
  state: SyncEngineState,
  batch: PendingUpdate[]
): Promise<void> {
  for (const op of batch) {
    if (op.retries >= MAX_RETRIES) {
      // Give up on this op after too many retries
      console.warn(`[Sync] Dropping op ${op.id} after ${op.retries} retries`);
      await removePendingUpdate(op.id);
      continue;
    }

    const success = await sendUpdate(state.documentId, op.update, op.retries);

    if (success) {
      await removePendingUpdate(op.id);
    } else {
      await incrementRetryCount(op.id);
      // Exponential backoff before next attempt
      await sleep(backoffDelay(op.retries));
    }
  }
}

/**
 * Send a single Yjs update to the server.
 * Returns true on success, false on failure.
 */
async function sendUpdate(
  documentId: string,
  update: Uint8Array,
  attempt: number
): Promise<boolean> {
  try {
    // Encode Uint8Array → base64 for JSON transport
    const base64 = btoa(String.fromCharCode(...update));
    const res = await fetch(`/api/sync/${documentId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ update: base64 }),
    });

    if (res.status === 413) {
      // Payload too large — split and retry? For now just drop it
      console.warn(`[Sync] Update too large for doc ${documentId} — dropping`);
      return true; // Remove from queue to avoid infinite retry
    }

    return res.ok;
  } catch (err) {
    console.warn(`[Sync] Send failed (attempt ${attempt}):`, err);
    return false;
  }
}

// ── Utils ─────────────────────────────────────────────────────────

function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}
