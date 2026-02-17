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

const isCloudinaryImageUrl = (text: string): boolean => {
  return text.includes('res.cloudinary.com') && 
         (text.endsWith('.png') || text.endsWith('.jpg') || text.endsWith('.jpeg') || 
          text.endsWith('.gif') || text.endsWith('.webp'));
};

const isCloudinaryAudioUrl = (text: string): boolean => {
  return text.includes('res.cloudinary.com') && 
         (text.endsWith('.webm') || text.endsWith('.mp3') || 
          text.endsWith('.wav') || text.endsWith('.ogg'));
};

function ChatWidget({ token }: { token: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [adminActive, setAdminActive] = useState(false);
  // Removed user info modal and state
  const [starterQuestions, setStarterQuestions] = useState<string[]>([]);
  const [showStarterQuestions, setShowStarterQuestions] = useState(false);
  const [welcomeMessage, setWelcomeMessage] = useState("");
  const [chatbotId, setChatbotId] = useState<string | null>(null);
  const [theme, setTheme] = useState<ThemeConfig | null>(null);
  const [didShowWelcome, setDidShowWelcome] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  // Removed WhatsApp error state
  
  const bodyRef = useRef<HTMLDivElement>(null);
  const realtimeRef = useRef<any>(null);
  const channelRef = useRef<any>(null);
  const userIdRef = useRef<string>("");
  const isDarkMode = useRef<boolean>(false);
  const popupRef = useRef<HTMLDivElement>(null);

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

  // Removed getOrPromptUserInfo

// Removed handleUserInfoSubmit

  const safeHexColor = (v: string | undefined): string | null => {
    if (typeof v !== "string") return null;
    const s = v.trim();
    if (/^#[0-9a-fA-F]{6}$/.test(s) || /^#[0-9a-fA-F]{3}$/.test(s)) return s;
    return null;
  };

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

      channel.subscribe("message", (msg: any) => {
        const data = msg?.data || {};
        if (data.role === "admin") {
          let msgType = data.type || "text";
          const textValue = String(data.text || "");
          
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

  const trackSession = useCallback(async () => {
    if (!token) return;
    const sid = getOrCreateSessionId();
    if (!sid) return;
    try {
      fetch("/api/widget-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          sessionId: sid,
          userId: userIdRef.current,
          // name and whatsapp will be empty if not set yet
          name: localStorage.getItem(`mchatly:name:${token}`) || "",
          whatsapp: localStorage.getItem(`mchatly:whatsapp:${token}`) || "",
          pageUrl: String(location.href),
          referrer: document.referrer ? String(document.referrer) : undefined,
          language: navigator.language ? String(navigator.language) : undefined,
          timezone: Intl?.DateTimeFormat
            ? Intl.DateTimeFormat().resolvedOptions().timeZone
            : undefined,
        }),
      }).catch(() => {});
    } catch {}
  }, [token, getOrCreateSessionId]);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = input.trim();
    if (!val) return;
    setInput("");
    // Prompt for user info before sending
  await sendMessage(val, "text");
  };

 const handleStarterClick = async (question: string) => {
  setStarterQuestions([]);
  setShowStarterQuestions(false);
  // Send message directly
  sendMessage(question, "text");
};

  const toggleChat = () => {
    if (isOpen) {
      setIsAnimating(true);
      setTimeout(() => {
        setIsOpen(false);
        setIsAnimating(false);
        window.parent?.postMessage({ type: 'mchatly:close' }, '*');
      }, 300);
    } else {
      setIsOpen(true);
      setIsAnimating(true);
      window.parent?.postMessage({ type: 'mchatly:open' }, '*');
      setTimeout(() => setIsAnimating(false), 300);
    }
  };

  useEffect(() => {
    const init = async () => {
      await loadTheme();
      await trackSession();
      await loadHistory();
      try {
        window.parent?.postMessage({ type: "mchatly:ready", token }, "*");
      } catch {}
    };
    init();
  }, []);

  useEffect(() => {
    if (historyLoaded && !didShowWelcome && welcomeMessage && messages.length === 0) {
      setDidShowWelcome(true);
      setMessages([{ text: welcomeMessage, role: "bot", type: "text" }]);
      setShowStarterQuestions(false);
      setTimeout(() => {
        setShowStarterQuestions(true);
      }, 5000);
    }
  }, [historyLoaded, didShowWelcome, welcomeMessage, messages.length]);

  useEffect(() => {
    if (bodyRef.current && isOpen) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [messages, loading, isOpen]);

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

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(event.target as Node)) {
        if (isOpen && !isAnimating) {
          toggleChat();
        }
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen, isAnimating]);

  const formatDuration = (seconds?: number): string => {
    if (!seconds) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const ImageModal = () => {
    if (!selectedImage) return null;
    return (
      <div 
        style={{
          position: "absolute",
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

  const primaryColor = theme?.primary || "#111";
  const isDark = isDarkMode.current;

  // Custom chat bubble colors
  const botBubbleColor = "rgba(201,235,208,1)";
  const userBubbleColor = "rgba(204,220,246,1)";
  const chatBgColor = "rgba(255,255,255,1)";

  // Responsive: detect mobile
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth <= 640);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  return (
    <>
      {/* Floating Button */}
      {!isOpen && (
        <button
          onClick={toggleChat}
          style={{
            position: "fixed",
            bottom: isMobile ? 14 : 24,
            right: isMobile ? 14 : 24,
            width: isMobile ? 45 : 50,
            height: isMobile ? 45 : 50,
            borderRadius: "50%",
            background: primaryColor,
            color: "#fff",
            border: "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9998,
            transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
            transform: isAnimating ? "scale(0.8) rotate(90deg)" : "scale(1) rotate(0deg)",
          }}
        >
          <svg
            width={isMobile ? 18 : 28}
            height={isMobile ? 18 : 28}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </button>
      )}

      {/* Chat Popup */}
      {(isOpen || isAnimating) && (
        <div
          ref={popupRef}
          style={{
            position: "fixed",
            bottom: isMobile ? 30 : 24,
            right: isMobile ? 8 : 24,
            width: isMobile ? Math.round(325 * 1.05) : 340,
            height: isMobile ? Math.round(490 * 1.15) : 520,
            maxHeight: isMobile ? 'calc(100vh - 56px)' : 'calc(100vh - 48px)',
            borderRadius: isMobile ? 10 : 18,
            overflow: "hidden",
            background: chatBgColor,
            color: "#111",
            fontFamily: "system-ui",
            fontSize: isMobile ? 12 : 14,
            zIndex: 9999,
            display: "flex",
            flexDirection: "column",
            opacity: isOpen ? 1 : 0,
            transform: isOpen 
              ? "scale(1) translateY(0)" 
              : "scale(0.8) translateY(20px)",
            transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
            pointerEvents: isOpen ? "auto" : "none",
            boxShadow: '0 4px 24px 0 rgba(0,0,0,0.10)',
          }}
        >
          {/* User Info Modal removed */}

          {/* Header */}
          <div
            style={{
              padding: isMobile ? "10px 12px" : "16px 20px",
              borderBottom: `1px solid ${isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)"}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              background: chatBgColor,
              flexShrink: 0,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 7 : 12 }}>
              <div
                style={{
                  width: isMobile ? 36 : 54,
                  height: isMobile ? 36 : 54,
                  borderRadius: "50%",
                  overflow: "hidden",
                  background: "#e5e7eb",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <img
                  src="https://mchatly2.vercel.app/ahan.jpeg"
                  alt="Ahan Chaudhry"
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    borderRadius: '50%',
                    display: 'block',
                  }}
                />
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: isMobile ? 12 : 16 }}>Chat Support</div>
                <div style={{ fontSize: isMobile ? 10 : 12, opacity: 0.6, display: "flex", alignItems: "center", gap: 4 }}>
                  <span
                    style={{
                      width: isMobile ? 6 : 8,
                      height: isMobile ? 6 : 8,
                      borderRadius: "50%",
                      background: adminActive ? "#22c55e" : "#9ca3af",
                      display: "inline-block",
                    }}
                  />
                  {adminActive ? "Online" : "Ahan Chaudhry"}
                </div>
              </div>
            </div>
            <button
              onClick={toggleChat}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: 8,
                borderRadius: 8,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#28374a",
                opacity: 0.8,
                transition: "opacity 0.2s",
              }}
              aria-label="Close chat"
              onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.8")}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#28374a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* Main chat area - flex container for messages + starter questions */}
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              background: "rgba(255,255,255,1)",
              fontSize: isMobile ? 12 : 14,
            }}
          >
            {/* Scrollable messages area */}
            <div
              ref={bodyRef}
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                padding: isMobile ? 8 : 16,
                gap: isMobile ? 6 : 12,
                overflowY: "auto",
                overflowX: "hidden",
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
                    background: msg.role === "user" ? userBubbleColor : botBubbleColor,
                    color: "#111",
                    borderRadius: msg.role === "user" ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
                    padding: msg.type === "image" || msg.type === "voice" ? (isMobile ? 2 : 4) : (isMobile ? "7px 10px" : "12px 16px"),
                    maxWidth: isMobile ? "95%" : "85%",
                    wordBreak: "break-word",
                    fontSize: isMobile ? 12 : 14,
                    lineHeight: 1.4,
                  }}
                >
                  {msg.type === "image" ? (
                    <div>
                      <img
                        src={msg.text}
                        alt={msg.filename || "Shared image"}
                        style={{ 
                          maxWidth: isMobile ? 120 : 200, 
                          maxHeight: isMobile ? 90 : 160, 
                          borderRadius: isMobile ? 8 : 12,
                          display: "block",
                          cursor: "pointer"
                        }}
                        onClick={() => setSelectedImage(msg.text)}
                        loading="lazy"
                      />
                      {msg.filename && (
                        <div style={{ 
                          fontSize: isMobile ? 8 : 10, 
                          opacity: 0.7, 
                          marginTop: isMobile ? 3 : 6,
                          textAlign: "center" 
                        }}>
                          {msg.filename}
                        </div>
                      )}
                    </div>
                  ) : msg.type === "voice" ? (
                    <div style={{ padding: isMobile ? "2px 4px" : "4px 8px" }}>
                      <audio 
                        controls 
                        style={{ 
                          maxWidth: isMobile ? 110 : 220,
                          height: isMobile ? 20 : 36
                        }}
                      >
                        <source src={msg.text} type="audio/webm" />
                        <source src={msg.text} type="audio/mp3" />
                        Your browser does not support the audio element.
                      </audio>
                      {msg.duration && (
                        <div style={{ 
                          fontSize: isMobile ? 7 : 10, 
                          opacity: 0.7, 
                          marginTop: isMobile ? 2 : 4,
                          textAlign: "center" 
                        }}>
                          {formatDuration(msg.duration)}
                        </div>
                      )}
                    </div>
                  ) : (
                    msg.role === "bot" && msg.text.includes("\n") ? (
                      msg.text.split("\n").map((line, idx, arr) => (
                        <span key={idx}>
                          {line.trim()}
                          {idx < arr.length - 1 && <br />}
                        </span>
                      ))
                    ) : (
                      msg.text
                    )
                  )}
                </div>

       

              ))}

               {loading && (
                <div
                  style={{
                    alignSelf: "flex-start",
                    background: "var(--mchatly-bot-bubble, #fff)",
                    color: "var(--mchatly-bot-text, #111)",
                    borderRadius: "18px 18px 18px 4px",
                    padding: "12px 16px",
                    maxWidth: "85%",
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <span style={{ display: "flex", gap: 3 }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: "currentColor", opacity: 0.4, animation: "bounce 1.4s infinite ease-in-out both", animationDelay: "0s" }} />
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: "currentColor", opacity: 0.4, animation: "bounce 1.4s infinite ease-in-out both", animationDelay: "0.16s" }} />
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: "currentColor", opacity: 0.4, animation: "bounce 1.4s infinite ease-in-out both", animationDelay: "0.32s" }} />
                  </span>
                </div>
              )}

                   {showStarterQuestions && starterQuestions.length > 0 && (
              <div
                  style={{
                    padding: isMobile ? "7px 10px" : "12px 16px",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "flex-end",
                    gap: isMobile ? 4 : 8,
                    background: "#fff",
                    borderTop: "1px solid rgba(0,0,0,0.05)",
                    flexShrink: 0,
                  }}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: isMobile ? 3 : 6, alignItems: "flex-end" }}>
                  {starterQuestions.slice(0, 3).map((q, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleStarterClick(q)}
                      style={{
                        padding: isMobile ? "7px 10px" : "12px 16px",
                        borderRadius: "14px 14px 4px 14px",
                        background: userBubbleColor,
                        color: "#111",
                        border: "none",
                        boxShadow: "none",
                        cursor: "pointer",
                        fontSize: isMobile ? 12 : 14,
                        textAlign: "left",
                        transition: "all 0.2s",
                        width: "auto",
                        maxWidth: undefined,
                        wordBreak: "break-word",
                      }}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

             
            </div>

         
          </div>

          {/* Input Form */}
          <form
            onSubmit={handleSubmit}
            style={{
              padding: isMobile ? "7px 10px" : "12px 16px",
              borderTop: `1px solid ${isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)"}`,
              display: "flex",
              gap: isMobile ? 5 : 10,
              background: "#fff",
              flexShrink: 0,
            }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type a message..."
              style={{
                flex: 1,
                border: `1px solid ${isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.15)"}`,
                borderRadius: 18,
                padding: isMobile ? "7px 10px" : "12px 16px",
                font: "inherit",
                fontSize: isMobile ? 12 : 14,
                background: "rgba(240,241,243,1)",
                color: "#111",
                outline: "none",
              }}
              disabled={loading}
            />
            <button
              type="submit"
              style={{
                background: "rgba(240,241,243,1)",
                color: "#111",
                border: "none",
                borderRadius: "50%",
                width: isMobile ? 30 : 44,
                height: isMobile ? 30 : 44,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: loading || !input.trim() ? "not-allowed" : "pointer",
                opacity: loading || !input.trim() ? 0.5 : 1,
                transition: "all 0.2s",
              }}
              disabled={loading || !input.trim()}
            >
              <svg width={isMobile ? 13 : 20} height={isMobile ? 13 : 20} viewBox="0 0 24 24" fill="none" stroke="rgba(40,55,74,1)" strokeWidth="2.7" style={{display:'block'}}>
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </form>

          {/* Footer */}
          {/* Footer removed as requested */}
        </div>
      )}

      <ImageModal />

      <style jsx global>{`
        @keyframes bounce {
          0%, 80%, 100% {
            transform: scale(0.6);
            opacity: 0.4;
          }
          40% {
            transform: scale(1);
            opacity: 1;
          }
        }
      `}</style>
    </>
  );
}

export default ChatWidget;