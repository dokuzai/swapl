"use client";

// "Passkeys" card on /account: list, add (WebAuthn registration ceremony via
// @simplewebauthn/browser) and remove credentials. The server component
// passes the initial list; mutations re-sync via router.refresh().

import { useState } from "react";
import { useRouter } from "next/navigation";
import { startRegistration } from "@simplewebauthn/browser";
import type { PasskeySummary } from "@/lib/auth/passkeys";

// Human label for the device performing the registration, sent as the
// credential's default name (the API falls back to a generic one).
function deviceLabel(): string {
  const ua = navigator.userAgent;
  if (/iPhone|iPad/.test(ua)) return "iPhone / iPad";
  if (/Macintosh/.test(ua)) return "Mac";
  if (/Android/.test(ua)) return "Android device";
  if (/Windows/.test(ua)) return "Windows PC";
  if (/Linux/.test(ua)) return "Linux device";
  return "This device";
}

export function PasskeysSection({ passkeys }: { passkeys: PasskeySummary[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function addPasskey() {
    setError(null);
    setBusy(true);
    try {
      const optRes = await fetch("/api/auth/passkey/register/options", { method: "POST" });
      if (!optRes.ok) throw new Error("options failed");
      const attestation = await startRegistration({ optionsJSON: await optRes.json() });
      const verifyRes = await fetch("/api/auth/passkey/register/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response: attestation, name: deviceLabel() }),
      });
      if (!verifyRes.ok) {
        const j = await verifyRes.json().catch(() => ({}));
        throw new Error(typeof j.error === "string" ? j.error : "verification failed");
      }
      router.refresh();
    } catch (err) {
      // User closed the platform sheet → not an error worth showing.
      if (!(err instanceof Error && err.name === "NotAllowedError")) {
        setError("Could not add the passkey. Try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function removePasskey(id: string) {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/auth/passkey/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("delete failed");
      router.refresh();
    } catch {
      setError("Could not remove the passkey. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const shortDate = (iso: string) =>
    new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  return (
    <section className="surface-card p-6 mb-6">
      <div className="flex items-center justify-between mb-1">
        <h2 className="font-display text-xl font-medium">Passkeys</h2>
        <button
          type="button"
          onClick={addPasskey}
          disabled={busy}
          className="px-3 py-1.5 rounded-lg border text-sm font-medium disabled:opacity-60"
          style={{ borderColor: "var(--line)", background: "var(--card-bg)" }}
        >
          {busy ? "Working…" : "Add a passkey"}
        </button>
      </div>
      <p className="text-sm mb-4" style={{ color: "var(--navy-2)" }}>
        Sign in with Face ID, Touch ID or your device lock — no password needed.
      </p>

      {passkeys.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--navy-3)" }}>
          No passkeys yet.
        </p>
      ) : (
        <ul className="divide-y" style={{ borderColor: "var(--line)" }}>
          {passkeys.map((p) => (
            <li key={p.id} className="py-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">{p.name ?? "Passkey"}</p>
                <p className="text-xs" style={{ color: "var(--navy-3)" }}>
                  Added {shortDate(p.createdAt)}
                  {p.lastUsedAt ? ` · Last used ${shortDate(p.lastUsedAt)}` : ""}
                  {p.backedUp ? " · Synced" : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => removePasskey(p.id)}
                disabled={busy}
                className="text-xs underline disabled:opacity-60"
                style={{ color: "var(--navy-2)" }}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      {error && (
        <p className="mt-3 text-sm" style={{ color: "var(--destructive)" }}>
          {error}
        </p>
      )}
    </section>
  );
}
