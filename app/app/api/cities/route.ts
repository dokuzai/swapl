// GET /api/cities?q={prefix} — city autocomplete for search. Distinct cities
// of ACTIVE listings with listing counts, optionally prefix-filtered
// case-insensitively. Ordered by count desc, capped at 20. Public (no auth).

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

const MAX_ITEMS = 20;

export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().toLowerCase();

  // Group in the DB, filter the prefix in JS so case-insensitivity behaves
  // identically on SQLite (dev) and Postgres (prod).
  const groups = await prisma.listing.groupBy({
    by: ["city", "country"],
    where: { isActive: true },
    _count: { _all: true },
  });

  const items = groups
    .filter((g) => !q || g.city.toLowerCase().startsWith(q))
    .map((g) => ({ city: g.city, country: g.country, listings: g._count._all }))
    .sort((a, b) => b.listings - a.listings || a.city.localeCompare(b.city))
    .slice(0, MAX_ITEMS);

  return NextResponse.json({ items });
}
