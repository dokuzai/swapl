import "dotenv/config";
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { coordForCity, jitterCoord } from "../lib/city-coords";

const adapter = new PrismaBetterSqlite3({ url: process.env.DATABASE_URL ?? "file:./dev.db" });
const prisma = new PrismaClient({ adapter });

async function main() {
  const rows = await prisma.listing.findMany({ where: { OR: [{ lat: null }, { lng: null }] } });
  console.log(`Backfilling ${rows.length} listings without coords…`);
  let n = 0;
  for (const r of rows) {
    const base = coordForCity(r.city);
    if (!base) continue;
    const c = jitterCoord(base, r.id);
    await prisma.listing.update({ where: { id: r.id }, data: { lat: c.lat, lng: c.lng } });
    n++;
  }
  console.log(`✅ Updated ${n}`);
}

main().finally(() => prisma.$disconnect());
