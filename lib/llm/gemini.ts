import OpenAI from "openai";

export const OPENAI_CHAT_MODEL = "gpt-3.5-turbo";

const THIS =process.env.KEY;
const openai = new OpenAI({ apiKey: THIS });

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
