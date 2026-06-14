"use client";

// Real-time-ish chat for the swap thread (DOK-154). The middle pane of the
// three-pane /swaps/[id] layout. Bubbles for mine/theirs, day separators,
// time + read ticks, a composer that's always docked at the bottom (one tap to
// send text, two to attach a photo), auto-scroll to the newest message, "load
// older" pagination, and light polling that only runs while the tab is visible.
//
// No WebSocket: GET /api/proposals/{id}/messages with a short interval and an
// implicit read-receipt on every fetch. POST sends; photos go through the
// existing /api/uploads/listing-photo pipeline first.

import { useCallback, useEffect, useRef, useState } from "react";
import { useT, useLocale } from "@/lib/i18n/client";

type Message = {
  id: string;
  proposalId: string;
  authorId: string;
  mine: boolean;
  body: string;
  photos: string[];
  readAt: string | null;
  createdAt: string;
};

const POLL_MS = 6000;

export function ChatThread({
  proposalId,
  otherName,
}: {
  proposalId: string;
  otherName: string;
}) {
  const t = useT();
  const locale = useLocale();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [body, setBody] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // Track whether the viewer is pinned near the bottom so polling-driven
  // updates don't yank them away while they're reading history.
  const pinnedRef = useRef(true);
  const lastIdRef = useRef<string | null>(null);

  const mergeNewest = useCallback((incoming: Message[]) => {
    setMessages((prev) => {
      if (incoming.length === 0) return prev;
      const seen = new Set(prev.map((m) => m.id));
      const added = incoming.filter((m) => !seen.has(m.id));
      // Also fold in read-receipt updates for messages we already hold.
      const byId = new Map(incoming.map((m) => [m.id, m] as const));
      const updated = prev.map((m) => byId.get(m.id) ?? m);
      return added.length ? [...updated, ...added] : updated;
    });
  }, []);

  // Initial + polling load of the newest window.
  const loadNewest = useCallback(async () => {
    try {
      const res = await fetch(`/api/proposals/${proposalId}/messages`, { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { messages: Message[]; nextCursor: string | null; hasMore: boolean };
      setLoaded((wasLoaded) => {
        if (!wasLoaded) {
          setMessages(data.messages);
          setNextCursor(data.nextCursor);
          setHasMore(data.hasMore);
        } else {
          mergeNewest(data.messages);
        }
        return true;
      });
    } catch {
      // best-effort; keep whatever we have
    }
  }, [proposalId, mergeNewest]);

  useEffect(() => {
    void loadNewest();
  }, [loadNewest]);

  // Light polling — only while the tab is visible, to keep it cheap.
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (timer) return;
      timer = setInterval(() => {
        if (document.visibilityState === "visible") void loadNewest();
      }, POLL_MS);
    };
    const stop = () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void loadNewest();
        start();
      } else {
        stop();
      }
    };
    start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [loadNewest]);

  // Auto-scroll to the newest message when a new one arrives and the viewer is
  // pinned to the bottom (or it's the very first load).
  useEffect(() => {
    const last = messages[messages.length - 1];
    const lastId = last?.id ?? null;
    if (lastId !== lastIdRef.current) {
      lastIdRef.current = lastId;
      if (pinnedRef.current) {
        endRef.current?.scrollIntoView({ block: "end" });
      }
    }
  }, [messages]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    pinnedRef.current = distance < 80;
  };

  const loadOlder = async () => {
    if (!nextCursor || loadingOlder) return;
    setLoadingOlder(true);
    const el = scrollRef.current;
    const prevHeight = el?.scrollHeight ?? 0;
    try {
      const res = await fetch(
        `/api/proposals/${proposalId}/messages?cursor=${encodeURIComponent(nextCursor)}&markRead=false`,
        { cache: "no-store" }
      );
      if (res.ok) {
        const data = (await res.json()) as { messages: Message[]; nextCursor: string | null; hasMore: boolean };
        setMessages((prev) => {
          const seen = new Set(prev.map((m) => m.id));
          const older = data.messages.filter((m) => !seen.has(m.id));
          return [...older, ...prev];
        });
        setNextCursor(data.nextCursor);
        setHasMore(data.hasMore);
        // Preserve the viewer's scroll position after prepending history.
        requestAnimationFrame(() => {
          if (el) el.scrollTop = el.scrollHeight - prevHeight;
        });
      }
    } finally {
      setLoadingOlder(false);
    }
  };

  async function uploadFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const urls: string[] = [];
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.append("file", file);
        const res = await fetch("/api/uploads/listing-photo", { method: "POST", body: form });
        if (res.ok) {
          const { url } = (await res.json()) as { url: string };
          urls.push(url);
        }
      }
      setPhotos((p) => [...p, ...urls].slice(0, 10));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const canSend = (body.trim().length > 0 || photos.length > 0) && !sending && !uploading;

  async function send() {
    if (!canSend) return;
    setSending(true);
    setSendError(false);
    pinnedRef.current = true;
    try {
      const res = await fetch(`/api/proposals/${proposalId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body: body.trim(),
          photos: photos.length ? photos : undefined,
        }),
      });
      if (!res.ok) throw new Error();
      const { message } = (await res.json()) as { message: Message };
      mergeNewest([message]);
      setBody("");
      setPhotos([]);
      // Ensure we land on the new bubble.
      requestAnimationFrame(() => endRef.current?.scrollIntoView({ block: "end" }));
    } catch {
      setSendError(true);
    } finally {
      setSending(false);
    }
  }

  function onComposerKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends; Shift+Enter for a newline.
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  return (
    <section className="surface-card flex flex-col overflow-hidden" style={{ height: "min(70vh, 560px)" }}>
      <header
        className="px-4 py-3 border-b flex items-center justify-between shrink-0"
        style={{ borderColor: "var(--line)" }}
      >
        <h2 className="font-display text-lg tracking-[-0.01em]">{t("chat.title", { name: otherName })}</h2>
        <span className="font-mono text-[10px] uppercase tracking-[.08em]" style={{ color: "var(--navy-3)" }}>
          {t("chat.subtitle")}
        </span>
      </header>

      <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-y-auto px-4 py-4 min-h-0">
        {hasMore && (
          <div className="text-center mb-4">
            <button
              type="button"
              onClick={loadOlder}
              disabled={loadingOlder}
              className="font-mono text-[11px] uppercase tracking-[.08em] px-3 py-1.5 rounded-full border"
              style={{ borderColor: "var(--line)", color: "var(--navy-2)" }}
            >
              {loadingOlder ? t("chat.loading") : t("chat.loadOlder")}
            </button>
          </div>
        )}

        {!loaded ? (
          <p className="text-sm text-center" style={{ color: "var(--navy-3)" }}>
            …
          </p>
        ) : messages.length === 0 ? (
          <p className="text-sm text-center py-8" style={{ color: "var(--navy-3)" }}>
            {t("chat.empty", { name: otherName })}
          </p>
        ) : (
          <ol className="space-y-1">
            {messages.map((m, i) => {
              const prev = messages[i - 1];
              const showDay = !prev || !sameDay(prev.createdAt, m.createdAt);
              const isLastMine = m.mine && (i === messages.length - 1 || !messages[i + 1].mine);
              return (
                <li key={m.id}>
                  {showDay && <DaySeparator iso={m.createdAt} locale={locale} t={t} />}
                  <Bubble message={m} locale={locale} showReceipt={isLastMine} t={t} />
                </li>
              );
            })}
          </ol>
        )}
        <div ref={endRef} />
      </div>

      <div className="border-t px-3 py-3 shrink-0" style={{ borderColor: "var(--line)", background: "var(--card-bg)" }}>
        {photos.length > 0 && (
          <div className="flex gap-2 mb-2 flex-wrap">
            {photos.map((url) => (
              <span key={url} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="" className="w-14 h-14 rounded-lg object-cover border" style={{ borderColor: "var(--line)" }} />
                <button
                  type="button"
                  aria-label={t("chat.removePhoto")}
                  onClick={() => setPhotos((p) => p.filter((u) => u !== url))}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full grid place-items-center text-[11px]"
                  style={{ background: "var(--navy)", color: "var(--cream)" }}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
        {sendError && (
          <p className="text-xs mb-2" style={{ color: "var(--pink)" }}>
            {t("chat.sendError")}
          </p>
        )}
        <div className="flex items-end gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => uploadFiles(e.target.files)}
          />
          <button
            type="button"
            aria-label={t("chat.attach")}
            onClick={() => fileRef.current?.click()}
            disabled={uploading || photos.length >= 10}
            className="shrink-0 w-10 h-10 rounded-full grid place-items-center border text-lg"
            style={{ borderColor: "var(--line)", color: "var(--navy-2)" }}
          >
            {uploading ? "…" : "+"}
          </button>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={onComposerKeyDown}
            rows={1}
            maxLength={4000}
            placeholder={t("chat.placeholder")}
            className="flex-1 resize-none rounded-2xl px-4 py-2.5 text-sm outline-none max-h-32"
            style={{ border: "1px solid var(--line)", background: "var(--cream)" }}
          />
          <button
            type="button"
            onClick={send}
            disabled={!canSend}
            className="pill-primary shrink-0 h-10 px-5"
            style={{ opacity: canSend ? 1 : 0.5 }}
          >
            {sending ? t("chat.sending") : t("chat.send")}
          </button>
        </div>
      </div>
    </section>
  );
}

function Bubble({
  message,
  locale,
  showReceipt,
  t,
}: {
  message: Message;
  locale: string;
  showReceipt: boolean;
  t: ReturnType<typeof useT>;
}) {
  const time = new Date(message.createdAt).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  return (
    <div className={"flex flex-col " + (message.mine ? "items-end" : "items-start")}>
      <div
        className="max-w-[78%] rounded-2xl px-3.5 py-2"
        style={
          message.mine
            ? { background: "var(--navy)", color: "var(--cream)", borderBottomRightRadius: 6 }
            : { background: "var(--cream-2)", color: "var(--navy)", borderBottomLeftRadius: 6 }
        }
      >
        {message.photos.length > 0 && (
          <div className={"grid gap-1.5 " + (message.photos.length > 1 ? "grid-cols-2" : "grid-cols-1") + (message.body ? " mb-2" : "")}>
            {message.photos.map((url) => (
              // eslint-disable-next-line @next/next/no-img-element
              <a key={url} href={url} target="_blank" rel="noopener noreferrer">
                <img src={url} alt="" className="rounded-lg object-cover w-full max-h-48" />
              </a>
            ))}
          </div>
        )}
        {message.body && <p className="text-[15px] leading-[1.5] whitespace-pre-wrap break-words">{message.body}</p>}
      </div>
      <div className="flex items-center gap-1 mt-0.5 px-1">
        <span className="font-mono text-[10px]" style={{ color: "var(--navy-3)" }}>
          {time}
        </span>
        {message.mine && showReceipt && (
          <span
            className="font-mono text-[10px]"
            style={{ color: message.readAt ? "var(--pink)" : "var(--navy-3)" }}
            title={message.readAt ? t("chat.read") : t("chat.sent")}
          >
            {message.readAt ? "✓✓" : "✓"}
          </span>
        )}
      </div>
    </div>
  );
}

function DaySeparator({ iso, locale, t }: { iso: string; locale: string; t: ReturnType<typeof useT> }) {
  return (
    <div className="flex items-center justify-center my-3">
      <span
        className="font-mono text-[10px] uppercase tracking-[.08em] px-3 py-1 rounded-full"
        style={{ background: "var(--cream-2)", color: "var(--navy-3)" }}
      >
        {dayLabel(iso, locale, t)}
      </span>
    </div>
  );
}

function sameDay(a: string, b: string): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
}

function dayLabel(iso: string, locale: string, t: ReturnType<typeof useT>): string {
  const d = new Date(iso);
  const now = new Date();
  if (sameDay(iso, now.toISOString())) return t("chat.today");
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(iso, yesterday.toISOString())) return t("chat.yesterday");
  return d.toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short" });
}
