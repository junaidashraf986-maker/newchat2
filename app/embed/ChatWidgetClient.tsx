"use client";

import { useEffect, useState, useRef, useCallback } from "react";

type ChatMessage = {
  _id?: string;
  text: string;
  role: "user" | "bot";
  type?: "text" | "image" | "voice";
  timestamp?: string;
  filename?: string;
  duration?: number;
};

type UserInfo = {
  name: string;
  whatsapp: string;
};

type ThemeConfig = {
  mode?: "light" | "dark" | "system";
  primary?: string;
  userBubble?: string;
  botBubble?: string;
  userText?: string;
  botText?: string;
};

type WidgetConfig = {
  theme?: ThemeConfig;
  chatbotId?: string;
  welcomeMessage?: string;
  starterQuestions?: string[];
};

// Check if text is a Cloudinary image URL
// Check if text is a Cloudinary image URL
// Check if text is a Cloudinary image URL
const isCloudinaryImageUrl = (text: string): boolean => {
  return text.includes('res.cloudinary.com') && 
         (text.endsWith('.png') || text.endsWith('.jpg') || text.endsWith('.jpeg') || 
          text.endsWith('.gif') || text.endsWith('.webp'));
};

// Check if text is a Cloudinary audio URL
const isCloudinaryAudioUrl = (text: string): boolean => {
  return text.includes('res.cloudinary.com') && 
         (text.endsWith('.webm') || text.endsWith('.mp3') || 
          text.endsWith('.wav') || text.endsWith('.ogg'));
};

function ChatWidget({ token }: { token: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [adminActive, setAdminActive] = useState(false);
  const [showUserInfoModal, setShowUserInfoModal] = useState(false);
  const [userInfo, setUserInfo] = useState<UserInfo>({ name: "", whatsapp: "" });
  const [starterQuestions, setStarterQuestions] = useState<string[]>([]);
  const [welcomeMessage, setWelcomeMessage] = useState("");
  const [chatbotId, setChatbotId] = useState<string | null>(null);
  const [theme, setTheme] = useState<ThemeConfig | null>(null);
  const [didShowWelcome, setDidShowWelcome] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  
  const bodyRef = useRef<HTMLDivElement>(null);
  const realtimeRef = useRef<any>(null);
  const channelRef = useRef<any>(null);
  const userIdRef = useRef<string>("");
  const isDarkMode = useRef<boolean>(false);

  // Initialize user ID
  useEffect(() => {
    const key = `mchatly:userId:${token}`;
    let uid = localStorage.getItem(key);
    if (!uid) {
      if (window.crypto && window.crypto.randomUUID) {
        uid = window.crypto.randomUUID();
      } else {
        uid = String(Date.now()) + '-' + Math.random().toString(16).slice(2);
      }
      localStorage.setItem(key, uid);
    }
    userIdRef.current = uid;
  }, [token]);

  // Get or create session ID
  const getOrCreateSessionId = useCallback(() => {
    const key = `mchatly:sessionId:${token}`;
    let sid = localStorage.getItem(key);
    if (!sid) {
      if (window.crypto && window.crypto.randomUUID) {
        sid = window.crypto.randomUUID();
      } else {
        sid = String(Date.now()) + '-' + Math.random().toString(16).slice(2);
      }
      localStorage.setItem(key, sid);
    }
    return sid;
  }, [token]);

  // Get or prompt user info
  const getOrPromptUserInfo = useCallback(async (): Promise<UserInfo> => {
    const nameKey = `mchatly:name:${token}`;
    const whatsappKey = `mchatly:whatsapp:${token}`;
    let name = localStorage.getItem(nameKey);
    let whatsapp = localStorage.getItem(whatsappKey);

    if (!name || !whatsapp) {
      setShowUserInfoModal(true);
      return new Promise((resolve) => {
        const checkInterval = setInterval(() => {
          const newName = localStorage.getItem(nameKey);
          const newWhatsapp = localStorage.getItem(whatsappKey);
          if (newName && newWhatsapp) {
            clearInterval(checkInterval);
            setUserInfo({ name: newName, whatsapp: newWhatsapp });
            resolve({ name: newName, whatsapp: newWhatsapp });
          }
        }, 100);
      });
    }

    setUserInfo({ name, whatsapp });
    return { name, whatsapp };
  }, [token]);

  // Handle user info submission
  const handleUserInfoSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const name = (e.currentTarget as HTMLFormElement).userName.value.trim();
    const whatsapp = (e.currentTarget as HTMLFormElement).userWhatsapp.value.trim();

    if (!name || !whatsapp) {
      return;
    }

    const nameKey = `mchatly:name:${token}`;
    const whatsappKey = `mchatly:whatsapp:${token}`;
    localStorage.setItem(nameKey, name);
    localStorage.setItem(whatsappKey, whatsapp);
    setShowUserInfoModal(false);
    setUserInfo({ name, whatsapp });
  };

  // Safe hex color validation
  const safeHexColor = (v: string | undefined): string | null => {
    if (typeof v !== "string") return null;
    const s = v.trim();
    if (/^#[0-9a-fA-F]{6}$/.test(s) || /^#[0-9a-fA-F]{3}$/.test(s)) return s;
    return null;
  };

  // Apply theme
  const applyTheme = useCallback((t: ThemeConfig) => {
    const mode = t.mode || "system";
    const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    const isDark = mode === "dark" || (mode === "system" && prefersDark);
    isDarkMode.current = isDark;

    const root = document.documentElement;
    root.style.setProperty("--mchatly-panel-bg", isDark ? "#0b0b0b" : "#ffffff");
    root.style.setProperty("--mchatly-panel-text", isDark ? "#ffffff" : "#111111");

    const primary = safeHexColor(t.primary);
    const userBubble = safeHexColor(t.userBubble);
    const botBubble = safeHexColor(t.botBubble);
    const userText = safeHexColor(t.userText);
    const botText = safeHexColor(t.botText);

    if (primary) root.style.setProperty("--mchatly-primary", primary);
    if (userBubble) root.style.setProperty("--mchatly-user-bubble", userBubble);
    if (botBubble) root.style.setProperty("--mchatly-bot-bubble", botBubble);
    if (userText) root.style.setProperty("--mchatly-user-text", userText);
    if (botText) root.style.setProperty("--mchatly-bot-text", botText);
  }, []);

  // Load Ably script
  const loadAbly = (): Promise<any> => {
    return new Promise((resolve, reject) => {
      if ((window as any).Ably) return resolve((window as any).Ably);
      const script = document.createElement("script");
      script.src = "https://cdn.ably.com/lib/ably.min-1.js";
      script.onload = () => resolve((window as any).Ably);
      script.onerror = () => reject(new Error("Failed to load Ably"));
      document.head.appendChild(script);
    });
  };

  // Connect to realtime
  const connectRealtime = useCallback(async (cbotId: string) => {
    if (!token || !cbotId || channelRef.current) return;
    const sid = getOrCreateSessionId();
    if (!sid) return;

    try {
      const Ably = await loadAbly();
      const realtime = new Ably.Realtime({
        authUrl:
          "/api/ably-token?role=visitor&token=" +
          encodeURIComponent(token) +
          "&sessionId=" +
          encodeURIComponent(sid),
      });
      realtimeRef.current = realtime;

      const channelName = "live-chat:" + cbotId + ":" + sid;
      const channel = realtime.channels.get(channelName);
      channelRef.current = channel;

      // Subscribe to messages - handle text, image, and voice
      channel.subscribe("message", (msg: any) => {
  const data = msg?.data || {};
  if (data.role === "admin") {
    let msgType = data.type || "text";
    const textValue = String(data.text || "");
    
    // Auto-detect Cloudinary URLs if type is text
    if (msgType === "text") {
      if (isCloudinaryImageUrl(textValue)) {
        msgType = "image";
      } else if (isCloudinaryAudioUrl(textValue)) {
        msgType = "voice";
      }
    }
    
    setMessages((msgs) => [
      ...msgs,
      { 
        text: textValue, 
        role: "bot", 
        type: msgType,
        filename: data.filename,
        duration: data.duration
      },
    ]);
  }
});

      channel.presence.subscribe("enter", (member: any) => {
        if (member?.data?.role === "admin" && !adminActive) {
          setAdminActive(true);
          setMessages((msgs) => [
            ...msgs,
            { text: "Admin joined the chat.", role: "bot", type: "text" },
          ]);
        }
      });

      channel.presence.subscribe("leave", (member: any) => {
        if (member?.data?.role === "admin") {
          setAdminActive(false);
          setMessages((msgs) => [
            ...msgs,
            { text: "Admin left the chat.", role: "bot", type: "text" },
          ]);
        }
      });

      channel.presence.get((err: any, members: any[]) => {
        if (err) return;
        const hasAdmin = (members || []).some((m) => m.data?.role === "admin");
        if (hasAdmin && !adminActive) {
          setAdminActive(true);
          setMessages((msgs) => [
            ...msgs,
            { text: "Admin joined the chat.", role: "bot", type: "text" },
          ]);
        }
      });
    } catch {}
  }, [token, getOrCreateSessionId, adminActive]);

  // Load theme and config
  const loadTheme = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch("/api/widget-config?token=" + encodeURIComponent(token));
      const data: WidgetConfig = await res.json().catch(() => ({}));
      
      if (data.chatbotId) {
        setChatbotId(String(data.chatbotId));
        await connectRealtime(String(data.chatbotId));
      }
      
      if (data.welcomeMessage) {
        setWelcomeMessage(String(data.welcomeMessage));
      }
      
      if (data.theme) {
        setTheme(data.theme);
        applyTheme({
          mode: ["light", "dark", "system"].includes(data.theme.mode || "")
            ? data.theme.mode
            : "system",
          primary: safeHexColor(data.theme.primary) || undefined,
          userBubble: safeHexColor(data.theme.userBubble) || undefined,
          botBubble: safeHexColor(data.theme.botBubble) || undefined,
          userText: safeHexColor(data.theme.userText) || undefined,
          botText: safeHexColor(data.theme.botText) || undefined,
        });
      }

      if (Array.isArray(data.starterQuestions)) {
        setStarterQuestions(data.starterQuestions);
      }
    } catch {}
  }, [token, applyTheme, connectRealtime]);

  // Track session
  const trackSession = useCallback(async () => {
    if (!token) return;
    const sid = getOrCreateSessionId();
    if (!sid) return;
    
    const userInfo = await getOrPromptUserInfo();
    
    try {
      fetch("/api/widget-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          sessionId: sid,
          userId: userIdRef.current,
          name: userInfo.name,
          whatsapp: userInfo.whatsapp,
          pageUrl: String(location.href),
          referrer: document.referrer ? String(document.referrer) : undefined,
          language: navigator.language ? String(navigator.language) : undefined,
          timezone: Intl?.DateTimeFormat
            ? Intl.DateTimeFormat().resolvedOptions().timeZone
            : undefined,
        }),
      }).catch(() => {});
    } catch {}
  }, [token, getOrCreateSessionId, getOrPromptUserInfo]);

  // Load chat history
// Load chat history
// Load chat history
const loadHistory = useCallback(async () => {
  if (!token) return;
  const sid = getOrCreateSessionId();
  if (!sid) return;
  
  try {
    const res = await fetch(
      `/api/widget-history?token=${encodeURIComponent(token)}&sessionId=${encodeURIComponent(sid)}`
    );
    const data = await res.json().catch(() => ({}));
    
    if (Array.isArray(data.items)) {
      const mapped = data.items.map((item: any) => {
        // Auto-detect Cloudinary URLs on load
        let msgType = item.type || "text";
        if (msgType === "text") {
          if (isCloudinaryImageUrl(item.text)) {
            msgType = "image";
          } else if (isCloudinaryAudioUrl(item.text)) {
            msgType = "voice";
          }
        }
        return {
          ...item,
          role: item.role === "user" ? "user" : "bot",
          type: msgType,
        };
      });
      setMessages(mapped);
    }
    setHistoryLoaded(true);
  } catch {}
}, [token, getOrCreateSessionId]);

  // Log chat
  const logChat = useCallback(async (message: string, messageBy: "user" | "bot", type: "text" | "image" | "voice" = "text") => {
    if (!token) return;
    try {
      const nameKey = `mchatly:name:${token}`;
      const whatsappKey = `mchatly:whatsapp:${token}`;
      const name = localStorage.getItem(nameKey) || "";
      const whatsapp = localStorage.getItem(whatsappKey) || "";
      
      await fetch("/api/log-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          sessionId: getOrCreateSessionId(),
          userId: userIdRef.current,
          message,
          messageBy,
          type,
          name,
          whatsapp,
        }),
      });
    } catch {}
  }, [token, getOrCreateSessionId]);

  // Send message
  const sendMessage = useCallback(async (userMessage: string, type: "text" | "image" | "voice" = "text") => {
    if (!userMessage.trim()) return;

    setMessages((msgs) => [
      ...msgs,
      { text: userMessage, role: "user", type },
    ]);
    await logChat(userMessage, "user", type);

    if (adminActive && channelRef.current) {
      try {
        channelRef.current.publish("message", { role: "visitor", text: userMessage, type });
      } catch {}
      return;
    }

    if (type === "text") {
      setLoading(true);
    }

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, message: userMessage }),
      });
      const data = await res.json().catch(() => ({}));
      
      let botResponse = "";
      if (!res.ok) {
        botResponse = data.error ? String(data.error) : "Sorry — something went wrong.";
      } else {
        botResponse = (data.reply ? String(data.reply) : "").trim();
      }

      if (!botResponse) botResponse = "Sorry — I could not generate a response.";

      setMessages((msgs) => [
        ...msgs,
        { text: botResponse, role: "bot", type: "text" },
      ]);
      await logChat(botResponse, "bot", "text");
    } catch {
      const errorMsg = "Network error. Please try again.";
      setMessages((msgs) => [
        ...msgs,
        { text: errorMsg, role: "bot", type: "text" },
      ]);
      await logChat(errorMsg, "bot", "text");
    } finally {
      setLoading(false);
    }
  }, [token, adminActive, logChat]);

  // Handle form submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = input.trim();
    if (!val) return;
    setInput("");
    await sendMessage(val, "text");
  };

  // Handle starter question click
  const handleStarterClick = (question: string, index: number) => {
    setStarterQuestions((prev) => prev.filter((_, i) => i !== index));
    sendMessage(question, "text");
  };

  // Initialize
  useEffect(() => {
    const init = async () => {
      await getOrPromptUserInfo();
      await loadTheme();
      await trackSession();
      await loadHistory();
      
      try {
        window.parent?.postMessage({ type: "mchatly:ready", token }, "*");
      } catch {}
    };
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Show welcome message after history loads if no messages
  useEffect(() => {
    if (historyLoaded && !didShowWelcome && welcomeMessage && messages.length === 0) {
      setDidShowWelcome(true);
      setMessages([{ text: welcomeMessage, role: "bot", type: "text" }]);
    }
  }, [historyLoaded, didShowWelcome, welcomeMessage, messages.length]);

  // Scroll to bottom on new message
  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [messages, loading]);

  // Cleanup Ably on unmount
  useEffect(() => {
    return () => {
      if (channelRef.current) {
        try {
          channelRef.current.unsubscribe();
        } catch {}
      }
      if (realtimeRef.current) {
        try {
          realtimeRef.current.close();
        } catch {}
      }
    };
  }, []);

  // Format duration for voice messages
  const formatDuration = (seconds?: number): string => {
    if (!seconds) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Image modal component
  const ImageModal = () => {
    if (!selectedImage) return null;
    return (
      <div 
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100vw",
          height: "100vh",
          background: "rgba(0,0,0,0.9)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 10000,
          cursor: "pointer",
        }}
        onClick={() => setSelectedImage(null)}
      >
        <img 
          src={selectedImage} 
          alt="Full size" 
          style={{
            maxWidth: "90%",
            maxHeight: "90%",
            objectFit: "contain",
            borderRadius: 8,
          }}
          onClick={(e) => e.stopPropagation()}
        />
        <button
          style={{
            position: "absolute",
            top: 20,
            right: 20,
            background: "rgba(255,255,255,0.2)",
            border: "none",
            color: "#fff",
            fontSize: 24,
            width: 40,
            height: 40,
            borderRadius: "50%",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          onClick={() => setSelectedImage(null)}
        >
          ×
        </button>
      </div>
    );
  };

  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        border: "1px solid rgba(0,0,0,.12)",
        borderRadius: 14,
        overflow: "hidden",
        background: "var(--mchatly-panel-bg, #fff)",
        color: "var(--mchatly-panel-text, #111)",
        fontFamily: "system-ui",
      }}
    >
      {/* Image Modal */}
      <ImageModal />
      
      {/* User Info Modal */}
      {showUserInfoModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100vw",
            height: "100vh",
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
          }}
        >
          <form
            onSubmit={handleUserInfoSubmit}
            style={{
              background: "#fff",
              padding: "32px 24px",
              borderRadius: 14,
              boxShadow: "0 2px 16px rgba(0,0,0,0.08)",
              display: "flex",
              flexDirection: "column",
              gap: 18,
              minWidth: 320,
              maxWidth: "90%",
            }}
          >
            <div style={{ fontWeight: 700, fontSize: 20 }}>Start Conversation</div>
            <input
              name="userName"
              placeholder="Your Name"
              required
              style={{
                padding: 12,
                borderRadius: 8,
                border: "1px solid #ddd",
                fontSize: 16,
                width: "100%",
              }}
            />
            <input
              name="userWhatsapp"
              placeholder="WhatsApp Number"
              type="tel"
              required
              style={{
                padding: 12,
                borderRadius: 8,
                border: "1px solid #ddd",
                fontSize: 16,
                width: "100%",
              }}
            />
            <button
              type="submit"
              style={{
                padding: "12px 18px",
                borderRadius: 8,
                background: "#111",
                color: "#fff",
                fontWeight: 700,
                fontSize: 16,
                border: "none",
                cursor: "pointer",
              }}
            >
              Start Chat
            </button>
          </form>
        </div>
      )}

      {/* Header */}
      <div
        style={{
          padding: "10px 12px",
          borderBottom: "1px solid rgba(0,0,0,.08)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div>
          <div style={{ fontWeight: 700 }}>Chat</div>
          <div style={{ fontSize: 12, opacity: 0.65 }}>
            Token: {token ? "••••••" : "missing"}
          </div>
        </div>
        <div style={{ fontSize: 12, opacity: 0.65 }}>mchatly</div>
      </div>

      {/* Messages */}
      <div
        ref={bodyRef}
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          padding: 10,
          gap: 8,
          overflow: "auto",
        }}
      >
        {messages.length === 0 && !loading && (
          <div style={{ color: "#888", textAlign: "center", marginTop: 40 }}>
            <b>No messages yet.</b>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={msg._id || i}
            style={{
              alignSelf: msg.role === "user" ? "flex-end" : "flex-start",
              background:
                msg.role === "user"
                  ? "var(--mchatly-user-bubble, #111)"
                  : "var(--mchatly-bot-bubble, #f1f1f1)",
              color:
                msg.role === "user"
                  ? "var(--mchatly-user-text, #fff)"
                  : "var(--mchatly-bot-text, #111)",
              borderRadius: 10,
              padding: msg.type === "image" || msg.type === "voice" ? 4 : "8px 10px",
              maxWidth: "90%",
              marginBottom: 2,
              wordBreak: "break-word",
            }}
          >
            {msg.type === "image" ? (
              <div>
                <img
                  src={msg.text}
                  alt={msg.filename || "Shared image"}
                  style={{ 
                    maxWidth: 220, 
                    maxHeight: 180, 
                    borderRadius: 8,
                    display: "block",
                    cursor: "pointer"
                  }}
                  onClick={() => setSelectedImage(msg.text)}
                  loading="lazy"
                />
                {msg.filename && (
                  <div style={{ 
                    fontSize: 10, 
                    opacity: 0.7, 
                    marginTop: 4,
                    textAlign: "center" 
                  }}>
                    {msg.filename}
                  </div>
                )}
              </div>
            ) : msg.type === "voice" ? (
              <div style={{ padding: "4px 8px" }}>
                <audio 
                  controls 
                  style={{ 
                    maxWidth: 250,
                    height: 40
                  }}
                >
                  <source src={msg.text} type="audio/webm" />
                  <source src={msg.text} type="audio/mp3" />
                  Your browser does not support the audio element.
                </audio>
                {msg.duration && (
                  <div style={{ 
                    fontSize: 10, 
                    opacity: 0.7, 
                    marginTop: 4,
                    textAlign: "center" 
                  }}>
                    {formatDuration(msg.duration)}
                  </div>
                )}
              </div>
            ) : (
              msg.text
            )}
          </div>
        ))}

        {loading && (
          <div
            style={{
              alignSelf: "flex-start",
              background: "var(--mchatly-bot-bubble, #f1f1f1)",
              color: "var(--mchatly-bot-text, #111)",
              borderRadius: 10,
              padding: "8px 10px",
              maxWidth: "90%",
              opacity: 0.75,
              fontStyle: "italic",
            }}
          >
            Typing…
          </div>
        )}
      </div>

      {/* Starter Questions */}
      {starterQuestions.length > 0 && (
        <div
          style={{
            padding: "8px 12px 0 12px",
            display: "flex",
            justifyContent: "flex-end",
            width: "fit-content",
            marginLeft: "auto",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {starterQuestions.map((q, idx) => (
              <button
                key={idx}
                onClick={() => handleStarterClick(q, idx)}
                style={{
                  padding: "8px 14px",
                  borderRadius: 10,
                  background: "var(--mchatly-bot-bubble, #f1f1f1)",
                  color: "var(--mchatly-bot-text, #111)",
                  border: "none",
                  cursor: "pointer",
                  fontSize: 15,
                  marginBottom: 8,
                  boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
                  whiteSpace: "nowrap",
                  textAlign: "left",
                }}
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input Form */}
      <form
        onSubmit={handleSubmit}
        style={{
          padding: 10,
          borderTop: "1px solid rgba(0,0,0,.08)",
          display: "flex",
          gap: 8,
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message..."
          style={{
            flex: 1,
            border: "1px solid rgba(0,0,0,.15)",
            borderRadius: 10,
            padding: 10,
            font: "inherit",
          }}
          disabled={loading}
        />
        <button
          type="submit"
          style={{
            background: "var(--mchatly-primary, #111)",
            color: "#fff",
            border: "1px solid rgba(255,255,255,.15)",
            borderRadius: 10,
            padding: "10px 12px",
            fontWeight: 700,
            cursor: loading ? "not-allowed" : "pointer",
          }}
          disabled={loading || !input.trim()}
        >
          Send
        </button>
      </form>

      {/* Footer */}
      <div
        style={{
          padding: "6px 10px",
          borderTop: "1px solid rgba(0,0,0,.06)",
          fontSize: 11,
          opacity: 0.65,
          textAlign: "center",
        }}
      >
        Powered by <a href={process.env.SITE_URL}>mchatly</a>
      </div>
    </div>
  );
}

export default ChatWidget;