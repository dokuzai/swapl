import { PrismaClient } from "@/app/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaPg } from "@prisma/adapter-pg";

// On Vercel the client is generated against the Postgres schema, so we must
// always pair it with the Postgres adapter — even before DATABASE_URL is set
// (e.g. during `next build`'s page-data collection). Locally the client is
// generated against the SQLite schema and we use better-sqlite3.
const IS_POSTGRES_CLIENT = Boolean(process.env.VERCEL) || (process.env.DATABASE_URL ?? "").startsWith("postgres");

function makeAdapter() {
  if (IS_POSTGRES_CLIENT) {
    // Build-time may run with no DATABASE_URL; pg will throw at first query,
    // not at construction, which is what we want.
    return new PrismaPg(process.env.DATABASE_URL ?? "postgres://placeholder@localhost/placeholder");
  }
  const raw = process.env.DATABASE_URL ?? "file:./dev.db";
  const path = raw.startsWith("file:") ? raw : `file:${raw}`;
  return new PrismaBetterSqlite3({ url: path });
}

declare global {
  // eslint-disable-next-line no-var
  var __swaplPrisma: PrismaClient | undefined;
}

// Lazy proxy so importing this module never instantiates a Prisma client.
// Required because `next build` walks the import graph of every route to
// collect page data, and we don't want a build-time DB connection.
let cached: PrismaClient | null = null;

function getClient(): PrismaClient {
  if (cached) return cached;
  if (global.__swaplPrisma) {
    cached = global.__swaplPrisma;
    return cached;
  }
  cached = new PrismaClient({ adapter: makeAdapter() });
  if (process.env.NODE_ENV !== "production") global.__swaplPrisma = cached;
  return cached;
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    const client = getClient() as unknown as Record<PropertyKey, unknown>;
    const value = Reflect.get(client, prop, receiver);
    return typeof value === "function" ? value.bind(client) : value;
  },
}) as PrismaClient;
