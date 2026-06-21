// closeWindowExcept / openDateRange (DOK-219) — the block-maintenance wiring on
// top of subtractRanges. A fake transaction records the block rows created and
// deleted so we can assert the closed/opened geometry and that occupancy is kept
// in lockstep.

import { beforeEach, describe, expect, it, vi } from "vitest";

const occ = vi.hoisted(() => ({ occupyListing: vi.fn(), releaseListingOccupancy: vi.fn() }));
vi.mock("@/lib/listing/occupancy", () => occ);

import { closeWindowExcept, openDateRange } from "@/lib/listing/host-availability";

const d = (s: string) => new Date(s + "T00:00:00.000Z");
const day = (x: Date) => x.toISOString().slice(0, 10);

// Minimal in-memory ListingBlockedRange table behind the tx shape the helpers use.
function fakeTx(seed: Array<{ id: string; dateFrom: Date; dateTo: Date; note: string | null }> = []) {
  let seq = 0;
  const rows = [...seed];
  return {
    rows,
    tx: {
      listingBlockedRange: {
        create: vi.fn(async ({ data }: { data: { listingId: string; dateFrom: Date; dateTo: Date; note: string | null } }) => {
          const row = { id: `b-${++seq}`, ...data };
          rows.push(row);
          return row;
        }),
        findMany: vi.fn(async () => rows.map((r) => ({ id: r.id, dateFrom: r.dateFrom, dateTo: r.dateTo, note: r.note }))),
        delete: vi.fn(async ({ where }: { where: { id: string } }) => {
          const i = rows.findIndex((r) => r.id === where.id);
          if (i >= 0) rows.splice(i, 1);
        }),
      },
    },
  };
}

beforeEach(() => vi.clearAllMocks());

describe("closeWindowExcept", () => {
  it("blocks the whole window when nothing is opened", async () => {
    const { tx, rows } = fakeTx();
    await closeWindowExcept(tx as never, "l1", { dateFrom: d("2026-01-01"), dateTo: d("2026-04-01") }, []);
    expect(rows.map((r) => [day(r.dateFrom), day(r.dateTo)])).toEqual([["2026-01-01", "2026-04-01"]]);
    expect(occ.occupyListing).toHaveBeenCalledTimes(1);
  });

  it("blocks only the gaps around the opened ranges", async () => {
    const { tx, rows } = fakeTx();
    await closeWindowExcept(
      tx as never,
      "l1",
      { dateFrom: d("2026-01-01"), dateTo: d("2026-04-01") },
      [{ dateFrom: d("2026-02-01"), dateTo: d("2026-03-01") }],
    );
    expect(rows.map((r) => [day(r.dateFrom), day(r.dateTo)])).toEqual([
      ["2026-01-01", "2026-02-01"],
      ["2026-03-01", "2026-04-01"],
    ]);
    expect(occ.occupyListing).toHaveBeenCalledTimes(2);
  });

  it("creates no blocks when the whole window is opened", async () => {
    const { tx, rows } = fakeTx();
    await closeWindowExcept(
      tx as never,
      "l1",
      { dateFrom: d("2026-01-01"), dateTo: d("2026-04-01") },
      [{ dateFrom: d("2026-01-01"), dateTo: d("2026-04-01") }],
    );
    expect(rows).toEqual([]);
    expect(occ.occupyListing).not.toHaveBeenCalled();
  });
});

describe("openDateRange", () => {
  it("splits a covering block, freeing the opened span", async () => {
    const { tx, rows } = fakeTx([{ id: "b-0", dateFrom: d("2026-01-01"), dateTo: d("2026-04-01"), note: null }]);
    await openDateRange(tx as never, "l1", { dateFrom: d("2026-02-01"), dateTo: d("2026-03-01") });
    expect(rows.map((r) => [day(r.dateFrom), day(r.dateTo)]).sort()).toEqual([
      ["2026-01-01", "2026-02-01"],
      ["2026-03-01", "2026-04-01"],
    ]);
    // released the old block once, re-occupied the two remainders.
    expect(occ.releaseListingOccupancy).toHaveBeenCalledTimes(1);
    expect(occ.occupyListing).toHaveBeenCalledTimes(2);
  });

  it("deletes a block fully inside the opened span", async () => {
    const { tx, rows } = fakeTx([{ id: "b-0", dateFrom: d("2026-02-10"), dateTo: d("2026-02-20"), note: null }]);
    await openDateRange(tx as never, "l1", { dateFrom: d("2026-02-01"), dateTo: d("2026-03-01") });
    expect(rows).toEqual([]);
    expect(occ.releaseListingOccupancy).toHaveBeenCalledTimes(1);
    expect(occ.occupyListing).not.toHaveBeenCalled();
  });

  it("leaves non-overlapping blocks untouched", async () => {
    const { tx, rows } = fakeTx([{ id: "b-0", dateFrom: d("2026-05-01"), dateTo: d("2026-06-01"), note: null }]);
    await openDateRange(tx as never, "l1", { dateFrom: d("2026-02-01"), dateTo: d("2026-03-01") });
    expect(rows.map((r) => [day(r.dateFrom), day(r.dateTo)])).toEqual([["2026-05-01", "2026-06-01"]]);
    expect(occ.releaseListingOccupancy).not.toHaveBeenCalled();
  });
});
