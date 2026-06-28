"use client";

/**
 * useYDoc — Yjs Document Lifecycle Hook
 *
 * Manages the complete lifecycle of a Yjs document:
 * 1. Creates a Y.Doc in memory
 * 2. Attaches IndexedDB persistence (loads local state FIRST — zero network)
 * 3. Connects to the WebSocket server for real-time sync (background)
 * 4. Exposes sync status for the UI connection indicator
 *
 * LOAD ORDER (critical for local-first behaviour):
 * ┌─────────────────────────────────────────────────────┐
 * │ 1. Create Y.Doc                                     │
 * │ 2. Attach IndexedDB → loads local state (0ms sync) │ ← renders here
 * │ 3. Connect WebSocket → merge server state           │ ← background
 * └─────────────────────────────────────────────────────┘
 *
 * The editor renders at step 2. Step 3 is invisible to the user
 * unless there are remote changes, in which case they appear seamlessly.
 */

import { useState, useEffect, useRef } from "react";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { createLocalPersistence } from "@/lib/crdt/indexeddb";
import { createSyncEngine } from "@/lib/sync/sync-engine";
import { generateUserColor } from "@/lib/utils";
import type { SyncStatus, AwarenessState } from "@/types";

interface UseYDocOptions {
  documentId: string;
  userId: string;
  userName: string;
  userImage: string | null;
  userRole: "owner" | "editor" | "viewer";
}

interface UseYDocReturn {
  doc: Y.Doc | null;
  provider: WebsocketProvider | null;
  syncStatus: SyncStatus;
  isLocalReady: boolean; // IndexedDB loaded — safe to render editor
  awareness: WebsocketProvider["awareness"] | null;
  collaborators: AwarenessState[];
}

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:1234";
const MAX_RECONNECT_ATTEMPTS = 10;

export function useYDoc({
  documentId,
  userId,
  userName,
  userImage,
  userRole,
}: UseYDocOptions): UseYDocReturn {
  const [doc, setDoc] = useState<Y.Doc | null>(null);
  const [provider, setProvider] = useState<WebsocketProvider | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("offline");
  const [isLocalReady, setIsLocalReady] = useState(false);
  const [collaborators, setCollaborators] = useState<AwarenessState[]>([]);

  // Refs to avoid stale closures in event handlers
  const docRef = useRef<Y.Doc | null>(null);
  const providerRef = useRef<WebsocketProvider | null>(null);
  const persistenceRef = useRef<{ destroy: () => void } | null>(null);

  // User's awareness colour (deterministic from userId)
  const userColor = generateUserColor(userId);

  // ── Initialise Y.Doc + IndexedDB + WebSocket ─────────────────
  useEffect(() => {
    // gc: false is required so Y.snapshot() restore works correctly
    const ydoc = new Y.Doc({ gc: false });
    docRef.current = ydoc;

    // ── Step 1: IndexedDB persistence ──────────────────────────
    // This loads local state FIRST. The editor can render immediately
    // from IndexedDB without any network requests.
    const { provider: idbProvider, synced: localSynced } =
      createLocalPersistence(documentId, ydoc);

    persistenceRef.current = idbProvider;

    localSynced.then(() => {
      setIsLocalReady(true);
      setDoc(ydoc);
    });

    // ── Step 2: WebSocket for real-time sync ───────────────────
    // Only editors and owners broadcast updates.
    // Viewers connect read-only (WS server enforces this server-side too).
    const wsProvider = new WebsocketProvider(
      WS_URL,
      documentId,
      ydoc,
      {
        connect: true,
        // Attach auth token via URL param — server validates on handshake
        // (In production, use a signed token; for now userId is fine in dev)
        params: { userId, role: userRole },
      }
    );

    providerRef.current = wsProvider;
    setProvider(wsProvider);

    // ── Awareness (presence) ───────────────────────────────────
    wsProvider.awareness.setLocalStateField("user", {
      id: userId,
      name: userName,
      color: userColor,
      image: userImage,
    });

    wsProvider.awareness.setLocalStateField("cursor", null);

    // ── WebSocket status handlers ──────────────────────────────
    wsProvider.on("status", ({ status }: { status: string }) => {
      if (status === "connected") {
        setSyncStatus("syncing");
      } else if (status === "disconnected") {
        setSyncStatus("offline");
      }
    });

    wsProvider.on("sync", (isSynced: boolean) => {
      setSyncStatus(isSynced ? "synced" : "syncing");
    });

    // ── Collaborator presence tracking ─────────────────────────
    const updateCollaborators = () => {
      const states = Array.from(
        wsProvider.awareness.getStates().entries()
      ) as [number, { user?: AwarenessState["user"]; cursor?: AwarenessState["cursor"] }][];

      const active: AwarenessState[] = states
        .filter(([clientId]) => clientId !== wsProvider.awareness.clientID)
        .map(([, state]) => ({
          user: state.user ?? {
            id: "unknown",
            name: "Anonymous",
            color: "#666",
            image: null,
          },
          cursor: state.cursor ?? null,
        }))
        .filter((s) => s.user.id !== userId);

      setCollaborators(active);
    };

    wsProvider.awareness.on("change", updateCollaborators);

    // ── Pending updates flush on reconnect ─────────────────────
    // When we come back online, the sync engine (Step 7) picks up
    // the IndexedDB queue. Here we just broadcast a "reconnected" event.
    wsProvider.on("sync", (isSynced: boolean) => {
      if (isSynced) {
        // Dispatch custom event for the sync engine to catch
        window.dispatchEvent(
          new CustomEvent("collabdocs:reconnected", {
            detail: { documentId },
          })
        );
      }
    });

    // ── Sync engine (offline queue flush) ──────────────────────
    const syncEngine = createSyncEngine(documentId, ydoc, (status) => {
      setSyncStatus(status);
    });

    // ── Cleanup ────────────────────────────────────────────────
    return () => {
      syncEngine.destroy();
      wsProvider.awareness.off("change", updateCollaborators);
      wsProvider.destroy();
      idbProvider.destroy();
      ydoc.destroy();
      docRef.current = null;
      providerRef.current = null;
      setDoc(null);
      setProvider(null);
      setIsLocalReady(false);
      setSyncStatus("offline");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentId, userId]);

  // Keep awareness user info fresh if name/image changes
  useEffect(() => {
    if (!providerRef.current) return;
    providerRef.current.awareness.setLocalStateField("user", {
      id: userId,
      name: userName,
      color: userColor,
      image: userImage,
    });
  }, [userId, userName, userImage, userColor]);

  return {
    doc,
    provider,
    syncStatus,
    isLocalReady,
    awareness: provider?.awareness ?? null,
    collaborators,
  };
}
