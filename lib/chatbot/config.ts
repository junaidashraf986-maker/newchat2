export const CHATBOT_LIMITS = {
  instructionTextMaxChars: 50000,
  instructionFilesMaxCount: 3,
  instructionFileMaxBytes: 2 * 1024 * 1024, // 2MB
  // Chunking for embeddings
  embeddingChunkMaxChars: 1500,
  embeddingChunkOverlapChars: 150,
  embeddingMaxChunksPerFile: 50,
  // For MVP, allow common text-like docs (no parsing yet).
  instructionAllowedMimeTypes: [
    "text/plain",
    "text/markdown",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ] as const,
} as const;

export type ChatbotLimits = typeof CHATBOT_LIMITS;

export const CHATBOT_OPTIONS = {
  tone: ["friendly", "professional", "concise", "playful"] as const,
  humor: ["off", "low", "medium", "high"] as const,
  theme: ["light", "dark", "system"] as const,
} as const;

export type ChatbotTone = (typeof CHATBOT_OPTIONS.tone)[number];
export type ChatbotHumor = (typeof CHATBOT_OPTIONS.humor)[number];
export type ChatbotTheme = (typeof CHATBOT_OPTIONS.theme)[number];
