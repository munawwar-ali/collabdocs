"use client";

import { useState, useEffect } from "react";
import { Keyboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

const SHORTCUTS = [
  { category: "Navigation", items: [
    { keys: ["Ctrl", "Shift", "H"], label: "Version history" },
    { keys: ["Ctrl", "Shift", "I"], label: "AI assistant" },
    { keys: ["Ctrl", "Shift", "S"], label: "Share document" },
  ]},
  { category: "Editor", items: [
    { keys: ["Ctrl", "B"], label: "Bold" },
    { keys: ["Ctrl", "I"], label: "Italic" },
    { keys: ["Ctrl", "Z"], label: "Undo" },
    { keys: ["Ctrl", "Shift", "Z"], label: "Redo" },
    { keys: ["Ctrl", "Enter"], label: "Submit AI prompt" },
  ]},
  { category: "Text", items: [
    { keys: ["#", "Space"], label: "Heading 1" },
    { keys: ["##", "Space"], label: "Heading 2" },
    { keys: ["-", "Space"], label: "Bullet list" },
    { keys: ["1.", "Space"], label: "Numbered list" },
    { keys: [">", "Space"], label: "Blockquote" },
    { keys: ["```", "Enter"], label: "Code block" },
  ]},
];

export function KeyboardShortcutsButton() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "?" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        // Only open if not in an input/textarea
        const tag = (e.target as HTMLElement).tagName.toLowerCase();
        if (tag !== "input" && tag !== "textarea" && tag !== "div") {
          setOpen(true);
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <>
      <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-slate-600"
        onClick={() => setOpen(true)} aria-label="Keyboard shortcuts" title="Keyboard shortcuts (?)">
        <Keyboard className="h-4 w-4" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Keyboard className="h-4 w-4" />
              Keyboard Shortcuts
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            {SHORTCUTS.map((group) => (
              <div key={group.category}>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                  {group.category}
                </p>
                <div className="space-y-1.5">
                  {group.items.map((item) => (
                    <div key={item.label} className="flex items-center justify-between text-sm">
                      <span className="text-slate-600">{item.label}</span>
                      <div className="flex items-center gap-1">
                        {item.keys.map((key, i) => (
                          <span key={i}>
                            {i > 0 && <span className="text-slate-300 text-xs mx-0.5">+</span>}
                            <kbd className="inline-flex items-center px-1.5 py-0.5 rounded border border-slate-200 bg-slate-50 text-xs font-mono text-slate-700">
                              {key}
                            </kbd>
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
