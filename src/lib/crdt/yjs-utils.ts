/**
 * Yjs CRDT Utilities
 *
 * Low-level helpers for working with Yjs documents.
 * These functions are the foundation of our conflict-free sync engine.
 *
 * KEY CONCEPTS:
 *
 * Y.Doc       — The in-memory CRDT document. Every client has one.
 * State vector — A compact summary of "how far" a doc has seen each client's
 *               updates. Used to request only the missing updates.
 * Update      — A binary delta encoding one or more operations. Updates are
 *               the unit of sync: clients exchange updates, not full states.
 * Snapshot    — A complete document state encoded as a single update.
 *               Used for version history; restoring applies a snapshot as
 *               a new update so collaborators get a normal delta, not a reset.
 */

import * as Y from "yjs";

// ── Document creation ────────────────────────────────────────────

/**
 * Create a new Yjs document with our standard shared types.
 * Every CollabDocs document uses a single Y.XmlFragment named "content"
 * as the root — TipTap's Collaboration extension expects this.
 */
export function createYDoc(): Y.Doc {
  const doc = new Y.Doc();
  // Access the fragment to initialise it — no-op if already exists
  doc.getXmlFragment("content");
  return doc;
}

// ── State vector operations ──────────────────────────────────────

/**
 * Get the current state vector of a document as a base64 string.
 * Send this to the server to request only the updates you're missing.
 *
 * The state vector is very compact (a few bytes per collaborator)
 * compared to the full document state.
 */
export function getStateVectorBase64(doc: Y.Doc): string {
  return Buffer.from(Y.encodeStateVector(doc)).toString("base64");
}

/**
 * Decode a base64 state vector back to Uint8Array.
 */
export function decodeStateVectorBase64(base64: string): Uint8Array {
  return new Uint8Array(Buffer.from(base64, "base64"));
}

// ── Update encoding / decoding ───────────────────────────────────

/**
 * Encode the full document state as a binary update.
 * Equivalent to "take a snapshot of everything right now."
 *
 * Pass an optional `encodedStateVector` to get only the diff
 * since that state vector (efficient incremental sync).
 */
export function encodeUpdate(
  doc: Y.Doc,
  encodedStateVector?: Uint8Array
): Uint8Array {
  return Y.encodeStateAsUpdate(doc, encodedStateVector);
}

/**
 * Encode update as base64 for JSON transport.
 */
export function encodeUpdateBase64(
  doc: Y.Doc,
  encodedStateVector?: Uint8Array
): string {
  return Buffer.from(encodeUpdate(doc, encodedStateVector)).toString("base64");
}

/**
 * Decode a base64-encoded update back to Uint8Array.
 */
export function decodeUpdateBase64(base64: string): Uint8Array {
  return new Uint8Array(Buffer.from(base64, "base64"));
}

/**
 * Apply a binary update to a Y.Doc.
 * This is the core CRDT merge operation — idempotent and commutative.
 * Applying the same update twice is safe; order doesn't matter.
 */
export function applyUpdate(doc: Y.Doc, update: Uint8Array): void {
  Y.applyUpdate(doc, update);
}

/**
 * Apply a base64-encoded update to a Y.Doc.
 */
export function applyUpdateBase64(doc: Y.Doc, base64: string): void {
  applyUpdate(doc, decodeUpdateBase64(base64));
}

// ── Merge operations ─────────────────────────────────────────────

/**
 * Merge multiple Yjs updates into a single update.
 * Useful for compacting the sync queue before sending to server.
 *
 * This creates a temporary Y.Doc, applies all updates, then encodes
 * the merged state as a single update.
 */
export function mergeUpdates(updates: Uint8Array[]): Uint8Array {
  return Y.mergeUpdates(updates);
}

/**
 * Compute the diff between two documents (as state vectors).
 * Returns the update that, when applied to `fromStateVector`, produces
 * the current state of `doc`.
 *
 * This is what the server sends to a reconnecting client:
 * "here are all the changes you missed while offline."
 */
export function diffUpdate(
  doc: Y.Doc,
  fromStateVector: Uint8Array
): Uint8Array {
  return Y.encodeStateAsUpdate(doc, fromStateVector);
}

// ── Version / snapshot operations ────────────────────────────────

/**
 * Create a complete snapshot of the current document state.
 * This is stored in `document_versions.yjs_snapshot`.
 *
 * A snapshot is just a full update (no diff): it captures
 * the entire document so it can be restored independently.
 */
export function createSnapshot(doc: Y.Doc): Uint8Array {
  return Y.encodeStateAsUpdate(doc);
}

/**
 * Restore a document to a snapshot state.
 *
 * CRITICAL: We do NOT replace the Y.Doc or its state vector.
 * Instead we:
 * 1. Load the snapshot into a temporary Y.Doc
 * 2. Encode its content as a new update against the current doc
 * 3. Apply that update to the live doc
 *
 * This means the restore is just another update in the CRDT log.
 * Active collaborators receive it as a normal delta — no jarring reset.
 * Their own pending offline changes are then CRDT-merged on top.
 */
export function restoreSnapshot(
  liveDoc: Y.Doc,
  snapshotUpdate: Uint8Array
): Uint8Array {
  // Load snapshot into a temporary doc
  const snapshotDoc = new Y.Doc();
  Y.applyUpdate(snapshotDoc, snapshotUpdate);

  // Compute the update that transitions liveDoc → snapshotDoc content
  // We do this by encoding snapshotDoc's full state as an update
  // that can be applied on top of liveDoc's current state
  const restoreUpdate = Y.encodeStateAsUpdate(snapshotDoc);

  // Apply to the live doc
  Y.applyUpdate(liveDoc, restoreUpdate);

  // Return the update so it can be sent to the server + other clients
  return restoreUpdate;
}

// ── Document inspection ──────────────────────────────────────────

/**
 * Get the plain text content of a Yjs document.
 * Used for AI features and search indexing.
 */
export function getDocumentText(doc: Y.Doc): string {
  const fragment = doc.getXmlFragment("content");
  return fragment.toString();
}

/**
 * Check if a Yjs document is empty (no content written yet).
 */
export function isDocumentEmpty(doc: Y.Doc): boolean {
  const update = Y.encodeStateAsUpdate(doc);
  // An empty doc still has a minimal header — threshold is ~10 bytes
  return update.length < 15;
}
