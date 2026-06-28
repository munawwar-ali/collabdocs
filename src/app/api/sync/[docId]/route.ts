/**
 * GET  /api/sync/[docId]?since=N  — pull Yjs updates since sequence N
 * POST /api/sync/[docId]          — push a new Yjs update (editors only)
 *
 * SECURITY HARDENING:
 * - Auth enforced by middleware (401 if no session)
 * - Role checked: viewers blocked from POST at both API and DB level
 * - Payload size capped at 512KB binary (OOM protection)
 * - Zod validates all inputs before touching DB
 * - Rate limited: 120 pushes/minute per user (prevents flood attacks)
 * - Yjs binary sanity check before append
 * - Sequence number validated as non-negative integer
 * - All errors return generic messages (no internal details leaked)
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { getAuthOrUnauthorized } from "@/lib/session";
import {
  getSyncOperationsSince,
  appendSyncOperation,
  getDocumentWithRole,
} from "@/db/queries";
import {
  ok,
  parseJsonBody,
  forbidden,
  notFound,
  badRequest,
  serverError,
  rateLimit,
  payloadTooLarge,
} from "@/lib/api-middleware";
import {
  LIMITS,
  RATE_LIMITS,
  YjsUpdateSchema,
  SequenceNumberSchema,
  isPlausibleYjsUpdate,
} from "@/lib/security";
import { maybeCreateAutoSnapshot } from "@/lib/sync/auto-snapshot";

type RouteContext = { params: Promise<{ docId: string }> };

// ── GET /api/sync/[docId] ─────────────────────────────────────────
export async function GET(req: NextRequest, { params }: RouteContext) {
  try {
    const { userId, response } = await getAuthOrUnauthorized();
    if (response) return response;

    const { docId } = await params;

    // Validate ?since param
    const sinceParam = req.nextUrl.searchParams.get("since");
    const sinceResult = SequenceNumberSchema.safeParse(
      sinceParam !== null ? Number(sinceParam) : 0
    );
    if (!sinceResult.success) {
      return badRequest("Invalid 'since' parameter — must be a non-negative integer");
    }

    const ops = await getSyncOperationsSince(docId, userId, sinceResult.data);

    const updates = ops.map((op) => ({
      sequenceNumber: op.sequenceNumber,
      userId: op.userId,
      serverTimestamp: op.serverTimestamp,
      isRestoreOp: op.isRestoreOp,
      yjsUpdateBase64: op.yjsUpdate
        ? Buffer.from(op.yjsUpdate).toString("base64")
        : null,
    }));

    const latestSequence =
      ops.length > 0 ? (ops[ops.length - 1]?.sequenceNumber ?? sinceResult.data) : sinceResult.data;

    return ok({ updates, latestSequence, count: ops.length });
  } catch (error) {
    if (error instanceof Error && error.message === "Access denied") {
      return forbidden();
    }
    return serverError(error);
  }
}

// ── POST /api/sync/[docId] ────────────────────────────────────────
const SyncPushSchema = z.object({
  update: YjsUpdateSchema,
  isRestoreOp: z.boolean().default(false),
  restoredFromVersionId: z.string().uuid().optional().nullable(),
});

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const { userId, response } = await getAuthOrUnauthorized();
    if (response) return response;

    const { docId } = await params;

    // ── Rate limit ─────────────────────────────────────────────
    const rateLimitRes = rateLimit(
      userId,
      `sync-${docId}`,
      RATE_LIMITS.SYNC_PUSH.limit,
      RATE_LIMITS.SYNC_PUSH.windowMs
    );
    if (rateLimitRes) return rateLimitRes;

    // ── Role check ─────────────────────────────────────────────
    const doc = await getDocumentWithRole(docId, userId);
    if (!doc) return notFound("Document not found");
    if (doc.role === "viewer") {
      return forbidden("Viewers cannot push document updates");
    }

    // ── Parse + validate ───────────────────────────────────────
    const [body, error] = await parseJsonBody(request, SyncPushSchema);
    if (error) return error;

    // ── Decode base64 → Buffer ─────────────────────────────────
    let updateBuffer: Buffer;
    try {
      updateBuffer = Buffer.from(body.update, "base64");
    } catch {
      return badRequest("Invalid base64 encoding");
    }

    // ── Binary size cap ────────────────────────────────────────
    if (updateBuffer.byteLength > LIMITS.MAX_YJS_UPDATE_BYTES) {
      return payloadTooLarge();
    }

    // ── Yjs sanity check ───────────────────────────────────────
    if (!isPlausibleYjsUpdate(updateBuffer)) {
      return badRequest("Payload does not appear to be a valid Yjs update");
    }

    // ── Append to sync log ─────────────────────────────────────
    const op = await appendSyncOperation(
      docId,
      userId,
      updateBuffer,
      body.isRestoreOp,
      body.restoredFromVersionId ?? undefined
    );

    // Fire-and-forget auto-snapshot (non-blocking)
    if (op?.sequenceNumber) {
      void maybeCreateAutoSnapshot(docId, op.sequenceNumber, userId);
    }

    return ok({
      sequenceNumber: op?.sequenceNumber,
      id: op?.id,
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes("not found")) return notFound(error.message);
      if (error.message.includes("Viewers")) return forbidden(error.message);
    }
    return serverError(error);
  }
}
