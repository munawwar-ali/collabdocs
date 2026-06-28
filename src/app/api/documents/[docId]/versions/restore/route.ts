/**
 * POST /api/documents/[docId]/versions/restore
 * Returns the snapshot binary for client-side restore.
 * Editors and owners only.
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { getAuthOrUnauthorized } from "@/lib/session";
import { getDocumentVersion, getDocumentWithRole } from "@/db/queries";
import {
  ok, parseJsonBody, notFound, forbidden, serverError,
} from "@/lib/api-middleware";
import { UUIDSchema } from "@/lib/security";

type RouteContext = { params: Promise<{ docId: string }> };

const RestoreSchema = z.object({
  versionId: UUIDSchema,
});

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const { userId, response } = await getAuthOrUnauthorized();
    if (response) return response;
    const { docId } = await params;

    const doc = await getDocumentWithRole(docId, userId);
    if (!doc) return notFound("Document not found");
    if (doc.role === "viewer") return forbidden("Viewers cannot restore versions");

    const [body, error] = await parseJsonBody(request, RestoreSchema);
    if (error) return error;

    const version = await getDocumentVersion(body.versionId, userId);
    if (!version) return notFound("Version not found");
    if (version.documentId !== docId) return forbidden("Version does not belong to this document");

    const yjsSnapshotBase64 = version.yjsSnapshot
      ? Buffer.from(version.yjsSnapshot).toString("base64")
      : null;

    return ok({
      versionId: version.id,
      label: version.label,
      atSequenceNumber: version.atSequenceNumber,
      yjsSnapshotBase64,
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes("not found")) return notFound(error.message);
      if (error.message === "Access denied") return forbidden();
    }
    return serverError(error);
  }
}
