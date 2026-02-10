
// Type definitions at the top, only once
type SessionRow = {
  _id: unknown;
  lastSeenAt: Date;
  city?: string;
  region?: string;
  country?: string;
  deviceType?: string;
  os?: string;
  browser?: string;
};

type MessageRow = {
  _id: unknown;
  timestamp: Date;
  userMessage: string;
  botResponse: string;
};

import Link from "next/link";
import { ChatbotTabs } from "@/components/app/ChatbotTabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { requireUser } from "@/lib/auth/server";
import { connectToDatabase } from "@/lib/db/mongoose";
import { Chatbot } from "@/lib/models/Chatbot";
import { ChatHistory } from "@/lib/models/ChatHistory";
import { WidgetSession } from "@/lib/models/WidgetSession";

export default async function ChatbotOverviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;

  await connectToDatabase();

  const chatbot = await Chatbot.findOne({ _id: id, ownerId: user.id })
    .select("name description token createdAt settings")
    .lean();

  if (!chatbot) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Not found</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Chatbot doesn’t exist or you don’t have access.
        </CardContent>
      </Card>
    );
  }

  // base variable removed; use ChatbotTabs for navigation

  const now = new Date();
  const since7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const [sessions7d, sessions24h] = await Promise.all([
    WidgetSession.countDocuments({
      chatbotToken: chatbot.token,
      lastSeenAt: { $gte: since7d },
    }),
    WidgetSession.countDocuments({
      chatbotToken: chatbot.token,
      lastSeenAt: { $gte: since24h },
    }),
  ]);

  const [messages7d, lastMessages] = await Promise.all([
    ChatHistory.countDocuments({
      chatbotToken: chatbot.token,
      timestamp: { $gte: since7d },
    }),
    ChatHistory.find({ chatbotToken: chatbot.token })
      .sort({ timestamp: -1 })
      .limit(8)
      .lean(),
  ]);

  const recentVisitors = await WidgetSession.find({
    chatbotToken: chatbot.token,
  })
    .sort({ lastSeenAt: -1 })
    .limit(8)
    .lean();

  const formatWhere = (s: SessionRow) => {
    const bits = [s.city, s.region, s.country].filter(Boolean);
    return bits.length ? bits.join(", ") : "Unknown";
  };

  const formatDevice = (s: SessionRow) => {
    const bits = [s.deviceType, s.os, s.browser].filter(Boolean);
    return bits.length ? bits.join(" • ") : "Unknown";
  };

  return (
    <div className="mx-auto max-w-5xl grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-2xl font-semibold truncate">{chatbot.name}</div>
          {chatbot.description ? (
            <div className="text-sm text-muted-foreground line-clamp-2">
              {chatbot.description}
            </div>
          ) : null}
        </div>

  <ChatbotTabs chatbotId={String(chatbot._id)} active="overview" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">
              Sessions (24h)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">{sessions24h}</div>
            <div className="text-xs text-muted-foreground">Widget opens</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">
              Sessions (7d)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">{sessions7d}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">
              Messages (7d)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">{messages7d}</div>
            <div className="text-xs text-muted-foreground">From chat logs</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">
              Widget
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2">
            <Link
              href={`/embed?token=${encodeURIComponent(chatbot.token)}`}
              className="text-sm underline underline-offset-4"
            >
              Open widget
            </Link>
            <div className="text-xs text-muted-foreground">Token</div>
            <code className="text-xs break-all">{chatbot.token}</code>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent visitors</CardTitle>
          <div className="text-sm text-muted-foreground">
            Location is best-effort and depends on your host/proxy headers.
          </div>
        </CardHeader>
        <CardContent>
          {recentVisitors.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              No sessions tracked yet.
            </div>
          ) : (
            <div className="grid gap-2">
              {(recentVisitors as unknown as SessionRow[]).map((s) => (
                <div key={String(s._id)} className="rounded-md border p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">
                        {formatDevice(s)}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {formatWhere(s)}
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(s.lastSeenAt).toLocaleString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* <Card>
        <CardHeader>
          <CardTitle>Recent messages</CardTitle>
        </CardHeader>
        <CardContent>
          {lastMessages.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              No messages logged yet.
            </div>
          ) : (
            <div className="grid gap-3">
              {(lastMessages as unknown as MessageRow[]).map((m) => (
                <div key={String(m._id)} className="rounded-md border p-3">
                  <div className="text-xs text-muted-foreground">
                    {new Date(m.timestamp).toLocaleString()}
                  </div>
                  <Separator className="my-2" />
                  <div className="text-sm">
                    <span className="font-medium">User:</span> {m.userMessage}
                  </div>
                  <div className="mt-2 text-sm">
                    <span className="font-medium">Bot:</span> {m.botResponse}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card> */}
    </div>
  );
}
