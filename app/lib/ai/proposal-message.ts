// AI-drafted swap-proposal cover messages. Reads a small bag of facts about
// who's swapping with whom and writes a short, sincere note explaining why
// this swap fits.
//
// Falls back to a templated message that name-checks the most concrete
// shared signal so the user has *something* to send even when AI is offline.

import { resolveAIConfig, chat, type ResolveOptions } from "./providers";

export type ProposalFacts = {
  proposer: { name: string | null; cityFrom: string; neighbourhoodFrom: string };
  proposerListing: {
    sizeSqm: number;
    sleeps: number;
    petsAllowed: boolean;
    wfhSetup: boolean;
    stepFreeAccess: boolean;
    summary?: string;
  };
  targetListing: {
    title: string;
    cityTo: string;
    neighbourhoodTo: string;
    sizeSqm: number;
    sleeps: number;
    petsAllowed: boolean;
    wfhSetup: boolean;
    stepFreeAccess: boolean;
    bedrooms: number;
    propertyType: string;
  };
  dateFrom?: string;
  dateTo?: string;
  hostNotes?: string;
};

export type ProposalDraft = {
  message: string;
  source: "ai" | "fallback";
};

const SYSTEM_PROMPT = `You write short, sincere swap-proposal cover messages on swapl.

Reply ONLY with strict JSON of the shape: { "message": "<= 90 words, 2 short paragraphs max" }.

Voice: warm, specific, never marketing-speak. First-person from the proposer.

Rules:
- Open by saying who you are and why their place fits (mention one concrete detail: neighbourhood, view, WFH desk, step-free, pet, layout).
- Mention what you offer back in one sentence (your home's size, sleeps, neighbourhood, one signature trait).
- Mention the dates plainly.
- No flattery, no exclamation marks beyond one polite use, no emoji, no hashtags.
- If host notes exist, weave them in faithfully.`;

export async function draftProposalMessage(facts: ProposalFacts, opts: ResolveOptions = {}): Promise<ProposalDraft> {
  const config = resolveAIConfig(opts);
  if (!config) return fallback(facts);

  try {
    const text = await chat({
      config,
      responseJson: true,
      maxTokens: 350,
      temperature: 0.55,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: JSON.stringify(facts) },
      ],
    });
    const parsed = JSON.parse(extractJson(text));
    const message = sanitise(parsed.message, facts);
    if (!message) return fallback(facts);
    return { message, source: "ai" };
  } catch (err) {
    console.error("[ai:proposal-message]", err);
    return fallback(facts);
  }
}

function sanitise(raw: unknown, _facts: ProposalFacts): string | null {
  // Lenient by design: the user can edit before sending. We only reject
  // empty / runaway-length output.
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (trimmed.length < 20 || trimmed.length > 1500) return null;
  return trimmed;
}

function fallback(f: ProposalFacts): ProposalDraft {
  const yourName = f.proposer.name ?? "Hi";
  const overlapBits: string[] = [];
  if (f.proposerListing.petsAllowed && f.targetListing.petsAllowed) overlapBits.push("we both keep pet-friendly homes");
  if (f.proposerListing.wfhSetup && f.targetListing.wfhSetup) overlapBits.push("we'd both be able to keep working through the trip");
  if (f.proposerListing.stepFreeAccess && f.targetListing.stepFreeAccess) overlapBits.push("step-free access matters to us too");

  const overlapLine = overlapBits.length ? ` From a quick read of your listing, ${overlapBits[0]}.` : "";
  const dates = f.dateFrom && f.dateTo ? `We were thinking ${f.dateFrom} → ${f.dateTo}.` : "";

  const message = [
    `${yourName} from ${f.proposer.neighbourhoodFrom}, ${f.proposer.cityFrom}. We loved the look of your ${f.targetListing.neighbourhoodTo} ${f.targetListing.propertyType.toLowerCase()} — ${f.targetListing.sizeSqm}m² for ${f.targetListing.sleeps} fits us perfectly.${overlapLine}`,
    `In return we'd offer our ${f.proposerListing.sizeSqm}m² home (sleeps ${f.proposerListing.sleeps})${f.proposerListing.summary ? ` — ${f.proposerListing.summary}` : ""}. ${dates}`,
  ].filter(Boolean).join("\n\n");
  return { message, source: "fallback" };
}

function extractJson(text: string): string {
  const match = text.match(/\{[\s\S]*\}/);
  return match ? match[0] : text;
}
