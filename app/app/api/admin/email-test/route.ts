import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/abilities";
import { sendEmail } from "@/lib/email";
import { templates } from "@/emails/templates";

const schema = z.object({
  to: z.string().email(),
});

export async function POST(req: Request) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const { to } = parsed.data;
  const using = process.env.RESEND_API_KEY ? "resend" : "console-log";
  try {
    await sendEmail(templates.betaWelcome(to));
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Send failed" },
      { status: 502 },
    );
  }
  return NextResponse.json({ ok: true, using });
}
