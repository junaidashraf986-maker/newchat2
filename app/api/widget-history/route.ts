import { connectToDatabase } from "@/lib/db/mongoose";
import { ChatHistory } from "@/lib/models/ChatHistory";
import { jsonError, jsonOk } from "@/lib/http";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  const sessionId = url.searchParams.get("sessionId");

  if (!token || !sessionId) {
    return jsonError("Missing token or sessionId", 400);
  }

  try {
    await connectToDatabase();

    // Find messages for this session
    // Find messages for this session
    const messages = await ChatHistory.find({
      chatbotToken: token,
      sessionId: sessionId
    })
    .sort({ timestamp: 1 })
    .select("message messageBy timestamp")
    .lean();

    const items = messages.map((m) => ({
      text: m.message,
      // Map 'user' -> 'user', 'bot'|'admin' -> 'bot' (or keep distinct if frontend handles it)
      // Frontend expects: role
      role: m.messageBy, 
      timestamp: m.timestamp
    }));

    return jsonOk({ items });
  } catch (e) {
    console.error(e);
    return jsonError("Server error", 500);
  }
}
