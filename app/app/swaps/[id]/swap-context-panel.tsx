import Link from "next/link";
import { CityIllust } from "@/components/illustrations";
import { paletteForCity } from "@/lib/cities";
import { formatDateRange } from "@/lib/listing-utils";
import { StatusPill } from "../status-pill";
import { RetryCoverButton } from "@/components/insurance/retry-cover-button";
import { ProofOfCoverBadge } from "@/components/insurance/proof-of-cover-badge";
import { en } from "@/lib/i18n/dict-en";

type PanelListing = {
  id: string;
  city: string;
  neighbourhood: string;
  sizeSqm: number;
  sleeps: number;
};

type PanelPolicy = {
  status: string;
  coverageAmount: number;
  policyNumber: string;
  documentsUrl: string | null;
  // DOK-156 — proof-of-cover DTO fields (null when anchoring is disabled).
  onChainStatus: string | null;
  onChainRef: string | null;
  explorerUrl: string | null;
};

export type SwapContextProps = {
  status: string;
  dateFrom: string;
  dateTo: string;
  otherName: string | null;
  myListing: PanelListing;
  theirListing: PanelListing;
  agreement: {
    id: string;
    yourGuestCode: string | null;
    yourCode: string | null;
    insurancePolicy: PanelPolicy | null;
  } | null;
  /** Contextual actions (accept/decline/counter/withdraw…) rendered at the bottom. */
  actions: React.ReactNode;
  /**
   * Post-agreement trip cockpit (DOK-152). When present it replaces the static
   * key-codes + insurance blocks — the cockpit renders its own phase timeline,
   * checklist, keys, reveal-gated address/guide and check-in/out.
   */
  tripCockpit?: React.ReactNode;
};

// Right-hand "Swap" context panel of the three-pane thread (DOK-150).
// On mobile the same panel renders inside a collapsible <details> at the
// top of the thread.
export function SwapContextPanel({
  status,
  dateFrom,
  dateTo,
  otherName,
  myListing,
  theirListing,
  agreement,
  actions,
  tripCockpit,
}: SwapContextProps) {
  return (
    <div className="space-y-4">
      <Link href={`/listings/${theirListing.id}`} className="surface-card overflow-hidden block hover:no-underline">
        <div className="aspect-[16/10]">
          <CityIllust city={theirListing.city} palette={paletteForCity(theirListing.city)} />
        </div>
        <div className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-mono text-[10px] uppercase tracking-[.08em]" style={{ color: "var(--navy-3)" }}>
                {otherName ? `${otherName}'s place` : "Their place"}
              </div>
              <div className="font-display text-lg tracking-[-0.01em] mt-1">
                {theirListing.neighbourhood} · {theirListing.city}
              </div>
              <div className="text-xs mt-0.5" style={{ color: "var(--navy-3)" }}>
                {theirListing.sizeSqm}m² · sleeps {theirListing.sleeps}
              </div>
            </div>
            <StatusPill status={status} accent={status === "ACCEPTED"} />
          </div>
          <div className="mt-3 font-mono text-xs uppercase tracking-[.08em]" style={{ color: "var(--navy-2)" }}>
            {formatDateRange(dateFrom, dateTo)}
          </div>
        </div>
      </Link>

      <div className="surface-card p-4 text-sm flex items-center justify-between gap-3">
        <span style={{ color: "var(--navy-2)" }}>
          Your home: {myListing.neighbourhood} · {myListing.city}
        </span>
        <Link href={`/listings/${myListing.id}`} className="font-mono text-[11px] uppercase tracking-[.08em] whitespace-nowrap" style={{ color: "var(--pink)" }}>
          View →
        </Link>
      </div>

      {/* Post-agreement: the trip cockpit takes over the keys + insurance area.
          Before acceptance (no agreement / no cockpit) we keep the static
          insurance teaser so the value prop is visible pre-swap. */}
      {tripCockpit ?? (
        <div className="surface-card p-5">
          <div className="font-mono text-[11px] uppercase tracking-[.08em] mb-2" style={{ color: "var(--navy-3)" }}>
            Insurance
          </div>
          <InsurancePanel policy={agreement?.insurancePolicy ?? null} agreementId={agreement?.id ?? null} />
        </div>
      )}

      <div className="surface-card p-5">
        <div className="font-mono text-[11px] uppercase tracking-[.08em] mb-3" style={{ color: "var(--navy-3)" }}>
          Actions
        </div>
        {actions}
      </div>
    </div>
  );
}

function InsurancePanel({ policy, agreementId }: { policy: PanelPolicy | null; agreementId: string | null }) {
  if (!policy) {
    return (
      <>
        <div className="font-display text-lg mb-2">Auto-issued on acceptance</div>
        <p className="text-sm" style={{ color: "var(--navy-2)" }}>
          When this swap is accepted, both homes are insured automatically. No checkbox, no upsell.
        </p>
      </>
    );
  }

  if (policy.status === "pending" && agreementId) {
    return (
      <>
        <div className="font-display text-lg mb-2">Finalising your cover…</div>
        <p className="text-sm mb-3" style={{ color: "var(--navy-2)" }}>
          Your swap is confirmed. We&rsquo;re issuing the policy with our underwriter — this usually takes a moment.
        </p>
        <RetryCoverButton agreementId={agreementId} />
      </>
    );
  }

  return (
    <>
      <div className="font-display text-lg mb-2">
        €{policy.coverageAmount.toLocaleString()} cover · {policy.status}
      </div>
      <p className="text-sm" style={{ color: "var(--navy-2)" }}>
        Auto-issued on acceptance. Property damage, third-party liability and trip interruption — both directions.
      </p>
      <p className="mt-2 font-mono text-[11px]" style={{ color: "var(--navy-3)" }}>
        Policy {policy.policyNumber}
      </p>
      {policy.documentsUrl && (
        <a href={policy.documentsUrl} target="_blank" rel="noreferrer" className="pill-ghost mt-3 inline-block">
          View certificate of cover →
        </a>
      )}
      <ProofOfCoverBadge
        tone="light"
        className="mt-3"
        onChainStatus={policy.onChainStatus}
        onChainRef={policy.onChainRef}
        explorerUrl={policy.explorerUrl}
        labels={{
          badge: en["cover.proof.badge"],
          blurb: en["cover.proof.blurb"],
          view: en["cover.proof.view"],
        }}
      />
    </>
  );
}
