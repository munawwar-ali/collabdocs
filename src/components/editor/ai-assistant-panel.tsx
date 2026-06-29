"use client";

/**
 * AiAssistantPanel
 *
 * Slide-in AI writing assistant powered by Groq (via /api/ai/assist).
 * Uses native fetch + ReadableStream for SSE — no extra client library needed.
 */

import { useState, useRef, useCallback, useId } from "react";
import type { Editor } from "@tiptap/react";
import {
  X, Sparkles, Send, ChevronDown, Loader2,
  Copy, Check, RotateCcw, WandSparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

// ── Command definitions ───────────────────────────────────────────
interface AICommand {
  id: string; label: string; icon: string;
  needsSelection: boolean;
  hasParam?: { label: string; placeholder: string };
  insertsAfter: boolean;
}

const COMMANDS: AICommand[] = [
  { id: "continue", label: "Continue writing", icon: "✍️", needsSelection: false, insertsAfter: true },
  { id: "summarise", label: "Summarise", icon: "📝", needsSelection: false, insertsAfter: true },
  { id: "fix", label: "Fix grammar", icon: "✅", needsSelection: true, insertsAfter: false },
  { id: "expand", label: "Expand", icon: "🔭", needsSelection: true, insertsAfter: false },
  { id: "shorter", label: "Make shorter", icon: "✂️", needsSelection: true, insertsAfter: false },
  { id: "translate", label: "Translate", icon: "🌍", needsSelection: true, insertsAfter: false,
    hasParam: { label: "Target language", placeholder: "e.g. Spanish, French, Hindi…" } },
  { id: "tone", label: "Change tone", icon: "🎭", needsSelection: true, insertsAfter: false,
    hasParam: { label: "New tone", placeholder: "e.g. formal, casual, academic, friendly…" } },
  { id: "custom", label: "Custom prompt", icon: "💬", needsSelection: false, insertsAfter: true },
];

// ── Streaming fetch helper ────────────────────────────────────────
async function streamAiResponse(
  body: object,
  onChunk: (chunk: string) => void,
  signal: AbortSignal
): Promise<string> {
  const res = await fetch("/api/ai/assist", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Request failed" })) as { error?: string };
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }

  if (!res.body) throw new Error("No response body");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let full = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    // toTextStreamResponse sends plain text chunks directly
    full += chunk;
    onChunk(chunk);
  }

  return full;
}

// ── Component ─────────────────────────────────────────────────────
interface AiAssistantPanelProps {
  editor: Editor | null;
  documentId: string;
  onClose: () => void;
}

export function AiAssistantPanel({ editor, documentId, onClose }: AiAssistantPanelProps) {
  const [activeCommand, setActiveCommand] = useState<AICommand | null>(null);
  const [extraParam, setExtraParam] = useState("");
  const [customPrompt, setCustomPrompt] = useState("");
  const [output, setOutput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const formId = useId();
  const isReadOnly = !editor?.isEditable;

  const runCommand = useCallback(async (command: AICommand, param = "", prompt = "") => {
    if (!editor) return;
    setOutput(""); setError(null);

    abortRef.current?.abort();
    abortRef.current = new AbortController();

    const { from, to } = editor.state.selection;
    const selectedText = editor.state.doc.textBetween(from, to, " ").slice(0, 4_000);
    const documentContext = editor.state.doc.textContent.slice(0, 8_000);

    setIsLoading(true);
    try {
      await streamAiResponse(
        { documentId, command: command.id, selectedText, documentContext,
          extraParam: command.id === "custom" ? prompt : param },
        (chunk) => setOutput((prev) => prev + chunk),
        abortRef.current.signal
      );
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setError((err as Error).message || "Something went wrong");
      }
    } finally {
      setIsLoading(false);
    }
  }, [editor, documentId]);

  const insertResult = useCallback((text: string, command: AICommand) => {
    if (!editor || isReadOnly) return;
    if (command.insertsAfter) {
      const endPos = editor.state.doc.content.size;
      editor.chain().focus().insertContentAt(endPos, "\n" + text).run();
    } else {
      editor.chain().focus().insertContent(text).run();
    }
    setOutput(""); setActiveCommand(null); setExtraParam("");
  }, [editor, isReadOnly]);

  const handleCopy = useCallback(async () => {
    if (!output) return;
    await navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [output]);

  const stopGeneration = () => { abortRef.current?.abort(); setIsLoading(false); };

  const selectCommand = (cmd: AICommand) => {
    setActiveCommand(cmd); setOutput(""); setError(""); setExtraParam("");
    if (!cmd.hasParam && cmd.id !== "custom") void runCommand(cmd);
  };

  return (
    <div className="flex flex-col h-full" role="complementary" aria-label="AI Writing Assistant">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b shrink-0">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-purple-500" />
          <span className="font-semibold text-sm">AI Assistant</span>
          <span className="text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full font-medium">Groq</span>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose} aria-label="Close">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-3">

          {/* Command grid */}
          {!activeCommand && (
            <>
              <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">What do you need?</p>
              <div className="grid grid-cols-2 gap-1.5">
                {COMMANDS.map((cmd) => (
                  <button key={cmd.id} onClick={() => selectCommand(cmd)}
                    className="flex flex-col items-start gap-1 p-2.5 rounded-lg border border-slate-200 hover:border-purple-300 hover:bg-purple-50 transition-colors text-left"
                    aria-label={cmd.label}>
                    <span className="text-base leading-none">{cmd.icon}</span>
                    <span className="text-xs font-medium text-slate-800 leading-tight">{cmd.label}</span>
                  </button>
                ))}
              </div>
              {isReadOnly && (
                <p className="text-xs text-amber-600 bg-amber-50 rounded px-2.5 py-2">
                  View-only mode. AI results won&apos;t be inserted but you can copy them.
                </p>
              )}
            </>
          )}

          {/* Active command */}
          {activeCommand && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <button onClick={() => { stopGeneration(); setActiveCommand(null); setOutput(""); }}
                  className="text-slate-400 hover:text-slate-600 text-sm" aria-label="Back">←</button>
                <span className="text-sm font-medium">{activeCommand.icon} {activeCommand.label}</span>
              </div>

              {/* Param input (translate / tone) */}
              {activeCommand.hasParam && (
                <div className="space-y-1">
                  <label htmlFor={`${formId}-param`} className="text-xs text-slate-600 font-medium">
                    {activeCommand.hasParam.label}
                  </label>
                  <div className="flex gap-2">
                    <input id={`${formId}-param`} type="text"
                      placeholder={activeCommand.hasParam.placeholder}
                      value={extraParam}
                      onChange={(e) => setExtraParam(e.target.value)}
                      className="flex-1 text-sm border rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-purple-400"
                      onKeyDown={(e) => { if (e.key === "Enter") void runCommand(activeCommand, extraParam); }} />
                    <Button size="sm" onClick={() => void runCommand(activeCommand, extraParam)}
                      disabled={isLoading || !extraParam.trim()} className="bg-purple-600 hover:bg-purple-700">
                      {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                </div>
              )}

              {/* Custom prompt */}
              {activeCommand.id === "custom" && (
                <div className="space-y-2">
                  <Textarea placeholder="Ask AI anything… (Ctrl+Enter to submit)"
                    value={customPrompt} onChange={(e) => setCustomPrompt(e.target.value)}
                    className="text-sm min-h-[80px] resize-none focus:ring-purple-400"
                    onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void runCommand(activeCommand, "", customPrompt); }}
                    aria-label="Custom AI prompt" />
                  <Button size="sm" className="w-full gap-2 bg-purple-600 hover:bg-purple-700"
                    onClick={() => void runCommand(activeCommand, "", customPrompt)}
                    disabled={isLoading || !customPrompt.trim()}>
                    {isLoading
                      ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Generating…</>
                      : <><WandSparkles className="h-3.5 w-3.5" />Generate</>}
                  </Button>
                </div>
              )}

              {/* Loading spinner for auto-run commands */}
              {isLoading && !activeCommand.hasParam && activeCommand.id !== "custom" && (
                <div className="flex items-center gap-2 text-sm text-purple-600 py-1">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Generating…</span>
                  <button onClick={stopGeneration} className="text-xs text-slate-400 hover:text-slate-600 underline ml-auto">Stop</button>
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">
                  {error.includes("GROQ_API_KEY") ? "Add your GROQ_API_KEY to enable AI." : error}
                </div>
              )}

              {/* Output */}
              {output && (
                <div className="space-y-2">
                  <div className="text-sm bg-slate-50 border border-slate-200 rounded-lg p-3 leading-relaxed whitespace-pre-wrap max-h-64 overflow-y-auto"
                    aria-live="polite" aria-label="AI response">
                    {output}
                    {isLoading && <span className="inline-block w-1 h-4 bg-purple-400 animate-pulse ml-0.5 align-text-bottom" />}
                  </div>

                  {!isLoading && (
                    <div className="flex gap-2">
                      {!isReadOnly && (
                        <Button size="sm" className="flex-1 gap-1.5 bg-purple-600 hover:bg-purple-700 text-xs"
                          onClick={() => insertResult(output, activeCommand)}>
                          <ChevronDown className="h-3.5 w-3.5" />
                          {activeCommand.insertsAfter ? "Insert" : "Replace selection"}
                        </Button>
                      )}
                      <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={handleCopy}>
                        {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                        {copied ? "Copied!" : "Copy"}
                      </Button>
                      <Button size="sm" variant="outline" className="gap-1.5 text-xs" title="Regenerate"
                        onClick={() => void runCommand(activeCommand, extraParam, customPrompt)}>
                        <RotateCcw className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Footer */}
      <div className="px-3 py-2 border-t text-[10px] text-slate-400 shrink-0">
        Powered by{" "}
        <a href="https://console.groq.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-slate-600">Groq</a>
        {" "}· llama-3.3-70b · Responses may be inaccurate
      </div>
    </div>
  );
}
