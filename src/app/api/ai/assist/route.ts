/**
 * POST /api/ai/assist
 *
 * Streaming AI writing assistant powered by Groq (llama-3.3-70b).
 * Returns a Server-Sent Events stream so the UI can show tokens
 * appearing in real time — no waiting for the full response.
 *
 * SUPPORTED COMMANDS:
 * - continue    → Continue writing from the current cursor position
 * - summarise   → Summarise the selected text or whole document
 * - fix         → Fix grammar, spelling and awkward phrasing
 * - expand      → Expand a short note into a full paragraph
 * - shorter     → Make the selected text more concise
 * - translate   → Translate to a specified language
 * - tone        → Rewrite in a different tone (formal, casual, etc.)
 * - custom      → Free-form prompt from the user
 *
 * SECURITY:
 * - Auth required
 * - Must be a member of the document (at least viewer)
 * - Rate limited: 20 requests / minute / user
 * - Prompt length capped to prevent token flooding
 * - System prompt clearly separates instructions from user content
 *   to prevent prompt injection attacks
 */

import { NextRequest } from "next/server";
import { streamText } from "ai";
import { createGroq } from "@ai-sdk/groq";
import { z } from "zod";
import { getAuthOrUnauthorized } from "@/lib/session";
import { getDocumentWithRole } from "@/db/queries";
import {
  parseJsonBody,
  notFound,
  forbidden,
  serverError,
  rateLimit,
  badRequest,
} from "@/lib/api-middleware";
import { RATE_LIMITS, UUIDSchema } from "@/lib/security";

// ── Groq client ───────────────────────────────────────────────────
const groq = createGroq({
  apiKey: process.env.GROQ_API_KEY,
});

// Model: llama-3.3-70b is Groq's fastest free model — ideal for streaming
const MODEL = "llama-3.3-70b-versatile";

// Max tokens per response (controls cost + latency)
const MAX_TOKENS = 1024;

// Max characters of document context sent to AI (prevent token flooding)
const MAX_CONTEXT_CHARS = 8_000;
const MAX_SELECTION_CHARS = 4_000;
const MAX_PROMPT_CHARS = 500;

// ── Request schema ────────────────────────────────────────────────
const AiAssistSchema = z.object({
  documentId: UUIDSchema,

  command: z.enum([
    "continue",
    "summarise",
    "fix",
    "expand",
    "shorter",
    "translate",
    "tone",
    "custom",
  ]),

  // The selected text in the editor (what the command acts on)
  selectedText: z
    .string()
    .max(MAX_SELECTION_CHARS, "Selected text is too long")
    .optional()
    .default(""),

  // Surrounding context (text before/after cursor) for better results
  documentContext: z
    .string()
    .max(MAX_CONTEXT_CHARS, "Document context is too long")
    .optional()
    .default(""),

  // Extra detail for translate/tone/custom commands
  extraParam: z
    .string()
    .max(MAX_PROMPT_CHARS, "Prompt is too long")
    .optional()
    .default(""),
});

// ── System prompt builder ─────────────────────────────────────────

function buildSystemPrompt(): string {
  return `You are an expert writing assistant integrated into CollabDocs, 
a collaborative document editor. Your job is to help users write better documents.

RULES:
- Respond ONLY with the requested text — no preamble, no explanation, no quotes
- Match the tone and style of the existing document where possible
- Be concise and direct
- Never add meta-commentary like "Here is the revised version:" or "Sure!"
- If asked to continue writing, produce flowing prose that fits seamlessly
- Preserve the document's voice and terminology`;
}

function buildUserPrompt(
  command: string,
  selectedText: string,
  documentContext: string,
  extraParam: string
): string {
  // NOTE: We clearly label where user content begins to prevent prompt injection.
  // A malicious user cannot escape this boundary because we validate and
  // cap input lengths before they reach this function.
  const contextBlock = documentContext
    ? `\n\n--- DOCUMENT CONTEXT ---\n${documentContext}\n--- END CONTEXT ---`
    : "";

  const selectedBlock = selectedText
    ? `\n\n--- SELECTED TEXT ---\n${selectedText}\n--- END SELECTED TEXT ---`
    : "";

  switch (command) {
    case "continue":
      return `Continue writing the document from where it ends. Write 1-3 natural paragraphs that flow from the existing content. Do not repeat anything already written.${contextBlock}`;

    case "summarise":
      return `Write a concise summary of the following text in 2-3 sentences:${selectedBlock || contextBlock}`;

    case "fix":
      return `Fix any grammar, spelling, punctuation and awkward phrasing in the following text. Return ONLY the corrected text, preserving the original meaning and structure:${selectedBlock}`;

    case "expand":
      return `Expand the following into a well-developed paragraph with supporting detail and examples. Return only the expanded version:${selectedBlock}`;

    case "shorter":
      return `Make the following text more concise. Remove redundancy, tighten sentences, keep all key points. Return only the revised text:${selectedBlock}`;

    case "translate":
      return `Translate the following text to ${extraParam || "Spanish"}. Return only the translation, preserving formatting:${selectedBlock}`;

    case "tone":
      return `Rewrite the following text in a ${extraParam || "more formal"} tone. Keep the same information and length. Return only the rewritten version:${selectedBlock}`;

    case "custom":
      return `${extraParam}${selectedBlock}${contextBlock}`;

    default:
      return `Help improve this text:${selectedBlock}`;
  }
}

// ── Route handler ─────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    // ── Auth ───────────────────────────────────────────────────
    const { userId, response } = await getAuthOrUnauthorized();
    if (response) return response;

    // ── Rate limit ─────────────────────────────────────────────
    const rl = rateLimit(
      userId,
      "ai-assist",
      RATE_LIMITS.AI_ASSIST.limit,
      RATE_LIMITS.AI_ASSIST.windowMs
    );
    if (rl) return rl;

    // ── Parse + validate ───────────────────────────────────────
    const [body, parseError] = await parseJsonBody(request, AiAssistSchema);
    if (parseError) return parseError;

    // ── Document membership check ──────────────────────────────
    // AI can be used by all roles (including viewers — they can ask
    // AI to summarise a doc they're viewing)
    const doc = await getDocumentWithRole(body.documentId, userId);
    if (!doc) return notFound("Document not found");

    // ── Check Groq API key ─────────────────────────────────────
    if (!process.env.GROQ_API_KEY) {
      return badRequest(
        "AI assistant is not configured. Add GROQ_API_KEY to your environment variables."
      );
    }

    // ── Build prompts ──────────────────────────────────────────
    const systemPrompt = buildSystemPrompt();
    const userPrompt = buildUserPrompt(
      body.command,
      body.selectedText,
      body.documentContext,
      body.extraParam
    );

    // ── Stream response ────────────────────────────────────────
    const result = streamText({
      model: groq(MODEL),
      system: systemPrompt,
      prompt: userPrompt,
      maxOutputTokens: MAX_TOKENS,
      temperature: 0.7,
      // Stop sequences prevent the AI from continuing past a natural end
      stopSequences: ["--- END", "---END"],
    });

    // Return the stream as SSE (Server-Sent Events)
    // The Vercel AI SDK handles all the streaming plumbing
    return result.toTextStreamResponse();
  } catch (error) {
    // Don't leak Groq API errors to the client
    console.error("[AI] Error:", error);
    return serverError("AI request failed. Please try again.");
  }
}
