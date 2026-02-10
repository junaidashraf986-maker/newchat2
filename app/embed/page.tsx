import dynamic from "next/dynamic";

import ChatWidget from "./ChatWidgetClient";

export default async function EmbedPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  const sp = await searchParams;
  const tokenRaw = sp.token;
  const token = Array.isArray(tokenRaw) ? tokenRaw[0] : tokenRaw;
  const safeToken = token ?? "";

  return (
    <div
      style={{
        height: "100vh",
        background: "transparent",
        fontFamily: "system-ui",
      }}
    >
      {safeToken ? (
        <ChatWidget token={safeToken} />
      ) : (
        <div style={{ padding: 32, textAlign: "center" }}>
          <b>Missing token</b>
        </div>
      )}
    </div>
  );
}

