"use client";

/**
 * CollaborativeEditor
 *
 * The main TipTap rich-text editor wired to a Yjs CRDT document.
 * Features:
 * - Real-time collaboration with cursor presence
 * - Full offline editing (renders from IndexedDB, no network needed)
 * - Rich text formatting (bold, italic, headings, lists, code blocks)
 * - Character count
 * - Placeholder text
 * - AI writing assistant integration point
 */

import { useEffect, useRef } from "react";
import { useEditor, EditorContent, Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCursor from "@tiptap/extension-collaboration-cursor";
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
    // ── Extensions ────────────────────────────────────────────
    extensions: [
      StarterKit.configure({
        // Yjs handles undo/redo via Y.UndoManager — disable built-in history
        // Note: In TipTap v3, history is disabled automatically when
        // the Collaboration extension is present
      }),

      // Yjs CRDT binding — every keystroke is a Yjs transaction
      Collaboration.configure({
        document: doc,
        field: "content", // Must match createYDoc() fragment name
      }),

      // Live cursor positions from collaborators
      ...(provider
        ? [
            CollaborationCursor.configure({
              provider,
              user: {
                // Will be overridden by awareness state from useYDoc
                name: "You",
                color: "#3b82f6",
              },
            }),
          ]
        : []),

      // Placeholder text for empty documents
      Placeholder.configure({
        placeholder:
          "Start writing… your work is saved locally as you type.",
        emptyEditorClass: "is-editor-empty",
      }),

      // Character count display
      CharacterCount.configure({
        limit: 100_000, // 100k char limit per document
      }),
    ],

    // ── Editor settings ───────────────────────────────────────
    editable: !isReadOnly,
    autofocus: !isReadOnly ? "end" : false,

    // ── Editor ready callback ─────────────────────────────────
    onCreate: ({ editor }) => {
      onEditorReadyRef.current?.(editor);
    },

    // ── Accessibility ─────────────────────────────────────────
    editorProps: {
      attributes: {
        class:
          "prose prose-slate max-w-none focus:outline-none min-h-[calc(100vh-16rem)] px-8 py-6",
        role: "textbox",
        "aria-label": "Document editor",
        "aria-multiline": "true",
        "aria-readonly": isReadOnly ? "true" : "false",
      },
    },
  });

  // Update editable state when role changes
  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!isReadOnly);
  }, [editor, isReadOnly]);

  if (!editor) return null;

  const charCount = editor.storage.characterCount?.characters?.() ?? 0;
  const wordCount = editor.storage.characterCount?.words?.() ?? 0;

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar (hidden for viewers) */}
      {!isReadOnly && <EditorToolbar editor={editor} />}

      {/* Editor surface */}
      <div className="flex-1 overflow-y-auto bg-white">
        <div className="max-w-4xl mx-auto">
          <EditorContent editor={editor} />
        </div>
      </div>

      {/* Status bar */}
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
