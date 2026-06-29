"use client";

import dynamic from "next/dynamic";
import type { DocumentRole } from "@/types";

const EditorShell = dynamic(
  () => import("@/components/editor/editor-shell").then((m) => m.EditorShell),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="animate-pulse text-slate-400 text-sm">
          Loading editor...
        </div>
      </div>
    ),
  }
);

interface EditorClientWrapperProps {
  documentId: string;
  documentTitle: string;
  userRole: DocumentRole;
  userId: string;
  userName: string;
  userImage: string | null;
}

export function EditorClientWrapper(props: EditorClientWrapperProps) {
  return <EditorShell {...props} />;
}