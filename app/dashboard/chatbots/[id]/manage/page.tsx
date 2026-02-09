"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  CHATBOT_LIMITS,
  CHATBOT_OPTIONS,
  type ChatbotHumor,
  type ChatbotTheme,
  type ChatbotTone,
} from "@/lib/chatbot/config";

function getTextColorForBg(bgHex: string): "#000000" | "#ffffff" {
  const m = /^#?([0-9a-f]{6})$/i.exec((bgHex ?? "").trim());
  if (!m) return "#ffffff";
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  // Relative luminance (sRGB); simple threshold is fine for a preview.
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance > 0.6 ? "#000000" : "#ffffff";
}

type RemoteChatbot = {
  id: string;
  name: string;
  token: string;
  description?: string;
  instructionText: string;
  settings: {
    tone?: string;
    humor?: string;
    theme?: string;
    allowEmojis?: boolean;

    widgetThemeMode?: "light" | "dark" | "system";
    widgetPrimaryColor?: string;
    widgetUserBubbleColor?: string;
    widgetBotBubbleColor?: string;

    widgetWelcomeMessage?: string;
    starterQuestions?: string[];
  };
  instructionFiles: Array<{
    id?: string;
    filename: string;
    mimeType?: string;
    sizeBytes?: number;
    chunkCount?: number;
    text?: string;
  }>;
  faqs?: Array<{ question: string; answer: string }>;
};

type RemoteFAQ = {
  question: string;
  answer: string;
};

type UiFAQ = { id: string; question: string; answer: string };

export default function ManageChatbotPage() {
  const params = useParams();
  const id = typeof params?.id === "string" ? params.id : "";

  const faqIdSeed = useRef(0);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [savingFileText, setSavingFileText] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [chatbot, setChatbot] = useState<RemoteChatbot | null>(null);
  const [activeKnowledgeTab, setActiveKnowledgeTab] = useState<
    "text" | "documents" | "faq"
  >("text");

  const [instructionText, setInstructionText] = useState("");
  const remaining = useMemo(
    () => CHATBOT_LIMITS.instructionTextMaxChars - instructionText.length,
    [instructionText]
  );

  const [tone, setTone] = useState<ChatbotTone>(CHATBOT_OPTIONS.tone[0]);
  const [humor, setHumor] = useState<ChatbotHumor>(CHATBOT_OPTIONS.humor[0]);
  const [theme, setTheme] = useState<ChatbotTheme>(CHATBOT_OPTIONS.theme[0]);
  const [allowEmojis, setAllowEmojis] = useState(false);

  const [editingFileId, setEditingFileId] = useState<string | null>(null);
  const [editingFileText, setEditingFileText] = useState("");

  const [faqs, setFaqs] = useState<UiFAQ[]>([]);

  const [widgetThemeMode, setWidgetThemeMode] = useState<
    "light" | "dark" | "system"
  >("system");
  const [widgetPrimaryColor, setWidgetPrimaryColor] = useState("#111111");
  const [widgetUserBubbleColor, setWidgetUserBubbleColor] = useState("#111111");
  const [widgetBotBubbleColor, setWidgetBotBubbleColor] = useState("#f1f1f1");
  const [widgetWelcomeMessage, setWidgetWelcomeMessage] = useState("");
  const [starterQuestions, setStarterQuestions] = useState<string[]>([]);

  // TODO: Visitor analytics is now rendered on the dashboard overview page.
  // Keeping sessions state out of this page to match the requested UX.

  async function load() {
    if (!id) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/user/chatbots/${id}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? "Failed to load");
        return;
      }

      const c = (data?.chatbot ?? null) as RemoteChatbot | null;
      setChatbot(c);
      if (!c) return;

      setInstructionText(c.instructionText ?? "");

      setTone((c.settings?.tone as ChatbotTone) ?? CHATBOT_OPTIONS.tone[0]);
      setHumor((c.settings?.humor as ChatbotHumor) ?? CHATBOT_OPTIONS.humor[0]);
      setTheme((c.settings?.theme as ChatbotTheme) ?? CHATBOT_OPTIONS.theme[0]);
      setAllowEmojis(Boolean(c.settings?.allowEmojis));

      setWidgetThemeMode(c.settings?.widgetThemeMode ?? "system");
      setWidgetPrimaryColor(c.settings?.widgetPrimaryColor ?? "#111111");
      setWidgetUserBubbleColor(c.settings?.widgetUserBubbleColor ?? "#111111");
      setWidgetBotBubbleColor(c.settings?.widgetBotBubbleColor ?? "#f1f1f1");
  setWidgetWelcomeMessage(c.settings?.widgetWelcomeMessage ?? "");
  setStarterQuestions(Array.isArray(c.settings?.starterQuestions) ? c.settings.starterQuestions : []);

      const incomingFaqs: RemoteFAQ[] = Array.isArray(c?.faqs)
        ? (c.faqs as RemoteFAQ[])
        : [];
      setFaqs(
        incomingFaqs.map((f, idx) => ({
          id: `faq-${Date.now()}-${faqIdSeed.current++}-${idx}`,
          question: f.question ?? "",
          answer: f.answer ?? "",
        }))
      );
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function saveSettings() {
    if (!id) return;
    setSaving(true);
    setError(null);

    try {
      const res = await fetch(`/api/user/chatbots/${id}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instructionText,
          settings: {
            tone,
            humor,
            theme,
            allowEmojis,
            widgetThemeMode,
            widgetPrimaryColor,
            widgetUserBubbleColor,
            widgetBotBubbleColor,
            widgetWelcomeMessage,
            starterQuestions,
          },
          faqs: faqs
            .map((f) => ({
              question: (f.question ?? "").trim(),
              answer: (f.answer ?? "").trim(),
            }))
            .filter((f) => f.question && f.answer),
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? "Failed to save");
        return;
      }

      // refresh local snapshot
      await load();
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  async function uploadFile(file: File) {
    if (!id) return;

    setUploading(true);
    setError(null);

    try {
      const form = new FormData();
      form.set("file", file);

      const res = await fetch(`/api/user/chatbots/${id}/files`, {
        method: "POST",
        body: form,
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? "Upload failed");
        return;
      }

      await load();
    } catch {
      setError("Network error");
    } finally {
      setUploading(false);
    }
  }

  async function removeFile(fileId: string) {
    if (!id) return;
    setUploading(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/user/chatbots/${id}/files?fileId=${encodeURIComponent(fileId)}`,
        {
          method: "DELETE",
        }
      );

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? "Delete failed");
        return;
      }

      await load();
    } catch {
      setError("Network error");
    } finally {
      setUploading(false);
    }
  }

  async function saveFileText(fileId: string, text: string) {
    if (!id) return;
    setSavingFileText(true);
    setError(null);
    try {
      const res = await fetch(`/api/user/chatbots/${id}/files/text`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileId, text }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? "Failed to save file text");
        return;
      }

      setEditingFileId(null);
      setEditingFileText("");
      await load();
    } catch {
      setError("Network error");
    } finally {
      setSavingFileText(false);
    }
  }

  const canUploadMore =
    (chatbot?.instructionFiles?.length ?? 0) <
    CHATBOT_LIMITS.instructionFilesMaxCount;

  const faqCount = faqs.length;

  return (
    <div className="mx-auto max-w-4xl grid gap-6">
      <div>
        <div className="text-2xl font-semibold">Manage chatbot</div>
        <div className="text-sm text-muted-foreground">
          Upload instructions and tune behavior.
        </div>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Something went wrong</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {loading ? (
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            Loading…
          </CardContent>
        </Card>
      ) : null}

      {!loading && chatbot ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Chatbot</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2">
              <div className="text-sm">
                <span className="text-muted-foreground">Name:</span>{" "}
                <span className="font-medium">{chatbot.name}</span>
              </div>
              <div className="text-sm">
                <span className="text-muted-foreground">Token:</span>{" "}
                <code className="text-xs break-all">{chatbot.token}</code>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Knowledge</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-2">
                <Label>Starter Questions (shown as chat bubbles)</Label>
                <div className="overflow-x-auto flex gap-2 mb-2 py-2" style={{ minHeight: 48, maxHeight: 60 }}>
                  {starterQuestions.length === 0 ? (
                    <span className="text-muted-foreground text-sm">No starter questions yet.</span>
                  ) : starterQuestions.map((q, idx) => (
                    <div
                      key={q + '-' + idx}
                      className="px-4 py-2 rounded-lg bg-muted text-sm flex items-center gap-2 shadow-sm whitespace-nowrap"
                      style={{
                        background: 'var(--mchatly-bot-bubble, #f1f1f1)',
                        color: 'var(--mchatly-bot-text, #111)',
                        borderRadius: 10,
                        boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
                        marginBottom: 0,
                      }}
                    >
                      <Input
                        value={q}
                        className="w-auto text-sm px-2 py-1 bg-transparent border-none"
                        style={{ background: 'transparent', color: 'inherit', border: 'none', boxShadow: 'none' }}
                        onChange={e => {
                          const val = e.target.value;
                          setStarterQuestions(prev => prev.map((item, i) => i === idx ? val : item));
                        }}
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        className="ml-2"
                        onClick={() => setStarterQuestions(prev => prev.filter((_, i) => i !== idx))}
                      >
                        ×
                      </Button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Input
                    placeholder="Add a starter question..."
                    id="starter-question-input"
                    onKeyDown={e => {
                      if (e.key === "Enter") {
                        const val = e.currentTarget.value.trim();
                        if (val) {
                          setStarterQuestions([...starterQuestions, val]);
                          e.currentTarget.value = "";
                        }
                      }
                    }}
                  />
                  <Button
                    type="button"
                    onClick={() => {
                      const input = document.querySelector<HTMLInputElement>("#starter-question-input");
                      if (input && input.value.trim()) {
                        setStarterQuestions([...starterQuestions, input.value.trim()]);
                        input.value = "";
                      }
                    }}
                  >Add</Button>
                </div>
              </div>
              <Tabs
                value={activeKnowledgeTab}
                onValueChange={(v: string) =>
                  setActiveKnowledgeTab(v as "text" | "documents" | "faq")
                }
              >
                <TabsList>
                  {/* <TabsTrigger value="text">Text</TabsTrigger> */}
                  <TabsTrigger value="documents">Documents</TabsTrigger>
                  <TabsTrigger value="faq">FAQ</TabsTrigger>
                </TabsList>
{/* 
                <TabsContent value="text" className="grid gap-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="instructionText">Text instructions</Label>
                    <div className="text-xs text-muted-foreground">
                      {remaining} chars left
                    </div>
                  </div>
                  <textarea
                    id="instructionText"
                    className="min-h-32 rounded-md border bg-background p-3 text-sm"
                    value={instructionText}
                    maxLength={CHATBOT_LIMITS.instructionTextMaxChars}
                    onChange={(e) => setInstructionText(e.target.value)}
                    placeholder="e.g. You are a support assistant for Acme. Be concise. If you don't know, say so."
                  />
                  <div className="text-xs text-muted-foreground">
                    Limit is dynamic: {CHATBOT_LIMITS.instructionTextMaxChars}{" "}
                    chars
                  </div>
                </TabsContent> */}

                <TabsContent value="documents" className="grid gap-2">
                  <Label>Instruction files</Label>
                  <div className="text-xs text-muted-foreground">
                    Up to {CHATBOT_LIMITS.instructionFilesMaxCount} files. Max
                    size per file:{" "}
                    {Math.round(
                      CHATBOT_LIMITS.instructionFileMaxBytes / 1024 / 1024
                    )}
                    MB.
                  </div>

                  <Input
                    type="file"
                    disabled={uploading || !canUploadMore}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void uploadFile(f);
                      e.currentTarget.value = "";
                    }}
                  />

                  {!canUploadMore ? (
                    <div className="text-xs text-muted-foreground">
                      File limit reached.
                    </div>
                  ) : null}

                  {(chatbot.instructionFiles ?? []).length === 0 ? (
                    <div className="text-sm text-muted-foreground">
                      No files uploaded yet.
                    </div>
                  ) : (
                    <div className="grid gap-3">
                      {(chatbot.instructionFiles ?? []).map((f) => (
                        <div
                          key={f.id ?? f.filename}
                          className="rounded-md border p-3"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-sm font-medium truncate">
                                {f.filename}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {(f.mimeType || "unknown").toUpperCase()} •{" "}
                                {Math.round((f.sizeBytes ?? 0) / 1024)} KB •{" "}
                                {f.chunkCount ?? 0} chunks
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => {
                                  setEditingFileId(f.id ?? null);
                                  setEditingFileText(f.text ?? "");
                                }}
                              >
                                View/Edit
                              </Button>
                              <Button
                                variant="destructive"
                                size="sm"
                                disabled={uploading || !f.id}
                                onClick={() => {
                                  if (f.id) void removeFile(f.id);
                                }}
                              >
                                Remove
                              </Button>
                            </div>
                          </div>

                          {editingFileId && editingFileId === f.id ? (
                            <div className="mt-3 grid gap-2">
                              <textarea
                                className="min-h-40 rounded-md border bg-background p-3 text-sm"
                                value={editingFileText}
                                onChange={(e) =>
                                  setEditingFileText(e.target.value)
                                }
                              />
                              <div className="flex items-center justify-end gap-2">
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => {
                                    setEditingFileId(null);
                                    setEditingFileText("");
                                  }}
                                >
                                  Cancel
                                </Button>
                                <Button
                                  size="sm"
                                  disabled={savingFileText}
                                  onClick={() => {
                                    if (f.id)
                                      void saveFileText(f.id, editingFileText);
                                  }}
                                >
                                  {savingFileText ? "Saving…" : "Save"}
                                </Button>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="faq" className="grid gap-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <Label>FAQ</Label>
                      <div className="text-xs text-muted-foreground">
                        Add question/answer pairs. No limit.
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() =>
                        setFaqs((prev) => [
                          ...prev,
                          {
                            id: `faq-${Date.now()}`,
                            question: "",
                            answer: "",
                          },
                        ])
                      }
                    >
                      Add Q&A
                    </Button>
                  </div>

                  {faqCount === 0 ? (
                    <div className="text-sm text-muted-foreground">
                      No FAQs yet.
                    </div>
                  ) : (
                    <div className="grid gap-3">
                      {faqs.map((f, idx) => (
                        <div key={f.id} className="rounded-md border p-3">
                          <div className="flex items-center justify-between">
                            <div className="text-sm font-medium">
                              Q&A #{idx + 1}
                            </div>
                            <Button
                              variant="destructive"
                              size="sm"
                              type="button"
                              onClick={() =>
                                setFaqs((prev) =>
                                  prev.filter((x) => x.id !== f.id)
                                )
                              }
                            >
                              Remove
                            </Button>
                          </div>

                          <div className="mt-3 grid gap-2">
                            <div className="grid gap-1">
                              <Label>Question</Label>
                              <Input
                                value={f.question}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  setFaqs((prev) =>
                                    prev.map((x) =>
                                      x.id === f.id ? { ...x, question: v } : x
                                    )
                                  );
                                }}
                                placeholder="e.g. What is your refund policy?"
                              />
                            </div>

                            <div className="grid gap-1">
                              <Label>Answer</Label>
                              <textarea
                                className="min-h-24 rounded-md border bg-background p-3 text-sm"
                                value={f.answer}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  setFaqs((prev) =>
                                    prev.map((x) =>
                                      x.id === f.id ? { ...x, answer: v } : x
                                    )
                                  );
                                }}
                                placeholder="e.g. We offer refunds within 30 days..."
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>
              </Tabs>

              <Separator />
            </CardContent>
          </Card>

          {/* <Card>
            <CardHeader>
              <CardTitle>Behavior settings</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-6">
              <div className="grid gap-2">
                <Label>Tone</Label>
                <div className="flex flex-wrap gap-2">
                  {CHATBOT_OPTIONS.tone.map((opt) => (
                    <label
                      key={opt}
                      className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm cursor-pointer"
                    >
                      <input
                        type="radio"
                        name="tone"
                        value={opt}
                        checked={tone === opt}
                        onChange={() => setTone(opt)}
                      />
                      {opt}
                    </label>
                  ))}
                </div>
              </div>

              <div className="grid gap-2">
                <Label>Humor</Label>
                <div className="flex flex-wrap gap-2">
                  {CHATBOT_OPTIONS.humor.map((opt) => (
                    <label
                      key={opt}
                      className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm cursor-pointer"
                    >
                      <input
                        type="radio"
                        name="humor"
                        value={opt}
                        checked={humor === opt}
                        onChange={() => setHumor(opt)}
                      />
                      {opt}
                    </label>
                  ))}
                </div>
              </div>

              <div className="grid gap-2">
                <Label>Theme</Label>
                <div className="flex flex-wrap gap-2">
                  {CHATBOT_OPTIONS.theme.map((opt) => (
                    <label
                      key={opt}
                      className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm cursor-pointer"
                    >
                      <input
                        type="radio"
                        name="theme"
                        value={opt}
                        checked={theme === opt}
                        onChange={() => setTheme(opt)}
                      />
                      {opt}
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  id="allowEmojis"
                  type="checkbox"
                  checked={allowEmojis}
                  onChange={(e) => setAllowEmojis(e.target.checked)}
                />
                <Label htmlFor="allowEmojis">Allow emojis in replies</Label>
              </div>

              <Separator />

              <div className="grid gap-6 md:grid-cols-2">
                <div className="grid gap-6">
                  <div className="grid gap-2">
                    <Label>Widget theme mode</Label>
                    <div className="flex flex-wrap gap-2">
                      {(["system", "light", "dark"] as const).map((opt) => (
                        <label
                          key={opt}
                          className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm cursor-pointer"
                        >
                          <input
                            type="radio"
                            name="widgetThemeMode"
                            value={opt}
                            checked={widgetThemeMode === opt}
                            onChange={() => setWidgetThemeMode(opt)}
                          />
                          {opt}
                        </label>
                      ))}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      “system” follows the user’s OS/browser preference.
                    </div>
                  </div>

                  <div className="grid gap-3">
                    <Label>Widget colors</Label>

                    <div className="grid gap-1">
                      <Label>Primary (button/accent)</Label>
                      <div className="flex items-center gap-3">
                        <Input
                          type="color"
                          value={widgetPrimaryColor}
                          onChange={(e) =>
                            setWidgetPrimaryColor(e.target.value)
                          }
                          className="h-10 w-16 p-1"
                        />
                        <Input
                          value={widgetPrimaryColor}
                          onChange={(e) =>
                            setWidgetPrimaryColor(e.target.value)
                          }
                          placeholder="#111111"
                        />
                      </div>
                    </div>

                    <div className="grid gap-1">
                      <Label>User bubble</Label>
                      <div className="flex items-center gap-3">
                        <Input
                          type="color"
                          value={widgetUserBubbleColor}
                          onChange={(e) =>
                            setWidgetUserBubbleColor(e.target.value)
                          }
                          className="h-10 w-16 p-1"
                        />
                        <Input
                          value={widgetUserBubbleColor}
                          onChange={(e) =>
                            setWidgetUserBubbleColor(e.target.value)
                          }
                          placeholder="#111111"
                        />
                      </div>
                    </div>

                    <div className="grid gap-1">
                      <Label>Bot bubble</Label>
                      <div className="flex items-center gap-3">
                        <Input
                          type="color"
                          value={widgetBotBubbleColor}
                          onChange={(e) =>
                            setWidgetBotBubbleColor(e.target.value)
                          }
                          className="h-10 w-16 p-1"
                        />
                        <Input
                          value={widgetBotBubbleColor}
                          onChange={(e) =>
                            setWidgetBotBubbleColor(e.target.value)
                          }
                          placeholder="#f1f1f1"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-2">
                    <Label>Widget welcome message</Label>
                    <textarea
                      className="min-h-20 rounded-md border bg-background p-3 text-sm"
                      value={widgetWelcomeMessage}
                      onChange={(e) => setWidgetWelcomeMessage(e.target.value)}
                      placeholder="e.g. Hi! How can I help you today?"
                      maxLength={500}
                    />
                    <div className="text-xs text-muted-foreground">
                      Shown once when a user opens the widget. Leave empty to
                      disable.
                    </div>
                  </div>
                </div>

                <div className="grid gap-3">
                  <Label>Live widget preview</Label>
                  <div
                    className="rounded-md border p-4"
                    style={{
                      background:
                        widgetThemeMode === "dark" ? "#0b0f14" : "#ffffff",
                      color: widgetThemeMode === "dark" ? "#e5e7eb" : "#111827",
                    }}
                  >
                    <div className="flex items-end justify-between">
                      <div className="text-sm font-medium">
                        {chatbot?.name ?? "Widget"}
                      </div>
                      <div
                        className="h-9 w-9 rounded-full flex items-center justify-center"
                        style={{
                          background: widgetPrimaryColor,
                          color: getTextColorForBg(widgetPrimaryColor),
                        }}
                      >
                        ⌁
                      </div>
                    </div>

                    <div className="mt-3 grid gap-2 text-sm">
                      {widgetWelcomeMessage?.trim() ? (
                        <div
                          className="max-w-[85%] rounded-2xl px-3 py-2"
                          style={{
                            background: widgetBotBubbleColor,
                            color: getTextColorForBg(widgetBotBubbleColor),
                          }}
                        >
                          {widgetWelcomeMessage.trim()}
                        </div>
                      ) : null}

                      <div
                        className="max-w-[85%] rounded-2xl px-3 py-2"
                        style={{
                          background: widgetBotBubbleColor,
                          color: getTextColorForBg(widgetBotBubbleColor),
                        }}
                      >
                        Ask me anything about your docs.
                      </div>

                      <div className="flex justify-end">
                        <div
                          className="max-w-[85%] rounded-2xl px-3 py-2"
                          style={{
                            background: widgetUserBubbleColor,
                            color: getTextColorForBg(widgetUserBubbleColor),
                          }}
                        >
                          What are your hours?
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 flex items-center gap-2">
                      <div
                        className="flex-1 rounded-full border px-3 py-2 text-xs"
                        style={{
                          background:
                            widgetThemeMode === "dark" ? "#0f172a" : "#fff",
                          color:
                            widgetThemeMode === "dark" ? "#cbd5e1" : "#111",
                          borderColor:
                            widgetThemeMode === "dark" ? "#1f2937" : "#e5e7eb",
                        }}
                      >
                        Type your message…
                      </div>
                      <div
                        className="rounded-full px-4 py-2 text-xs font-medium"
                        style={{
                          background: widgetPrimaryColor,
                          color: getTextColorForBg(widgetPrimaryColor),
                        }}
                      >
                        Send
                      </div>
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    This is a static preview (no network calls).
                  </div>
                </div>
              </div>

             
            </CardContent>
          </Card> */}

           <div className="flex justify-end">
                <Button onClick={() => void saveSettings()} disabled={saving}>
                  {saving ? "Saving…" : "Save changes"}
                </Button>
              </div>
        </>
      ) : null}
    </div>
  );
}
