
import { z } from "zod";
import { requireUser } from "@/lib/auth/server";
import { connectToDatabase } from "@/lib/db/mongoose";
import { jsonError, jsonOk } from "@/lib/http";
import { Chatbot } from "@/lib/models/Chatbot";
import { WidgetSession } from "@/lib/models/WidgetSession";

const ParamsSchema = z.object({
  id: z.string().min(1),
});

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    const params = await context.params;
    const parsed = ParamsSchema.safeParse(params);
    if (!parsed.success) {
      return jsonError("Invalid request", 400, { issues: parsed.error.issues });
    }

    await connectToDatabase();

    // Parse pagination params
    const url = new URL(req.url, "http://localhost");
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
    const limit = Math.max(1, Math.min(50, parseInt(url.searchParams.get("limit") || "10", 10)));
    const skip = (page - 1) * limit;

    const chatbot = await Chatbot.findOne({
      _id: parsed.data.id,
      ownerId: user.id,
    })
      .select("token")
      .lean();

    if (!chatbot) return jsonError("Not found", 404);

    const pipeline = [
      { $match: { chatbotToken: chatbot.token } },
      {
        $lookup: {
          from: "chat_history",
          localField: "sessionId",
          foreignField: "sessionId",
          as: "chatHistory",
          pipeline: [{ $limit: 1 }]
        }
      },
      { $match: { "chatHistory.0": { $exists: true } } }
    ];

    const countPipeline = [...pipeline, { $count: "total" }];
    const totalResult = await WidgetSession.aggregate(countPipeline);
    const total = totalResult[0]?.total || 0;

    const sessions = await WidgetSession.aggregate([
      ...pipeline,
      { $sort: { lastSeenAt: -1 } },
      { $skip: skip },
      { $limit: limit },
      { $project: { chatHistory: 0 } }
    ]);

    return jsonOk({
      sessions: sessions.map((s) => ({
        id: s._id.toString(),
        sessionId: s.sessionId,
        userId: s.userId ?? null,
        name: s.name ?? null,
        whatsapp: s.whatsapp ?? null,
        startedAt: s.startedAt,
        lastSeenAt: s.lastSeenAt,
        country: s.country ?? null,
        region: s.region ?? null,
        city: s.city ?? null,
        browser: s.browser ?? null,
        os: s.os ?? null,
        deviceType: s.deviceType ?? null,
        referrer: s.referrer ?? null,
        pageUrl: s.pageUrl ?? null,
        language: s.language ?? null,
        timezone: s.timezone ?? null,
      })),
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    });
  } catch {
    return jsonError("Unauthenticated", 401);
  }
}
