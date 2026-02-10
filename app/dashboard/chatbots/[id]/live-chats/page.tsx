
import { LiveChats } from "@/components/app/live-chats";
// Reuse navigation from overview page
import dynamic from "next/dynamic";
import { ChatbotTabs } from "@/components/app/ChatbotTabs";

export default async function LiveChatsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <div className="mx-auto max-w-6xl grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-2xl font-semibold">Live chats</div>
          <div className="text-sm text-muted-foreground">
            Monitor active sessions and join a chat to talk in real time.
          </div>
        </div>
        <ChatbotTabs chatbotId={id} active="live-chats" />
      </div>
      <LiveChats chatbotId={id} />
    </div>
  );
}
