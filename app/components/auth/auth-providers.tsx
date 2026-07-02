"use client";

// Social + OTP sign-in options rendered under the password forms on /login
// and /register. The server component computes which providers are active
// (lib/auth/web-providers.ts reads the same env the API gates on) and passes
// the result down, so disabled providers never appear in the markup and
// their third-party scripts are never loaded.
//
// Every flow ends in the SAME web session as the password login: the API
// routes set the cookie (no `platform` in the body → cookie response), we
// just redirect to `next`.

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { startAuthentication } from "@simplewebauthn/browser";
import { useT } from "@/lib/i18n/client";
import type { WebAuthProviders } from "@/lib/auth/web-providers";

// ---- Third-party SDK globals (loaded lazily, only when enabled) ------------

type GoogleIdApi = {
  accounts: {
    id: {
      initialize: (opts: { client_id: string; callback: (res: { credential: string }) => void }) => void;
      renderButton: (el: HTMLElement, opts: Record<string, string | number>) => void;
    };
  };
};

type AppleSignInResponse = {
  authorization: { id_token: string };
  user?: { name?: { firstName?: string; lastName?: string } };
};

type AppleIdApi = {
  auth: {
    init: (opts: { clientId: string; scope: string; redirectURI: string; usePopup: boolean }) => void;
    signIn: () => Promise<AppleSignInResponse>;
  };
};

type TelegramAuthUser = Record<string, string | number>;

declare global {
  interface Window {
    google?: GoogleIdApi;
    AppleID?: AppleIdApi;
    onSwaplTelegramAuth?: (user: TelegramAuthUser) => void;
  }
}

// Load an external script once (same pattern as components/turnstile.tsx).
function loadScript(id: string, src: string, onLoad: () => void, decorate?: (s: HTMLScriptElement) => void) {
  const existing = document.getElementById(id) as HTMLScriptElement | null;
  if (existing) {
    if (existing.dataset.loaded === "true") onLoad();
    else existing.addEventListener("load", onLoad);
    return;
  }
  const s = document.createElement("script");
  s.id = id;
  s.src = src;
  s.async = true;
  s.defer = true;
  decorate?.(s);
  s.addEventListener("load", () => {
    s.dataset.loaded = "true";
    onLoad();
  });
  document.head.appendChild(s);
}

const inputStyle = { borderColor: "var(--line)", background: "var(--card-bg)" } as const;

export function AuthProviders({ providers }: { providers: WebAuthProviders }) {
  const t = useT();
  const router = useRouter();
  const next = useSearchParams().get("next") ?? "/listings";

  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // POST a credential to one of the session-emitting auth endpoints. No
  // `platform` in the body → the API answers with the standard web cookie.
  function signIn(path: string, body: unknown) {
    setError(null);
    start(async () => {
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        router.replace(next);
        router.refresh();
      } else {
        const j = await res.json().catch(() => ({}));
        setError(typeof j.error === "string" ? j.error : t("auth.social.failed"));
      }
    });
  }

  // ---- Google Identity Services (renders its own button) ----
  const googleRef = useRef<HTMLDivElement>(null);
  const signInRef = useRef(signIn);
  signInRef.current = signIn;
  useEffect(() => {
    const clientId = providers.google?.clientId;
    if (!clientId) return;
    let cancelled = false;
    loadScript("google-gsi-script", "https://accounts.google.com/gsi/client", () => {
      if (cancelled || !googleRef.current || !window.google) return;
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: ({ credential }) => signInRef.current("/api/auth/oauth/google", { idToken: credential }),
      });
      window.google.accounts.id.renderButton(googleRef.current, {
        theme: "outline",
        size: "large",
        text: "continue_with",
        width: 320,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [providers.google?.clientId]);

  // ---- Sign in with Apple (our button → popup) ----
  const [appleReady, setAppleReady] = useState(false);
  useEffect(() => {
    const clientId = providers.apple?.clientId;
    if (!clientId) return;
    let cancelled = false;
    loadScript(
      "apple-signin-script",
      "https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js",
      () => {
        if (cancelled || !window.AppleID) return;
        window.AppleID.auth.init({
          clientId,
          scope: "name email",
          redirectURI: `${window.location.origin}/login`,
          usePopup: true,
        });
        setAppleReady(true);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [providers.apple?.clientId]);

  async function appleSignIn() {
    setError(null);
    if (!window.AppleID) return;
    let res: AppleSignInResponse;
    try {
      res = await window.AppleID.auth.signIn();
    } catch {
      return; // user closed the popup — not an error worth showing
    }
    const name = res.user?.name;
    const fullName = [name?.firstName, name?.lastName].filter(Boolean).join(" ") || undefined;
    signIn("/api/auth/oauth/apple", { identityToken: res.authorization.id_token, fullName });
  }

  // ---- Passkey (WebAuthn) — usernameless, discoverable credentials ----
  async function passkeySignIn() {
    setError(null);
    let assertion;
    try {
      const optRes = await fetch("/api/auth/passkey/login/options", { method: "POST" });
      if (!optRes.ok) throw new Error("options failed");
      assertion = await startAuthentication({ optionsJSON: await optRes.json() });
    } catch (err) {
      // User dismissed the platform sheet → silent; anything else → message.
      if (err instanceof Error && err.name === "NotAllowedError") return;
      setError(t("auth.passkey.failed"));
      return;
    }
    // No `platform` in the body → standard web cookie session.
    signIn("/api/auth/passkey/login/verify", assertion);
  }

  // ---- Telegram Login Widget (script renders an iframe button) ----
  const telegramRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const botUsername = providers.telegram?.botUsername;
    if (!botUsername || !telegramRef.current || telegramRef.current.childElementCount > 0) return;
    window.onSwaplTelegramAuth = (user) => signInRef.current("/api/auth/oauth/telegram", { authData: user });
    const s = document.createElement("script");
    s.src = "https://telegram.org/js/telegram-widget.js?22";
    s.async = true;
    s.setAttribute("data-telegram-login", botUsername);
    s.setAttribute("data-size", "large");
    s.setAttribute("data-radius", "10");
    s.setAttribute("data-onauth", "onSwaplTelegramAuth(user)");
    telegramRef.current.appendChild(s);
  }, [providers.telegram?.botUsername]);

  return (
    <div className="mt-6">
      <div className="flex items-center gap-3 mb-4" role="separator">
        <span className="h-px flex-1" style={{ background: "var(--line)" }} />
        <span className="text-xs" style={{ color: "var(--navy-3)" }}>
          {t("auth.social.divider")}
        </span>
        <span className="h-px flex-1" style={{ background: "var(--line)" }} />
      </div>

      <div className="flex flex-col items-stretch gap-3">
        {providers.google && <div ref={googleRef} className="flex justify-center min-h-10" />}

        {providers.apple && (
          <button
            type="button"
            onClick={appleSignIn}
            disabled={!appleReady || pending}
            className="w-full px-3 py-2.5 rounded-lg border text-sm font-medium disabled:opacity-60"
            style={inputStyle}
          >
            {t("auth.social.apple")}
          </button>
        )}

        {providers.telegram && <div ref={telegramRef} className="flex justify-center" />}

        {providers.passkey && (
          <button
            type="button"
            onClick={passkeySignIn}
            disabled={pending}
            className="w-full px-3 py-2.5 rounded-lg border text-sm font-medium disabled:opacity-60"
            style={inputStyle}
          >
            🔑 {t("auth.passkey.signIn")}
          </button>
        )}

        <OtpSignIn phoneEnabled={providers.phone} onSession={() => { router.replace(next); router.refresh(); }} />
      </div>

      {error && (
        <p className="mt-3 text-sm" style={{ color: "var(--destructive)" }}>
          {error}
        </p>
      )}
    </div>
  );
}

// ---- Email / SMS one-time code, inline two-step flow -----------------------

type OtpStep =
  | { stage: "closed" }
  | { stage: "destination"; channel: "email" | "sms" }
  | { stage: "code"; channel: "email" | "sms"; destination: string };

function OtpSignIn({ phoneEnabled, onSession }: { phoneEnabled: boolean; onSession: () => void }) {
  const t = useT();
  const [step, setStep] = useState<OtpStep>({ stage: "closed" });
  const [destination, setDestination] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function open(channel: "email" | "sms") {
    setError(null);
    setDestination("");
    setCode("");
    setStep({ stage: "destination", channel });
  }

  function requestCode(e: React.FormEvent) {
    e.preventDefault();
    if (step.stage !== "destination") return;
    const { channel } = step;
    const dest = destination.trim();
    setError(null);
    start(async () => {
      const res = await fetch("/api/auth/otp/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel, destination: dest }),
      });
      if (res.ok) {
        setCode("");
        setStep({ stage: "code", channel, destination: dest });
      } else {
        const j = await res.json().catch(() => ({}));
        setError(typeof j.error === "string" ? j.error : t("auth.otp.sendFailed"));
      }
    });
  }

  function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    if (step.stage !== "code") return;
    const { destination: dest } = step;
    setError(null);
    start(async () => {
      const res = await fetch("/api/auth/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ destination: dest, code }),
      });
      if (res.ok) {
        onSession();
      } else {
        const j = await res.json().catch(() => ({}));
        setError(typeof j.error === "string" ? j.error : t("auth.social.failed"));
      }
    });
  }

  if (step.stage === "closed") {
    return (
      <>
        <button
          type="button"
          onClick={() => open("email")}
          className="w-full px-3 py-2.5 rounded-lg border text-sm font-medium"
          style={inputStyle}
        >
          ✉️ {t("auth.otp.emailOption")}
        </button>
        {phoneEnabled && (
          <button
            type="button"
            onClick={() => open("sms")}
            className="w-full px-3 py-2.5 rounded-lg border text-sm font-medium"
            style={inputStyle}
          >
            📱 {t("auth.otp.phoneOption")}
          </button>
        )}
      </>
    );
  }

  const isEmail = step.channel === "email";

  if (step.stage === "destination") {
    return (
      <form onSubmit={requestCode} className="flex flex-col gap-3 rounded-lg border p-4" style={{ borderColor: "var(--line)" }}>
        <label className="block text-sm">
          <span className="block mb-1.5 font-medium">
            {isEmail ? t("auth.otp.emailLabel") : t("auth.otp.phoneLabel")}
          </span>
          <input
            type={isEmail ? "email" : "tel"}
            required
            autoFocus
            autoComplete={isEmail ? "email" : "tel"}
            placeholder={isEmail ? "you@example.com" : "+31 6 12345678"}
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            className="w-full px-3 py-2.5 rounded-lg border outline-none"
            style={inputStyle}
          />
          {!isEmail && (
            <span className="block mt-1.5 text-xs" style={{ color: "var(--navy-3)" }}>
              {t("auth.otp.phoneHint")}
            </span>
          )}
        </label>
        {error && <p className="text-sm" style={{ color: "var(--destructive)" }}>{error}</p>}
        <button type="submit" className="pill-primary justify-center" disabled={pending}>
          {pending ? t("auth.otp.sending") : t("auth.otp.send")}
        </button>
        <button
          type="button"
          onClick={() => setStep({ stage: "closed" })}
          className="text-xs self-center"
          style={{ color: "var(--navy-2)" }}
        >
          {t("auth.otp.cancel")}
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={verifyCode} className="flex flex-col gap-3 rounded-lg border p-4" style={{ borderColor: "var(--line)" }}>
      <p className="text-sm" style={{ color: "var(--navy-2)" }}>
        {t("auth.otp.sentTo", { dest: step.destination })}
      </p>
      <label className="block text-sm">
        <span className="block mb-1.5 font-medium">{t("auth.otp.codeLabel")}</span>
        <input
          type="text"
          required
          autoFocus
          inputMode="numeric"
          pattern="\d{6}"
          maxLength={6}
          autoComplete="one-time-code"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          className="w-full px-3 py-2.5 rounded-lg border outline-none tracking-[0.3em] text-center font-mono"
          style={inputStyle}
        />
      </label>
      {error && <p className="text-sm" style={{ color: "var(--destructive)" }}>{error}</p>}
      <button type="submit" className="pill-primary justify-center" disabled={pending || code.length !== 6}>
        {pending ? t("auth.otp.verifying") : t("auth.otp.verify")}
      </button>
      <button
        type="button"
        onClick={() => setStep({ stage: "destination", channel: step.channel })}
        className="text-xs self-center"
        style={{ color: "var(--navy-2)" }}
      >
        {t("auth.otp.back")}
      </button>
    </form>
  );
}
