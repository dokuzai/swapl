import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth/session";
import { forbidden, invalidInput, notFound, rateLimited, unauthenticated, unprocessable } from "@/lib/api/errors";
import { checkRateLimitDurable } from "@/lib/rate-limit";
import { gift, KeysLedgerError } from "@/lib/keys/ledger";
import {
  GIFT_DAILY_CAP,
  GIFT_MAX_PER_TRANSFER,
  GIFT_MIN,
  GIFT_MONTHLY_CAP,
  GIFT_RATE_LIMIT,
  GIFT_RATE_WINDOW_MS,
} from "@/lib/keys/config";
import { sendPush, pushTemplates } from "@/lib/push";

const bodySchema = z.object({
  toUserId: z.string().min(1),
  amount: z.number().int().min(GIFT_MIN).max(GIFT_MAX_PER_TRANSFER),
});

const DAY_MS = 24 * 60 * 60 * 1000;
const MONTH_MS = 30 * DAY_MS;

// POST /api/keys/gift — gift Keys to another VERIFIED user. Capped per transfer,
// per day, and per month; rate-limited; never overdraws the sender's balance.
// Keys cannot be bought or cashed out, so this internal transfer keeps them in
// the "travel points" (air-miles) exemption.
export async function POST(req: Request) {
  const session = await getSessionFromRequest(req);
  if (!session) return unauthenticated();

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return invalidInput("Invalid gift", { issues: parsed.error.issues });

  const { toUserId, amount } = parsed.data;

  if (toUserId === session.userId) {
    return unprocessable("Cannot gift Keys to yourself");
  }

  // Rate limit per sender (anti-spam, separate from the value caps).
  const rl = await checkRateLimitDurable(`keys-gift:${session.userId}`, GIFT_RATE_LIMIT, GIFT_RATE_WINDOW_MS);
  if (!rl.ok) return rateLimited();

  // Recipient must exist and be verified — gifting only flows between trusted,
  // KYC'd members.
  const recipient = await prisma.user.findUnique({
    where: { id: toUserId },
    select: { id: true, verified: true, suspendedAt: true },
  });
  if (!recipient) return notFound("Recipient not found");
  if (!recipient.verified || recipient.suspendedAt) {
    return forbidden("Recipient must be a verified, active member");
  }

  // Sender must be verified too (only verified members can move Keys).
  const sender = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { verified: true, suspendedAt: true },
  });
  if (!sender?.verified || sender.suspendedAt) {
    return forbidden("Only verified members can gift Keys");
  }

  // Rolling daily + monthly caps enforced inside the gift transaction, which
  // runs at Serializable isolation — so concurrent gifts can't each read the
  // same pre-gift total and both slip past the cap (READ COMMITTED would).
  const now = Date.now();
  try {
    const { sent, received } = await gift(session.userId, toUserId, amount, undefined, async (tx) => {
      const [dayAgg, monthAgg] = await Promise.all([
        tx.keysTransaction.aggregate({
          where: { userId: session.userId, kind: "gift_sent", createdAt: { gte: new Date(now - DAY_MS) } },
          _sum: { delta: true },
        }),
        tx.keysTransaction.aggregate({
          where: { userId: session.userId, kind: "gift_sent", createdAt: { gte: new Date(now - MONTH_MS) } },
          _sum: { delta: true },
        }),
      ]);
      const dayTotal = Math.abs(dayAgg._sum.delta ?? 0);
      const monthTotal = Math.abs(monthAgg._sum.delta ?? 0);
      if (dayTotal + amount > GIFT_DAILY_CAP) {
        throw new Error(`GIFT_DAILY_CAP_EXCEEDED:${dayTotal}`);
      }
      if (monthTotal + amount > GIFT_MONTHLY_CAP) {
        throw new Error(`GIFT_MONTHLY_CAP_EXCEEDED:${monthTotal}`);
      }
    });
    sendPush(toUserId, pushTemplates.keysGiftReceived(amount)).catch(() => {});
    return NextResponse.json({
      ok: true,
      amount,
      balanceAfter: sent.balanceAfter,
      recipientBalanceAfter: received.balanceAfter,
    });
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("GIFT_DAILY_CAP_EXCEEDED")) {
      const used = parseInt(err.message.split(":")[1], 10);
      return unprocessable("Daily gift limit reached", { limit: GIFT_DAILY_CAP, used });
    }
    if (err instanceof Error && err.message.startsWith("GIFT_MONTHLY_CAP_EXCEEDED")) {
      const used = parseInt(err.message.split(":")[1], 10);
      return unprocessable("Monthly gift limit reached", { limit: GIFT_MONTHLY_CAP, used });
    }
    if (err instanceof KeysLedgerError && err.code === "NEGATIVE_BALANCE") {
      return unprocessable("Not enough Keys");
    }
    // Serializable conflict (a concurrent gift won the race). Ask to retry
    // rather than 500 — the cap/atomicity guarantee held.
    if (typeof err === "object" && err !== null && (err as { code?: string }).code === "P2034") {
      return unprocessable("Please try again");
    }
    throw err;
  }
}
