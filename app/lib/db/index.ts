export { prisma } from "./prisma";

// Helpers for the JSON-encoded TEXT columns used because SQLite has no array type.
export function parseJSON<T = unknown>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

export function stringifyJSON(value: unknown): string {
  return JSON.stringify(value);
}
