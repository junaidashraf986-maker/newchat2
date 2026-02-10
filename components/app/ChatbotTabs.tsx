import Link from "next/link";

export function TabLink({ href, label, active }: { href: string; label: string; active?: boolean }) {
  return (
    <Link
      href={href}
      className={
        "rounded-md px-3 py-2 text-sm border transition-colors " +
        (active
          ? "bg-accent text-accent-foreground border-transparent"
          : "hover:bg-accent hover:text-accent-foreground")
      }
    >
      {label}
    </Link>
  );
}

export function ChatbotTabs({ chatbotId, active }: { chatbotId: string; active: string }) {
  const base = `/dashboard/chatbots/${chatbotId}`;
  return (
    <div className="flex flex-wrap gap-2">
      <TabLink href={`${base}/overview`} label="Overview" active={active === "overview"} />
      <TabLink href={`${base}/live-chats`} label="Live Chats" active={active === "live-chats"} />
      <TabLink href={`/projects/${chatbotId}/analytics`} label="Analytics" active={active === "analytics"} />
      <TabLink href={`${base}/settings`} label="Settings" active={active === "settings"} />
    </div>
  );
}
