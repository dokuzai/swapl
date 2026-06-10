// Optional AI pass over illustration candidates: keyword filters catch the
// obvious junk (ads, car brochures), but only a model can tell "vintage
// lithograph of the Galata bridge" from "scanned flyer that mentions
// Istanbul". No ANTHROPIC_API_KEY → pass-through, like the rest of lib/ai.

import { getAnthropic, AI_MODEL } from "@/lib/ai/client";
import type { CityPhoto } from "./types";

const MAX_CANDIDATES = 12;

export async function judgeIllustrations(
  city: string,
  country: string,
  candidates: CityPhoto[],
): Promise<CityPhoto[]> {
  const anthropic = getAnthropic();
  if (!anthropic || candidates.length === 0) return candidates;

  const list = candidates
    .slice(0, MAX_CANDIDATES)
    .map((c, i) => `${i}: ${c.alt}`)
    .join("\n");

  try {
    const res = await anthropic.messages.create({
      model: AI_MODEL,
      max_tokens: 200,
      system:
        'You curate hero artwork for a travel site. Given numbered image titles, reply ONLY with strict JSON {"keep":[indices]} — the indices of titles that are clearly artistic depictions (illustration, painting, engraving, vintage postcard art) OF THE CITY itself, ranked best first. Exclude advertisements, product shots, vehicles, brochures, interiors, portraits, and anything not depicting the city.',
      messages: [
        {
          role: "user",
          content: `City: ${city}, ${country}\n\nCandidates:\n${list}`,
        },
      ],
    });
    const text = res.content.find((b) => b.type === "text")?.text ?? "";
    const parsed = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)) as {
      keep?: unknown;
    };
    if (!Array.isArray(parsed.keep)) return candidates;
    const kept = parsed.keep
      .filter((i): i is number => Number.isInteger(i) && i >= 0 && i < candidates.length)
      .map((i) => candidates[i]);
    // The judge saying "none of these" is a real verdict — fall back to the SVG.
    return kept;
  } catch {
    // Judge is best-effort; never let it break the page.
    return candidates;
  }
}
