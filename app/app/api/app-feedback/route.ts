import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { appFeedbackSchema } from "@/lib/validators";
import { getSessionFromRequest } from "@/lib/auth/session";

// App-experience feedback (functional-spec A): a member rates the APP itself
// (1..5 + optional comment + client source tag). Distinct from SwapReview
// (traveller→traveller). Shared by web/ios/android via the `source` tag.
export async function POST(req: Request) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const parsed = appFeedbackSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const { score, comment, source, surface, contextKey, context } = parsed.data;
  // Context is stored JSON-encoded in a String column (dual-schema rule).
  const contextJson = context ? JSON.stringify(context) : null;

  // At most one row per (user, surface, contextKey) — satisfies AC-7's
  // no-re-nag rule. Latest submission overwrites the prior one.
  await prisma.appFeedback.upsert({
    where: {
      userId_surface_contextKey: {
        userId: session.userId,
        surface,
        contextKey,
      },
    },
    update: {
      score,
      comment,
      source,
      context: contextJson,
    },
    create: {
      userId: session.userId,
      score,
      comment,
      source,
      surface,
      contextKey,
      context: contextJson,
    },
  });

  return NextResponse.json({ ok: true }, { status: 201 });
}
