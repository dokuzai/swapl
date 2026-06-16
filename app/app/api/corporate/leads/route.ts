import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { checkRateLimitDurable, clientIpFromRequest } from "@/lib/rate-limit";

const schema = z.object({
  companyName: z.string().min(2),
  contactName: z.string().min(2),
  email: z.string().email(),
  phone: z.string().optional(),
  employeeCount: z.number().int().positive().optional(),
  useCase: z.string().max(2000).optional(),
});

export async function POST(req: Request) {
  const ip = clientIpFromRequest(req);
  const rl = await checkRateLimitDurable(`corporate-leads:${ip}`, 5, 60 * 60 * 1000);
  if (!rl.ok) return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const lead = await prisma.corporateLead.create({ data: parsed.data });

  sendEmail({
    to: "sales@swapl.test",
    subject: `Corporate lead · ${parsed.data.companyName}`,
    text: `${parsed.data.contactName} <${parsed.data.email}>${parsed.data.phone ? ` (${parsed.data.phone})` : ""}\n\nEmployees: ${parsed.data.employeeCount ?? "—"}\nUse case: ${parsed.data.useCase ?? "—"}\n\nReview at /admin/corporate`,
  }).catch((err) => console.error("[corp:lead:email]", err));

  return NextResponse.json({ ok: true, id: lead.id });
}
