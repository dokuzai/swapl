// AI-drafted listing copy. Given a small bag of structured form-state facts,
// returns { title, description } in the same editorial voice as the seeded
// listings (Cihangir flat with Bosphorus view, etc.).
//
// Falls back to a deterministic hand-built sentence so the listing flow is
// never blocked when no AI key is configured.

import { resolveAIConfig, chat, type ResolveOptions } from "./providers";
import { propertyLabel, type PropertyType } from "@/lib/types";

export type ListingFacts = {
  city: string;
  neighbourhood: string;
  country?: string;
  propertyType: PropertyType;
  sizeSqm: number;
  sleeps: number;
  bedrooms: number;
  bathrooms: number;
  floor?: number | null;
  hasElevator?: boolean;
  stepFreeAccess?: boolean;
  petsAllowed?: boolean;
  petTypes?: string[];
  wfhSetup?: boolean;
  wfhDesks?: number;
  amenities?: string[]; // e.g. ["Balcony", "Rooftop", "Bike incl."]
  availableFrom?: string;
  availableTo?: string;
  hostNotes?: string; // optional free-text the user typed before clicking generate
};

export type ListingDraft = {
  title: string;
  description: string;
  source: "ai" | "fallback";
};

const SYSTEM_PROMPT = `You write swapl home-swap listings. Voice: editorial, warm, specific, lightly Italian-bistro-poetic — never marketing-speak.

Reply ONLY with strict JSON of the shape:
{ "title": "<= 80 chars", "description": "200–500 words across 2–4 short paragraphs, no headings, no bullet lists, no emoji" }

Rules:
- Title is concrete and place-aware (e.g. "Cihangir flat with Bosphorus view", not "Beautiful 2-bed apartment").
- Description must mention the neighbourhood by name, the type of building, the standout sensory detail, and any practical note (lift / step-free / pets / WFH desks). Don't oversell.
- No hashtags. No bullet points. No "discover" / "stunning" / "perfect" / "imagine yourself". No prices.
- If the host left notes, weave them in faithfully — don't invent details.`;

export async function draftListingCopy(facts: ListingFacts, opts: ResolveOptions = {}): Promise<ListingDraft> {
  const config = resolveAIConfig(opts);
  if (!config) return fallback(facts);

  const userPrompt = JSON.stringify({
    city: facts.city,
    neighbourhood: facts.neighbourhood,
    country: facts.country,
    propertyType: facts.propertyType,
    sizeSqm: facts.sizeSqm,
    sleeps: facts.sleeps,
    bedrooms: facts.bedrooms,
    bathrooms: facts.bathrooms,
    floor: facts.floor ?? null,
    hasElevator: facts.hasElevator ?? false,
    stepFreeAccess: facts.stepFreeAccess ?? false,
    petsAllowed: facts.petsAllowed ?? false,
    petTypes: facts.petTypes ?? [],
    wfhSetup: facts.wfhSetup ?? false,
    wfhDesks: facts.wfhDesks ?? 0,
    amenities: facts.amenities ?? [],
    availableWindow: facts.availableFrom && facts.availableTo ? `${facts.availableFrom} → ${facts.availableTo}` : undefined,
    hostNotes: facts.hostNotes ?? "",
  });

  try {
    const text = await chat({
      config,
      responseJson: true,
      maxTokens: 700,
      temperature: 0.6,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
    });
    const parsed = JSON.parse(extractJson(text));
    const title = sanitiseTitle(parsed.title, facts);
    const description = sanitiseDescription(parsed.description, facts);
    if (!title || !description) return fallback(facts);
    return { title, description, source: "ai" };
  } catch (err) {
    console.error("[ai:listing-content]", err);
    return fallback(facts);
  }
}

function sanitiseTitle(raw: unknown, facts: ListingFacts): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().replace(/\s+/g, " ");
  if (trimmed.length < 6) return null;
  if (trimmed.length > 120) return trimmed.slice(0, 117) + "…";
  // Reject obviously generic outputs.
  if (/beautiful|stunning|cozy|gorgeous/i.test(trimmed) && !trimmed.includes(facts.neighbourhood)) {
    return null;
  }
  return trimmed;
}

function sanitiseDescription(raw: unknown, facts: ListingFacts): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (trimmed.length < 80) return null;
  if (trimmed.length > 4000) return trimmed.slice(0, 3997) + "…";
  // Sanity check the place is actually mentioned somewhere.
  if (!trimmed.toLowerCase().includes(facts.neighbourhood.toLowerCase()) &&
      !trimmed.toLowerCase().includes(facts.city.toLowerCase())) {
    return null;
  }
  return trimmed;
}

function fallback(f: ListingFacts): ListingDraft {
  const title = `${f.neighbourhood} ${propertyLabel(f.propertyType).toLowerCase()} in ${f.city}`;
  const beds = `${f.bedrooms}-bedroom`;
  const stairs = f.stepFreeAccess
    ? "Step-free from the street"
    : f.hasElevator
      ? "Elevator building"
      : f.floor && f.floor > 1
        ? `Walk-up to the ${ordinal(f.floor)} floor`
        : "Ground floor";
  const wfh = f.wfhSetup ? `WFH desk${(f.wfhDesks ?? 1) > 1 ? `s for ${f.wfhDesks}` : ""}` : "Quiet for a long stay";
  const pets = f.petsAllowed
    ? `Pets welcome${f.petTypes && f.petTypes.length ? ` (${f.petTypes.join(", ")})` : ""}`
    : "Pet-free home";
  const extras = f.amenities && f.amenities.length ? f.amenities.slice(0, 3).join(", ") : "";

  const description = [
    `A ${beds} ${propertyLabel(f.propertyType).toLowerCase()} in ${f.neighbourhood}, ${f.city}. ${f.sizeSqm}m², sleeps ${f.sleeps}.`,
    `${stairs}. ${wfh}. ${pets}.${extras ? ` ${extras}.` : ""}`,
    f.hostNotes ? f.hostNotes.trim() : "Tell guests what makes the neighbourhood feel like home — the bakery downstairs, the morning light, the corner shop that always remembers your order.",
  ].join("\n\n");

  return { title, description, source: "fallback" };
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

function extractJson(text: string): string {
  const match = text.match(/\{[\s\S]*\}/);
  return match ? match[0] : text;
}
