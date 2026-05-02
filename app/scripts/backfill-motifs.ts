import "dotenv/config";
import { PrismaClient } from "../generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { generateCityArt } from "../lib/ai/city-illustration";

const adapter = new PrismaBetterSqlite3({ url: process.env.DATABASE_URL ?? "file:./dev.db" });
const prisma = new PrismaClient({ adapter });

async function main() {
  const rows = await prisma.listing.findMany({
    where: { OR: [{ motifHint: null }, { motifHint: "" }] },
    select: { id: true, city: true, country: true },
  });
  console.log(`Backfilling motifs for ${rows.length} listings…`);
  let n = 0;
  for (const r of rows) {
    const art = await generateCityArt(r.city, r.country);
    await prisma.listing.update({
      where: { id: r.id },
      data: { paletteHint: art.palette, motifHint: art.motif.join(",") || null },
    });
    n++;
  }
  console.log(`✅ Updated ${n}`);
}

main().finally(() => prisma.$disconnect());
