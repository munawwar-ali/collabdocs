/**
 * Document Query Helpers
 *
 * Centralized data-access layer for all document operations.
 * Every function that queries user-scoped data sets the RLS context first.
 *
 * SECURITY PATTERN:
 * 1. Set `app.current_user_id` via `set_app_user()` before any query
 * 2. PostgreSQL RLS policies enforce access at the DB level
 * 3. Application-level role checks add a second layer for clarity
 */

import { db, pool } from "@/db";
import {
  documents,
  documentMembers,
  documentVersions,
  syncOperations,
  users,
} from "@/db/schema";
import { and, desc, eq, ne, sql } from "drizzle-orm";
import type { DocumentRole } from "@/db/schema";

// ----------------------------------------------------------------
// RLS Context Setter
// ----------------------------------------------------------------

/**
 * Set the current user in PostgreSQL session config for RLS.
 * Must be called before any user-scoped query within a transaction.
 */
export async function withUserContext<T>(
  userId: string,
  fn: () => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("SELECT set_app_user($1)", [userId]);
    return await fn();
  } finally {
    client.release();
  }
}

// ----------------------------------------------------------------
// Document Queries
// ----------------------------------------------------------------

/**
 * List all documents accessible by a user (they are a member).
 * Returns documents with the user's role and member count.
 */
export async function getUserDocuments(userId: string) {
  const results = await db
    .select({
      id: documents.id,
      title: documents.title,
      ownerId: documents.ownerId,
      createdAt: documents.createdAt,
      updatedAt: documents.updatedAt,
      isDeleted: documents.isDeleted,
      role: documentMembers.role,
      memberCount: sql<number>`(
        SELECT COUNT(*) FROM document_members dm2
        WHERE dm2.document_id = ${documents.id}
      )`.as("member_count"),
    })
    .from(documents)
    .innerJoin(
      documentMembers,
      and(
        eq(documentMembers.documentId, documents.id),
        eq(documentMembers.userId, userId)
      )
    )
    .where(eq(documents.isDeleted, false))
    .orderBy(desc(documents.updatedAt));

  return results;
}

/**
 * Get a single document — verifies the user is a member.
 * Returns null if the document doesn't exist or user has no access.
 */
export async function getDocumentWithRole(
  documentId: string,
  userId: string
) {
  const [result] = await db
    .select({
      id: documents.id,
      title: documents.title,
      ownerId: documents.ownerId,
      yjsState: documents.yjsState,
      serverClock: documents.serverClock,
      createdAt: documents.createdAt,
      updatedAt: documents.updatedAt,
      role: documentMembers.role,
    })
    .from(documents)
    .innerJoin(
      documentMembers,
      and(
        eq(documentMembers.documentId, documents.id),
        eq(documentMembers.userId, userId)
      )
    )
    .where(
      and(eq(documents.id, documentId), eq(documents.isDeleted, false))
    )
    .limit(1);

  return result ?? null;
}

/**
 * Create a new document and insert the owner as a member in one transaction.
 */
export async function createDocument(
  userId: string,
  title = "Untitled Document"
) {
  return await db.transaction(async (tx) => {
    const [doc] = await tx
      .insert(documents)
      .values({ title, ownerId: userId })
      .returning();

    if (!doc) throw new Error("Failed to create document");

    await tx.insert(documentMembers).values({
      documentId: doc.id,
      userId,
      role: "owner",
    });

    return doc;
  });
}

/**
 * Update document title (owner or editor only).
 */
export async function updateDocumentTitle(
  documentId: string,
  userId: string,
  title: string
) {
  // Verify edit permission first
  const doc = await getDocumentWithRole(documentId, userId);
  if (!doc) throw new Error("Document not found");
  if (doc.role === "viewer") throw new Error("Viewers cannot edit documents");

  const [updated] = await db
    .update(documents)
    .set({ title, updatedAt: new Date() })
    .where(eq(documents.id, documentId))
    .returning({ id: documents.id, title: documents.title });

  return updated;
}

/**
 * Soft-delete a document (owner only).
 */
export async function deleteDocument(documentId: string, userId: string) {
  const doc = await getDocumentWithRole(documentId, userId);
  if (!doc) throw new Error("Document not found");
  if (doc.role !== "owner") throw new Error("Only owners can delete documents");

  await db
    .update(documents)
    .set({ isDeleted: true, deletedAt: new Date() })
    .where(eq(documents.id, documentId));
}

// ----------------------------------------------------------------
// Member Queries
// ----------------------------------------------------------------

/**
 * Get all members of a document with their user details.
 */
export async function getDocumentMembers(
  documentId: string,
  requestingUserId: string
) {
  // Verify requester is a member
  const requester = await getDocumentWithRole(documentId, requestingUserId);
  if (!requester) throw new Error("Access denied");

  return await db
    .select({
      userId: documentMembers.userId,
      role: documentMembers.role,
      joinedAt: documentMembers.joinedAt,
      name: users.name,
      email: users.email,
      image: users.image,
    })
    .from(documentMembers)
    .innerJoin(users, eq(documentMembers.userId, users.id))
    .where(eq(documentMembers.documentId, documentId))
    .orderBy(documentMembers.joinedAt);
}

/**
 * Add a member to a document (owner only).
 * Looks up the user by email.
 */
export async function addDocumentMember(
  documentId: string,
  ownerUserId: string,
  inviteeEmail: string,
  role: Exclude<DocumentRole, "owner">
) {
  const doc = await getDocumentWithRole(documentId, ownerUserId);
  if (!doc) throw new Error("Document not found");
  if (doc.role !== "owner") throw new Error("Only owners can invite members");

  // Find the user by email
  const [invitee] = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(eq(users.email, inviteeEmail))
    .limit(1);

  if (!invitee) throw new Error(`No user found with email: ${inviteeEmail}`);

  // Check if already a member
  const [existing] = await db
    .select({ id: documentMembers.id })
    .from(documentMembers)
    .where(
      and(
        eq(documentMembers.documentId, documentId),
        eq(documentMembers.userId, invitee.id)
      )
    )
    .limit(1);

  if (existing) throw new Error("User is already a member of this document");

  const [member] = await db
    .insert(documentMembers)
    .values({
      documentId,
      userId: invitee.id,
      role,
      invitedByUserId: ownerUserId,
    })
    .returning();

  return member;
}

/**
 * Update a member's role (owner only, cannot change own role).
 */
export async function updateMemberRole(
  documentId: string,
  ownerUserId: string,
  targetUserId: string,
  newRole: Exclude<DocumentRole, "owner">
) {
  if (ownerUserId === targetUserId) {
    throw new Error("Cannot change your own role");
  }

  const doc = await getDocumentWithRole(documentId, ownerUserId);
  if (!doc) throw new Error("Document not found");
  if (doc.role !== "owner") throw new Error("Only owners can change roles");

  const [updated] = await db
    .update(documentMembers)
    .set({ role: newRole })
    .where(
      and(
        eq(documentMembers.documentId, documentId),
        eq(documentMembers.userId, targetUserId),
        ne(documentMembers.role, "owner") // Never touch owner entry
      )
    )
    .returning();

  if (!updated) throw new Error("Member not found");
  return updated;
}

/**
 * Remove a member (owner only).
 */
export async function removeDocumentMember(
  documentId: string,
  ownerUserId: string,
  targetUserId: string
) {
  if (ownerUserId === targetUserId) {
    throw new Error("Cannot remove yourself from your own document");
  }

  const doc = await getDocumentWithRole(documentId, ownerUserId);
  if (!doc) throw new Error("Document not found");
  if (doc.role !== "owner") throw new Error("Only owners can remove members");

  await db
    .delete(documentMembers)
    .where(
      and(
        eq(documentMembers.documentId, documentId),
        eq(documentMembers.userId, targetUserId),
        ne(documentMembers.role, "owner")
      )
    );
}

// ----------------------------------------------------------------
// Sync Operation Queries
// ----------------------------------------------------------------

/**
 * Get all sync operations for a document after a given sequence number.
 * Used during reconnect sync: client says "I have up to seq 47, give me the rest."
 */
export async function getSyncOperationsSince(
  documentId: string,
  userId: string,
  afterSequenceNumber: number
) {
  // Verify membership
  const doc = await getDocumentWithRole(documentId, userId);
  if (!doc) throw new Error("Access denied");

  return await db
    .select({
      id: syncOperations.id,
      sequenceNumber: syncOperations.sequenceNumber,
      yjsUpdate: syncOperations.yjsUpdate,
      userId: syncOperations.userId,
      serverTimestamp: syncOperations.serverTimestamp,
      isRestoreOp: syncOperations.isRestoreOp,
    })
    .from(syncOperations)
    .where(
      and(
        eq(syncOperations.documentId, documentId),
        sql`${syncOperations.sequenceNumber} > ${afterSequenceNumber}`
      )
    )
    .orderBy(syncOperations.sequenceNumber);
}

/**
 * Append a sync operation. Returns the assigned sequence number.
 * The sequence number is assigned atomically to prevent gaps.
 */
export async function appendSyncOperation(
  documentId: string,
  userId: string,
  yjsUpdate: Buffer,
  isRestoreOp = false,
  restoredFromVersionId?: string
) {
  return await db.transaction(async (tx) => {
    // Atomically increment and get the next sequence number
    const [doc] = await tx
      .update(documents)
      .set({
        serverClock: sql`${documents.serverClock} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(documents.id, documentId))
      .returning({ serverClock: documents.serverClock });

    if (!doc) throw new Error("Document not found");

    const [op] = await tx
      .insert(syncOperations)
      .values({
        documentId,
        userId,
        yjsUpdate,
        sequenceNumber: doc.serverClock,
        serverTimestamp: new Date(),
        isRestoreOp,
        restoredFromVersionId,
      })
      .returning({ id: syncOperations.id, sequenceNumber: syncOperations.sequenceNumber });

    return op!;
  });
}

// ----------------------------------------------------------------
// Version Queries
// ----------------------------------------------------------------

/**
 * List all versions for a document.
 */
export async function getDocumentVersions(
  documentId: string,
  userId: string
) {
  const doc = await getDocumentWithRole(documentId, userId);
  if (!doc) throw new Error("Access denied");

  return await db
    .select({
      id: documentVersions.id,
      documentId: documentVersions.documentId,
      label: documentVersions.label,
      description: documentVersions.description,
      atSequenceNumber: documentVersions.atSequenceNumber,
      createdAt: documentVersions.createdAt,
      isAutoSnapshot: documentVersions.isAutoSnapshot,
      createdByName: users.name,
      createdById: documentVersions.createdById,
    })
    .from(documentVersions)
    .innerJoin(users, eq(documentVersions.createdById, users.id))
    .where(eq(documentVersions.documentId, documentId))
    .orderBy(desc(documentVersions.createdAt));
}

/**
 * Create a named snapshot of the current document state.
 * `yjsSnapshot` is the result of Y.encodeStateAsUpdate(doc).
 */
export async function createDocumentVersion(
  documentId: string,
  userId: string,
  label: string,
  description: string | null,
  yjsSnapshot: Buffer,
  atSequenceNumber: number,
  isAutoSnapshot = false
) {
  const doc = await getDocumentWithRole(documentId, userId);
  if (!doc) throw new Error("Access denied");
  if (doc.role === "viewer") throw new Error("Viewers cannot create versions");

  const [version] = await db
    .insert(documentVersions)
    .values({
      documentId,
      createdById: userId,
      label,
      description,
      yjsSnapshot,
      atSequenceNumber,
      isAutoSnapshot,
    })
    .returning();

  return version!;
}

/**
 * Get a specific version snapshot (for restore).
 * Returns the binary Yjs snapshot.
 */
export async function getDocumentVersion(
  versionId: string,
  userId: string
) {
  const [version] = await db
    .select({
      id: documentVersions.id,
      documentId: documentVersions.documentId,
      yjsSnapshot: documentVersions.yjsSnapshot,
      atSequenceNumber: documentVersions.atSequenceNumber,
      label: documentVersions.label,
    })
    .from(documentVersions)
    .where(eq(documentVersions.id, versionId))
    .limit(1);

  if (!version) return null;

  // Verify requesting user is a member
  const doc = await getDocumentWithRole(version.documentId, userId);
  if (!doc) throw new Error("Access denied");

  return version;
}
