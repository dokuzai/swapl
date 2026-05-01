import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { betaSignupSchema } from "@/lib/validators";
import { sendEmail, emailTemplates } from "@/lib/email";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = betaSignupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }

  const { email } = parsed.data;
  // Idempotent — `email` is unique.
  await prisma.betaSignup.upsert({
    where: { email },
    create: { email },
    update: {},
  });

  // Fire and forget the welcome email.
  sendEmail(emailTemplates.betaWelcome(email)).catch((err) => console.error("[beta:email]", err));

  return NextResponse.json({ ok: true });
}
