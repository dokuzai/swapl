import Link from "next/link";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { CityIllust, SwapArrows } from "@/components/illustrations";
import { paletteForCity } from "@/lib/cities";
import { formatDateRange } from "@/lib/listing-utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your swaps · swapl" };

type Bucket = {
  id: string;
  status: string;
  dateFrom: Date;
  dateTo: Date;
  message: string | null;
  meSide: "proposer" | "target";
  myCity: string;
  theirCity: string;
  myNeighbourhood: string;
  theirNeighbourhood: string;
  otherName: string | null;
};

export default async function SwapsInbox() {
  const session = await getSession();
  // layout redirects, but type-narrow:
  if (!session) return null;

  const proposals = await prisma.swapProposal.findMany({
    where: {
      OR: [
        { proposerId: session.userId },
        { targetListing: { userId: session.userId } },
      ],
    },
    include: {
      proposerListing: { select: { city: true, neighbourhood: true } },
      targetListing: { select: { city: true, neighbourhood: true, userId: true } },
      proposer: { select: { id: true, name: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  const buckets: Bucket[] = await Promise.all(
    proposals.map(async (p) => {
      const meIsProposer = p.proposerId === session.userId;
      const otherUserId = meIsProposer ? p.targetListing.userId : p.proposerId;
      const other = await prisma.user.findUnique({ where: { id: otherUserId }, select: { name: true } });
      return {
        id: p.id,
        status: p.status,
        dateFrom: p.dateFrom,
        dateTo: p.dateTo,
        message: p.message,
        meSide: meIsProposer ? "proposer" : "target",
        myCity: meIsProposer ? p.proposerListing.city : p.targetListing.city,
        myNeighbourhood: meIsProposer ? p.proposerListing.neighbourhood : p.targetListing.neighbourhood,
        theirCity: meIsProposer ? p.targetListing.city : p.proposerListing.city,
        theirNeighbourhood: meIsProposer ? p.targetListing.neighbourhood : p.proposerListing.neighbourhood,
        otherName: other?.name ?? null,
      };
    })
  );

  const incoming = buckets.filter((b) => b.meSide === "target" && (b.status === "PENDING" || b.status === "COUNTERED"));
  const outgoing = buckets.filter((b) => b.meSide === "proposer" && (b.status === "PENDING" || b.status === "COUNTERED"));
  const accepted = buckets.filter((b) => b.status === "ACCEPTED");
  const archived = buckets.filter((b) => b.status === "DECLINED" || b.status === "WITHDRAWN");

  return (
    <div className="wrap py-10 lg:py-14">
      <header className="mb-8">
        <h1 className="font-display text-4xl tracking-[-0.02em] font-medium">Swap inbox</h1>
        <p className="mt-3 text-[16px]" style={{ color: "var(--navy-2)" }}>
          {incoming.length} waiting on you · {outgoing.length} waiting on them · {accepted.length} active
        </p>
      </header>

      <Group title="Waiting on you" items={incoming} empty="No incoming proposals right now." />
      <Group title="Sent — awaiting reply" items={outgoing} empty="You haven't sent any proposals yet." />
      <Group title="Active swaps" items={accepted} empty="No active swap agreements yet." accent />
      {archived.length > 0 && <Group title="Archived" items={archived} empty="" muted />}
    </div>
  );
}

function Group({
  title,
  items,
  empty,
  accent,
  muted,
}: {
  title: string;
  items: Bucket[];
  empty: string;
  accent?: boolean;
  muted?: boolean;
}) {
  if (items.length === 0 && !empty) return null;
  return (
    <section className="mb-10">
      <h2 className="font-display text-xl tracking-[-0.01em] mb-4">{title}</h2>
      {items.length === 0 ? (
        <div className="surface-card p-6 text-sm" style={{ color: "var(--navy-2)" }}>
          {empty}
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((b) => (
            <li key={b.id}>
              <Link
                href={`/swaps/${b.id}`}
                className={"surface-card block p-4 hover:no-underline" + (muted ? " opacity-70" : "")}
              >
                <div className="grid items-center gap-4" style={{ gridTemplateColumns: "auto 1fr auto" }}>
                  <div className="flex items-center gap-2">
                    <Thumb city={b.myCity} />
                    <SwapArrows color="var(--pink)" size={16} />
                    <Thumb city={b.theirCity} />
                  </div>
                  <div>
                    <div className="font-display text-base tracking-[-0.01em]">
                      {b.myNeighbourhood} · {b.myCity} ⇄ {b.theirNeighbourhood} · {b.theirCity}
                    </div>
                    <div className="text-xs mt-1 font-mono" style={{ color: "var(--navy-3)" }}>
                      {b.otherName ? `with ${b.otherName} · ` : ""}
                      {formatDateRange(b.dateFrom.toISOString(), b.dateTo.toISOString())}
                    </div>
                  </div>
                  <StatusPill status={b.status} accent={accent} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Thumb({ city }: { city: string }) {
  return (
    <span
      className="block w-10 h-10 rounded overflow-hidden border"
      style={{ borderColor: "var(--line)", background: "var(--cream-2)" }}
      aria-hidden
    >
      <CityIllust city={city} palette={paletteForCity(city)} />
    </span>
  );
}

function StatusPill({ status, accent }: { status: string; accent?: boolean }) {
  const map: Record<string, { label: string; bg: string; fg: string }> = {
    PENDING: { label: "Pending", bg: "var(--cream-2)", fg: "var(--navy)" },
    COUNTERED: { label: "Countered", bg: "var(--pink-light)", fg: "var(--pink)" },
    ACCEPTED: { label: "Active swap", bg: accent ? "var(--pink)" : "var(--pink-light)", fg: accent ? "#fff" : "var(--pink)" },
    DECLINED: { label: "Declined", bg: "var(--cream-2)", fg: "var(--navy-3)" },
    WITHDRAWN: { label: "Withdrawn", bg: "var(--cream-2)", fg: "var(--navy-3)" },
  };
  const s = map[status] ?? map.PENDING;
  return (
    <span
      className="font-mono text-[10px] uppercase tracking-[.08em] px-2.5 py-1 rounded-full whitespace-nowrap"
      style={{ background: s.bg, color: s.fg }}
    >
      {s.label}
    </span>
  );
}
