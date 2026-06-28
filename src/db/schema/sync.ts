/**
 * Sync Operations Table
 *
 * Every Yjs update that flows through the system is recorded here.
 * This serves as an append-only event log — the canonical history of
 * all changes to a document.
 *
 * WHY THIS EXISTS:
 * - Enables deterministic replay: any document state can be reconstructed
 *   by replaying all ops from the beginning
 * - Enables granular diffing: clients can request ops since their last
 *   known sequence number instead of the full document state
 * - Enables audit trails and conflict forensics
 *
 * SECURITY:
 * - Max payload size enforced at the API middleware level (1MB default)
 * - userId is always set server-side from the verified JWT session —
 *   never trusted from the client payload
 */

import {
  pgTable,
  uuid,
  integer,
  timestamp,
  text,
  boolean,
  index,
} from "drizzle-orm/pg-core";
import { bytea } from "./types";
import { documents } from "./documents";
import { users } from "./users";

export const syncOperations = pgTable(
  "sync_operations",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),

    // Who submitted this update (always verified server-side)
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    // The raw Yjs binary update (Uint8Array encoded as BYTEA)
    // This is the minimal delta, not the full document state
    yjsUpdate: bytea("yjs_update").notNull(),

    // Monotonic sequence number per document for ordered replay
    // Assigned by the server, never trusted from client
    sequenceNumber: integer("sequence_number").notNull(),

    // Client-side timestamp (informational only — server time is authoritative)
    clientTimestamp: timestamp("client_timestamp", { mode: "date" }),

    // Server-assigned timestamp (authoritative for ordering)
    serverTimestamp: timestamp("server_timestamp", { mode: "date" })
      .notNull()
      .defaultNow(),

    // Whether this op was the result of a version restore
    isRestoreOp: boolean("is_restore_op").notNull().default(false),

    // If this is a restore, which version was restored
    restoredFromVersionId: uuid("restored_from_version_id"),
  },
  (table) => ({
    // Fast lookup: "give me all ops for doc X after sequence N"
    docSeqIdx: index("sync_ops_doc_seq_idx").on(
      table.documentId,
      table.sequenceNumber
    ),
    // Fast lookup for sync: latest op per document
    docTimestampIdx: index("sync_ops_doc_timestamp_idx").on(
      table.documentId,
      table.serverTimestamp
    ),
  })
);

/**
 * Document Versions (Snapshots)
 *
 * A snapshot is a complete Yjs document state captured at a point in time.
 * Unlike sync_operations (which are deltas), a snapshot is a full state
 * vector that can be used to restore the document directly.
 *
 * RESTORE SEMANTICS (critical for correctness):
 * Restoring a snapshot does NOT overwrite the document state directly.
 * Instead, we create a new Yjs update that transitions the current state
 * to the snapshot content. This update flows through the normal sync
 * pipeline, so all active collaborators receive it as just another update —
 * they never experience a jarring state reset.
 *
 * This means:
 * - Active collaborators' pending local changes are preserved (CRDT merge)
 * - Version history is never destructive
 * - The sequence number continues forward (no gaps or resets)
 */
export const documentVersions = pgTable(
  "document_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),

    // Who created this snapshot
    createdById: uuid("created_by_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    // Human-readable label (e.g. "Before major edit", "v2.0 draft")
    label: text("label").notNull(),

    // Optional description
    description: text("description"),

    // The full Yjs document state at this point in time (BYTEA)
    // This is Y.encodeStateAsUpdate(doc) — the complete snapshot
    yjsSnapshot: bytea("yjs_snapshot").notNull(),

    // The sequence number of the last sync_op included in this snapshot
    // Used to efficiently find which ops were applied after this snapshot
    atSequenceNumber: integer("at_sequence_number").notNull(),

    // Metadata
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),

    // Was this version created automatically (e.g. every 50 ops) or manually?
    isAutoSnapshot: boolean("is_auto_snapshot").notNull().default(false),
  },
  (table) => ({
    docVersionIdx: index("doc_versions_doc_idx").on(
      table.documentId,
      table.createdAt
    ),
  })
);

// TypeScript types
export type SyncOperation = typeof syncOperations.$inferSelect;
export type NewSyncOperation = typeof syncOperations.$inferInsert;
export type DocumentVersion = typeof documentVersions.$inferSelect;
export type NewDocumentVersion = typeof documentVersions.$inferInsert;
