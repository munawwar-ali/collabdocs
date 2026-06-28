"use client";

import { useState, useRef, useEffect } from "react";
import { Loader2 } from "lucide-react";

interface DocumentTitleInputProps {
  title: string;
  isReadOnly: boolean;
  isSaving: boolean;
  onSave?: (title: string) => void;
}

export function DocumentTitleInput({
  title,
  isReadOnly,
  isSaving,
  onSave,
}: DocumentTitleInputProps) {
  const [localTitle, setLocalTitle] = useState(title);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync with parent if title changes (e.g. from real-time update)
  useEffect(() => {
    setLocalTitle(title);
  }, [title]);

  function handleBlur() {
    const trimmed = localTitle.trim() || "Untitled Document";
    setLocalTitle(trimmed);
    if (trimmed !== title) onSave?.(trimmed);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      inputRef.current?.blur();
    }
    if (e.key === "Escape") {
      setLocalTitle(title); // revert
      inputRef.current?.blur();
    }
  }

  if (isReadOnly) {
    return (
      <h1 className="text-base font-semibold text-slate-900 truncate">
        {title}
      </h1>
    );
  }

  return (
    <div className="flex items-center gap-2 min-w-0">
      <input
        ref={inputRef}
        type="text"
        value={localTitle}
        onChange={(e) => setLocalTitle(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        maxLength={500}
        className="text-base font-semibold text-slate-900 bg-transparent border-none outline-none
                   hover:bg-slate-50 focus:bg-slate-50 rounded px-1 py-0.5 truncate w-full
                   focus:ring-1 focus:ring-blue-300 transition-colors"
        aria-label="Document title"
        placeholder="Untitled Document"
      />
      {isSaving && (
        <Loader2 className="h-3.5 w-3.5 text-slate-400 animate-spin shrink-0" />
      )}
    </div>
  );
}
