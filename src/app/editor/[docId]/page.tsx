import { redirect, notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { getDocumentWithRole } from "@/db/queries";
import dynamic from "next/dynamic";

// Dynamic import prevents TipTap/Yjs from loading on the server
const EditorShell = dynamic(
  () => import("@/components/editor/editor-shell").then((m) => m.EditorShell),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-slate-400">Loading editor...</div>
      </div>
    ),
  }
);

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
    <EditorShell
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