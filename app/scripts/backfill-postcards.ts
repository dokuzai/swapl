import "dotenv/config";
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { generateCityPostcard } from "../lib/ai/city-illustration";

const adapter = new PrismaBetterSqlite3({ url: process.env.DATABASE_URL ?? "file:./dev.db" });
const prisma = new PrismaClient({ adapter });

async function main() {
  const rows = await prisma.listing.findMany({
    select: { id: true, city: true, country: true, postcard: true },
  });
  console.log(`Generating postcards for ${rows.length} listings…`);
  let n = 0;
  for (const r of rows) {
    const decision = await generateCityPostcard(r.city, r.country);
    await prisma.listing.update({
      where: { id: r.id },
      data: {
        paletteHint: decision.palette,
        motifHint: decision.motif.join(",") || null,
        postcard: JSON.stringify(decision.postcard),
      },
    });
    n++;
  }
  console.log(`✅ Updated ${n} (cache populated for new cities, presets used for seeded ones).`);
}

main().finally(() => prisma.$disconnect());
