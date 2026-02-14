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
  const popupRef = useRef<HTMLDivElement>(null);

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
      script.src = "https://cdn.ably.com/lib/ably.min-1.js ";
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
    await sendMessage(val, "text");
  };

  const handleStarterClick = (question: string, index: number) => {
    setStarterQuestions((prev) => prev.filter((_, i) => i !== index));
    sendMessage(question, "text");
  };

  const toggleChat = () => {
    if (isOpen) {
      setIsAnimating(true);
      setTimeout(() => {
        setIsOpen(false);
        setIsAnimating(false);
      }, 300);
    } else {
      setIsOpen(true);
      setIsAnimating(true);
      setTimeout(() => setIsAnimating(false), 300);
    }
  };

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
  }, []);

  useEffect(() => {
    if (historyLoaded && !didShowWelcome && welcomeMessage && messages.length === 0) {
      setDidShowWelcome(true);
      setMessages([{ text: welcomeMessage, role: "bot", type: "text" }]);
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

  const primaryColor = theme?.primary || "#111";
  const isDark = isDarkMode.current;

  return (
    <>
      {/* Floating Button */}
      {!isOpen && (
        <button
          onClick={toggleChat}
          style={{
            position: "fixed",
            bottom: 24,
            right: 24,
            width: 60,
            height: 60,
            borderRadius: "50%",
            background: primaryColor,
            color: "#fff",
            border: "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
            zIndex: 9998,
            transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
            transform: isAnimating ? "scale(0.8) rotate(90deg)" : "scale(1) rotate(0deg)",
          }}
        >
          <svg
            width="28"
            height="28"
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
            bottom: 24,
            right: 24,
            width: 380,
            height: 600,
            maxHeight: "calc(100vh - 48px)",
            borderRadius: 20,
            overflow: "hidden",
            background: "var(--mchatly-panel-bg, #fff)",
            color: "var(--mchatly-panel-text, #111)",
            fontFamily: "system-ui",
            boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
            zIndex: 9999,
            display: "flex",
            flexDirection: "column",
            opacity: isOpen ? 1 : 0,
            transform: isOpen 
              ? "scale(1) translateY(0)" 
              : "scale(0.8) translateY(20px)",
            transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
            pointerEvents: isOpen ? "auto" : "none",
          }}
        >
          {/* User Info Modal - MOVED INSIDE and positioned absolutely */}
          {showUserInfoModal && (
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: "100%",
                background: "rgba(0,0,0,0.6)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 100,
                backdropFilter: "blur(4px)",
              }}
            >
              <form
                onSubmit={handleUserInfoSubmit}
                style={{
                  background: "#fff",
                  padding: "32px 28px",
                  borderRadius: 20,
                  boxShadow: "0 25px 50px rgba(0,0,0,0.15)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 20,
                  minWidth: 300,
                  maxWidth: "85%",
                  margin: 20,
                }}
              >
                <div>
                  <div style={{ fontWeight: 700, fontSize: 24, marginBottom: 8, color: "#111" }}>Start Conversation</div>
                  <div style={{ fontSize: 14, opacity: 0.6, color: "#666" }}>
                    Please provide your details to begin chatting
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <input
                    name="userName"
                    placeholder="Your Name"
                    required
                    style={{
                      padding: 14,
                      borderRadius: 12,
                      border: "1px solid #e5e7eb",
                      fontSize: 15,
                      width: "100%",
                      outline: "none",
                      transition: "border-color 0.2s",
                    }}
                    onFocus={(e) => (e.target.style.borderColor = primaryColor)}
                    onBlur={(e) => (e.target.style.borderColor = "#e5e7eb")}
                  />
                  <input
                    name="userWhatsapp"
                    placeholder="WhatsApp Number"
                    type="tel"
                    required
                    style={{
                      padding: 14,
                      borderRadius: 12,
                      border: "1px solid #e5e7eb",
                      fontSize: 15,
                      width: "100%",
                      outline: "none",
                      transition: "border-color 0.2s",
                    }}
                    onFocus={(e) => (e.target.style.borderColor = primaryColor)}
                    onBlur={(e) => (e.target.style.borderColor = "#e5e7eb")}
                  />
                </div>
                <button
                  type="submit"
                  style={{
                    padding: "14px 20px",
                    borderRadius: 12,
                    background: primaryColor,
                    color: "#fff",
                    fontWeight: 600,
                    fontSize: 16,
                    border: "none",
                    cursor: "pointer",
                    transition: "transform 0.2s, box-shadow 0.2s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = "translateY(-2px)";
                    e.currentTarget.style.boxShadow = "0 10px 20px rgba(0,0,0,0.15)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = "translateY(0)";
                    e.currentTarget.style.boxShadow = "none";
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
              padding: "16px 20px",
              borderBottom: `1px solid ${isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)"}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              background: isDark ? "#1a1a1a" : "#fff",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: "50%",
                  background: primaryColor,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#fff",
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 16 }}>Chat Support</div>
                <div style={{ fontSize: 12, opacity: 0.6, display: "flex", alignItems: "center", gap: 4 }}>
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: adminActive ? "#22c55e" : "#9ca3af",
                      display: "inline-block",
                    }}
                  />
                  {adminActive ? "Online" : "Bot"}
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
                color: "var(--mchatly-panel-text, #111)",
                opacity: 0.6,
                transition: "opacity 0.2s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.6")}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* Messages */}
          <div
            ref={bodyRef}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              padding: 16,
              gap: 12,
              overflow: "auto",
              background: isDark ? "#0b0b0b" : "#f8f9fa",
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
                      : "var(--mchatly-bot-bubble, #fff)",
                  color:
                    msg.role === "user"
                      ? "var(--mchatly-user-text, #fff)"
                      : "var(--mchatly-bot-text, #111)",
                  borderRadius: msg.role === "user" ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
                  padding: msg.type === "image" || msg.type === "voice" ? 4 : "12px 16px",
                  maxWidth: "85%",
                  wordBreak: "break-word",
                  boxShadow: msg.role === "bot" ? "0 1px 2px rgba(0,0,0,0.1)" : "none",
                  fontSize: 14,
                  lineHeight: 1.5,
                }}
              >
                {msg.type === "image" ? (
                  <div>
                    <img
                      src={msg.text}
                      alt={msg.filename || "Shared image"}
                      style={{ 
                        maxWidth: 200, 
                        maxHeight: 160, 
                        borderRadius: 12,
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
                        marginTop: 6,
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
                        maxWidth: 220,
                        height: 36
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
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: "currentColor",
                      opacity: 0.4,
                      animation: "bounce 1.4s infinite ease-in-out both",
                      animationDelay: "0s",
                    }}
                  />
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: "currentColor",
                      opacity: 0.4,
                      animation: "bounce 1.4s infinite ease-in-out both",
                      animationDelay: "0.16s",
                    }}
                  />
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: "currentColor",
                      opacity: 0.4,
                      animation: "bounce 1.4s infinite ease-in-out both",
                      animationDelay: "0.32s",
                    }}
                  />
                </span>
              </div>
            )}
          </div>

          {/* Starter Questions */}
          {starterQuestions.length > 0 && (
            <div
              style={{
                padding: "12px 16px",
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-end",
                gap: 8,
                background: isDark ? "#0b0b0b" : "#f8f9fa",
                borderTop: `1px solid ${isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)"}`,
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 6, maxWidth: "60%", alignItems: "flex-end" }}>
                {starterQuestions.slice(0, 3).map((q, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleStarterClick(q, idx)}
                    style={{
                      padding: "10px 14px",
                      borderRadius: 12,
                      background: isDark ? "rgba(255,255,255,0.1)" : "#fff",
                      color: "#ffff",
                      border: `1px solid ${isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)"}`,
                      cursor: "pointer",
                      fontSize: 13,
                      textAlign: "right",
                      transition: "all 0.2s",
                      width: "100%",
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
              padding: "12px 16px",
              borderTop: `1px solid ${isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)"}`,
              display: "flex",
              gap: 10,
              background: isDark ? "#1a1a1a" : "#fff",
            }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type a message..."
              style={{
                flex: 1,
                border: `1px solid ${isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.15)"}`,
                borderRadius: 24,
                padding: "12px 16px",
                font: "inherit",
                fontSize: 14,
                background: isDark ? "#0b0b0b" : "#fff",
                color: "var(--mchatly-panel-text, #111)",
                outline: "none",
              }}
              disabled={loading}
            />
            <button
              type="submit"
              style={{
                background: primaryColor,
                color: "#fff",
                border: "none",
                borderRadius: "50%",
                width: 44,
                height: 44,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: loading || !input.trim() ? "not-allowed" : "pointer",
                opacity: loading || !input.trim() ? 0.5 : 1,
                transition: "all 0.2s",
              }}
              disabled={loading || !input.trim()}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </form>

          {/* Footer */}
          <div
            style={{
              padding: "8px 16px",
              borderTop: `1px solid ${isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)"}`,
              fontSize: 11,
              opacity: 0.5,
              textAlign: "center",
              background: isDark ? "#1a1a1a" : "#fff",
            }}
          >
            Powered by <a href={process.env.SITE_URL} style={{ color: "inherit" }}>mchatly</a>
          </div>
        </div>
      )}

      <ImageModal />

      {/* CSS for typing animation */}
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