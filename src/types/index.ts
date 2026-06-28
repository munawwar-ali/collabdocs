// ============================================================
// CollabDocs — Global Type Definitions
// ============================================================

// --- Document roles ---
export type DocumentRole = "owner" | "editor" | "viewer";

// --- Document status ---
export type SyncStatus = "synced" | "pending" | "syncing" | "conflict" | "offline";

// --- Document member ---
export interface DocumentMember {
  userId: string;
  email: string;
  name: string | null;
  image: string | null;
  role: DocumentRole;
  joinedAt: Date;
}

// --- Document (full) ---
export interface Document {
  id: string;
  title: string;
  ownerId: string;
  createdAt: Date;
  updatedAt: Date;
  isDeleted: boolean;
}

// --- Document with member role (for the current user) ---
export interface DocumentWithRole extends Document {
  role: DocumentRole;
  memberCount: number;
}

// --- Version snapshot ---
export interface DocumentVersion {
  id: string;
  documentId: string;
  createdById: string;
  createdByName: string | null;
  label: string;
  description: string | null;
  createdAt: Date;
  atSequenceNumber: number;
  isAutoSnapshot: boolean;
}

// --- Sync operation (queued locally) ---
export interface SyncOperation {
  id: string;
  documentId: string;
  update: Uint8Array; // Yjs binary update
  timestamp: number;
  retries: number;
}

// --- Awareness state (collaborator presence) ---
export interface AwarenessState {
  user: {
    id: string;
    name: string;
    color: string;
    image: string | null;
  };
  cursor: {
    anchor: number | null;
    head: number | null;
  } | null;
}

// --- API response wrapper ---
export interface ApiResponse<T = unknown> {
  data?: T;
  error?: string;
  message?: string;
}

// --- Session user (extends next-auth) ---
export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
}
