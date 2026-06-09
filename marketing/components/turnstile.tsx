"use client";

import { useEffect, useRef } from "react";

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

// Whether a captcha is active in this build (site key present). Forms use this
// to require a token before submitting.
export const turnstileEnabled = Boolean(SITE_KEY);

type TurnstileAPI = {
  render: (
    el: HTMLElement,
    opts: {
      sitekey: string;
      callback: (token: string) => void;
      "expired-callback"?: () => void;
      "error-callback"?: () => void;
    }
  ) => string;
  remove: (id: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileAPI;
  }
}

const SCRIPT_ID = "cf-turnstile-script";

// Renders the Cloudflare Turnstile widget and reports the token via `onVerify`.
// Renders nothing when NEXT_PUBLIC_TURNSTILE_SITE_KEY is unset (dev).
export function TurnstileWidget({ onVerify }: { onVerify: (token: string | null) => void }) {
  const container = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const cb = useRef(onVerify);
  cb.current = onVerify;

  useEffect(() => {
    if (!SITE_KEY) return;
    let cancelled = false;

    function render() {
      if (cancelled || !container.current || widgetId.current || !window.turnstile) return;
      widgetId.current = window.turnstile.render(container.current, {
        sitekey: SITE_KEY!,
        callback: (token) => cb.current(token),
        "expired-callback": () => cb.current(null),
        "error-callback": () => cb.current(null),
      });
    }

    if (window.turnstile) {
      render();
    } else if (!document.getElementById(SCRIPT_ID)) {
      const s = document.createElement("script");
      s.id = SCRIPT_ID;
      s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
      s.async = true;
      s.defer = true;
      s.addEventListener("load", render);
      document.head.appendChild(s);
    } else {
      document.getElementById(SCRIPT_ID)?.addEventListener("load", render);
    }

    return () => {
      cancelled = true;
      if (widgetId.current && window.turnstile) {
        window.turnstile.remove(widgetId.current);
        widgetId.current = null;
      }
    };
  }, []);

  if (!SITE_KEY) return null;
  return <div ref={container} className="mt-1" />;
}
