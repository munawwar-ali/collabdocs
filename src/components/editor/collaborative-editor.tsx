"use client";

import { useEffect, useRef } from "react";
import { useEditor, EditorContent, Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import CharacterCount from "@tiptap/extension-character-count";
import * as Y from "yjs";
import type { WebsocketProvider } from "y-websocket";
import { EditorToolbar } from "./editor-toolbar";

interface CollaborativeEditorProps {
  doc: Y.Doc;
  provider: WebsocketProvider | null;
  isReadOnly: boolean;
  onEditorReady?: (editor: Editor) => void;
}

export function CollaborativeEditor({
  doc,
  provider,
  isReadOnly,
  onEditorReady,
}: CollaborativeEditorProps) {
  const onEditorReadyRef = useRef(onEditorReady);
  onEditorReadyRef.current = onEditorReady;

  const editor = useEditor({
    extensions: [
      StarterKit.configure({}),
      Placeholder.configure({
        placeholder: "Start writing… your work is saved locally as you type.",
        emptyEditorClass: "is-editor-empty",
      }),
      CharacterCount.configure({
        limit: 100_000,
      }),
    ],
    editable: !isReadOnly,
    autofocus: !isReadOnly ? "end" : false,
    onCreate: ({ editor }) => {
      onEditorReadyRef.current?.(editor);
    },
    editorProps: {
      attributes: {
        class:
          "prose prose-slate max-w-none focus:outline-none min-h-[calc(100vh-16rem)] px-8 py-6",
        role: "textbox",
        "aria-label": "Document editor",
        "aria-multiline": "true",
      },
    },
  });

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!isReadOnly);
  }, [editor, isReadOnly]);

  if (!editor) return null;

  const charCount = editor.storage.characterCount?.characters?.() ?? 0;
  const wordCount = editor.storage.characterCount?.words?.() ?? 0;

  return (
    <div className="flex flex-col h-full">
      {!isReadOnly && <EditorToolbar editor={editor} />}
      <div className="flex-1 overflow-y-auto bg-white">
        <div className="max-w-4xl mx-auto">
          <EditorContent editor={editor} />
        </div>
      </div>
      <div className="border-t bg-slate-50 px-4 py-1.5 flex items-center justify-between text-xs text-slate-500">
        <span>
          {wordCount.toLocaleString()} word{wordCount !== 1 ? "s" : ""} ·{" "}
          {charCount.toLocaleString()} character{charCount !== 1 ? "s" : ""}
        </span>
        {isReadOnly && (
          <span className="text-amber-600 font-medium">View only</span>
        )}
      </div>
    </div>
  );
}