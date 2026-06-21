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
import type { SubscriptionModel, OrganizationMemberModel } from "../../generated/prisma/models";

export const PLAN_IDS = ["free", "plus", "pro"] as const;
export type PlanId = (typeof PLAN_IDS)[number];

export type PlanLimits = {
  id: PlanId;
  label: string;
  maxListings: number;            // 0 = unlimited
  maxProposalsMonth: number;      // 0 = unlimited
  maxTravelWindows: number;       // 0 = unlimited
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
    maxTravelWindows: 3,
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
    maxTravelWindows: 10,
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
    maxTravelWindows: 0,
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
  // Admins bypass plan limits entirely: they always resolve to the Pro tier
  // (all caps are the unlimited 0-sentinel, every feature gate enabled),
  // regardless of subscription or organization state.
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  if (user?.role === "swapl_admin") return PLAN_LIMITS.pro;

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

/**
 * Couchsurfer membership (DOK-219) — a yearly add-on, independent of the plan
 * tier. True when the user holds an active/trialing membership that hasn't
 * lapsed. Admins are always treated as members (parity with plan resolution).
 */
export async function isCouchsurferMember(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (user?.role === "swapl_admin") return true;
  const m = await prisma.couchsurferMembership.findUnique({
    where: { userId },
    select: { status: true, currentPeriodEnd: true },
  });
  if (!m) return false;
  if (m.status !== "active" && m.status !== "trialing" && m.status !== "past_due") return false;
  return m.currentPeriodEnd.getTime() > Date.now();
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

export async function ensureCanCreateTravelWindow(userId: string): Promise<void> {
  const plan = await getEffectivePlan(userId);
  if (plan.maxTravelWindows === 0) return; // unlimited (Pro / admin bypass)
  const count = await prisma.travelWindow.count({ where: { userId } });
  if (count >= plan.maxTravelWindows) {
    throw new PlanLimitError({
      currentPlan: plan.id,
      reason: `Your ${plan.label} plan allows ${plan.maxTravelWindows} saved travel window${
        plan.maxTravelWindows === 1 ? "" : "s"
      }.`,
      upgradeTo: plan.id === "free" ? "plus" : "pro",
    });
  }
}

const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

export async function ensureCanCreateProposal(userId: string): Promise<void> {
  const plan = await getEffectivePlan(userId);
  if (plan.maxProposalsMonth === 0) return; // unlimited

  // Atomic read-check-reset-increment to prevent concurrent proposal creations
  // from both passing the limit check. Uses a DB-level transaction with
  // increment so the counter is always consistent.
  await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { proposalsThisMonthCount: true, proposalsCounterResetAt: true },
    });
    if (!user) throw new Error("user not found");

    const now = new Date();
    const sinceReset = now.getTime() - (user.proposalsCounterResetAt?.getTime() ?? 0);
    let count = user.proposalsThisMonthCount;
    if (sinceReset >= MONTH_MS) {
      count = 0;
      await tx.user.update({
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
    await tx.user.update({
      where: { id: userId },
      data: { proposalsThisMonthCount: { increment: 1 } },
    });
  });
}
