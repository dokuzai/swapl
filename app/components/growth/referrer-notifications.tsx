"use client";

// Referrer real-time toast (DOK-157). Closes the dopamine loop: while the app
// is open, poll GET /api/referrals/notifications for rewarded-but-unseen
// referral credits and toast them one at a time ("NAME just verified — you
// earned 20 Keys!"), then POST the ids back so each credit shows exactly once.
//
// Copy is passed in as templates (with {name}/{keys} placeholders) from the
// server Navbar so this works without an i18n client provider in scope.

import { useEffect, useRef, useState, useCallback } from "react";

type Notification = {
  id: string;
  refereeName: string | null;
  keys: number;
  rewardedAt: string | null;
};

export type ReferrerToastCopy = {
  // "{name} just verified — you earned {keys} Keys! 🔑"
  named: string;
  // "Someone you invited just verified — you earned {keys} Keys! 🔑"
  anon: string;
};

const POLL_MS = 20_000;

function fill(tpl: string, vars: Record<string, string | number>): string {
  return Object.entries(vars).reduce(
    (s, [k, v]) => s.replace(new RegExp(`\\{${k}\\}`, "g"), String(v)),
    tpl,
  );
}

export function ReferrerNotifications({ copy }: { copy: ReferrerToastCopy }) {
  const [current, setCurrent] = useState<Notification | null>(null);
  // FIFO queue of credits waiting to be shown.
  const queue = useRef<Notification[]>([]);
  // Ids already enqueued/shown this session — dedupe across polls before the
  // server ack lands.
  const seen = useRef<Set<string>>(new Set());

  const ack = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    fetch("/api/referrals/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    }).catch(() => {});
  }, []);

  const showNext = useCallback(() => {
    setCurrent((cur) => {
      if (cur) return cur;
      return queue.current.shift() ?? null;
    });
  }, []);

  // Poll loop.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    async function poll() {
      try {
        const res = await fetch("/api/referrals/notifications");
        if (!res.ok) return;
        const json = (await res.json()) as { notifications?: Notification[] };
        const fresh = (json.notifications ?? []).filter((n) => !seen.current.has(n.id));
        if (cancelled || fresh.length === 0) return;
        // Oldest first so credits toast in the order they happened.
        fresh.reverse();
        fresh.forEach((n) => {
          seen.current.add(n.id);
          queue.current.push(n);
        });
        // Ack immediately — the toast is driven by local state, so we don't
        // need the credit to stay "unseen" server-side once we've taken it.
        ack(fresh.map((n) => n.id));
        showNext();
      } catch {
        // Best-effort: a failed poll just retries on the next tick.
      }
    }

    poll();
    timer = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [ack, showNext]);

  // Auto-dismiss the current toast, then surface the next queued one.
  useEffect(() => {
    if (!current) return;
    const t = setTimeout(() => {
      setCurrent(null);
      // Let state settle, then pull the next credit.
      setTimeout(showNext, 50);
    }, 6000);
    return () => clearTimeout(t);
  }, [current, showNext]);

  if (!current) return null;

  const text = current.refereeName
    ? fill(copy.named, { name: current.refereeName, keys: current.keys })
    : fill(copy.anon, { keys: current.keys });

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] px-5 py-3 rounded-full text-sm shadow-lg cursor-pointer max-w-[90vw] text-center"
      style={{ background: "var(--navy)", color: "var(--cream)" }}
      onClick={() => {
        setCurrent(null);
        setTimeout(showNext, 50);
      }}
    >
      {text}
    </div>
  );
}
