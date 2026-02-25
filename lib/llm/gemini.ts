import { Configuration, OpenAIApi } from "openai";

export const OPENAI_CHAT_MODEL = "gpt-3.5-turbo";

const THIS = process.env.OPENAI_API_KEY;  
const configuration = new Configuration({ apiKey: THIS });
const openai = new OpenAIApi(configuration);

export async function generateText(opts: {
  prompt: string;
  model?: string;
  temperature?: number;
}): Promise<string> {
  const model = opts.model ?? OPENAI_CHAT_MODEL;
  const temperature = opts.temperature ?? 0.4;
  const response = await openai.createChatCompletion({
    model,
    messages: [{ role: "user", content: opts.prompt }],
    temperature,
  });
  const text = response.data.choices[0]?.message?.content;
  return (text ?? "").trim();
}
