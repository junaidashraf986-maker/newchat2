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
    <>
      {/* Force override styles with !important */}
      <style>
        {`
          .embedContainer {
            height: 100vh !important;
            position: fixed !important;
            top: auto !important;
            right: 20px !important;
            bottom: 20px !important;
            left: auto !important;

            width: 64px !important;
            height: 60px !important;
            min-width: 64px !important;
            min-height: 60px !important;
            max-width: 64px !important;
            max-height: 60px !important;

            display: block !important;
            z-index: 1000003 !important;

            background: transparent !important;
            background-color: transparent !important;

            font-family: system-ui !important;

            border: 0 !important;
            padding: 0 !important;
            margin: 0 !important;

            box-shadow: none !important;
            outline: none !important;

            transform: none !important;
            transition-property: none !important;

            overflow: visible !important;
            resize: none !important;

            cursor: none !important;
            pointer-events: auto !important;

            border-radius: unset !important;
            color-scheme: light !important;
          }
        `}
      </style>

      <div className="embedContainer">
        {safeToken ? (
          <ChatWidget token={safeToken} />
        ) : (
          <div style={{ padding: 32, textAlign: "center" }}>
            <b>Missing token</b>
          </div>
        )}
      </div>
    </>
  );
}