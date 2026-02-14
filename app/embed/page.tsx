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

          html, body {
          background: transparent !important;
          margin: 0 !important;
          padding: 0 !important;
          overflow: hidden !important;
        }


          .embedContainer {
            height: 100vh !important;
            position: fixed !important;
            top: auto !important;
            right: 20px !important;
            bottom: 20px !important;
            left: auto !important;

            width: 64px !important;
            height: 60px !important;
            min-width: 80px !important;
            min-height: 80px !important;
            max-width: 80px !important;
            max-height: 80px !important;

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

            pointer-events: auto !important;

            border-radius: unset !important;
            color-scheme: light !important;
          }
        `}
      </style>

      <div className="embedContainer">
        {safeToken ? (
         <div style={{ 
        width: '100%', 
        height: '100%', 
        position: 'relative',
        background: 'transparent',
        overflow: 'visible' // Changed from hidden
      }}>
        <ChatWidget token={safeToken} />
      </div>
        ) : (
          <div style={{ padding: 32, textAlign: "center" }}>
            <b>Missing token</b>
          </div>
        )}
      </div>
    </>
  );
}