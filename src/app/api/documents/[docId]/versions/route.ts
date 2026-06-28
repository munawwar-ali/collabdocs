/**
 * GET  /api/documents/[docId]/versions  — list snapshots
 * POST /api/documents/[docId]/versions  — create named snapshot
 *
 * SECURITY: rate-limited, role-checked, snapshot size capped,
 * base64 validated, binary sanity checked.
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { getAuthOrUnauthorized } from "@/lib/session";
import {
  getDocumentVersions,
  createDocumentVersion,
  getDocumentWithRole,
} from "@/db/queries";
import {
  ok,
  created,
  parseJsonBody,
  notFound,
  forbidden,
  badRequest,
  serverError,
  rateLimit,
  payloadTooLarge,
} from "@/lib/api-middleware";
import {
  LIMITS,
  RATE_LIMITS,
  LabelSchema,
  DescriptionSchema,
  SequenceNumberSchema,
  YjsSnapshotSchema,
  isPlausibleYjsSnapshot,
  stripHtml,
  hasNullBytes,
} from "@/lib/security";

type RouteContext = { params: Promise<{ docId: string }> };

// ── GET ───────────────────────────────────────────────────────────
export async function GET(_req: NextRequest, { params }: RouteContext) {
  try {
    const { userId, response } = await getAuthOrUnauthorized();
    if (response) return response;

    const { docId } = await params;
    const versions = await getDocumentVersions(docId, userId);
    return ok(versions);
  } catch (error) {
    if (error instanceof Error && error.message === "Access denied") {
      return forbidden();
    }
    return serverError(error);
  }
}

// ── POST ──────────────────────────────────────────────────────────
const CreateVersionSchema = z.object({
  label: LabelSchema,
  description: DescriptionSchema,
  yjsSnapshot: YjsSnapshotSchema,
  atSequenceNumber: SequenceNumberSchema,
});

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const { userId, response } = await getAuthOrUnauthorized();
    if (response) return response;

    const { docId } = await params;

    // ── Rate limit ─────────────────────────────────────────────
    const rl = rateLimit(userId, `version-create-${docId}`,
      RATE_LIMITS.VERSION_CREATE.limit, RATE_LIMITS.VERSION_CREATE.windowMs);
    if (rl) return rl;

    // ── Role check ─────────────────────────────────────────────
    const doc = await getDocumentWithRole(docId, userId);
    if (!doc) return notFound("Document not found");
    if (doc.role === "viewer") return forbidden("Viewers cannot create versions");

    // ── Parse + validate ───────────────────────────────────────
    const [body, error] = await parseJsonBody(request, CreateVersionSchema);
    if (error) return error;

    // ── Sanitise text fields ───────────────────────────────────
    const label = stripHtml(body.label);
    if (hasNullBytes(label)) return badRequest("Invalid characters in label");

    // ── Decode snapshot ────────────────────────────────────────
    let snapshotBuffer: Buffer;
    try {
      snapshotBuffer = Buffer.from(body.yjsSnapshot, "base64");
    } catch {
      return badRequest("Invalid base64 snapshot encoding");
    }

    if (snapshotBuffer.byteLength > LIMITS.MAX_SNAPSHOT_BYTES) return payloadTooLarge();
    if (!isPlausibleYjsSnapshot(snapshotBuffer)) {
      return badRequest("Payload does not appear to be a valid Yjs snapshot");
    }

    const version = await createDocumentVersion(
      docId, userId, label,
      body.description ? stripHtml(body.description) : null,
      snapshotBuffer, body.atSequenceNumber
    );

    // Strip binary from response
    const { yjsSnapshot: _blob, ...safeMeta } = version;
    return created(safeMeta);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes("not found")) return notFound(error.message);
      if (error.message.includes("Viewers")) return forbidden(error.message);
    }
    return serverError(error);
  }
}
