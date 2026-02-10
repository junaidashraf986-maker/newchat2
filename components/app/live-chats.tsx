"use client";

import type React from "react";
import Ably from "ably";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Image as ImageIcon, X, Send, Mic, Square } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

if (typeof window !== "undefined" && 'serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'open-session' && event.data.url) {
      window.open(event.data.url, '_blank');
    }
  });
}

type SessionRow = {
  id: string;
  sessionId: string;
  startedAt: string;
  lastSeenAt: string;
  userId?: string | null;
  name?: string | null;
  whatsapp?: string | null;
  country?: string | null;
  region?: string | null;
  city?: string | null;
  browser?: string | null;
  os?: string | null;
  deviceType?: string | null;
};

type ChatMessage = {
  id: string;
  role: "user" | "bot" | "admin" | "system";
  text: string;
  type?: "text" | "image" | "voice";
  timestamp?: string;
};

type RealtimeClient = InstanceType<typeof Ably.Realtime>;
type RealtimeChannel = ReturnType<RealtimeClient["channels"]["get"]>;

// Check if text is a Cloudinary URL
const isCloudinaryUrl = (text: string): boolean => {
  return text.includes('res.cloudinary.com') && 
         (text.endsWith('.png') || text.endsWith('.jpg') || text.endsWith('.jpeg') || 
          text.endsWith('.gif') || text.endsWith('.webp') || text.endsWith('.webm') || 
          text.endsWith('.mp3') || text.endsWith('.wav') || text.endsWith('.ogg'));
};

export function LiveChats({ chatbotId }: Readonly<{ chatbotId: string }>) {
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  
  // Voice recording states
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioDuration, setAudioDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  const searchParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
  const initialSessionId = searchParams ? searchParams.get("session") : null;
  
  // Push notification setup
  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    async function setupPush() {
      try {
        const reg = await navigator.serviceWorker.register('/sw.js');
        let sub = await reg.pushManager.getSubscription();
        if (!sub) {
          const vapidRes = await fetch('/api/push-vapid');
          const vapidData = await vapidRes.json().catch(() => ({}));
          const publicKey = vapidData.publicKey;
          sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: publicKey ? urlBase64ToUint8Array(publicKey) : undefined,
          });
        }
        await fetch('/api/push-subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subscription: sub }),
        });
      } catch (err) {
        console.error('Push setup failed', err);
      }
    }
    function urlBase64ToUint8Array(base64String: string) {
      const padding = '='.repeat((4 - base64String.length % 4) % 4);
      const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
      const rawData = window.atob(base64);
      const outputArray = new Uint8Array(rawData.length);
      for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
      }
      return outputArray;
    }
    setupPush();
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
    function handleNotificationClick(event: MessageEvent) {
      if (event.data && event.data.type === 'open-session' && event.data.url) {
        window.location.href = event.data.url;
      }
    }
    navigator.serviceWorker.addEventListener('message', handleNotificationClick);
    return () => {
      navigator.serviceWorker.removeEventListener('message', handleNotificationClick);
    };
  }, []);

  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(initialSessionId);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [adminJoined, setAdminJoined] = useState(false);
  const [text, setText] = useState("");
  const realtimeRef = useRef<RealtimeClient | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const lastSessionRef = useRef<string | null>(null);

  const selectedSession = useMemo(
    () => sessions.find((s) => s.sessionId === selectedSessionId) ?? null,
    [sessions, selectedSessionId]
  );

  async function loadSessions() {
    setLoadingSessions(true);
    try {
      const res = await fetch(`/api/user/chatbots/${chatbotId}/live-chats`);
      const data = await res.json().catch(() => ({}));
      if (res.ok && Array.isArray(data?.sessions)) {
        setSessions(data.sessions as SessionRow[]);
      }
    } finally {
      setLoadingSessions(false);
    }
  }

  async function loadMessages(sessionId: string) {
    setLoadingMessages(true);
    try {
      const res = await fetch(
        `/api/user/chatbots/${chatbotId}/live-chats/${sessionId}`
      );
      const data = await res.json().catch(() => ({}));
      if (res.ok && Array.isArray(data?.items)) {
        const processedMessages = data.items.map((m: { id: string; role: "user" | "bot" | "admin" | "system"; text: string; type?: "text" | "image" | "voice"; timestamp: string }) => {
          let messageType = m.type || "text";
          if (messageType === "text" && isCloudinaryUrl(m.text)) {
            if (m.text.endsWith('.webm') || m.text.endsWith('.mp3') || 
                m.text.endsWith('.wav') || m.text.endsWith('.ogg')) {
              messageType = "voice";
            } else {
              messageType = "image";
            }
          }
          return {
            id: m.id,
            role: m.role,
            text: m.text,
            type: messageType,
            timestamp: m.timestamp,
          };
        });
        setMessages(processedMessages);
      } else {
        setMessages([]);
      }
    } finally {
      setLoadingMessages(false);
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 100);
    }
  }

  useEffect(() => {
    void loadSessions();
    if (initialSessionId) {
      setSelectedSessionId(initialSessionId);
      void loadMessages(initialSessionId);
    }
    return undefined;
  }, [chatbotId]);

  useEffect(() => {
    if (!selectedSessionId) return;
    void loadMessages(selectedSessionId);
  }, [selectedSessionId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (lastSessionRef.current && lastSessionRef.current !== selectedSessionId) {
      void cleanupRealtime();
    }
    lastSessionRef.current = selectedSessionId;
  }, [selectedSessionId]);

  useEffect(() => {
    return () => {
      void cleanupRealtime();
      stopRecording();
    };
  }, []);

  function attachChannel(channel: RealtimeChannel) {
    return new Promise<void>((resolve, reject) => {
      channel.attach((err?: Error | null) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  function detachChannel(channel: RealtimeChannel) {
    return new Promise<void>((resolve, reject) => {
      channel.detach((err?: Error | null) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  function leavePresence(channel: RealtimeChannel) {
    return new Promise<void>((resolve, reject) => {
      channel.presence.leave((err?: Error | null) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  function enterPresence(channel: RealtimeChannel, data: Record<string, string>) {
    return new Promise<void>((resolve, reject) => {
      channel.presence.enter(data, (err?: Error | null) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  async function cleanupRealtime() {
    const channel = channelRef.current;
    if (channel) {
      try {
        await leavePresence(channel);
      } catch {}
      try {
        await detachChannel(channel);
      } catch {}
      channelRef.current = null;
    }

    const realtime = realtimeRef.current;
    if (realtime) {
      try {
        await realtime.close();
      } catch {}
      realtimeRef.current = null;
    }

    setAdminJoined(false);
  }

  async function joinChat() {
    if (!selectedSessionId || adminJoined) return;
    await cleanupRealtime();
    const authUrl = `/api/ably-token?role=admin&chatbotId=${encodeURIComponent(
      chatbotId
    )}&sessionId=${encodeURIComponent(selectedSessionId)}`;
    const realtime = new Ably.Realtime({ authUrl });
    realtimeRef.current = realtime;
    realtime.connection.on(["closed", "failed"], () => {
      setAdminJoined(false);
    });

    const channelName = `live-chat:${chatbotId}:${selectedSessionId}`;
    const channel = realtime.channels.get(channelName);
    channelRef.current = channel;
    await attachChannel(channel);
    await enterPresence(channel, { role: "admin" });
    setAdminJoined(true);

    channel.subscribe("message", (message) => {
      const payload = message.data as { role?: string; text?: string; type?: "text" | "image" | "voice" };
      if (payload?.role !== "visitor") return;
      const textValue = String(payload.text ?? "");
      if (!textValue) return;
      
      let msgType = payload.type || "text";
      if (msgType === "text" && isCloudinaryUrl(textValue)) {
        if (textValue.endsWith('.webm') || textValue.endsWith('.mp3') || 
            textValue.endsWith('.wav') || textValue.endsWith('.ogg')) {
          msgType = "voice";
        } else {
          msgType = "image";
        }
      }
      
      setMessages((prev) => [
        ...prev,
        { 
          id: `${Date.now()}-${Math.random()}`, 
          role: "user", 
          text: textValue,
          type: msgType
        },
      ]);
    });
  }

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        alert('Please select an image file');
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        alert('Image size should be less than 5MB');
        return;
      }
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const clearImage = () => {
    setImageFile(null);
    setImagePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Upload to Cloudinary - NOW RETURNS BOTH URL AND PUBLIC_ID
  const uploadToCloudinary = async (file: File, resourceType: 'image' | 'video' | 'raw' = 'image'): Promise<{ url: string; public_id: string }> => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('resourceType', resourceType);
    
    const res = await fetch('/api/upload-image', {
      method: 'POST',
      body: formData,
    });
    
    if (!res.ok) {
      throw new Error('Upload failed');
    }
    
    const data = await res.json();
    // Return both URL and public_id for logging
    return { url: data.url, public_id: data.public_id };
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      
      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setAudioBlob(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };
      
      mediaRecorder.start();
      setIsRecording(true);
      setAudioDuration(0);
      
      recordingTimerRef.current = setInterval(() => {
        setAudioDuration(prev => prev + 1);
      }, 1000);
      
    } catch (err) {
      console.error('Failed to start recording:', err);
      alert('Could not access microphone. Please check permissions.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
    }
  };

  const cancelRecording = () => {
    stopRecording();
    setAudioBlob(null);
    setAudioDuration(0);
  };

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // ============================================
  // UPDATE 1: logMessageToHistory function signature
  // Added cloudinaryPublicId and cloudinaryResourceType parameters
  // ============================================
  async function logMessageToHistory(
    message: string, 
    messageBy: "admin", 
    type: "text" | "image" | "voice",
    cloudinaryPublicId?: string,
    cloudinaryResourceType?: "image" | "video"
  ) {
    try {
      let chatbotToken = chatbotId;
      if (chatbotId && chatbotId.length === 24) {
        const res = await fetch(`/api/user/chatbots/${chatbotId}`);
        const data = await res.json().catch(() => ({}));
        if (res.ok && data && typeof data.chatbot.token === "string") {
          chatbotToken = data.chatbot.token;
        }
      }
      
      await fetch("/api/log-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: chatbotToken,
          sessionId: selectedSessionId,
          userId: "admin",
          message,
          messageBy,
          type,
          // NEW: Send Cloudinary data for cleanup tracking
          cloudinaryPublicId,
          cloudinaryResourceType,
        }),
      });
    } catch (error) {
      console.error('Failed to log message:', error);
    }
  }

  async function sendAdminMessage() {
    const channel = channelRef.current;
    if (!channel || !adminJoined) return;

    // Handle voice message
    if (audioBlob) {
      setIsUploading(true);
      try {
        const audioFile = new File([audioBlob], `voice-${Date.now()}.webm`, { type: 'audio/webm' });
        
        // ============================================
        // UPDATE 2: Get both URL and public_id from upload
        // ============================================
        const { url: audioUrl, public_id: audioPublicId } = await uploadToCloudinary(audioFile, 'video');
        
        await new Promise<void>((resolve, reject) => {
          channel.publish(
            "message", 
            { 
              role: "admin", 
              text: audioUrl,
              type: "voice",
              duration: audioDuration
            }, 
            (err?: Error | null) => {
              if (err) reject(err);
              else resolve();
            }
          );
        });

        setMessages((prev) => [
          ...prev,
          { 
            id: `${Date.now()}-${Math.random()}`, 
            role: "admin", 
            text: audioUrl, 
            type: "voice" 
          },
        ]);

        // ============================================
        // UPDATE 3: Pass public_id and resourceType to logMessageToHistory
        // ============================================
        await logMessageToHistory(audioUrl, "admin", "voice", audioPublicId, "video");
        
        setAudioBlob(null);
        setAudioDuration(0);
      } catch (error) {
        console.error('Failed to send voice:', error);
        alert('Failed to send voice message. Please try again.');
      } finally {
        setIsUploading(false);
      }
      return;
    }

    // Handle image upload and send
    if (imageFile) {
      setIsUploading(true);
      try {
        // ============================================
        // UPDATE 4: Get both URL and public_id from upload
        // ============================================
        const { url: imageUrl, public_id: imagePublicId } = await uploadToCloudinary(imageFile, 'image');
        
        await new Promise<void>((resolve, reject) => {
          channel.publish(
            "message", 
            { 
              role: "admin", 
              text: imageUrl,
              type: "image",
              filename: imageFile.name
            }, 
            (err?: Error | null) => {
              if (err) reject(err);
              else resolve();
            }
          );
        });

        setMessages((prev) => [
          ...prev,
          { 
            id: `${Date.now()}-${Math.random()}`, 
            role: "admin", 
            text: imageUrl, 
            type: "image" 
          },
        ]);

        // ============================================
        // UPDATE 5: Pass public_id and resourceType to logMessageToHistory
        // ============================================
        await logMessageToHistory(imageUrl, "admin", "image", imagePublicId, "image");
        clearImage();
      } catch (error) {
        console.error('Failed to send image:', error);
        alert('Failed to send image. Please try again.');
      } finally {
        setIsUploading(false);
      }
      return;
    }

    // Handle text message
    if (!text.trim()) return;
    const content = text.trim();
    setText("");

    try {
      await new Promise<void>((resolve, reject) => {
        channel.publish(
          "message", 
          { role: "admin", text: content, type: "text" }, 
          (err?: Error | null) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      setMessages((prev) => [
        ...prev,
        { 
          id: `${Date.now()}-${Math.random()}`, 
          role: "admin", 
          text: content, 
          type: "text" 
        },
      ]);

      // Text messages don't need Cloudinary data
      await logMessageToHistory(content, "admin", "text");
    } catch (error) {
      console.error('Failed to send message:', error);
    }
  }

  function formatWhere(s: SessionRow) {
    const bits = [s.city, s.region, s.country].filter(Boolean);
    return bits.length ? bits.join(", ") : "Unknown";
  }

  function formatDevice(s: SessionRow) {
    const bits = [s.deviceType, s.os, s.browser].filter(Boolean);
    return bits.length ? bits.join(" • ") : "Unknown";
  }

  function getMessageClass(role: ChatMessage["role"]) {
    if (role === "user") return "bg-white text-foreground border justify-self-start";
    if (role === "admin") return "w-fit bg-red-500 text-white justify-self-end";
    return "bg-blue-300 justify-self-end border";
  }

  let sessionsContent: React.ReactNode;
  if (loadingSessions) {
    sessionsContent = (
      <div className="text-sm text-muted-foreground">Loading…</div>
    );
  } else if (sessions.length === 0) {
    sessionsContent = (
      <div className="text-sm text-muted-foreground">
        No active sessions yet.
      </div>
    );
  } else {
    sessionsContent = (
      <div className="grid gap-2">
        {sessions.map((s) => (
          <button
            key={s.sessionId}
            type="button"
            onClick={() => setSelectedSessionId(s.sessionId)}
            className={cn(
              "rounded-md border px-3 py-2 text-left text-sm",
              selectedSessionId === s.sessionId
                ? "border-primary/60 bg-primary/10"
                : "hover:bg-accent"
            )}
          >
            <div className="font-medium truncate">Session: {s.sessionId}</div>
            <div className="text-xs text-muted-foreground truncate">Name: {s.name || "Unknown"}</div>
            <div className="text-xs text-muted-foreground truncate">WhatsApp: {s.whatsapp || "Unknown"}</div>
            <div className="text-xs text-muted-foreground truncate">
              {formatWhere(s)}
            </div>
          </button>
        ))}
      </div>
    );
  }

  let messagesContent: React.ReactNode;
  if (loadingMessages) {
    messagesContent = (
      <div className="text-sm text-muted-foreground">Loading messages…</div>
    );
  } else if (messages.length === 0) {
    messagesContent = (
      <div className="text-sm text-muted-foreground">
        No messages logged yet.
      </div>
    );
  } else {
    messagesContent = (
      <div className="grid gap-2">
        {messages.map((m) => (
          <div
            key={m.id}
            className={cn(
              "max-w-[80%] rounded-2xl px-3 py-2 text-sm",
              getMessageClass(m.role)
            )}
          >
            {m.type === "image" && m.text ? (
              <img 
                src={m.text} 
                alt="uploaded" 
                className="max-w-[200px] max-h-[200px] rounded object-cover"
                loading="lazy"
              />
            ) : m.type === "voice" ? (
              <audio controls className="max-w-[250px]">
                <source src={m.text} type="audio/webm" />
                Your browser does not support the audio element.
              </audio>
            ) : (
              <span className="break-words">{m.text}</span>
            )}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4">
      <div className="rounded-lg border bg-background p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm font-medium">Live sessions</div>
          <Button type="button" variant="outline" size="sm" onClick={loadSessions}>
            Refresh
          </Button>
        </div>
        {sessionsContent}
      </div>

      <div className="rounded-lg border bg-background p-3 flex flex-col h-[75vh]">
        {selectedSession === null ? (
          <div className="text-sm text-muted-foreground flex items-center justify-center h-full">
            Select a session to view messages.
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-2 mb-3 pb-3 border-b">
              <div className="text-sm font-medium">
                Session {selectedSession.sessionId}
                {selectedSession.name && (
                  <span className="text-muted-foreground ml-2">
                    ({selectedSession.name})
                  </span>
                )}
              </div>
              <Button 
                type="button" 
                variant={adminJoined ? "secondary" : "default"}
                onClick={joinChat} 
                disabled={adminJoined}
              >
                {adminJoined ? "Connected" : "Join Chat"}
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto rounded-md border p-3 bg-muted/30 mb-3">
              {messagesContent}
              <div ref={messagesEndRef} />
            </div>

            {/* Image Preview Area */}
            {imagePreview && (
              <div className="mb-3 p-2 bg-muted rounded-lg relative inline-block">
                <img 
                  src={imagePreview} 
                  alt="Preview" 
                  className="h-20 w-20 object-cover rounded"
                />
                <button
                  onClick={clearImage}
                  className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
                  type="button"
                >
                  <X size={14} />
                </button>
                <span className="text-xs text-muted-foreground ml-2">
                  {imageFile?.name} ({Math.round((imageFile?.size || 0) / 1024)}KB)
                </span>
              </div>
            )}

            {/* Audio Preview Area */}
            {audioBlob && (
              <div className="mb-3 p-2 bg-muted rounded-lg flex items-center gap-3">
                <audio controls className="h-8">
                  <source src={URL.createObjectURL(audioBlob)} type="audio/webm" />
                </audio>
                <span className="text-xs text-muted-foreground">
                  {formatDuration(audioDuration)}
                </span>
                <button
                  onClick={cancelRecording}
                  className="bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
                  type="button"
                >
                  <X size={14} />
                </button>
              </div>
            )}

            <div className="flex gap-2 items-end">
              <div className="flex-1 flex gap-2">
                <input
                  className="flex-1 rounded-md border bg-background px-3 py-2 text-sm"
                  placeholder={
                    imageFile ? "Press send to share image..." : 
                    audioBlob ? "Press send to share voice..." :
                    "Type a reply…"
                  }
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey && !imageFile && !audioBlob) {
                      e.preventDefault();
                      sendAdminMessage();
                    }
                  }}
                  disabled={!adminJoined || isUploading || isRecording}
                />
                
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageSelect}
                  disabled={!adminJoined || isUploading || isRecording || !!audioBlob}
                  className="hidden"
                  id="image-upload"
                />
                
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  disabled={!adminJoined || isUploading || isRecording || !!audioBlob}
                  onClick={() => fileInputRef.current?.click()}
                  className={cn(
                    "shrink-0",
                    imageFile && "bg-primary text-primary-foreground"
                  )}
                  title="Send image (max 5MB)"
                >
                  <ImageIcon size={18} />
                </Button>

                {/* Voice Recording Button */}
                {!audioBlob && (
                  <Button
                    type="button"
                    variant={isRecording ? "destructive" : "outline"}
                    size="icon"
                    disabled={!adminJoined || isUploading || !!imageFile}
                    onClick={isRecording ? stopRecording : startRecording}
                    className="shrink-0"
                    title={isRecording ? "Stop recording" : "Record voice"}
                  >
                    {isRecording ? <Square size={18} /> : <Mic size={18} />}
                  </Button>
                )}
              </div>

              <Button 
                type="button" 
                onClick={sendAdminMessage} 
                disabled={
                  (!adminJoined || 
                  (!text.trim() && !imageFile && !audioBlob)) || 
                  isUploading || 
                  isRecording
                }
                className="shrink-0"
              >
                {isUploading ? (
                  "Uploading..."
                ) : isRecording ? (
                  formatDuration(audioDuration)
                ) : (
                  <>
                    <Send size={16} className="mr-2" />
                    Send
                  </>
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {isRecording ? "Recording..." : 
               imageFile ? "Image will be uploaded to Cloudinary" : 
               audioBlob ? "Voice message ready to send" :
               "Press Enter to send"}
            </p>
          </>
        )}
      </div>
    </div>
  );
}