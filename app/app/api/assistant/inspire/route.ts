// POST /api/assistant/inspire — compose a "Get Inspired" swap package from
// real, active, date-compatible listings + env-gated affiliate enrichment.
// Saves an InspirationPackage draft; nothing is sent until /confirm.

import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionFromRequest } from "@/lib/auth/session";
import { composePackage, InspireError } from "@/lib/ai/inspire";
import { checkRateLimit } from "@/lib/rate-limit";
import { apiError, invalidInput, unauthenticated, unprocessable } from "@/lib/api/errors";

const HOUR_MS = 60 * 60 * 1000;

const schema = z.object({
  prompt: z.string().max(500).optional(),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export async function POST(req: Request) {
  const session = await getSessionFromRequest(req);
  if (!session) return unauthenticated();

  const rl = checkRateLimit(`assistant:inspire:${session.userId}`, 10, HOUR_MS);
  if (!rl.ok) return apiError(429, "Too many packages composed — try again in a bit.");

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return invalidInput("Invalid input", { issues: parsed.error.issues });
  const { prompt, dateFrom, dateTo } = parsed.data;
  if (dateFrom && dateTo && dateTo <= dateFrom) {
    return invalidInput("End date must be after start.");
  }

  try {
    const pkg = await composePackage(session.userId, { prompt, dateFrom, dateTo });
    return NextResponse.json(pkg);
  } catch (err) {
    if (err instanceof InspireError) return unprocessable(err.code, { message: err.message });
    throw err;
  }
}
