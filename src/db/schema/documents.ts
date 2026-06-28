/**
 * Documents Table
 *
 * Core document metadata. The actual document content lives in Yjs
 * binary format — this table stores the server-side snapshot and metadata.
 *
 * IMPORTANT: Document content is stored as `BYTEA` (binary) because
 * Yjs encodes state as Uint8Array. We never store raw text here.
 */

import {
  pgTable,
  text,
  timestamp,
  boolean,
  uuid,
  integer,
  pgEnum,
} from "drizzle-orm/pg-core";
import { bytea } from "./types";
import { users } from "./users";

// Document member roles
// - owner: full control, can delete, manage members
// - editor: can read and write
// - viewer: read-only, cannot push updates to WS server
export const documentRoleEnum = pgEnum("document_role", [
  "owner",
  "editor",
  "viewer",
]);

export const documents = pgTable("documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull().default("Untitled Document"),

  // Owner is always a member too (in document_members), but we
  // keep a direct FK for fast ownership checks and RLS policies.
  ownerId: uuid("owner_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),

  // Server-side Yjs state vector (binary).
  // This is the authoritative server state for sync negotiation.
  // Clients send their state vector; server diffs and returns missing updates.
  yjsState: bytea("yjs_state"),

  // Server clock: monotonically increasing, used for optimistic concurrency
  serverClock: integer("server_clock").notNull().default(0),

  // Soft delete: documents are never hard-deleted to preserve version history
  isDeleted: boolean("is_deleted").notNull().default(false),
  deletedAt: timestamp("deleted_at", { mode: "date" }),

  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

/**
 * Document Members
 *
 * Junction table between users and documents.
 * Every document has at least one member: the owner.
 * RLS policies use this table to enforce read/write access.
 */
export const documentMembers = pgTable("document_members", {
  id: uuid("id").primaryKey().defaultRandom(),
  documentId: uuid("document_id")
    .notNull()
    .references(() => documents.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  role: documentRoleEnum("role").notNull().default("viewer"),
  invitedByUserId: uuid("invited_by_user_id").references(() => users.id),
  joinedAt: timestamp("joined_at", { mode: "date" }).notNull().defaultNow(),
});

// TypeScript types
export type Document = typeof documents.$inferSelect;
export type NewDocument = typeof documents.$inferInsert;
export type DocumentMember = typeof documentMembers.$inferSelect;
export type NewDocumentMember = typeof documentMembers.$inferInsert;
export type DocumentRole = "owner" | "editor" | "viewer";
