import Link from "next/link";
import { CityIllust } from "@/components/illustrations";
import { paletteForCity } from "@/lib/cities";
import { formatDateRange } from "@/lib/listing-utils";
import { StatusPill } from "../status-pill";
import { RetryCoverButton } from "@/components/insurance/retry-cover-button";
import { ProofOfCoverBadge } from "@/components/insurance/proof-of-cover-badge";
import { en, type DictKey } from "@/lib/i18n/dict-en";
import { getI18n, t, type Dict } from "@/lib/i18n/server";
import type { ContactChannelKey, ContactChannels } from "@/lib/contact-channels";

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
  /** Counterparty's contact channels — non-null only once the swap is accepted. */
  otherContact?: ContactChannels | null;
  /** Whether the counterparty has any channels set (drives the locked teaser). */
  otherHasContact?: boolean;
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
  /** "People" roster + invite controls (DOK-187). */
  people?: React.ReactNode;
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
const STATUS_LABEL_KEY: Record<string, DictKey> = {
  PENDING: "swaps.status.pending",
  COUNTERED: "swaps.status.countered",
  ACCEPTED: "swaps.status.accepted",
  DECLINED: "swaps.status.declined",
  WITHDRAWN: "swaps.status.withdrawn",
};

// Per-channel label + link rendering. Brand names are universal (no i18n key);
// Discord usernames have no reliable deep link, so they're shown as text.
const CONTACT_META: {
  key: ContactChannelKey;
  labelKey?: DictKey;
  brand?: string;
  href: (v: string) => string | null;
}[] = [
  { key: "email", labelKey: "account.contact.email", href: (v) => `mailto:${v}` },
  { key: "phone", labelKey: "account.contact.phone", href: (v) => `tel:${v.replace(/[^\d+]/g, "")}` },
  { key: "whatsapp", brand: "WhatsApp", href: (v) => `https://wa.me/${v.replace(/\D/g, "")}` },
  { key: "telegram", brand: "Telegram", href: (v) => `https://t.me/${v.replace(/^@+/, "")}` },
  { key: "instagram", brand: "Instagram", href: (v) => `https://instagram.com/${v.replace(/^@+/, "")}` },
  { key: "discord", brand: "Discord", href: () => null },
  {
    key: "website",
    labelKey: "account.contact.website",
    // Re-validate the protocol here too (defense-in-depth) so a non-normalized
    // value could never become a javascript:/data: link.
    href: (v) => {
      try {
        const u = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`);
        return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
      } catch {
        return null;
      }
    },
  },
];

export async function SwapContextPanel({
  status,
  dateFrom,
  dateTo,
  otherName,
  otherContact,
  otherHasContact,
  myListing,
  theirListing,
  agreement,
  actions,
  people,
  tripCockpit,
}: SwapContextProps) {
  const { locale, dict } = await getI18n();
  const statusLabel = t(dict, STATUS_LABEL_KEY[status] ?? "swaps.status.pending");
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
                {otherName ? t(dict, "swaps.panel.theirPlaceNamed", { name: otherName }) : t(dict, "swaps.panel.theirPlace")}
              </div>
              <div className="font-display text-lg tracking-[-0.01em] mt-1">
                {theirListing.neighbourhood} · {theirListing.city}
              </div>
              <div className="text-xs mt-0.5" style={{ color: "var(--navy-3)" }}>
                {t(dict, "listing.sizeSleeps", { size: theirListing.sizeSqm, sleeps: theirListing.sleeps })}
              </div>
            </div>
            <StatusPill status={status} accent={status === "ACCEPTED"} label={statusLabel} />
          </div>
          <div className="mt-3 font-mono text-xs uppercase tracking-[.08em]" style={{ color: "var(--navy-2)" }}>
            {formatDateRange(dateFrom, dateTo, locale)}
          </div>
        </div>
      </Link>

      <div className="surface-card p-4 text-sm flex items-center justify-between gap-3">
        <span style={{ color: "var(--navy-2)" }}>
          {t(dict, "swaps.panel.yourHome", { home: `${myListing.neighbourhood} · ${myListing.city}` })}
        </span>
        <Link href={`/listings/${myListing.id}`} className="font-mono text-[11px] uppercase tracking-[.08em] whitespace-nowrap" style={{ color: "var(--pink)" }}>
          {t(dict, "swaps.panel.view")}
        </Link>
      </div>

      {/* Post-agreement: the trip cockpit takes over the keys + insurance area.
          Before acceptance (no agreement / no cockpit) we keep the static
          insurance teaser so the value prop is visible pre-swap. */}
      {tripCockpit ?? (
        <div className="surface-card p-5">
          <div className="font-mono text-[11px] uppercase tracking-[.08em] mb-2" style={{ color: "var(--navy-3)" }}>
            {t(dict, "swaps.accept.insTitle")}
          </div>
          <InsurancePanel policy={agreement?.insurancePolicy ?? null} agreementId={agreement?.id ?? null} dict={dict} />
        </div>
      )}

      {(otherContact || otherHasContact) && (
        <div className="surface-card p-5">
          <div className="font-mono text-[11px] uppercase tracking-[.08em] mb-3" style={{ color: "var(--navy-3)" }}>
            {t(dict, "swaps.contact.heading")}
          </div>
          {otherContact ? (
            <ul className="space-y-2.5">
              {CONTACT_META.map((m) => {
                const v = otherContact[m.key];
                if (!v) return null;
                const label = m.brand ?? t(dict, m.labelKey!);
                const href = m.href(v);
                return (
                  <li key={m.key} className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="font-mono text-[10px] uppercase tracking-[.08em] shrink-0" style={{ color: "var(--navy-3)" }}>
                      {label}
                    </span>
                    {href ? (
                      <a href={href} target="_blank" rel="noreferrer" className="truncate text-right" style={{ color: "var(--pink)" }}>
                        {v}
                      </a>
                    ) : (
                      <span className="truncate text-right" style={{ color: "var(--navy-2)" }}>{v}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm" style={{ color: "var(--navy-3)" }}>{t(dict, "swaps.contact.locked")}</p>
          )}
        </div>
      )}

      <div className="surface-card p-5">
        <div className="font-mono text-[11px] uppercase tracking-[.08em] mb-3" style={{ color: "var(--navy-3)" }}>
          {t(dict, "swaps.panel.actions")}
        </div>
        {actions}
      </div>

      {people}
    </div>
  );
}

function InsurancePanel({ policy, agreementId, dict }: { policy: PanelPolicy | null; agreementId: string | null; dict: Dict }) {
  if (!policy) {
    return (
      <>
        <div className="font-display text-lg mb-2">{t(dict, "swaps.accept.insTitle")}</div>
        <p className="text-sm" style={{ color: "var(--navy-2)" }}>
          {t(dict, "swaps.accept.insBody")}
        </p>
      </>
    );
  }

  if (policy.status === "pending" && agreementId) {
    return (
      <>
        <div className="font-display text-lg mb-2">{t(dict, "swaps.cover.finalisingTitle")}</div>
        <p className="text-sm mb-3" style={{ color: "var(--navy-2)" }}>
          {t(dict, "swaps.cover.finalisingBody")}
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
        {t(dict, "swaps.accept.insBody")}
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
