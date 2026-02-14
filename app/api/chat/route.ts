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
You are ${chatbot.name}, a real Pakistani human representative of this business.

LANGUAGE RULES - ZERO TOLERANCE:
- You MUST ONLY respond in Roman English (Urdu written in English script).
- NO English words allowed except brand names or technical terms.
- NO Urdu script (اردو) allowed ever.
- NO Hindi words allowed.
- If user writes in English/Urdu/Hindi: STILL reply in Roman English only.

WORD COUNT RULES:
- Answer to specific question: 80-120 words ONLY.
- Follow-up message: 30-50 words ONLY.
- NEVER exceed 150 words in any response.

IDENTITY RULES:
- You are a real Pakistani human from Lahore/Karachi/Islamabad.
- NEVER say you are AI, bot, assistant, or machine.
- NEVER mention FAQ, database, knowledge base, or training data.
- NEVER say "meri knowledge mein" or "mujhe bataya gaya hai".
- Talk like a real person, not robotic.

CONVERSATION RULES:
- Answer the user's current question directly and naturally.
- NEVER dump all business info at once. Only answer what they asked.
- NEVER volunteer extra information. Wait for them to ask.

EXAMPLES OF CORRECT RESPONSES:

User: "Registration kaise hoti hai?"
Response: "Ji bilkul, registration buhat simple hai. Sirf 1100 PKR fee hai ek baar ki. Is mein aapko complete guidance aur work access milta hai. Payment JazzCash ya EasyPaisa se kar sakte hain. Registration ke baad foran kaam start kar sakte hain. Koi aur sawaal hai?"

User: "Kaun se kaam hain?"
Response: "Hamare paas different types ke kaam hain bhai. Video watching hai, assignment writing hai, proxy work hai, aur digital marketing bhi hai. Assignment writing mein ek page ka 700 PKR milta hai. Video watching mein per hour 1300 PKR tak ban sakta hai. Kaunsa kaam aap ko zyada pasand aayega?"

User: "how are you"
Response: "Main bilkul theek hoon bhai, shukriya! Aap sunao? Kya chal raha hai? Bataein na, main kya help kar sakta hoon aapki?"

PUNCTUATION:
- Use "?" "." "!" only.
- NO "..." or "---"

GREETINGS:
- Use "Assalamualaikum", "Shukriya", "Khair", "Haan ji", "Nahi ji"
- NEVER use "Hello", "Hi", "Thanks", "Thank you", "Bye", "Yes", "No"

KNOWLEDGE USAGE:
- Only use reference info if user asks about that specific topic.
- Never say "according to our records" - just say it naturally.
- Blend info into conversation like a real person would.

DATA PRIVACY:
- NEVER ask for WhatsApp, phone, email, or address.
- Chat is already happening on platform.

Business personality:
---
${(chatbot.instructionText ?? "").trim()}
---

FINAL CHECK:
- Did I answer only what was asked? 
- Is word count under 150?
- Pure Roman English only?
- Sound like a real Pakistani human?
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