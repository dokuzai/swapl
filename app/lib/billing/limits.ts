// Plan-limit single source of truth. Mirrors Plan rows in the DB so that
// server checks remain statically typed and don't require a DB hit on the
// hot path of common operations like "can this user open the create form".
//
// Effective plan resolution:
//   1. If the user is a member of an Organization (Feature 5) with active
//      `planStatus`, return "pro".
//   2. Else use Subscription.planId if its status is active|trialing|past_due
//      (past_due gets a 3-day grace before downgrade — handled by webhook).
//   3. Else "free".

import { prisma } from "@/lib/db";
import type { SubscriptionModel, OrganizationMemberModel } from "@/app/generated/prisma/models";

export const PLAN_IDS = ["free", "plus", "pro"] as const;
export type PlanId = (typeof PLAN_IDS)[number];

export type PlanLimits = {
  id: PlanId;
  label: string;
  maxListings: number;            // 0 = unlimited
  maxProposalsMonth: number;      // 0 = unlimited
  prioritySearch: "standard" | "priority" | "top";
  fullFilters: boolean;
  calendarSync: boolean;
  matchBreakdown: boolean;
  listingAnalytics: boolean;
  multiHomeTeams: boolean;
};

export const PLAN_LIMITS: Record<PlanId, PlanLimits> = {
  free: {
    id: "free",
    label: "Free",
    maxListings: 1,
    maxProposalsMonth: 3,
    prioritySearch: "standard",
    fullFilters: false,
    calendarSync: false,
    matchBreakdown: false,
    listingAnalytics: false,
    multiHomeTeams: false,
  },
  plus: {
    id: "plus",
    label: "swapl Plus",
    maxListings: 3,
    maxProposalsMonth: 0,
    prioritySearch: "priority",
    fullFilters: true,
    calendarSync: true,
    matchBreakdown: true,
    listingAnalytics: false,
    multiHomeTeams: false,
  },
  pro: {
    id: "pro",
    label: "swapl Pro",
    maxListings: 0,
    maxProposalsMonth: 0,
    prioritySearch: "top",
    fullFilters: true,
    calendarSync: true,
    matchBreakdown: true,
    listingAnalytics: true,
    multiHomeTeams: true,
  },
};

export class PlanLimitError extends Error {
  readonly upgradeTo: Exclude<PlanId, "free">;
  readonly reason: string;
  readonly currentPlan: PlanId;
  constructor(opts: { reason: string; currentPlan: PlanId; upgradeTo: Exclude<PlanId, "free"> }) {
    super(opts.reason);
    this.name = "PlanLimitError";
    this.reason = opts.reason;
    this.currentPlan = opts.currentPlan;
    this.upgradeTo = opts.upgradeTo;
  }
}

export async function getEffectivePlan(userId: string): Promise<PlanLimits> {
  // Org membership wins.
  const orgMember: (OrganizationMemberModel & { org: { planStatus: string } }) | null =
    await prisma.organizationMember.findFirst({
      where: { userId },
      include: { org: { select: { planStatus: true } } },
    });
  if (orgMember && orgMember.org.planStatus === "active") return PLAN_LIMITS.pro;

  const sub: SubscriptionModel | null = await prisma.subscription.findUnique({ where: { userId } });
  if (sub && (sub.status === "active" || sub.status === "trialing" || sub.status === "past_due")) {
    const id = sub.planId as PlanId;
    return PLAN_LIMITS[id] ?? PLAN_LIMITS.free;
  }
  return PLAN_LIMITS.free;
}

export async function ensureCanCreateListing(userId: string): Promise<void> {
  const plan = await getEffectivePlan(userId);
  if (plan.maxListings === 0) return;
  const count = await prisma.listing.count({ where: { userId, isActive: true } });
  if (count >= plan.maxListings) {
    throw new PlanLimitError({
      currentPlan: plan.id,
      reason: `Your ${plan.label} plan allows ${plan.maxListings} active listing${
        plan.maxListings === 1 ? "" : "s"
      }.`,
      upgradeTo: plan.id === "free" ? "plus" : "pro",
    });
  }
}

const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

export async function ensureCanCreateProposal(userId: string): Promise<void> {
  const plan = await getEffectivePlan(userId);
  if (plan.maxProposalsMonth === 0) return; // unlimited
  // Roll the per-user counter forward if it's older than 30 days.
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { proposalsThisMonthCount: true, proposalsCounterResetAt: true },
  });
  if (!user) throw new Error("user not found");
  const now = new Date();
  const sinceReset = now.getTime() - user.proposalsCounterResetAt.getTime();
  let count = user.proposalsThisMonthCount;
  if (sinceReset >= MONTH_MS) {
    count = 0;
    await prisma.user.update({
      where: { id: userId },
      data: { proposalsThisMonthCount: 0, proposalsCounterResetAt: now },
    });
  }
  if (count >= plan.maxProposalsMonth) {
    throw new PlanLimitError({
      currentPlan: plan.id,
      reason: `You've sent ${plan.maxProposalsMonth} proposals this month on the Free plan.`,
      upgradeTo: "plus",
    });
  }
}

export async function bumpProposalCounter(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { proposalsThisMonthCount: { increment: 1 } },
  });
}
