import { z } from "zod";
import { connectToDatabase } from "@/lib/db/mongoose";
import { jsonError, jsonOk } from "@/lib/http";
import { ChatHistory } from "@/lib/models/ChatHistory";
import { scheduleAdminNotification } from "@/lib/adminNotifications";

const BodySchema = z.object({
  token: z.string().min(10),
  message: z.string().max(8000),
  messageBy: z.enum(["user", "admin", "bot"]),
  sessionId: z.string().max(128).optional(),
  userId: z.string().max(128).optional(),
  name: z.string().max(128).optional(),
  whatsapp: z.string().max(32).optional(),
  type: z.enum(["text", "image", "voice"]).optional(),
  // NEW: Cloudinary fields
  cloudinaryPublicId: z.string().optional(),
  cloudinaryResourceType: z.enum(["image", "video"]).optional(),
});

export async function POST(req: Request) {
  try {
    const json = await req.json().catch(() => null);
    const parsed = BodySchema.safeParse(json);

    if (!parsed.success) {
      return jsonError("Invalid request", 400, { issues: parsed.error.issues });
    }

    await connectToDatabase();

    const { 
      token: chatbotToken, 
      sessionId, 
      message, 
      messageBy, 
      userId, 
      type,
      name,
      whatsapp,
      cloudinaryPublicId,
      cloudinaryResourceType 
    } = parsed.data;

    if (!chatbotToken || !sessionId) {
      return jsonError("Missing token or sessionId", 400);
    }

    const doc = await ChatHistory.create({
      chatbotToken,
      sessionId,
      userId: userId ?? undefined,
      message,
      messageBy,
      type: type ?? "text",
      name: name ?? undefined,
      whatsapp: whatsapp ?? undefined,
      timestamp: new Date(),
      // Store Cloudinary info for cleanup
      cloudinaryPublicId,
      cloudinaryResourceType,
    });

    // Trigger notification
    if (messageBy === 'bot' && message.includes("Someone will contact you shortly")) {
      scheduleAdminNotification(sessionId, chatbotToken);
    }

    return jsonOk({
      logged: true,
      sessionId,
      messageId: doc._id.toString(),
    });

  } catch (e: any) {
    console.error(e?.message);
    return jsonError("Server error", 500);
  }
}