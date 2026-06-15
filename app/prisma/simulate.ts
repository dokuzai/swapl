// swapl SIMULATION — appends a large, realistic marketplace to the EXISTING dev.db
// without wiping anything (unlike seed.ts, which resets first).
//
//   600 users · 1000 listings across 500 distinct owners (uneven: power-hosts,
//   single-home hosts, and ~100 pure travellers with zero listings) · real
//   addresses in 36 cities · proposals in every status · message threads ·
//   completed agreements with two-sided reviews · an explicit cohort of 20
//   proposers and 20 accepters.
//
// All rows are namespaced with the BATCH id (default "b1") so they're trivial to
// spot and remove:  DELETE FROM "User" WHERE id LIKE 'sim-b1-%';
//
//   pnpm --filter ./app exec tsx prisma/simulate.ts
//
import "dotenv/config";
import { PrismaClient } from "../generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import bcrypt from "bcryptjs";
import { writeFileSync, mkdirSync } from "node:fs";

const BATCH = process.env.SIM_BATCH ?? "b1";
const adapter = new PrismaBetterSqlite3({ url: process.env.DATABASE_URL ?? "file:./dev.db" });
const prisma = new PrismaClient({ adapter });

// ---- deterministic PRNG (reproducible runs; no Math.random nondeterminism) ----
let _s = 2463534242 >>> 0;
function rnd() { _s ^= _s << 13; _s ^= _s >>> 17; _s ^= _s << 5; _s >>>= 0; return _s / 0xffffffff; }
const pick = <T,>(a: T[]): T => a[Math.floor(rnd() * a.length)];
const int = (min: number, max: number) => min + Math.floor(rnd() * (max - min + 1));
const chance = (p: number) => rnd() < p;
const id = (kind: string, n: number) => `sim-${BATCH}-${kind}-${String(n).padStart(5, "0")}`;
const iso = (d: Date) => d;
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400000);
const BASE = new Date("2026-07-01T00:00:00Z");

// ---- 36 real cities with real streets / neighbourhoods ----
type City = { city: string; country: string; lat: number; lng: number; hoods: string[]; streets: string[] };
const CITIES: City[] = [
  { city: "Roma", country: "Italy", lat: 41.9028, lng: 12.4964, hoods: ["Trastevere","Monti","Testaccio","Prati"], streets: ["Via dei Coronari","Via del Governo Vecchio","Via Giulia","Viale di Trastevere"] },
  { city: "Milano", country: "Italy", lat: 45.4642, lng: 9.19, hoods: ["Brera","Navigli","Isola","Porta Romana"], streets: ["Via Tortona","Corso Como","Via Paolo Sarpi","Ripa di Porta Ticinese"] },
  { city: "Firenze", country: "Italy", lat: 43.7696, lng: 11.2558, hoods: ["Oltrarno","Santa Croce","San Frediano"], streets: ["Borgo San Frediano","Via Maggio","Via dei Neri","Lungarno Soderini"] },
  { city: "Napoli", country: "Italy", lat: 40.8518, lng: 14.2681, hoods: ["Chiaia","Vomero","Spaccanapoli"], streets: ["Via dei Tribunali","Via Toledo","Via Chiaia","Via San Gregorio Armeno"] },
  { city: "Torino", country: "Italy", lat: 45.0703, lng: 7.6869, hoods: ["San Salvario","Quadrilatero","Vanchiglia"], streets: ["Via Po","Via Garibaldi","Corso Vittorio Emanuele II"] },
  { city: "Bologna", country: "Italy", lat: 44.4949, lng: 11.3426, hoods: ["Centro","Bolognina","Santo Stefano"], streets: ["Via Zamboni","Strada Maggiore","Via San Vitale"] },
  { city: "Paris", country: "France", lat: 48.8566, lng: 2.3522, hoods: ["Le Marais","Montmartre","Belleville","Bastille"], streets: ["Rue de Rivoli","Rue Oberkampf","Rue des Martyrs","Boulevard Voltaire"] },
  { city: "Lyon", country: "France", lat: 45.764, lng: 4.8357, hoods: ["Croix-Rousse","Vieux Lyon","Confluence"], streets: ["Rue de la République","Quai Saint-Antoine","Montée de la Grande Côte"] },
  { city: "Barcelona", country: "Spain", lat: 41.3874, lng: 2.1686, hoods: ["Gràcia","El Born","Poblenou","Eixample"], streets: ["Carrer de Verdi","Passeig de Gràcia","Carrer d'Enric Granados","Rambla del Poblenou"] },
  { city: "Madrid", country: "Spain", lat: 40.4168, lng: -3.7038, hoods: ["Malasaña","La Latina","Chueca","Lavapiés"], streets: ["Calle de Fuencarral","Calle del Pez","Calle de la Cava Baja"] },
  { city: "Valencia", country: "Spain", lat: 39.4699, lng: -0.3763, hoods: ["El Carmen","Ruzafa","El Cabanyal"], streets: ["Carrer de Cadis","Carrer dels Cavallers","Avinguda del Regne de València"] },
  { city: "Lisbon", country: "Portugal", lat: 38.7223, lng: -9.1393, hoods: ["Alfama","Bairro Alto","Graça","Príncipe Real"], streets: ["Rua da Bica de Duarte Belo","Rua de São Bento","Travessa do Carmo"] },
  { city: "Porto", country: "Portugal", lat: 41.1579, lng: -8.6291, hoods: ["Ribeira","Cedofeita","Foz"], streets: ["Rua das Flores","Rua de Cedofeita","Rua de Miguel Bombarda"] },
  { city: "Amsterdam", country: "Netherlands", lat: 52.3676, lng: 4.9041, hoods: ["Jordaan","De Pijp","Oud-West"], streets: ["Prinsengracht","Albert Cuypstraat","Haarlemmerstraat"] },
  { city: "Berlin", country: "Germany", lat: 52.52, lng: 13.405, hoods: ["Kreuzberg","Prenzlauer Berg","Neukölln","Mitte"], streets: ["Oranienstraße","Kastanienallee","Sonnenallee","Bergmannstraße"] },
  { city: "Munich", country: "Germany", lat: 48.1351, lng: 11.582, hoods: ["Glockenbachviertel","Schwabing","Haidhausen"], streets: ["Müllerstraße","Leopoldstraße","Wiener Platz"] },
  { city: "Vienna", country: "Austria", lat: 48.2082, lng: 16.3738, hoods: ["Neubau","Leopoldstadt","Wieden"], streets: ["Neubaugasse","Praterstraße","Naschmarkt"] },
  { city: "Prague", country: "Czechia", lat: 50.0755, lng: 14.4378, hoods: ["Vinohrady","Žižkov","Malá Strana"], streets: ["Korunní","Seifertova","Nerudova"] },
  { city: "Budapest", country: "Hungary", lat: 47.4979, lng: 19.0402, hoods: ["Erzsébetváros","Ferencváros","Buda"], streets: ["Kazinczy utca","Ráday utca","Andrássy út"] },
  { city: "Kraków", country: "Poland", lat: 50.0647, lng: 19.945, hoods: ["Kazimierz","Stare Miasto","Podgórze"], streets: ["Ulica Józefa","Ulica Floriańska","Ulica Mostowa"] },
  { city: "Copenhagen", country: "Denmark", lat: 55.6761, lng: 12.5683, hoods: ["Vesterbro","Nørrebro","Christianshavn"], streets: ["Istedgade","Jægersborggade","Sankt Hans Gade"] },
  { city: "Stockholm", country: "Sweden", lat: 59.3293, lng: 18.0686, hoods: ["Södermalm","Östermalm","Vasastan"], streets: ["Götgatan","Hornsgatan","Odengatan"] },
  { city: "Oslo", country: "Norway", lat: 59.9139, lng: 10.7522, hoods: ["Grünerløkka","Frogner","Majorstuen"], streets: ["Thorvald Meyers gate","Markveien","Bogstadveien"] },
  { city: "Dublin", country: "Ireland", lat: 53.3498, lng: -6.2603, hoods: ["Portobello","Stoneybatter","Ranelagh"], streets: ["Camden Street","Manor Street","Ranelagh Road"] },
  { city: "London", country: "United Kingdom", lat: 51.5074, lng: -0.1278, hoods: ["Hackney","Shoreditch","Peckham","Notting Hill"], streets: ["Mare Street","Rivington Street","Bellenden Road","Portobello Road"] },
  { city: "Edinburgh", country: "United Kingdom", lat: 55.9533, lng: -3.1883, hoods: ["Stockbridge","Leith","Marchmont"], streets: ["Raeburn Place","Constitution Street","Marchmont Road"] },
  { city: "Athens", country: "Greece", lat: 37.9838, lng: 23.7275, hoods: ["Koukaki","Exarcheia","Plaka"], streets: ["Veikou","Themistokleous","Adrianou"] },
  { city: "Istanbul", country: "Türkiye", lat: 41.0082, lng: 28.9784, hoods: ["Cihangir","Karaköy","Kadıköy","Balat"], streets: ["Akarsu Caddesi","Serdar-ı Ekrem","Moda Caddesi","Vodina Caddesi"] },
  { city: "New York", country: "USA", lat: 40.7128, lng: -74.006, hoods: ["Williamsburg","West Village","Harlem","Astoria"], streets: ["Bedford Avenue","Bleecker Street","Frederick Douglass Blvd","30th Avenue"] },
  { city: "San Francisco", country: "USA", lat: 37.7749, lng: -122.4194, hoods: ["Mission","Noe Valley","Hayes Valley"], streets: ["Valencia Street","24th Street","Hayes Street"] },
  { city: "Mexico City", country: "Mexico", lat: 19.4326, lng: -99.1332, hoods: ["Roma Norte","Condesa","Coyoacán"], streets: ["Calle Orizaba","Avenida Ámsterdam","Calle Francisco Sosa"] },
  { city: "Buenos Aires", country: "Argentina", lat: -34.6037, lng: -58.3816, hoods: ["Palermo","San Telmo","Recoleta"], streets: ["Calle Honduras","Defensa","Avenida Santa Fe"] },
  { city: "Tokyo", country: "Japan", lat: 35.6762, lng: 139.6503, hoods: ["Shimokitazawa","Nakameguro","Yanaka"], streets: ["Chazawa-dori","Meguro-gawa","Yanaka Ginza"] },
  { city: "Kyoto", country: "Japan", lat: 35.0116, lng: 135.7681, hoods: ["Gion","Arashiyama","Higashiyama"], streets: ["Hanami-koji","Sannenzaka","Pontocho"] },
  { city: "Seoul", country: "South Korea", lat: 37.5665, lng: 126.978, hoods: ["Hannam-dong","Seochon","Yeonnam-dong"], streets: ["Itaewon-ro","Jahamun-ro","Donggyo-ro"] },
  { city: "Marrakesh", country: "Morocco", lat: 31.6295, lng: -7.9811, hoods: ["Gueliz","Medina","Kasbah"], streets: ["Rue de la Liberté","Derb Dabachi","Avenue Mohammed V"] },
];

const PROPERTY_TYPES = ["APARTMENT", "HOUSE", "LOFT", "TOWNHOUSE"];
const FIRST = ["Sofia","Lorenzo","Giulia","Marco","Chiara","Matteo","Alice","Davide","Anna","Luca","Elena","Francesco","Marta","Andrea","Giorgia","Tommaso","Sara","Pietro","Greta","Riccardo","Emma","Léa","Hugo","Manon","Noah","Clara","Liam","Ava","Mateo","Lucía","Júlia","João","Maria","Nuno","Anke","Lars","Freya","Jonas","Yuki","Haruki","Min-jun","Seo-yeon","Youssef","Fatima","Omar","Nora","Felix","Pelin","Emre","Aslı"];
const LAST = ["Rossi","Bianchi","Ferrari","Russo","Romano","Esposito","Conti","Greco","Bruno","Gallo","Martin","Bernard","Dubois","Garcia","Fernández","Lopez","Silva","Costa","Santos","Müller","Schmidt","Fischer","Weber","Tanaka","Suzuki","Kim","Park","Lee","El Amrani","Benali","Demir","Yılmaz","Novák","Kowalski","Nielsen","Andersson","Hansen","Murphy","O'Brien","Walsh"];
const ADJ = ["Light-filled","Quiet","Sun-drenched","Cosy","Spacious","Restored","Bright","Hidden","Leafy","Panoramic","Minimalist","Characterful"];
const NOUN: Record<string,string> = { APARTMENT:"apartment", HOUSE:"house", LOFT:"loft", TOWNHOUSE:"townhouse" };

const PROPOSAL_OPENERS = [
  "We loved {city} last time we visited — would these dates work for a swap?",
  "Ciao! La tua casa a {city} è perfetta per noi. Saremmo in due, molto tranquilli.",
  "Hi! We're a couple working remotely, would love to base ourselves in {hood} for a couple of weeks.",
  "Family of four here — your place looks ideal for {city}. Flexible on exact dates.",
  "Saremmo interessati a uno scambio. La nostra casa è disponibile nelle stesse settimane.",
  "Long-time admirer of {hood}! Could we propose a swap for the dates below?",
];
const REPLY_LINES = [
  "Sounds good — what are you hoping to do while you're here?",
  "Volentieri! Una domanda: viaggiate con animali?",
  "These dates mostly work, though we'd need to shift the end by a couple of days.",
  "Happy to host. The neighbourhood is quiet and the wifi is fast for WFH.",
  "Possiamo essere flessibili. Avete bisogno del parcheggio?",
  "Great — I'll send over the home guide once we confirm.",
  "Just to check: how many of you would be staying?",
];
const REVIEW_GOOD = [
  "Casa esattamente come nelle foto, quartiere bellissimo. Ospiti impeccabili.",
  "Spotless home, super-responsive hosts. The neighbourhood guide was a lovely touch.",
  "Scambio perfetto, comunicazione facile. Torneremmo subito.",
  "Everything worked exactly as described. Left the keys with the neighbour as agreed — seamless.",
  "Tutto liscio, dalla proposta al check-out. Consigliatissimi.",
];
const REVIEW_MIXED = [
  "Bella casa ma il check-in è stato confuso, le istruzioni sono arrivate tardi.",
  "Lovely place, though the listing photos made it look a bit bigger than it is.",
  "Buon soggiorno, però l'app continuava a perdere i messaggi tra web e telefono.",
  "Hosts were kind. Heating was tricky and the home guide was incomplete.",
];

mkdirSync("docs/ux-audit", { recursive: true });

async function main() {
  console.log(`SIMULATION batch=${BATCH} — appending to existing DB (no wipe).`);
  const passwordHash = await bcrypt.hash("swapl-demo", 10);

  // ---------- USERS ----------
  const USER_COUNT = 600;
  const users = Array.from({ length: USER_COUNT }, (_, i) => {
    const name = `${pick(FIRST)} ${pick(LAST)}`;
    return {
      id: id("u", i),
      email: `sim+${BATCH}-${String(i).padStart(5, "0")}@sim.swapl`,
      name,
      bio: pick(["Travels light.","WFH nomad.","Two kids, one cat.","Slow traveller.","Architect.","Loves food markets.","Cyclist.","Photographer.",""]),
      verified: true,
      passwordHash,
    };
  });
  console.log(`Creating ${users.length} users…`);
  await prisma.user.createMany({ data: users });

  // ---------- LISTINGS: 1000 across 500 distinct owners (uneven) ----------
  // Owners = first 500 users. Distribution: a few power-hosts, many 1-2 home
  // hosts. Remaining 100 users own nothing (pure travellers).
  const OWNER_POOL = 500;
  const LISTING_COUNT = 1000;
  const ownerOfListing: number[] = [];
  // Weighted assignment: give each owner a weight so distribution is skewed.
  const weights = Array.from({ length: OWNER_POOL }, (_, i) => (i < 40 ? 6 : i < 150 ? 3 : 1));
  const totalW = weights.reduce((a, b) => a + b, 0);
  for (let l = 0; l < LISTING_COUNT; l++) {
    let r = rnd() * totalW, owner = 0;
    while (r > weights[owner] && owner < OWNER_POOL - 1) { r -= weights[owner]; owner++; }
    ownerOfListing.push(owner);
  }
  // Guarantee every one of the 500 owners gets at least one (reassign first 500 slots).
  for (let i = 0; i < OWNER_POOL; i++) ownerOfListing[i] = i;

  const listings = ownerOfListing.map((ownerIdx, i) => {
    const c = pick(CITIES);
    const ptype = pick(PROPERTY_TYPES);
    const bedrooms = int(1, 4);
    const from = addDays(BASE, int(-30, 120));
    return {
      id: id("l", i),
      userId: id("u", ownerIdx),
      title: `${pick(ADJ)} ${NOUN[ptype]} in ${pick(c.hoods)}`,
      description: `A ${NOUN[ptype]} in ${c.city}. ${bedrooms} bedroom(s), close to transit, easy check-in. Real neighbourhood, real life.`,
      propertyType: ptype,
      city: c.city,
      neighbourhood: pick(c.hoods),
      country: c.country,
      address: `${int(1, 180)} ${pick(c.streets)}`,
      lat: c.lat + (rnd() - 0.5) * 0.06,
      lng: c.lng + (rnd() - 0.5) * 0.06,
      sizeSqm: int(38, 180),
      sleeps: bedrooms + int(0, 2),
      bedrooms,
      bathrooms: int(1, Math.max(1, bedrooms - 1)) || 1,
      floor: int(0, 7),
      hasElevator: chance(0.5),
      stepFreeAccess: chance(0.35),
      petsAllowed: chance(0.4),
      petTypes: JSON.stringify(chance(0.4) ? ["cats"] : []),
      wfhSetup: chance(0.7),
      wfhDesks: chance(0.7) ? int(1, 2) : 0,
      hasParking: chance(0.3),
      bikeIncluded: chance(0.25),
      rooftop: chance(0.15),
      balcony: chance(0.5),
      garden: chance(0.15),
      courtyard: chance(0.15),
      ac: chance(0.55),
      dishwasher: chance(0.5),
      washer: chance(0.8),
      dryer: chance(0.3),
      availableFrom: iso(from),
      availableTo: iso(addDays(from, int(20, 120))),
      minStayDays: 3,
      maxStayDays: 30,
      photos: JSON.stringify([
        "https://images.unsplash.com/photo-1554995207-c18c203602cb?w=1600",
        "https://images.unsplash.com/photo-1502672023488-70e25813eb80?w=1600",
      ]),
      tags: JSON.stringify([pick(["WFH","Balcony","Quiet","Central","Family","Pet-friendly"])]),
      paletteHint: pick(["warm","cool","rose","sand","sage","dusk"]),
    };
  });
  console.log(`Creating ${listings.length} listings across ${OWNER_POOL} owners…`);
  // chunk to keep SQLite statements bounded
  for (let i = 0; i < listings.length; i += 200) await prisma.listing.createMany({ data: listings.slice(i, i + 200) });

  // index: owner -> their listing indices
  const listingsByOwner = new Map<number, number[]>();
  ownerOfListing.forEach((o, li) => { (listingsByOwner.get(o) ?? listingsByOwner.set(o, []).get(o)!).push(li); });
  const ownersWithListings = [...listingsByOwner.keys()];

  // ---------- PROPOSALS / NEGOTIATIONS ----------
  // Explicit cohort: 20 proposers + 20 accepters → 20 ACCEPTED swaps.
  // Plus ~240 extra proposals in mixed statuses for a lively marketplace.
  type P = { id: string; proposerId: string; proposerListingId: string; targetListingId: string; dateFrom: Date; dateTo: Date; message: string; status: string; counterDateFrom?: Date; counterDateTo?: Date; counterMessage?: string };
  const proposals: P[] = [];
  const messages: { id: string; proposalId: string; authorId: string; body: string; createdAt: Date }[] = [];
  const agreements: { id: string; proposalId: string; listing1Id: string; listing2Id: string; dateFrom: Date; dateTo: Date; keyCode1: string; keyCode2: string; status: string }[] = [];
  const reviews: { id: string; agreementId: string; authorId: string; subjectId: string; rating: number; text: string }[] = [];

  let pSeq = 0, mSeq = 0, aSeq = 0, rSeq = 0;
  const ownerListing = (o: number) => id("l", pick(listingsByOwner.get(o)!));

  function makeProposal(proposerOwner: number, targetOwner: number, status: string, withAgreement: boolean) {
    if (proposerOwner === targetOwner) return;
    const start = addDays(BASE, int(-20, 90));
    const end = addDays(start, int(7, 21));
    const c = pick(CITIES);
    const pid = id("p", pSeq++);
    const proposerId = id("u", proposerOwner);
    const targetOwnerId = id("u", targetOwner);
    const proposerListingId = ownerListing(proposerOwner);
    const targetListingId = ownerListing(targetOwner);
    const p: P = {
      id: pid, proposerId, proposerListingId, targetListingId,
      dateFrom: start, dateTo: end,
      message: pick(PROPOSAL_OPENERS).replace("{city}", c.city).replace("{hood}", pick(c.hoods)),
      status,
    };
    if (status === "COUNTERED") {
      p.counterDateFrom = addDays(start, 5);
      p.counterDateTo = addDays(end, 5);
      p.counterMessage = "Those dates are tight — could we shift everything a few days later?";
    }
    proposals.push(p);

    // message thread (cross-client back-and-forth, alternating authors)
    const turns = int(1, 6);
    let t = start;
    for (let k = 0; k < turns; k++) {
      const author = k % 2 === 0 ? proposerId : targetOwnerId;
      t = addDays(t, -int(1, 4));
      messages.push({ id: id("m", mSeq++), proposalId: pid, authorId: author, body: k === 0 ? p.message : pick(REPLY_LINES), createdAt: t });
    }

    if (withAgreement && status === "ACCEPTED") {
      const aid = id("a", aSeq++);
      const completed = chance(0.6);
      agreements.push({
        id: aid, proposalId: pid, listing1Id: proposerListingId, listing2Id: targetListingId,
        dateFrom: start, dateTo: end, keyCode1: String(int(1000, 9999)), keyCode2: String(int(1000, 9999)),
        status: completed ? "COMPLETED" : "ACTIVE",
      });
      if (completed) {
        // two-sided reviews
        const good = chance(0.7);
        reviews.push({ id: id("r", rSeq++), agreementId: aid, authorId: proposerId, subjectId: targetOwnerId, rating: good ? int(4, 5) : int(2, 3), text: good ? pick(REVIEW_GOOD) : pick(REVIEW_MIXED) });
        reviews.push({ id: id("r", rSeq++), agreementId: aid, authorId: targetOwnerId, subjectId: proposerId, rating: good ? int(4, 5) : int(3, 4), text: good ? pick(REVIEW_GOOD) : pick(REVIEW_MIXED) });
      }
    }
  }

  // 20 explicit proposers (owners 0..19) -> 20 explicit accepters (owners 20..39)
  for (let i = 0; i < 20; i++) makeProposal(i, 20 + i, "ACCEPTED", true);

  // ~240 extra proposals, mixed statuses
  const STATUSES = ["PENDING","PENDING","COUNTERED","ACCEPTED","DECLINED","WITHDRAWN"];
  for (let i = 0; i < 240; i++) {
    const a = pick(ownersWithListings), b = pick(ownersWithListings);
    const st = pick(STATUSES);
    makeProposal(a, b, st, st === "ACCEPTED");
  }

  console.log(`Creating ${proposals.length} proposals…`);
  for (let i = 0; i < proposals.length; i += 200) await prisma.swapProposal.createMany({ data: proposals.slice(i, i + 200) });
  console.log(`Creating ${agreements.length} agreements…`);
  if (agreements.length) await prisma.swapAgreement.createMany({ data: agreements });
  console.log(`Creating ${messages.length} messages…`);
  for (let i = 0; i < messages.length; i += 300) await prisma.swapMessage.createMany({ data: messages.slice(i, i + 300) });
  console.log(`Creating ${reviews.length} reviews…`);
  if (reviews.length) await prisma.swapReview.createMany({ data: reviews });

  // ---------- summary artifact ----------
  const summary = {
    batch: BATCH,
    users: users.length,
    listings: listings.length,
    distinctOwners: ownersWithListings.length,
    travellersWithoutListing: USER_COUNT - ownersWithListings.length,
    proposals: proposals.length,
    acceptedSwaps: agreements.length,
    completedSwaps: agreements.filter((a) => a.status === "COMPLETED").length,
    messages: messages.length,
    reviews: reviews.length,
    statusBreakdown: STATUSES.reduce<Record<string, number>>((acc, s) => { acc[s] = proposals.filter((p) => p.status === s).length; return acc; }, {}),
    note: "All ids namespaced sim-" + BATCH + "-*. Remove with: DELETE FROM \"User\" WHERE id LIKE 'sim-" + BATCH + "-%'; (cascades).",
  };
  writeFileSync("docs/ux-audit/sim-summary.json", JSON.stringify(summary, null, 2));
  console.log("✅ Simulation complete:", JSON.stringify(summary, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(async () => { await prisma.$disconnect(); });
