// POST /api/auth/otp/request — send a 6-digit login code via email or SMS.
//
// Always answers 200 with an opaque body (no user enumeration: the response
// never reveals whether the destination exists). Email always works (Resend
// or the console fallback); SMS is env-gated on Twilio and returns 503 when
// unconfigured so clients hide the phone option (also reported by
// GET /api/auth/providers).

import { NextResponse } from "next/server";
import { otpRequestSchema } from "@/lib/validators";
import { createOtp, normaliseDestination } from "@/lib/auth/otp";
import { twilioConfig } from "@/lib/auth/oauth/config";
import { sendSms } from "@/lib/sms";
import { sendEmail, emailTemplates } from "@/lib/email";
import { checkRateLimitDurable, clientIpFromRequest } from "@/lib/rate-limit";
import { apiError, invalidInput, serverError } from "@/lib/api/errors";

const MIN_MS = 60 * 1000;

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = otpRequestSchema.safeParse(body);
  if (!parsed.success) {
    return invalidInput();
  }
  const { channel } = parsed.data;
  const destination = normaliseDestination(channel, parsed.data.destination);

  if (channel === "sms" && !twilioConfig() && process.env.NODE_ENV === "production") {
    // Dev keeps working via the console fallback in lib/sms.ts.
    return apiError(503, "SMS sign-in is not configured on this deployment.");
  }

  // 5 codes / 15 min per destination AND per IP — durable so serverless
  // instances share the budget; falls back to in-memory when Upstash is unset.
  const ip = clientIpFromRequest(req);
  const [rlDest, rlIp] = await Promise.all([
    checkRateLimitDurable(`otp-request:dest:${destination}`, 5, 15 * MIN_MS),
    checkRateLimitDurable(`otp-request:ip:${ip}`, 5, 15 * MIN_MS),
  ]);
  if (!rlDest.ok || !rlIp.ok) {
    return apiError(429, "Too many code requests. Try again in 15 minutes.");
  }

  try {
    const code = await createOtp(channel, destination);
    if (channel === "email") {
      await sendEmail(emailTemplates.loginCode(destination, code));
    } else {
      await sendSms(destination, `${code} is your swapl login code. Valid for 10 minutes.`);
    }
  } catch (err) {
    console.error("[otp-request]", err);
    return serverError("Could not send the code. Try again.");
  }

  // Opaque success: same body whether or not an account exists.
  return NextResponse.json({ ok: true });
}
