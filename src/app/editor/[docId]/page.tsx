import { redirect, notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { getDocumentWithRole } from "@/db/queries";
import { EditorClientWrapper } from "@/components/editor/editor-client-wrapper";

interface EditorPageProps {
  params: Promise<{ docId: string }>;
}

export default async function EditorPage({ params }: EditorPageProps) {
  const { docId } = await params;

  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const document = await getDocumentWithRole(docId, session.user.id);
  if (!document) notFound();

  return (
    <EditorClientWrapper
      documentId={docId}
      documentTitle={document.title}
      userRole={document.role}
      userId={session.user.id}
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