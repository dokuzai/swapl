"use client";

// Airbnb-style avatar dropdown for signed-in users (DOK-150).
// Replaces the bare avatar→/dashboard link: groups the product destinations,
// account/help/language, the "List your home" CTA and Sign out in one menu.
// The Messages badge counts proposals waiting on you (GET /api/proposals,
// one light client fetch on mount); a red dot on the avatar mirrors it.
// Mobile: the dropdown becomes a full-width sheet under the header.

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { LocaleSwitcher } from "@/components/layout/locale-switcher";
import type { Locale } from "@/lib/i18n/locales";

export type AvatarMenuLabels = {
  open: string;
  wishlists: string;
  trips: string;
  keys: string;
  invite: string;
  messages: string;
  profile: string;
  story: string;
  accountSettings: string;
  help: string;
  language: string;
  listYourHome: string;
  signOut: string;
  /** "{count} waiting on you" */
  waitingOnYou: string;
};

export function AvatarMenu({
  initial,
  userId,
  locale,
  labels,
}: {
  initial: string;
  userId: string;
  locale: Locale;
  labels: AvatarMenuLabels;
}) {
  const [open, setOpen] = useState(false);
  const [waiting, setWaiting] = useState(0);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Light badge fetch — same bucket the /swaps page shows as "waiting on you".
  useEffect(() => {
    let alive = true;
    fetch("/api/proposals")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (alive && d?.buckets?.waitingOnYou) setWaiting(d.buckets.waitingOnYou.length);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  // Esc to close (focus back on the trigger) + light focus trap on Tab.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
        return;
      }
      if (e.key !== "Tab" || !menuRef.current) return;
      const focusables = menuRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  // Focus the first item when the menu opens.
  useEffect(() => {
    if (open) menuRef.current?.querySelector<HTMLElement>("a[href]")?.focus();
  }, [open]);

  const itemCls =
    "flex items-center justify-between gap-3 px-4 py-2.5 text-sm rounded-xl hover:bg-cream-2 focus-visible:outline-2 focus-visible:outline-offset-[-2px]";

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={labels.open}
        aria-haspopup="menu"
        aria-expanded={open}
        className="relative inline-flex items-center gap-2 rounded-full border border-line pl-3 pr-1.5 h-11 transition-shadow hover:shadow-md"
        style={{ background: "var(--cream)" }}
      >
        {/* hamburger */}
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
          <path d="M2 4h12M2 8h12M2 12h12" />
        </svg>
        <span
          className="inline-flex items-center justify-center rounded-full w-8 h-8 font-medium uppercase text-sm"
          style={{ background: "var(--navy)", color: "var(--cream)" }}
        >
          {initial}
        </span>
        {waiting > 0 && (
          <span
            aria-label={labels.waitingOnYou.replace("{count}", String(waiting))}
            className="absolute top-0.5 right-0.5 w-2.5 h-2.5 rounded-full border-2"
            style={{ background: "var(--pink)", borderColor: "var(--cream)" }}
          />
        )}
      </button>

      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label={labels.open}
          className="fixed inset-x-0 top-[72px] mx-3 sm:mx-0 sm:absolute sm:inset-x-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-72 rounded-2xl border border-line shadow-lg p-2 z-50"
          style={{ background: "var(--cream)" }}
        >
          {/* product destinations */}
          <div role="group">
            <Link role="menuitem" href="/account/saved-searches" className={itemCls} onClick={() => setOpen(false)}>
              {labels.wishlists}
            </Link>
            <Link role="menuitem" href="/trips" className={itemCls} onClick={() => setOpen(false)}>
              {labels.trips}
            </Link>
            <Link role="menuitem" href="/account/keys" className={itemCls} onClick={() => setOpen(false)}>
              {labels.keys}
            </Link>
            <Link role="menuitem" href="/account/invite" className={itemCls} onClick={() => setOpen(false)}>
              {labels.invite}
            </Link>
            <Link role="menuitem" href="/swaps" className={itemCls} onClick={() => setOpen(false)}>
              <span>{labels.messages}</span>
              {waiting > 0 && (
                <span
                  className="font-mono text-[10px] uppercase tracking-[.08em] px-2 py-0.5 rounded-full"
                  style={{ background: "var(--pink)", color: "var(--cream)" }}
                >
                  {waiting}
                </span>
              )}
            </Link>
            <Link role="menuitem" href={`/profile/${userId}`} className={itemCls} onClick={() => setOpen(false)}>
              {labels.profile}
            </Link>
            <Link role="menuitem" href="/story" className={itemCls} onClick={() => setOpen(false)}>
              {labels.story}
            </Link>
          </div>

          <div aria-hidden className="my-2 h-px" style={{ background: "var(--line)" }} />

          {/* account / help / language */}
          <div role="group">
            <Link role="menuitem" href="/account" className={itemCls} onClick={() => setOpen(false)}>
              {labels.accountSettings}
            </Link>
            <a
              role="menuitem"
              href="https://swapl.fun/how-it-works"
              target="_blank"
              rel="noopener noreferrer"
              className={itemCls}
              onClick={() => setOpen(false)}
            >
              {labels.help}
            </a>
            <div className="flex items-center justify-between gap-3 px-4 py-1.5 text-sm">
              <span style={{ color: "var(--navy-2)" }}>{labels.language}</span>
              <LocaleSwitcher locale={locale} label={labels.language} />
            </div>
          </div>

          <div aria-hidden className="my-2 h-px" style={{ background: "var(--line)" }} />

          {/* CTA */}
          <Link
            role="menuitem"
            href="/listings/new"
            className="pill-primary flex w-full justify-center my-1"
            onClick={() => setOpen(false)}
          >
            {labels.listYourHome}
          </Link>

          <div aria-hidden className="my-2 h-px" style={{ background: "var(--line)" }} />

          {/* sign out — plain form POST, same as dashboard/account */}
          <form action="/api/auth/logout" method="post">
            <button role="menuitem" type="submit" className={`${itemCls} w-full text-left`}>
              {labels.signOut}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
