import mongoose, { type Model } from "mongoose";

export type ChatHistoryDocument = mongoose.Document & {
  chatbotToken: string;
  sessionId?: string;
  userId?: string;
  message: string;
  messageBy: "user" | "admin" | "bot";
  name?: string;
  whatsapp?: string;
  timestamp: Date;
  type: "text" | "image" | "voice";
  cloudinaryPublicId?: string;        // NEW
  cloudinaryResourceType?: "image" | "video"; // NEW
  cloudinaryDeletedAt?: Date;         // NEW
};

const ChatHistorySchema = new mongoose.Schema<ChatHistoryDocument>(
  {
    chatbotToken: { type: String, required: true, index: true },
    sessionId: { type: String, index: true },
    userId: { type: String, index: true },
    message: { type: String, required: true },
    type: { type: String, enum: ["text", "image", "voice"], default: "text" },
    messageBy: { type: String, required: true, enum: ["user", "admin", "bot"] },
    name: { type: String, default: "" },
    whatsapp: { type: String, default: "" },
    timestamp: { type: Date, default: Date.now },
    // NEW FIELDS for Cloudinary cleanup
    cloudinaryPublicId: { type: String, index: true },
    cloudinaryResourceType: { type: String, enum: ["image", "video"] },
    cloudinaryDeletedAt: { type: Date },
  },
  { collection: "chat_history" }
);

ChatHistorySchema.index({ chatbotToken: 1, timestamp: -1 });
ChatHistorySchema.index({ type: 1, timestamp: 1 }); // For cleanup queries



export const ChatHistory: Model<ChatHistoryDocument> =
  (mongoose.models.ChatHistory as Model<ChatHistoryDocument>) ||
  mongoose.model<ChatHistoryDocument>("ChatHistory", ChatHistorySchema);