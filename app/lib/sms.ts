// SMS adapter — Twilio REST via fetch, env-gated like lib/email.
//
// When TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM are unset the
// message is logged to the console (dev parity with the email fallback).
// No SDK: the Messages endpoint is a single form-encoded POST with basic auth.

import { twilioConfig } from "@/lib/auth/oauth/config";

export async function sendSms(to: string, body: string): Promise<void> {
  const cfg = twilioConfig();
  if (!cfg) {
    console.log(`[sms:dev] -> ${to}\n  ${body}`);
    return;
  }
  const url = `https://api.twilio.com/2010-04-01/Accounts/${cfg.accountSid}/Messages.json`;
  const auth = Buffer.from(`${cfg.accountSid}:${cfg.authToken}`).toString("base64");
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ To: to, From: cfg.from, Body: body }).toString(),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Twilio send failed (${res.status}): ${detail.slice(0, 300)}`);
  }
}
