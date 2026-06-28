/**
 * Auto-Snapshot Utility
 *
 * Automatically creates a named snapshot every AUTO_SNAPSHOT_INTERVAL
 * sync operations. This serves two purposes:
 *
 * 1. PERFORMANCE: Restoring from a nearby snapshot + a small delta
 *    is much faster than replaying thousands of individual ops from 0.
 *
 * 2. SAFETY NET: Even if users never manually save a version, they
 *    have automatic checkpoints they can roll back to.
 *
 * Called from the POST /api/sync/[docId] route after each successful
 * operation append.
 *
 * AUTO-SNAPSHOT FLOW:
 * 1. After appending op N, check if N % INTERVAL === 0
 * 2. If yes, load all ops from the last snapshot to now
 * 3. Replay them on a temp Y.Doc to reconstruct current state
 * 4. Save the snapshot to document_versions with isAutoSnapshot=true
 */

import * as Y from "yjs";
import { db } from "@/db";
import {
  syncOperations,
  documentVersions,
} from "@/db/schema";
import { and, eq, gt, desc } from "drizzle-orm";

const AUTO_SNAPSHOT_INTERVAL = 50; // Create auto-snapshot every 50 ops
const AUTO_SNAPSHOT_LABEL_PREFIX = "Auto-save";

/**
 * Check if we should create an auto-snapshot and do so if needed.
 * Called after every successful sync operation append.
 *
 * @param documentId - The document to potentially snapshot
 * @param sequenceNumber - The sequence number just assigned
 * @param createdById - The user who triggered this op
 */
export async function maybeCreateAutoSnapshot(
  documentId: string,
  sequenceNumber: number,
  createdById: string
): Promise<void> {
  // Only snapshot at interval boundaries
  if (sequenceNumber % AUTO_SNAPSHOT_INTERVAL !== 0) return;

  try {
    // Find the previous auto-snapshot sequence number (if any)
    const [lastSnapshot] = await db
      .select({
        atSequenceNumber: documentVersions.atSequenceNumber,
      })
      .from(documentVersions)
      .where(
        and(
          eq(documentVersions.documentId, documentId),
          eq(documentVersions.isAutoSnapshot, true)
        )
      )
      .orderBy(desc(documentVersions.atSequenceNumber))
      .limit(1);

    const fromSequence = lastSnapshot?.atSequenceNumber ?? 0;

    // Fetch all ops since the last snapshot
    const ops = await db
      .select({
        yjsUpdate: syncOperations.yjsUpdate,
        sequenceNumber: syncOperations.sequenceNumber,
      })
      .from(syncOperations)
      .where(
        and(
          eq(syncOperations.documentId, documentId),
          gt(syncOperations.sequenceNumber, fromSequence)
        )
      )
      .orderBy(syncOperations.sequenceNumber);

    if (ops.length === 0) return;

    // Reconstruct the current document state by replaying all ops
    const tempDoc = new Y.Doc();

    // If we have a base snapshot, start from it
    if (lastSnapshot) {
      const [baseSnapshot] = await db
        .select({ yjsSnapshot: documentVersions.yjsSnapshot })
        .from(documentVersions)
        .where(
          and(
            eq(documentVersions.documentId, documentId),
            eq(documentVersions.isAutoSnapshot, true),
            eq(documentVersions.atSequenceNumber, fromSequence)
          )
        )
        .limit(1);

      if (baseSnapshot?.yjsSnapshot) {
        Y.applyUpdate(tempDoc, new Uint8Array(baseSnapshot.yjsSnapshot));
      }
    }

    // Apply all ops since base snapshot
    for (const op of ops) {
      if (op.yjsUpdate) {
        Y.applyUpdate(tempDoc, new Uint8Array(op.yjsUpdate));
      }
    }

    // Encode full document state as a Yjs update
    const snapshotBuffer = Buffer.from(Y.encodeStateAsUpdate(tempDoc));
    tempDoc.destroy();

    // Save the auto-snapshot
    const now = new Date();
    const label = `${AUTO_SNAPSHOT_LABEL_PREFIX} #${Math.floor(sequenceNumber / AUTO_SNAPSHOT_INTERVAL)}`;

    await db.insert(documentVersions).values({
      documentId,
      createdById,
      label,
      description: `Automatic checkpoint at operation ${sequenceNumber}`,
      yjsSnapshot: snapshotBuffer,
      atSequenceNumber: sequenceNumber,
      isAutoSnapshot: true,
      createdAt: now,
    });

    console.log(
      `[AutoSnapshot] Created "${label}" for doc ${documentId} at seq ${sequenceNumber}`
    );
  } catch (err) {
    // Auto-snapshots are best-effort — don't fail the sync op
    console.error("[AutoSnapshot] Failed:", err);
  }
}
