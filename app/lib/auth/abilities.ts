// Cross-cutting ability checks. Combines the cookie session, the user's role,
// and the per-feature gates from lib/billing/limits.ts.
//
// Pattern:
//   const me = await requireUser();
//   await requireAdmin();      // throws redirect to /login if not admin
//   await requireMembership("plus"); // throws PlanLimitError otherwise

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession, requireSession } from "@/lib/auth/session";
import { getEffectivePlan, PlanLimitError, type PlanId } from "@/lib/billing/limits";

export type CurrentUser = {
  id: string;
  email: string;
  name: string | null;
  role: "member" | "swapl_admin";
};

export async function requireUser(): Promise<CurrentUser> {
  const session = await requireSession();
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, email: true, name: true, role: true },
  });
  if (!user) throw new Error("UNAUTHENTICATED");
  return { id: user.id, email: user.email, name: user.name, role: user.role as "member" | "swapl_admin" };
}

// For server components — redirects on failure rather than throwing.
export async function requireAdminPage(): Promise<CurrentUser> {
  const session = await getSession();
  if (!session) redirect("/login?next=/admin");
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, email: true, name: true, role: true },
  });
  if (!user || user.role !== "swapl_admin") redirect("/dashboard");
  return { id: user.id, email: user.email, name: user.name, role: "swapl_admin" };
}

// For API routes — throws an error the caller turns into JSON.
export async function requireAdmin(): Promise<CurrentUser> {
  const me = await requireUser();
  if (me.role !== "swapl_admin") {
    throw new Error("FORBIDDEN");
  }
  return me;
}

export async function requireMembership(min: Exclude<PlanId, "free">): Promise<void> {
  const session = await requireSession();
  const plan = await getEffectivePlan(session.userId);
  if (plan.id === "free") {
    throw new PlanLimitError({
      currentPlan: "free",
      reason: `This feature requires a ${min === "plus" ? "Plus" : "Pro"} plan.`,
      upgradeTo: min,
    });
  }
  if (min === "pro" && plan.id !== "pro") {
    throw new PlanLimitError({
      currentPlan: plan.id,
      reason: "This feature requires the Pro plan.",
      upgradeTo: "pro",
    });
  }
}
