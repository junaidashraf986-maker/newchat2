import OpenAI from "openai";

export const OPENAI_CHAT_MODEL = "gpt-3.5-turbo";

const OPENAI_API_KEY ="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";

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
