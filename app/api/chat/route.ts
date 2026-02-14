import { z } from "zod";
import { connectToDatabase } from "@/lib/db/mongoose";
import { jsonError, jsonOk } from "@/lib/http";
import { Chatbot } from "@/lib/models/Chatbot";

import { embedText } from "@/lib/embeddings/gemini";
import { queryTopK } from "@/lib/vectorstore/pinecone";
import { generateText } from "@/lib/llm/gemini";

function extractFAQAnswer(text: string): string {
  const qaMatch = /(?:Q:|Question:)\s*.*?(?:A:|Answer:)\s*(.*)/is.exec(text);
  let answer = qaMatch?.[1] ?? text;
  answer = answer
    .replace(/^(?:A:|Answer:)\s*/i, "")
    .replace(/^\s*\n?(?:A:|Answer:)\s*/i, "")
    .replace(/^(?:Q:|Question:)\s*/i, "");
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

// Slightly relaxed so FAQ is used as knowledge not forced answer
const FAQ_CONFIDENCE_THRESHOLD = 0.85;

export async function POST(req: Request) {
  try {
    const json = await req.json().catch(() => null);
    const parsed = BodySchema.safeParse(json);

    if (!parsed.success) {
      return jsonError("Invalid request", 400, {
        issues: parsed.error.issues,
      });
    }

    await connectToDatabase();

    const chatbot = await Chatbot.findOne({ token: parsed.data.token })
      .select("name instructionText")
      .lean();

    if (!chatbot) return jsonError("Unknown token", 404);

    const query = parsed.data.message.trim();
    const queryVec = await embedText(query);

    const matches = await queryTopK({
      vector: queryVec,
      topK: 8,
      includeMetadata: true,
      filter: { chatbotId: chatbot._id.toString() },
    });

    // Find best FAQ match
    let bestFAQ: { question: string; answer: string; score: number } | null =
      null;

    for (const m of matches) {
      if (
        m.metadata?.kind === "faq" &&
        typeof m.metadata?.text === "string" &&
        m.score !== undefined
      ) {
        if (!bestFAQ || m.score > bestFAQ.score) {
          bestFAQ = {
            question: String(m.metadata.question ?? ""),
            answer: String(m.metadata.text),
            score: m.score,
          };
        }
      }
    }

    // Collect knowledge snippets
    const contextSnippets = matches
      .filter((m) => typeof m.metadata?.text === "string")
      .map((m) => m.metadata?.text)
      .filter(Boolean)
      .slice(0, 5);

    // =========================
    // HUMANIZED PROMPT
    // =========================

    let prompt = `
You are ${chatbot.name}, a real human representative of this business.
VERY IMPORTANT RULES:

IDENTITY & BEHAVIOR:
- You are a real human representative of the business.
- Never say you are an AI.
- Never mention FAQ, knowledge base, or internal data sources.
- Do not sound automated or scripted.
- Speak naturally like a real team member helping personally.

RESPONSE STYLE:
- Do NOT copy answers directly from any reference.
- Always rewrite information in a warm, conversational tone.
- Avoid robotic, generic, or template-style replies.
- Keep responses realistic, clear, and human.
- If a user asks how to join, guide them step-by-step in a natural way.

DATA & PRIVACY:
- Do NOT ask for the user's WhatsApp number.
- Do NOT ask for phone numbers or personal contact details.
- Do NOT collect user data.
- Do NOT ask for the user's name unless absolutely necessary for clarification.
- Assume the conversation is already happening inside the official platform.

INTERACTION RULES:
- Always answer the user's question directly inside the chat.
- Only ask follow-up questions if they genuinely help clarify the user's issue.
- Do not push external contact options unless the user explicitly asks for them.

Business personality and behavior instructions:
---
${(chatbot.instructionText ?? "").trim()}
---
`;

    // Add conversation history for realism
    if (parsed.data.history?.length) {
      prompt += `\nPrevious conversation:\n`;
      for (const msg of parsed.data.history) {
        prompt += `${msg.role === "user" ? "User" : chatbot.name}: ${
          msg.content
        }\n`;
      }
    }

    // Add FAQ as background knowledge (not forced)
    if (bestFAQ && bestFAQ.score >= FAQ_CONFIDENCE_THRESHOLD) {
      prompt += `
Reference information (use only as background knowledge, do NOT copy directly):
Question: ${bestFAQ.question}
Answer: ${extractFAQAnswer(bestFAQ.answer)}
`;
    }

    // Add other context
    if (contextSnippets.length) {
      prompt += `
Additional internal reference information:
${contextSnippets
  .map((t, i) => `Info ${i + 1}: ${t}`)
  .join("\n")}
`;
    }

    prompt += `

User: ${query}
${chatbot.name}:
`;

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