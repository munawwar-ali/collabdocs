import { NextRequest } from "next/server";
import { createGroq } from "@ai-sdk/groq";
import { streamText } from "ai";
import { z } from "zod";
import { getAuthOrUnauthorized } from "@/lib/session";
import { getDocumentWithRole } from "@/db/queries";
import {
  parseJsonBody, notFound, forbidden,
  serverError, rateLimit, badRequest,
} from "@/lib/api-middleware";
import { RATE_LIMITS, UUIDSchema } from "@/lib/security";

const groq = createGroq({ apiKey: process.env.GROQ_API_KEY });
const MODEL = "llama-3.3-70b-versatile";

const AiAssistSchema = z.object({
  documentId: UUIDSchema,
  command: z.enum(["continue","summarise","fix","expand","shorter","translate","tone","custom"]),
  selectedText: z.string().max(4000).optional().default(""),
  documentContext: z.string().max(8000).optional().default(""),
  extraParam: z.string().max(500).optional().default(""),
});

function buildPrompt(command: string, selectedText: string, documentContext: string, extraParam: string): string {
  const sel = selectedText ? `\n\nTEXT:\n${selectedText}` : "";
  const ctx = documentContext ? `\n\nCONTEXT:\n${documentContext}` : "";
  switch (command) {
    case "continue": return `Continue writing naturally from where this ends. Write 1-3 paragraphs. Do not repeat anything already written.${ctx}`;
    case "summarise": return `Summarise in 2-3 sentences:${sel || ctx}`;
    case "fix": return `Fix grammar, spelling and phrasing. Return ONLY the corrected text:${sel}`;
    case "expand": return `Expand into a full paragraph with detail:${sel}`;
    case "shorter": return `Make more concise, keep all key points:${sel}`;
    case "translate": return `Translate to ${extraParam || "Spanish"}. Return only the translation:${sel}`;
    case "tone": return `Rewrite in a ${extraParam || "formal"} tone:${sel}`;
    case "custom": return `${extraParam}${sel}${ctx}`;
    default: return `Improve this text:${sel}`;
  }
}

export async function POST(request: NextRequest) {
  try {
    const { userId, response } = await getAuthOrUnauthorized();
    if (response) return response;

    const rl = rateLimit(userId, "ai-assist", RATE_LIMITS.AI_ASSIST.limit, RATE_LIMITS.AI_ASSIST.windowMs);
    if (rl) return rl;

    const [body, parseError] = await parseJsonBody(request, AiAssistSchema);
    if (parseError) return parseError;

    const doc = await getDocumentWithRole(body.documentId, userId);
    if (!doc) return notFound("Document not found");

    if (!process.env.GROQ_API_KEY) {
      return badRequest("AI assistant is not configured. Add GROQ_API_KEY.");
    }

    const prompt = buildPrompt(body.command, body.selectedText, body.documentContext, body.extraParam);

    const result = streamText({
      model: groq(MODEL),
      system: "You are an expert writing assistant. Respond ONLY with the requested text — no preamble, no explanation, no quotes around your response.",
      prompt,
      maxOutputTokens: 1024,
      temperature: 0.7,
    });

    // Return as plain text stream — easiest for client to consume
    return result.toTextStreamResponse({
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("[AI]", error);
    return serverError("AI request failed");
  }
}