/**
 * GET  /api/documents  — list documents
 * POST /api/documents  — create document
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { getAuthOrUnauthorized } from "@/lib/session";
import { getUserDocuments, createDocument } from "@/db/queries";
import {
  ok, created, parseJsonBody, serverError, rateLimit,
} from "@/lib/api-middleware";
import { TitleSchema, RATE_LIMITS, stripHtml, hasNullBytes } from "@/lib/security";
import { badRequest } from "@/lib/api-middleware";

export async function GET() {
  try {
    const { userId, response } = await getAuthOrUnauthorized();
    if (response) return response;
    const documents = await getUserDocuments(userId);
    return ok(documents);
  } catch (error) {
    return serverError(error);
  }
}

const CreateDocumentSchema = z.object({
  title: TitleSchema.default("Untitled Document"),
});

export async function POST(request: NextRequest) {
  try {
    const { userId, response } = await getAuthOrUnauthorized();
    if (response) return response;

    const rl = rateLimit(userId, "doc-create",
      RATE_LIMITS.DOCUMENT_CREATE.limit, RATE_LIMITS.DOCUMENT_CREATE.windowMs);
    if (rl) return rl;

    const [body, error] = await parseJsonBody(request, CreateDocumentSchema);
    if (error) return error;

    const title = stripHtml(body.title);
    if (hasNullBytes(title)) return badRequest("Invalid characters in title");

    const document = await createDocument(userId, title);
    return created(document);
  } catch (error) {
    return serverError(error);
  }
}
