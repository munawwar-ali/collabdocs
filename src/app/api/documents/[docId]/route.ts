/**
 * GET    /api/documents/[docId]  — fetch document + role
 * PATCH  /api/documents/[docId]  — update title (editor/owner)
 * DELETE /api/documents/[docId]  — soft-delete (owner only)
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthOrUnauthorized } from "@/lib/session";
import { getDocumentWithRole, updateDocumentTitle, deleteDocument } from "@/db/queries";
import {
  ok, parseJsonBody, notFound, forbidden, serverError,
} from "@/lib/api-middleware";
import { TitleSchema, stripHtml, hasNullBytes } from "@/lib/security";
import { badRequest } from "@/lib/api-middleware";

type RouteContext = { params: Promise<{ docId: string }> };

export async function GET(_req: NextRequest, { params }: RouteContext) {
  try {
    const { userId, response } = await getAuthOrUnauthorized();
    if (response) return response;
    const { docId } = await params;

    const document = await getDocumentWithRole(docId, userId);
    if (!document) return notFound("Document not found");

    // Never send binary Yjs state over this route
    const { yjsState: _yjsState, ...safeDoc } = document;
    return ok(safeDoc);
  } catch (error) {
    return serverError(error);
  }
}

const UpdateDocumentSchema = z.object({
  title: TitleSchema,
});

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const { userId, response } = await getAuthOrUnauthorized();
    if (response) return response;
    const { docId } = await params;

    const [body, error] = await parseJsonBody(request, UpdateDocumentSchema);
    if (error) return error;

    const title = stripHtml(body.title);
    if (hasNullBytes(title)) return badRequest("Invalid characters in title");

    const updated = await updateDocumentTitle(docId, userId, title);
    if (!updated) return notFound("Document not found");
    return ok(updated);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes("not found")) return notFound(error.message);
      if (error.message.includes("Viewers")) return forbidden(error.message);
    }
    return serverError(error);
  }
}

export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  try {
    const { userId, response } = await getAuthOrUnauthorized();
    if (response) return response;
    const { docId } = await params;

    await deleteDocument(docId, userId);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes("not found")) return notFound(error.message);
      if (error.message.includes("Only owners")) return forbidden(error.message);
    }
    return serverError(error);
  }
}
