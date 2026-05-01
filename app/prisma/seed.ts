// swapl seed — 20+ listings across 10 cities + sample proposals + an accepted agreement.
import "dotenv/config";
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import bcrypt from "bcryptjs";
import { CITIES, paletteForCity } from "../lib/cities";

function dbUrl() {
  const raw = process.env.DATABASE_URL ?? "file:./dev.db";
  return raw;
}

const adapter = new PrismaBetterSqlite3({ url: dbUrl() });
const prisma = new PrismaClient({ adapter });

const PASSWORD = "swapl-demo"; // dev only

type Seed = {
  name: string;
  email: string;
  bio: string;
  listing: {
    title: string;
    description: string;
    propertyType: "APARTMENT" | "HOUSE" | "LOFT" | "TOWNHOUSE";
    city: string;
    neighbourhood: string;
    sizeSqm: number;
    sleeps: number;
    bedrooms: number;
    bathrooms: number;
    floor: number;
    petsAllowed: boolean;
    petTypes?: string[];
    wfhSetup: boolean;
    wfhDesks?: number;
    stepFreeAccess: boolean;
    hasElevator?: boolean;
    bikeIncluded?: boolean;
    balcony?: boolean;
    rooftop?: boolean;
    garden?: boolean;
    courtyard?: boolean;
    piano?: boolean;
    pool?: boolean;
    ac?: boolean;
    washer?: boolean;
    dryer?: boolean;
    dishwasher?: boolean;
    hasParking?: boolean;
    availableFrom: string;
    availableTo: string;
    photos: string[];
    tags: string[];
  };
};

const SEEDS: Seed[] = [
  {
    name: "Aslı Demir",
    email: "asli@demo.swapl",
    bio: "Architect in Cihangir. Cat: Pamuk.",
    listing: {
      title: "Cihangir flat with Bosphorus view",
      description:
        "Three-bedroom flat on the fourth floor, deep balcony over the Bosphorus. Built-in WFH nook, full kitchen, family-friendly. Pamuk the cat may stay if you'd like company.",
      propertyType: "APARTMENT",
      city: "Istanbul",
      neighbourhood: "Cihangir",
      sizeSqm: 140,
      sleeps: 4,
      bedrooms: 3,
      bathrooms: 2,
      floor: 4,
      petsAllowed: true,
      petTypes: ["cats"],
      wfhSetup: true,
      wfhDesks: 2,
      stepFreeAccess: false,
      hasElevator: true,
      balcony: true,
      ac: true,
      washer: true,
      dishwasher: true,
      availableFrom: "2026-06-01",
      availableTo: "2026-08-30",
      photos: [
        "https://images.unsplash.com/photo-1554995207-c18c203602cb?w=1600",
        "https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=1600",
      ],
      tags: ["Bosphorus view", "WFH", "Cat-friendly", "Balcony"],
    },
  },
  {
    name: "Maartje van der Berg",
    email: "maartje@demo.swapl",
    bio: "Designer. Bikes everywhere. Two kids.",
    listing: {
      title: "Canal-side loft in the Jordaan",
      description:
        "Light-filled 17th-century loft above the canal. Bikes for four included. Five-min walk to Noordermarkt.",
      propertyType: "LOFT",
      city: "Amsterdam",
      neighbourhood: "Jordaan",
      sizeSqm: 92,
      sleeps: 3,
      bedrooms: 2,
      bathrooms: 1,
      floor: 2,
      petsAllowed: false,
      wfhSetup: true,
      wfhDesks: 1,
      stepFreeAccess: false,
      bikeIncluded: true,
      washer: true,
      dishwasher: true,
      availableFrom: "2026-06-04",
      availableTo: "2026-06-30",
      photos: [
        "https://images.unsplash.com/photo-1519642918688-7e43b19245d8?w=1600",
        "https://images.unsplash.com/photo-1502672023488-70e25813eb80?w=1600",
      ],
      tags: ["Bike incl.", "Canal view", "Quiet"],
    },
  },
  {
    name: "Haruki Tanaka",
    email: "haruki@demo.swapl",
    bio: "Photographer. Likes minimalism and ramen.",
    listing: {
      title: "Minimalist 1LDK in Shimokitazawa",
      description:
        "Tatami bedroom, deep soaking tub, chef's kitchen. Walking distance to vintage shops and live houses.",
      propertyType: "APARTMENT",
      city: "Tokyo",
      neighbourhood: "Shimokitazawa",
      sizeSqm: 58,
      sleeps: 2,
      bedrooms: 1,
      bathrooms: 1,
      floor: 3,
      petsAllowed: false,
      wfhSetup: true,
      wfhDesks: 1,
      stepFreeAccess: false,
      hasElevator: true,
      ac: true,
      washer: true,
      availableFrom: "2026-09-12",
      availableTo: "2026-10-30",
      photos: [
        "https://images.unsplash.com/photo-1505691938895-1758d7feb511?w=1600",
        "https://images.unsplash.com/photo-1480796927426-f609979314bd?w=1600",
      ],
      tags: ["Quiet street", "WFH desk", "Bath"],
    },
  },
  {
    name: "Ines Cardoso",
    email: "ines@demo.swapl",
    bio: "Tile collector. Owns a townhouse, lives slowly.",
    listing: {
      title: "Azulejo townhouse in Alfama",
      description:
        "Three floors of original azulejos, rooftop terrace with Tagus view. A piano, a tortoise (stays), and lots of light.",
      propertyType: "TOWNHOUSE",
      city: "Lisbon",
      neighbourhood: "Alfama",
      sizeSqm: 110,
      sleeps: 4,
      bedrooms: 2,
      bathrooms: 2,
      floor: 0,
      petsAllowed: true,
      petTypes: ["other"],
      wfhSetup: true,
      wfhDesks: 1,
      stepFreeAccess: false,
      rooftop: true,
      piano: true,
      ac: true,
      washer: true,
      availableFrom: "2026-09-12",
      availableTo: "2026-11-15",
      photos: [
        "https://images.unsplash.com/photo-1555881400-74d7acaacd8b?w=1600",
        "https://images.unsplash.com/photo-1533105079780-92b9be482077?w=1600",
      ],
      tags: ["Rooftop", "Piano", "Tortoise OK"],
    },
  },
  {
    name: "Carla Mendoza",
    email: "carla@demo.swapl",
    bio: "Curator. Speaks four languages.",
    listing: {
      title: "Art-deco flat in Roma Norte",
      description:
        "Renovated 1932 building with a leafy courtyard, fully equipped kitchen, and a guest studio for working from home.",
      propertyType: "APARTMENT",
      city: "CDMX",
      neighbourhood: "Roma Norte",
      sizeSqm: 135,
      sleeps: 5,
      bedrooms: 3,
      bathrooms: 2,
      floor: 2,
      petsAllowed: true,
      petTypes: ["dogs", "cats"],
      wfhSetup: true,
      wfhDesks: 2,
      stepFreeAccess: true,
      hasElevator: true,
      courtyard: true,
      ac: true,
      washer: true,
      dishwasher: true,
      availableFrom: "2026-10-03",
      availableTo: "2026-12-15",
      photos: [
        "https://images.unsplash.com/photo-1567552379061-d8d92c8d6c61?w=1600",
        "https://images.unsplash.com/photo-1505691938895-1758d7feb511?w=1600",
      ],
      tags: ["Courtyard", "Dog OK", "WFH 2 desks"],
    },
  },
  {
    name: "Marcus Bell",
    email: "marcus@demo.swapl",
    bio: "Brownstone owner. Records jazz at home.",
    listing: {
      title: "Brownstone parlor in Fort Greene",
      description:
        "Parlor floor of a Victorian brownstone. Original mantels, working fireplace, garden access, upright piano.",
      propertyType: "TOWNHOUSE",
      city: "Brooklyn",
      neighbourhood: "Fort Greene",
      sizeSqm: 120,
      sleeps: 4,
      bedrooms: 2,
      bathrooms: 2,
      floor: 1,
      petsAllowed: true,
      petTypes: ["dogs"],
      wfhSetup: true,
      wfhDesks: 1,
      stepFreeAccess: false,
      garden: true,
      piano: true,
      ac: true,
      washer: true,
      dryer: true,
      availableFrom: "2026-10-03",
      availableTo: "2026-12-20",
      photos: [
        "https://images.unsplash.com/photo-1502672023488-70e25813eb80?w=1600",
        "https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=1600",
      ],
      tags: ["Piano", "Dog OK", "Garden"],
    },
  },
  {
    name: "Élise Mercier",
    email: "elise@demo.swapl",
    bio: "Pastry chef. Knows the right markets.",
    listing: {
      title: "Marais walkup with iron balcony",
      description:
        "Fourth-floor walkup, no elevator, but the views and the croissants downstairs make up for it.",
      propertyType: "APARTMENT",
      city: "Paris",
      neighbourhood: "Marais",
      sizeSqm: 64,
      sleeps: 2,
      bedrooms: 1,
      bathrooms: 1,
      floor: 4,
      petsAllowed: false,
      wfhSetup: true,
      wfhDesks: 1,
      stepFreeAccess: false,
      balcony: true,
      ac: false,
      washer: true,
      availableFrom: "2026-05-15",
      availableTo: "2026-07-10",
      photos: [
        "https://images.unsplash.com/photo-1431576901776-e539bd916ba2?w=1600",
        "https://images.unsplash.com/photo-1499856871958-5b9627545d1a?w=1600",
      ],
      tags: ["Balcony", "Marais", "Walkup"],
    },
  },
  {
    name: "Yassir Lahlou",
    email: "yassir@demo.swapl",
    bio: "Riad-owner. Tea is mandatory.",
    listing: {
      title: "Restored riad off Jemaa el-Fnaa",
      description:
        "Three-bedroom riad with central courtyard fountain and rooftop hammam. Step-free ground floor.",
      propertyType: "HOUSE",
      city: "Marrakesh",
      neighbourhood: "Medina",
      sizeSqm: 220,
      sleeps: 6,
      bedrooms: 3,
      bathrooms: 3,
      floor: 0,
      petsAllowed: false,
      wfhSetup: false,
      stepFreeAccess: true,
      courtyard: true,
      rooftop: true,
      pool: true,
      ac: true,
      availableFrom: "2026-04-10",
      availableTo: "2026-06-30",
      photos: [
        "https://images.unsplash.com/photo-1539020140153-e479b8c0b5ce?w=1600",
        "https://images.unsplash.com/photo-1473625247510-8ceb1760943f?w=1600",
      ],
      tags: ["Riad", "Rooftop", "Plunge pool"],
    },
  },
  {
    name: "Lina Schulze",
    email: "lina@demo.swapl",
    bio: "Producer. Two-bike household.",
    listing: {
      title: "Altbau in Prenzlauer Berg",
      description:
        "High-ceilinged 110m² flat with original parquet, two desks, ample bike storage, balcony over a quiet courtyard.",
      propertyType: "APARTMENT",
      city: "Berlin",
      neighbourhood: "Prenzlauer Berg",
      sizeSqm: 110,
      sleeps: 4,
      bedrooms: 2,
      bathrooms: 1,
      floor: 3,
      petsAllowed: true,
      petTypes: ["cats"],
      wfhSetup: true,
      wfhDesks: 2,
      stepFreeAccess: false,
      hasElevator: false,
      bikeIncluded: true,
      balcony: true,
      washer: true,
      availableFrom: "2026-06-15",
      availableTo: "2026-09-15",
      photos: [
        "https://images.unsplash.com/photo-1502672023488-70e25813eb80?w=1600",
        "https://images.unsplash.com/photo-1542897644-e04428948020?w=1600",
      ],
      tags: ["Bikes incl.", "WFH 2 desks", "Quiet courtyard"],
    },
  },
  {
    name: "Joon Park",
    email: "joon@demo.swapl",
    bio: "Game dev. Owns a tiny dog (Pong).",
    listing: {
      title: "Hannok-influenced apartment in Seochon",
      description:
        "Two-bedroom apartment a block from Gyeongbokgung. Underfloor heating, fiber 1Gb, espresso machine.",
      propertyType: "APARTMENT",
      city: "Seoul",
      neighbourhood: "Seochon",
      sizeSqm: 78,
      sleeps: 3,
      bedrooms: 2,
      bathrooms: 1,
      floor: 5,
      petsAllowed: true,
      petTypes: ["dogs"],
      wfhSetup: true,
      wfhDesks: 1,
      stepFreeAccess: true,
      hasElevator: true,
      ac: true,
      washer: true,
      dishwasher: true,
      availableFrom: "2026-07-01",
      availableTo: "2026-09-30",
      photos: [
        "https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=1600",
        "https://images.unsplash.com/photo-1565623006066-82f23c79210b?w=1600",
      ],
      tags: ["Fiber", "Dog OK", "Step-free"],
    },
  },
  // additional 11 listings — same cities, varied owners, to reach 20+
  {
    name: "Selin Aksoy",
    email: "selin@demo.swapl",
    bio: "Translator. Quiet hours.",
    listing: {
      title: "Garden flat in Kadıköy",
      description: "Step-free 70m² with private garden. Cats welcome. Asia-side calm, ferry to Europe in 20 min.",
      propertyType: "APARTMENT",
      city: "Istanbul",
      neighbourhood: "Kadıköy",
      sizeSqm: 70,
      sleeps: 2,
      bedrooms: 1,
      bathrooms: 1,
      floor: 0,
      petsAllowed: true,
      petTypes: ["cats"],
      wfhSetup: true,
      wfhDesks: 1,
      stepFreeAccess: true,
      garden: true,
      ac: true,
      washer: true,
      availableFrom: "2026-06-10",
      availableTo: "2026-08-15",
      photos: ["https://images.unsplash.com/photo-1505691938895-1758d7feb511?w=1600"],
      tags: ["Step-free", "Garden", "Cat OK"],
    },
  },
  {
    name: "Jonas Visser",
    email: "jonas@demo.swapl",
    bio: "Boatmaker.",
    listing: {
      title: "Houseboat in De Pijp",
      description: "Quirky two-cabin houseboat moored in De Pijp. Wood stove, tiny galley, vivid sunsets.",
      propertyType: "HOUSE",
      city: "Amsterdam",
      neighbourhood: "De Pijp",
      sizeSqm: 48,
      sleeps: 2,
      bedrooms: 1,
      bathrooms: 1,
      floor: 0,
      petsAllowed: false,
      wfhSetup: false,
      stepFreeAccess: false,
      bikeIncluded: true,
      availableFrom: "2026-07-01",
      availableTo: "2026-09-30",
      photos: ["https://images.unsplash.com/photo-1519642918688-7e43b19245d8?w=1600"],
      tags: ["Houseboat", "Bikes incl."],
    },
  },
  {
    name: "Mei Sato",
    email: "mei@demo.swapl",
    bio: "Tea ceremony teacher.",
    listing: {
      title: "Quiet 2LDK in Yanaka",
      description: "Old-Tokyo neighborhood, koi pond outside, two tatami rooms, deep tub.",
      propertyType: "APARTMENT",
      city: "Tokyo",
      neighbourhood: "Yanaka",
      sizeSqm: 72,
      sleeps: 3,
      bedrooms: 2,
      bathrooms: 1,
      floor: 1,
      petsAllowed: false,
      wfhSetup: true,
      wfhDesks: 1,
      stepFreeAccess: true,
      ac: true,
      washer: true,
      availableFrom: "2026-04-20",
      availableTo: "2026-06-20",
      photos: ["https://images.unsplash.com/photo-1480796927426-f609979314bd?w=1600"],
      tags: ["Step-free", "Tatami", "Quiet"],
    },
  },
  {
    name: "Tiago Reis",
    email: "tiago@demo.swapl",
    bio: "Surfer. Studio architect.",
    listing: {
      title: "Bairro Alto studio with rooftop",
      description: "One-bedroom studio with private rooftop terrace and a bike for two.",
      propertyType: "APARTMENT",
      city: "Lisbon",
      neighbourhood: "Bairro Alto",
      sizeSqm: 52,
      sleeps: 2,
      bedrooms: 1,
      bathrooms: 1,
      floor: 3,
      petsAllowed: false,
      wfhSetup: false,
      stepFreeAccess: false,
      rooftop: true,
      bikeIncluded: true,
      ac: true,
      availableFrom: "2026-05-01",
      availableTo: "2026-07-30",
      photos: ["https://images.unsplash.com/photo-1555881400-74d7acaacd8b?w=1600"],
      tags: ["Rooftop", "Bike incl."],
    },
  },
  {
    name: "Diego Cruz",
    email: "diego@demo.swapl",
    bio: "Chef. Always testing recipes.",
    listing: {
      title: "Coyoacán family house",
      description: "Three-bedroom 1940s home in Coyoacán with kitchen garden and pool.",
      propertyType: "HOUSE",
      city: "CDMX",
      neighbourhood: "Coyoacán",
      sizeSqm: 200,
      sleeps: 6,
      bedrooms: 3,
      bathrooms: 3,
      floor: 0,
      petsAllowed: true,
      petTypes: ["dogs", "cats"],
      wfhSetup: true,
      wfhDesks: 2,
      stepFreeAccess: true,
      garden: true,
      pool: true,
      ac: true,
      washer: true,
      dishwasher: true,
      hasParking: true,
      availableFrom: "2026-08-01",
      availableTo: "2026-10-31",
      photos: ["https://images.unsplash.com/photo-1567552379061-d8d92c8d6c61?w=1600"],
      tags: ["Pool", "Dogs OK", "Step-free"],
    },
  },
  {
    name: "Aria Cohen",
    email: "aria@demo.swapl",
    bio: "Editor. Park slope walks.",
    listing: {
      title: "Park Slope duplex",
      description: "Family duplex with garden, near Prospect Park, kid-ready.",
      propertyType: "APARTMENT",
      city: "Brooklyn",
      neighbourhood: "Park Slope",
      sizeSqm: 150,
      sleeps: 5,
      bedrooms: 3,
      bathrooms: 2,
      floor: 1,
      petsAllowed: true,
      petTypes: ["cats"],
      wfhSetup: true,
      wfhDesks: 1,
      stepFreeAccess: false,
      garden: true,
      washer: true,
      dryer: true,
      availableFrom: "2026-07-15",
      availableTo: "2026-08-25",
      photos: ["https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=1600"],
      tags: ["Garden", "Family", "Cat OK"],
    },
  },
  {
    name: "Mathieu Roche",
    email: "mathieu@demo.swapl",
    bio: "Filmmaker.",
    listing: {
      title: "11ème one-bed with elevator",
      description: "Modern one-bedroom near Bastille, elevator building, step-free entry, dishwasher, AC.",
      propertyType: "APARTMENT",
      city: "Paris",
      neighbourhood: "Bastille",
      sizeSqm: 48,
      sleeps: 2,
      bedrooms: 1,
      bathrooms: 1,
      floor: 5,
      petsAllowed: false,
      wfhSetup: true,
      wfhDesks: 1,
      stepFreeAccess: true,
      hasElevator: true,
      ac: true,
      dishwasher: true,
      availableFrom: "2026-06-01",
      availableTo: "2026-08-15",
      photos: ["https://images.unsplash.com/photo-1431576901776-e539bd916ba2?w=1600"],
      tags: ["Step-free", "Elevator", "AC"],
    },
  },
  {
    name: "Khadija El Amrani",
    email: "khadija@demo.swapl",
    bio: "Ceramicist.",
    listing: {
      title: "Studio loft in Gueliz",
      description: "Modern district, ground-floor studio, courtyard, AC, bike included.",
      propertyType: "LOFT",
      city: "Marrakesh",
      neighbourhood: "Gueliz",
      sizeSqm: 60,
      sleeps: 2,
      bedrooms: 1,
      bathrooms: 1,
      floor: 0,
      petsAllowed: true,
      petTypes: ["cats"],
      wfhSetup: true,
      wfhDesks: 1,
      stepFreeAccess: true,
      bikeIncluded: true,
      courtyard: true,
      ac: true,
      availableFrom: "2026-09-01",
      availableTo: "2026-12-15",
      photos: ["https://images.unsplash.com/photo-1539020140153-e479b8c0b5ce?w=1600"],
      tags: ["Step-free", "Bike incl.", "Courtyard"],
    },
  },
  {
    name: "Felix Bauer",
    email: "felix@demo.swapl",
    bio: "Sound engineer.",
    listing: {
      title: "Kreuzberg loft over the canal",
      description: "Open-plan 95m² loft, two desks, soundproof booth, walking distance to clubs.",
      propertyType: "LOFT",
      city: "Berlin",
      neighbourhood: "Kreuzberg",
      sizeSqm: 95,
      sleeps: 3,
      bedrooms: 1,
      bathrooms: 1,
      floor: 2,
      petsAllowed: false,
      wfhSetup: true,
      wfhDesks: 2,
      stepFreeAccess: false,
      balcony: true,
      washer: true,
      availableFrom: "2026-08-01",
      availableTo: "2026-10-15",
      photos: ["https://images.unsplash.com/photo-1542897644-e04428948020?w=1600"],
      tags: ["Loft", "Soundproof", "Canal"],
    },
  },
  {
    name: "Da-eun Kim",
    email: "daeun@demo.swapl",
    bio: "UX researcher.",
    listing: {
      title: "Hannam-dong family flat",
      description: "Three-bedroom in Hannam-dong, parking, step-free, two desks, fiber 1Gb.",
      propertyType: "APARTMENT",
      city: "Seoul",
      neighbourhood: "Hannam-dong",
      sizeSqm: 130,
      sleeps: 5,
      bedrooms: 3,
      bathrooms: 2,
      floor: 8,
      petsAllowed: true,
      petTypes: ["cats"],
      wfhSetup: true,
      wfhDesks: 2,
      stepFreeAccess: true,
      hasElevator: true,
      hasParking: true,
      ac: true,
      washer: true,
      dryer: true,
      dishwasher: true,
      availableFrom: "2026-08-01",
      availableTo: "2026-11-30",
      photos: ["https://images.unsplash.com/photo-1565623006066-82f23c79210b?w=1600"],
      tags: ["Family", "Parking", "Fiber"],
    },
  },
  {
    name: "Pelin Kara",
    email: "pelin@demo.swapl",
    bio: "Illustrator. Two cats.",
    listing: {
      title: "Galata studio over the rooftops",
      description: "Top-floor studio, panoramic rooftop, cats live here too. Stairs only.",
      propertyType: "APARTMENT",
      city: "Istanbul",
      neighbourhood: "Galata",
      sizeSqm: 45,
      sleeps: 2,
      bedrooms: 1,
      bathrooms: 1,
      floor: 5,
      petsAllowed: true,
      petTypes: ["cats"],
      wfhSetup: true,
      wfhDesks: 1,
      stepFreeAccess: false,
      rooftop: true,
      ac: true,
      washer: true,
      availableFrom: "2026-05-15",
      availableTo: "2026-09-15",
      photos: ["https://images.unsplash.com/photo-1554995207-c18c203602cb?w=1600"],
      tags: ["Rooftop", "Cats", "View"],
    },
  },
];

// PLAN_LIMITS rows seeded into Stripe-agnostic Plan table. Mirrors
// lib/billing/limits.ts; ids must stay stable.
const PLANS = [
  {
    id: "free", label: "Free", monthlyCents: 0, yearlyCents: 0,
    maxListings: 1, maxProposalsMonth: 3, prioritySearch: "standard",
    fullFilters: false, calendarSync: false, matchBreakdown: false,
    listingAnalytics: false, multiHomeTeams: false,
  },
  {
    id: "plus", label: "swapl Plus", monthlyCents: 1200, yearlyCents: 9900,
    maxListings: 3, maxProposalsMonth: 0, prioritySearch: "priority",
    fullFilters: true, calendarSync: true, matchBreakdown: true,
    listingAnalytics: false, multiHomeTeams: false,
  },
  {
    id: "pro", label: "swapl Pro", monthlyCents: 2900, yearlyCents: 24900,
    maxListings: 0, maxProposalsMonth: 0, prioritySearch: "top",
    fullFilters: true, calendarSync: true, matchBreakdown: true,
    listingAnalytics: true, multiHomeTeams: true,
  },
] as const;

async function main() {
  console.log("Resetting database…");
  await prisma.affiliateClick.deleteMany();
  await prisma.orderAddOn.deleteMany();
  await prisma.listingFeaturedPurchase.deleteMany();
  await prisma.listingVerificationPayment.deleteMany();
  await prisma.billingInvoice.deleteMany();
  await prisma.billingEvent.deleteMany();
  await prisma.subscription.deleteMany();
  await prisma.stripeCustomer.deleteMany();
  await prisma.organizationMember.deleteMany();
  await prisma.organization.deleteMany();
  await prisma.report.deleteMany();
  await prisma.swapMessage.deleteMany();
  await prisma.insurancePolicy.deleteMany();
  await prisma.swapAgreement.deleteMany();
  await prisma.swapProposal.deleteMany();
  await prisma.listing.deleteMany();
  await prisma.betaSignup.deleteMany();
  await prisma.user.deleteMany();
  await prisma.plan.deleteMany();
  await prisma.addOn.deleteMany();
  await prisma.affiliatePartner.deleteMany();

  console.log("Seeding plans…");
  for (const p of PLANS) await prisma.plan.create({ data: { ...p } });

  console.log("Seeding affiliate partners…");
  await prisma.affiliatePartner.createMany({
    data: [
      { slug: "skyscanner",   name: "Skyscanner",   category: "flights",   baseUrl: "https://www.skyscanner.com/transport/flights/",       trackingParam: "associateid", commissionModel: "cpa" },
      { slug: "airalo",       name: "Airalo",       category: "esim",      baseUrl: "https://www.airalo.com/",                              trackingParam: "ref",         commissionModel: "rev_share" },
      { slug: "getyourguide", name: "GetYourGuide", category: "activities",baseUrl: "https://www.getyourguide.com/s/",                      trackingParam: "partner_id",  commissionModel: "percent_booking" },
      { slug: "battleface",   name: "Battleface",   category: "insurance", baseUrl: "https://www.battleface.com/en-gb/",                    trackingParam: "ref",         commissionModel: "percent_booking" },
    ],
  });

  console.log("Seeding add-ons…");
  await prisma.addOn.createMany({
    data: [
      { slug: "cleaning-mid",  name: "Pre-stay cleaning",      description: "Mid-size home, 90-minute professional clean before arrival.", priceCents: 6900, type: "flat_fee",        provider: "swapl",       category: "cleaning" },
      { slug: "lockbox",       name: "Smart key lockbox",      description: "Pick up keys at a KeyNest store nearby — no in-person handover.", priceCents: 1900, type: "flat_fee",  provider: "keynest",     category: "lockbox" },
      { slug: "transfer",      name: "Airport transfer",       description: "Pre-book a private transfer for your destination.",            priceCents: 0,    type: "affiliate",       provider: "getyourguide",category: "transfer" },
      { slug: "esim",          name: "Travel eSIM",            description: "Stay connected the moment you land.",                           priceCents: 0,    type: "affiliate",       provider: "airalo",      category: "esim" },
      { slug: "city-guide",    name: "Local city guide",       description: "Curated, neighbourhood-by-neighbourhood guide for your stay.",  priceCents: 900,  type: "flat_fee",        provider: "swapl",       category: "guide" },
    ],
  });

  console.log("Creating users + listings…");
  const passwordHash = await bcrypt.hash("swapl-demo", 10);

  const userIds: Record<string, string> = {};
  const listingIds: Record<string, string> = {};

  for (const seed of SEEDS) {
    const meta = CITIES.find((c) => c.name === seed.listing.city);
    const palette = paletteForCity(seed.listing.city);
    const user = await prisma.user.create({
      data: {
        email: seed.email,
        name: seed.name,
        bio: seed.bio,
        verified: true,
        passwordHash,
      },
    });
    userIds[seed.email] = user.id;
    const listing = await prisma.listing.create({
      data: {
        userId: user.id,
        title: seed.listing.title,
        description: seed.listing.description,
        propertyType: seed.listing.propertyType,
        city: seed.listing.city,
        neighbourhood: seed.listing.neighbourhood,
        country: meta?.country ?? "—",
        sizeSqm: seed.listing.sizeSqm,
        sleeps: seed.listing.sleeps,
        bedrooms: seed.listing.bedrooms,
        bathrooms: seed.listing.bathrooms,
        floor: seed.listing.floor,
        hasElevator: seed.listing.hasElevator ?? false,
        stepFreeAccess: seed.listing.stepFreeAccess,
        petsAllowed: seed.listing.petsAllowed,
        petTypes: JSON.stringify(seed.listing.petTypes ?? []),
        wfhSetup: seed.listing.wfhSetup,
        wfhDesks: seed.listing.wfhDesks ?? 0,
        hasParking: seed.listing.hasParking ?? false,
        bikeIncluded: seed.listing.bikeIncluded ?? false,
        rooftop: seed.listing.rooftop ?? false,
        balcony: seed.listing.balcony ?? false,
        garden: seed.listing.garden ?? false,
        courtyard: seed.listing.courtyard ?? false,
        piano: seed.listing.piano ?? false,
        pool: seed.listing.pool ?? false,
        gym: false,
        ac: seed.listing.ac ?? false,
        dishwasher: seed.listing.dishwasher ?? false,
        washer: seed.listing.washer ?? false,
        dryer: seed.listing.dryer ?? false,
        availableFrom: new Date(seed.listing.availableFrom),
        availableTo: new Date(seed.listing.availableTo),
        photos: JSON.stringify(seed.listing.photos),
        tags: JSON.stringify(seed.listing.tags),
        paletteHint: palette,
      },
    });
    listingIds[seed.email] = listing.id;
  }

  console.log("Creating sample swap proposals…");
  // Aslı (Istanbul) <-> Maartje (Amsterdam) — accepted, becomes the demo agreement.
  const acceptedProposal = await prisma.swapProposal.create({
    data: {
      proposerId: userIds["asli@demo.swapl"],
      proposerListingId: listingIds["asli@demo.swapl"],
      targetListingId: listingIds["maartje@demo.swapl"],
      dateFrom: new Date("2026-06-04"),
      dateTo: new Date("2026-06-18"),
      message: "We loved the Jordaan when we visited last spring. Pamuk would stay for sitting friends. Would the 4–18 work?",
      status: "ACCEPTED",
    },
  });
  const acceptedAgreement = await prisma.swapAgreement.create({
    data: {
      proposalId: acceptedProposal.id,
      listing1Id: listingIds["asli@demo.swapl"],
      listing2Id: listingIds["maartje@demo.swapl"],
      dateFrom: new Date("2026-06-04"),
      dateTo: new Date("2026-06-18"),
      keyCode1: "1842",
      keyCode2: "9210",
      status: "ACTIVE",
    },
  });
  await prisma.insurancePolicy.create({
    data: {
      agreementId: acceptedAgreement.id,
      provider: "swapl-cover",
      policyNumber: "SC-2026-000001",
      coverageAmount: 150000,
      expiresAt: new Date("2026-07-18"),
    },
  });

  // Tokyo (Haruki) -> Lisbon (Inês), pending
  await prisma.swapProposal.create({
    data: {
      proposerId: userIds["haruki@demo.swapl"],
      proposerListingId: listingIds["haruki@demo.swapl"],
      targetListingId: listingIds["ines@demo.swapl"],
      dateFrom: new Date("2026-09-12"),
      dateTo: new Date("2026-09-26"),
      message: "Two of us, very quiet, no pets. Would love the rooftop in Alfama for two weeks.",
      status: "PENDING",
    },
  });

  // Brooklyn (Marcus) -> CDMX (Carla), countered
  await prisma.swapProposal.create({
    data: {
      proposerId: userIds["marcus@demo.swapl"],
      proposerListingId: listingIds["marcus@demo.swapl"],
      targetListingId: listingIds["carla@demo.swapl"],
      dateFrom: new Date("2026-10-03"),
      dateTo: new Date("2026-10-17"),
      message: "Hoping to bring our terrier. Two adults, no kids.",
      status: "COUNTERED",
      counterDateFrom: new Date("2026-10-10"),
      counterDateTo: new Date("2026-10-24"),
      counterMessage: "Those dates are tight — can we shift a week later? The dog is welcome.",
    },
  });

  // Paris (Élise) -> Marrakesh (Yassir), pending
  await prisma.swapProposal.create({
    data: {
      proposerId: userIds["elise@demo.swapl"],
      proposerListingId: listingIds["elise@demo.swapl"],
      targetListingId: listingIds["yassir@demo.swapl"],
      dateFrom: new Date("2026-05-15"),
      dateTo: new Date("2026-06-05"),
      message: "Three weeks if possible. We'd water the plants and feed the cats next door.",
      status: "PENDING",
    },
  });

  // Berlin (Lina) -> Seoul (Joon), declined
  await prisma.swapProposal.create({
    data: {
      proposerId: userIds["lina@demo.swapl"],
      proposerListingId: listingIds["lina@demo.swapl"],
      targetListingId: listingIds["joon@demo.swapl"],
      dateFrom: new Date("2026-07-01"),
      dateTo: new Date("2026-07-15"),
      message: "Two weeks, two of us, working remotely.",
      status: "DECLINED",
    },
  });

  // a beta signup or two
  await prisma.betaSignup.create({ data: { email: "future-host@demo.swapl" } });
  await prisma.betaSignup.create({ data: { email: "another@demo.swapl" } });

  console.log("Seeding admin + demo subscriptions…");
  // Owner / first admin. Same shared demo password so it's easy to log in
  // during development; rotate this in production immediately.
  await prisma.user.upsert({
    where: { email: "gert@dokuz.ai" },
    create: {
      email: "gert@dokuz.ai",
      name: "Gert (admin)",
      passwordHash,
      verified: true,
      role: "swapl_admin",
    },
    update: { role: "swapl_admin" },
  });

  // Two demo users on paid plans so gates can be tested without Stripe.
  // source = "dev_seed" makes it obvious in the DB and easy to wipe.
  const now = new Date();
  const inOneMonth = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const asliId = userIds["asli@demo.swapl"];
  const maartjeId = userIds["maartje@demo.swapl"];
  if (asliId) {
    await prisma.subscription.create({
      data: {
        userId: asliId, planId: "plus", status: "active",
        stripeCustomerId: "cus_dev_seed_asli",
        currentPeriodStart: now, currentPeriodEnd: inOneMonth,
        source: "dev_seed",
      },
    });
  }
  if (maartjeId) {
    await prisma.subscription.create({
      data: {
        userId: maartjeId, planId: "pro", status: "active",
        stripeCustomerId: "cus_dev_seed_maartje",
        currentPeriodStart: now, currentPeriodEnd: inOneMonth,
        source: "dev_seed",
      },
    });
  }

  console.log(`✅ Seeded ${SEEDS.length} listings + 5 proposals (1 active swap agreement) + 2 beta signups + 3 plans + admin + 2 dev subscriptions.`);
  console.log(`   Login with any seed email + password "${PASSWORD}" (e.g. asli@demo.swapl, maartje@demo.swapl, gert@dokuz.ai).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
