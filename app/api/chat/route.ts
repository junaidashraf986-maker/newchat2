import { z } from "zod";
import { connectToDatabase } from "@/lib/db/mongoose";
import { jsonError, jsonOk } from "@/lib/http";
import { Chatbot } from "@/lib/models/Chatbot";


import { embedText } from "@/lib/embeddings/gemini";
import { queryTopK } from "@/lib/vectorstore/pinecone";
import { generateText } from "@/lib/llm/gemini";
import { convertSegmentPathToStaticExportFilename } from "next/dist/shared/lib/segment-cache/segment-value-encoding";

function extractFAQAnswer(text: string): string {
  // Remove Q: ... A: ... pattern, return only the answer
  const qaMatch = /(?:Q:|Question:)\s*.*?(?:A:|Answer:)\s*(.*)/is.exec(text);
  let answer = qaMatch?.[1] ?? text;
  // Remove A: or Answer: prefix if present at the start (including after newlines)
  answer = answer.replace(/^(?:A:|Answer:)\s*/i, "").replace(/^\s*\n?(?:A:|Answer:)\s*/i, "");
  // Remove Q: or Question: prefix if present at the start
  answer = answer.replace(/^(?:Q:|Question:)\s*/i, "");
  return answer.trim();
}

const BodySchema = z.object({
  token: z.string().min(10),
  message: z.string().min(1).max(4000),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(8000),
      })
    )
    .max(20)
    .optional(),
});

const FAQ_CONFIDENCE_THRESHOLD = 0.92;
const CONTEXT_CONFIDENCE_THRESHOLD = 0.68;

export async function POST(req: Request) {
  try {
    const json = await req.json().catch(() => null);
    const parsed = BodySchema.safeParse(json);
    if (!parsed.success) {
      return jsonError("Invalid request", 400, { issues: parsed.error.issues });
    }

    await connectToDatabase();

    const chatbot = await Chatbot.findOne({ token: parsed.data.token })
      .select("name instructionText faqs")
      .lean();

    if (!chatbot) return jsonError("Unknown token", 404);

    const query = parsed.data.message.trim();
    const queryVec = await embedText(query);

    // Query Pinecone for top matches (including FAQ and context)
    const matches = await queryTopK({
      vector: queryVec,
      topK: 8,
      includeMetadata: true,
      filter: { chatbotId: chatbot._id.toString() },
    });

    console.log('these are the matches ',matches)

    // Find best FAQ match
    let bestFAQ: { question: string; answer: string; score: number } | null = null;
    for (const m of matches) {
      if (m.metadata?.kind === "faq" && typeof m.metadata?.text === "string" && m.score !== undefined) {
        if (!bestFAQ || m.score > bestFAQ.score) {
          bestFAQ = {
            question: String(m.metadata.question ?? ""),
            answer: String(m.metadata.text),
            score: m.score,
          };
        }
      }
    }

    // Build context snippets (include FAQ and other context)
    const contextSnippets = matches
      .filter((m) => typeof m.metadata?.text === "string")
      .map((m) => m.metadata?.text)
      .filter(Boolean)
      .slice(0, 5);

    // Build Gemini prompt with instruction text, FAQ, and context
    let prompt = `You are an AI chatbot assistant for a business. Your behavior, tone, and rules are defined by the following instructions from the business owner (between triple dashes):\n---\n${(chatbot.instructionText ?? '').trim()}\n---\n`;
    if (bestFAQ && bestFAQ.score >= FAQ_CONFIDENCE_THRESHOLD) {
      prompt += `\nThe user's question matches the following FAQ. Use this FAQ answer to help craft a natural, helpful response.\nFAQ Question: ${bestFAQ.question}\nFAQ Answer: ${extractFAQAnswer(bestFAQ.answer)}\n`;
    }
    if (contextSnippets.length) {
      prompt += `\nHere is some context from the knowledge base and FAQs:\n${contextSnippets
        .map((t, i) => `Context ${i + 1}: ${t}`)
        .join("\n")}\n`;
    }
    prompt += `\nUser: ${query}\nAssistant:`;

    const geminiReply = await generateText({ prompt });

    return jsonOk({
      token: parsed.data.token,
      reply: geminiReply,
      sources: matches.map((s) => ({
        id: s.id,
        score: s.score,
        kind: s.metadata?.kind ?? null,
      })),
      usedContext: contextSnippets.length,
    });
  } catch (e) {
    console.log("Server issue:", e);
    return jsonError("Server error", 500);
  }
}
