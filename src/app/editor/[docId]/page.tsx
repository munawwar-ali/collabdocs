/**
 * Editor Page (Server Component)
 *
 * Fetches document metadata and the current user's role server-side,
 * then hands off to the client-side EditorShell which mounts Yjs.
 *
 * WHY SERVER COMPONENT HERE:
 * - Auth check happens server-side (no client round-trip)
 * - Document metadata (title, role) available before hydration
 * - If the user has no access, redirect before sending any JS
 */

import { redirect, notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { getDocumentWithRole } from "@/db/queries";
import { EditorShell } from "@/components/editor/editor-shell";

interface EditorPageProps {
  params: Promise<{ docId: string }>;
}

export default async function EditorPage({ params }: EditorPageProps) {
  const { docId } = await params;

  // Auth check — middleware already protects this route, but
  // we verify again here for defense in depth
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const userId = session.user.id;

  // Fetch document + verify membership
  const document = await getDocumentWithRole(docId, userId);
  if (!document) notFound();

  return (
    <EditorShell
      documentId={docId}
      documentTitle={document.title}
      userRole={document.role}
      userId={userId}
      userName={session.user.name ?? "Anonymous"}
      userImage={session.user.image ?? null}
    />
  );
}

export async function generateMetadata({ params }: EditorPageProps) {
  const { docId } = await params;
  const session = await auth();
  if (!session?.user?.id) return { title: "CollabDocs" };

  const document = await getDocumentWithRole(docId, session.user.id);
  return {
    title: document ? `${document.title} — CollabDocs` : "CollabDocs",
  };
}
