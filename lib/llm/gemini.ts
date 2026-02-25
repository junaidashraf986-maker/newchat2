import OpenAI from "openai";

export const OPENAI_CHAT_MODEL = "gpt-3.5-turbo";

const OPENAI_API_KEY = "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";
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

export async function generateText(opts: {
  prompt: string;
  model?: string;
  temperature?: number;
}): Promise<string> {
  const model = opts.model ?? OPENAI_CHAT_MODEL;
  const temperature = opts.temperature ?? 0.4;
  const response = await openai.chat.completions.create({
    model,
    messages: [{ role: "user", content: opts.prompt }],
    temperature,
  });
  const text = response.choices[0]?.message?.content;
  return (text ?? "").trim();
}
