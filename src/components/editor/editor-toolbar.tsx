"use client";

/**
 * EditorToolbar
 * Rich-text formatting controls wired to TipTap's command API.
 */

import type { Editor } from "@tiptap/react";
import {
  Bold,
  Italic,
  Strikethrough,
  Code,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  CodeSquare,
  Minus,
  Undo,
  Redo,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface EditorToolbarProps {
  editor: Editor;
}

interface ToolbarButton {
  label: string;
  icon: React.ReactNode;
  action: () => void;
  isActive?: () => boolean;
  disabled?: () => boolean;
}

export function EditorToolbar({ editor }: EditorToolbarProps) {
  const groups: ToolbarButton[][] = [
    // History
    [
      {
        label: "Undo",
        icon: <Undo className="h-4 w-4" />,
        action: () => editor.chain().focus().undo().run(),
        disabled: () => !editor.can().undo(),
      },
      {
        label: "Redo",
        icon: <Redo className="h-4 w-4" />,
        action: () => editor.chain().focus().redo().run(),
        disabled: () => !editor.can().redo(),
      },
    ],
    // Headings
    [
      {
        label: "Heading 1",
        icon: <Heading1 className="h-4 w-4" />,
        action: () =>
          editor.chain().focus().toggleHeading({ level: 1 }).run(),
        isActive: () => editor.isActive("heading", { level: 1 }),
      },
      {
        label: "Heading 2",
        icon: <Heading2 className="h-4 w-4" />,
        action: () =>
          editor.chain().focus().toggleHeading({ level: 2 }).run(),
        isActive: () => editor.isActive("heading", { level: 2 }),
      },
      {
        label: "Heading 3",
        icon: <Heading3 className="h-4 w-4" />,
        action: () =>
          editor.chain().focus().toggleHeading({ level: 3 }).run(),
        isActive: () => editor.isActive("heading", { level: 3 }),
      },
    ],
    // Inline marks
    [
      {
        label: "Bold",
        icon: <Bold className="h-4 w-4" />,
        action: () => editor.chain().focus().toggleBold().run(),
        isActive: () => editor.isActive("bold"),
        disabled: () => !editor.can().toggleBold(),
      },
      {
        label: "Italic",
        icon: <Italic className="h-4 w-4" />,
        action: () => editor.chain().focus().toggleItalic().run(),
        isActive: () => editor.isActive("italic"),
        disabled: () => !editor.can().toggleItalic(),
      },
      {
        label: "Strikethrough",
        icon: <Strikethrough className="h-4 w-4" />,
        action: () => editor.chain().focus().toggleStrike().run(),
        isActive: () => editor.isActive("strike"),
      },
      {
        label: "Inline code",
        icon: <Code className="h-4 w-4" />,
        action: () => editor.chain().focus().toggleCode().run(),
        isActive: () => editor.isActive("code"),
      },
    ],
    // Blocks
    [
      {
        label: "Bullet list",
        icon: <List className="h-4 w-4" />,
        action: () => editor.chain().focus().toggleBulletList().run(),
        isActive: () => editor.isActive("bulletList"),
      },
      {
        label: "Ordered list",
        icon: <ListOrdered className="h-4 w-4" />,
        action: () => editor.chain().focus().toggleOrderedList().run(),
        isActive: () => editor.isActive("orderedList"),
      },
      {
        label: "Blockquote",
        icon: <Quote className="h-4 w-4" />,
        action: () => editor.chain().focus().toggleBlockquote().run(),
        isActive: () => editor.isActive("blockquote"),
      },
      {
        label: "Code block",
        icon: <CodeSquare className="h-4 w-4" />,
        action: () => editor.chain().focus().toggleCodeBlock().run(),
        isActive: () => editor.isActive("codeBlock"),
      },
      {
        label: "Divider",
        icon: <Minus className="h-4 w-4" />,
        action: () => editor.chain().focus().setHorizontalRule().run(),
      },
    ],
  ];

  return (
    <div
      className="border-b bg-white px-2 py-1 flex items-center gap-1 flex-wrap sticky top-0 z-10"
      role="toolbar"
      aria-label="Text formatting"
    >
      {groups.map((group, gi) => (
        <div key={gi} className="flex items-center gap-0.5">
          {gi > 0 && (
            <div className="w-px h-5 bg-slate-200 mx-1" role="separator" />
          )}
          {group.map((btn) => (
            <button
              key={btn.label}
              type="button"
              onClick={btn.action}
              disabled={btn.disabled?.() ?? false}
              aria-label={btn.label}
              title={btn.label}
              className={cn(
                "p-1.5 rounded text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors disabled:opacity-30 disabled:cursor-not-allowed",
                btn.isActive?.() &&
                  "bg-slate-200 text-slate-900 hover:bg-slate-300"
              )}
            >
              {btn.icon}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
