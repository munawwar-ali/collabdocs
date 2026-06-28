/**
 * GET    /api/documents/[docId]/members  — list members
 * POST   /api/documents/[docId]/members  — invite by email
 * PATCH  /api/documents/[docId]/members  — change role
 * DELETE /api/documents/[docId]/members  — remove member
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthOrUnauthorized } from "@/lib/session";
import {
  getDocumentMembers, addDocumentMember,
  updateMemberRole, removeDocumentMember,
} from "@/db/queries";
import {
  ok, created, parseJsonBody, notFound, forbidden,
  conflict, badRequest, serverError, rateLimit,
} from "@/lib/api-middleware";
import {
  EmailSchema, UUIDSchema, AssignableRoleSchema, RATE_LIMITS,
} from "@/lib/security";

type RouteContext = { params: Promise<{ docId: string }> };

export async function GET(_req: NextRequest, { params }: RouteContext) {
  try {
    const { userId, response } = await getAuthOrUnauthorized();
    if (response) return response;
    const { docId } = await params;
    const members = await getDocumentMembers(docId, userId);
    return ok(members);
  } catch (error) {
    if (error instanceof Error && error.message === "Access denied") return forbidden();
    return serverError(error);
  }
}

const InviteMemberSchema = z.object({
  email: EmailSchema,
  role: AssignableRoleSchema,
});

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const { userId, response } = await getAuthOrUnauthorized();
    if (response) return response;
    const { docId } = await params;

    const rl = rateLimit(userId, `member-invite-${docId}`,
      RATE_LIMITS.MEMBER_INVITE.limit, RATE_LIMITS.MEMBER_INVITE.windowMs);
    if (rl) return rl;

    const [body, error] = await parseJsonBody(request, InviteMemberSchema);
    if (error) return error;

    const member = await addDocumentMember(docId, userId, body.email, body.role);
    return created(member);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes("not found")) return notFound(error.message);
      if (error.message.includes("Only owners")) return forbidden(error.message);
      if (error.message.includes("already a member")) return conflict(error.message);
      if (error.message.startsWith("No user found")) return badRequest(error.message);
    }
    return serverError(error);
  }
}

const UpdateRoleSchema = z.object({
  targetUserId: UUIDSchema,
  role: AssignableRoleSchema,
});

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const { userId, response } = await getAuthOrUnauthorized();
    if (response) return response;
    const { docId } = await params;

    const [body, error] = await parseJsonBody(request, UpdateRoleSchema);
    if (error) return error;

    const updated = await updateMemberRole(docId, userId, body.targetUserId, body.role);
    return ok(updated);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes("not found")) return notFound(error.message);
      if (error.message.includes("Only owners")) return forbidden(error.message);
      if (error.message.includes("own role")) return badRequest(error.message);
    }
    return serverError(error);
  }
}

const RemoveMemberSchema = z.object({
  targetUserId: UUIDSchema,
});

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  try {
    const { userId, response } = await getAuthOrUnauthorized();
    if (response) return response;
    const { docId } = await params;

    const [body, error] = await parseJsonBody(request, RemoveMemberSchema);
    if (error) return error;

    await removeDocumentMember(docId, userId, body.targetUserId);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes("not found")) return notFound(error.message);
      if (error.message.includes("Only owners")) return forbidden(error.message);
      if (error.message.includes("Cannot remove yourself")) return badRequest(error.message);
    }
    return serverError(error);
  }
}
