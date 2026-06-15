// DOK-156 — best-effort bridge between an issued InsurancePolicy and the
// env-gated TON proof-of-cover anchoring (lib/chain/ton).
//
// This is the ONLY place the insurance flow touches the chain. It is:
//   - best-effort: every path is try/catch'd; it never throws to the caller and
//     never blocks swap acceptance / policy issuance.
//   - env-gated: when TON env is unset, anchorPolicy() returns { skipped } and
//     we leave onChainRef null — identical to today's off-chain-only behaviour.
//   - fire-and-forget friendly: callers `void anchorIssuedPolicy(id)` after the
//     policy is persisted; the await happens off the request's critical path.

import { prisma } from "@/lib/db";
import { anchorPolicy, type AnchorablePolicy } from "@/lib/chain/ton";

/**
 * Anchor an already-persisted policy by id. Loads the minimal PII-free
 * metadata, marks the row "pending", attempts the on-chain write, and writes
 * back onChainRef/onChainNetwork/onChainStatus/anchoredAt. Idempotent-ish: it
 * only acts on policies that are not already anchored.
 *
 * Returns silently on any failure — this must NEVER affect the caller.
 */
export async function anchorIssuedPolicy(policyId: string): Promise<void> {
  try {
    const policy = await prisma.insurancePolicy.findUnique({
      where: { id: policyId },
      include: { agreement: { select: { dateFrom: true, dateTo: true } } },
    });
    if (!policy || !policy.agreement) return;
    // Already anchored — nothing to do (idempotent).
    if (policy.onChainStatus === "anchored" && policy.onChainRef) return;

    const meta: AnchorablePolicy = {
      policyNumber: policy.policyNumber,
      agreementId: policy.agreementId,
      coverageAmount: policy.coverageAmount,
      dateFrom: policy.agreement.dateFrom,
      dateTo: policy.agreement.dateTo,
    };

    const result = await anchorPolicy(meta);
    if (result.skipped) return; // disabled — stay off-chain exactly as today.

    await prisma.insurancePolicy.update({
      where: { id: policyId },
      data: {
        onChainRef: result.ref,
        onChainNetwork: result.network,
        onChainStatus: result.status, // "anchored" | "failed"
        anchoredAt: result.status === "anchored" ? new Date() : null,
      },
    });
  } catch (err) {
    // Swallow — best-effort only.
    console.error("[insurance:anchor]", err);
  }
}
