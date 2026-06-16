// AI property-document analysis for owner verification (DOK-186). SERVER-ONLY.
//
// POTENZIA (does not replace) the optional DOK-162 owner-proof flow: when a host
// submits proof documents we read them with a VISION model and PROPOSE a
// classification — is the titleholder a natural person (owner, or a tenant with
// the right to host) or a BUSINESS entity (company, VAT/P.IVA, agency, property
// manager, hotel/structure)? The admin always confirms or overrides.
//
// Env-gated like every other AI module (lib/ai): with no resolvable key — or a
// model with no vision capability — classifyPropertyDocument returns
// { classification: "uncertain", aiDisabled: true } WITHOUT throwing, so the
// listing falls back to pure DOK-162 manual admin review. No auto-block ever
// happens without the AI; no error is surfaced to the submitter.
//
// PRIVACY: the prompt extracts ONLY what the eligibility decision needs — the
// classification, the entity type, and the titleholder name (for an
// owner/tenant match). It must NOT echo back addresses, document numbers, dates
// of birth, or any other PII, and we never persist the document content.

import { resolveAIConfig, type ResolveOptions, type ProviderId } from "./providers";
import Anthropic from "@anthropic-ai/sdk";

export type PropertyDocClassification =
  | "private_owner"
  | "private_tenant"
  | "business"
  | "uncertain";

export type PropertyDocEntityType = "person" | "company" | "agency" | "hotel" | "unknown";

export type PropertyDocInput = {
  /** URLs of the uploaded proof documents/images. */
  documentUrls: string[];
  /** Host-declared document kind, if known. */
  documentType?: "deed" | "lease" | "other";
  /** Light listing context to help disambiguate (NO PII). */
  listingContext?: {
    title?: string;
    city?: string;
    country?: string;
    /** Host's account display name, used only to match the titleholder. */
    hostName?: string;
  };
};

export type PropertyDocResult = {
  classification: PropertyDocClassification;
  /** 0..1 model confidence. 0 when disabled/unknown. */
  confidence: number;
  entityType: PropertyDocEntityType;
  /** Redacted titleholder name for the owner/tenant match, if legible. */
  ownerName?: string;
  /** Short, bounded, explainable reasons — NO PII. */
  reasons: string[];
  /** True when AI was unconfigured or not vision-capable; flow degrades to DOK-162. */
  aiDisabled?: boolean;
  source: "ai" | "disabled";
};

const CLASSIFICATIONS: readonly PropertyDocClassification[] = [
  "private_owner",
  "private_tenant",
  "business",
  "uncertain",
];
const ENTITY_TYPES: readonly PropertyDocEntityType[] = [
  "person",
  "company",
  "agency",
  "hotel",
  "unknown",
];

// Vision is only wired for Anthropic's messages API here (image blocks). The
// OpenAI-compatible providers (kimi/openai) go through the text-only chat()
// helper in providers.ts, which cannot see a document — so for those we degrade
// gracefully rather than pretend to analyse an image.
function isVisionCapable(provider: ProviderId): boolean {
  return provider === "anthropic";
}

const SYSTEM_PROMPT = `You analyse a PROPERTY-OWNERSHIP or TENANCY proof document for a home-swap marketplace (swapl). Your ONLY job is to classify WHO the titleholder is, so the platform can keep it a community of individuals — not businesses.

Decide between:
- "private_owner": a NATURAL PERSON who owns the home (property deed, title, ownership tax record in an individual's name).
- "private_tenant": a NATURAL PERSON who rents/leases the home and may host (a lease/rental contract naming an individual as tenant). Hosting is allowed but they do NOT own it.
- "business": a COMPANY or commercial entity is the titleholder/operator — signs of a registered company name, VAT / P.IVA / company registration number, "S.r.l."/"Ltd"/"GmbH"/"SAS"/"LLC", a property-management or real-estate agency, or a hotel / guesthouse / aparthotel / commercial accommodation operator.
- "uncertain": the document is illegible, irrelevant, or you cannot reasonably tell.

Distinguish a PERSON from a BUSINESS ENTITY. A landlord who is a private individual is NOT a business. A property manager, agency, company, or hospitality operator IS a business.

PRIVACY — STRICT: Do NOT output addresses, document/registration numbers, tax IDs, dates of birth, or any sensitive personal data. The "ownerName" may be the titleholder's name only (for a match); "reasons" must be SHORT, factual, and contain NO personal data beyond an entity-type cue.

Reply ONLY with strict JSON, no prose:
{ "classification": "private_owner|private_tenant|business|uncertain", "confidence": <0..1>, "entityType": "person|company|agency|hotel|unknown", "ownerName": "<titleholder name or empty>", "reasons": ["<short cue>", "..."] }`;

export async function classifyPropertyDocument(
  input: PropertyDocInput,
  opts: ResolveOptions = {},
): Promise<PropertyDocResult> {
  const config = resolveAIConfig(opts);
  if (!config || !isVisionCapable(config.provider) || input.documentUrls.length === 0) {
    return disabled();
  }

  try {
    const client = new Anthropic({ apiKey: config.apiKey });

    // Fetch documents and attach the legible images as vision blocks. We cap the
    // count + size so a malicious URL cannot blow up the request, and skip any
    // non-image / unfetchable URL gracefully.
    const imageBlocks = await buildImageBlocks(input.documentUrls.slice(0, 4));
    if (imageBlocks.length === 0) {
      // Nothing the model can see (e.g. all PDFs/links it can't fetch) — degrade
      // to manual review rather than guessing from context alone.
      return disabled();
    }

    const contextLine = JSON.stringify({
      declaredDocumentType: input.documentType ?? "unknown",
      listing: {
        title: input.listingContext?.title?.slice(0, 120),
        city: input.listingContext?.city,
        country: input.listingContext?.country,
        hostName: input.listingContext?.hostName?.slice(0, 80),
      },
    });

    const out = await client.messages.create({
      model: config.model,
      max_tokens: 400,
      temperature: 0,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            ...imageBlocks,
            {
              type: "text",
              text: `Context (no PII to echo back): ${contextLine}\nClassify the titleholder. Reply with strict JSON only.`,
            },
          ],
        },
      ],
    });

    const text = out.content.map((c) => (c.type === "text" ? c.text : "")).join("");
    return normalize(text);
  } catch (err) {
    console.error("[ai:property-doc]", err);
    // Best-effort: any failure degrades to manual review, never blocks the host.
    return disabled();
  }
}

type ImageBlock = {
  type: "image";
  source: { type: "base64"; media_type: "image/jpeg" | "image/png" | "image/webp" | "image/gif"; data: string };
};

const SUPPORTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB per document, Anthropic vision cap territory

// SECURITY (SSRF): these document URLs come from user input. Only fetch from the
// UploadThing CDN where our own uploads live — never arbitrary hosts (which would
// allow hitting cloud metadata endpoints / internal services). `z.string().url()`
// at the route boundary is NOT sufficient on its own.
function isAllowedDocumentUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:") return false;
    const host = u.hostname.toLowerCase();
    return host === "utfs.io" || host.endsWith(".ufs.sh") || host.endsWith(".utfs.io");
  } catch {
    return false;
  }
}

async function buildImageBlocks(urls: string[]): Promise<ImageBlock[]> {
  const blocks: ImageBlock[] = [];
  for (const url of urls) {
    if (!isAllowedDocumentUrl(url)) continue;
    try {
      // redirect:"error" blocks an allowed host from bouncing us to an internal target.
      const res = await fetch(url, { signal: AbortSignal.timeout(10_000), redirect: "error" });
      if (!res.ok) continue;
      const contentType = (res.headers.get("content-type") ?? "").split(";")[0].trim();
      if (!(SUPPORTED_IMAGE_TYPES as readonly string[]).includes(contentType)) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.byteLength === 0 || buf.byteLength > MAX_IMAGE_BYTES) continue;
      blocks.push({
        type: "image",
        source: {
          type: "base64",
          media_type: contentType as ImageBlock["source"]["media_type"],
          data: buf.toString("base64"),
        },
      });
    } catch {
      // Skip unfetchable / timed-out documents; degrade gracefully.
    }
  }
  return blocks;
}

function disabled(): PropertyDocResult {
  return {
    classification: "uncertain",
    confidence: 0,
    entityType: "unknown",
    reasons: [],
    aiDisabled: true,
    source: "disabled",
  };
}

function normalize(raw: string): PropertyDocResult {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(extractJson(raw)) as Record<string, unknown>;
  } catch {
    return disabled();
  }

  const classification = (CLASSIFICATIONS as readonly string[]).includes(
    String(parsed.classification),
  )
    ? (parsed.classification as PropertyDocClassification)
    : "uncertain";

  const entityType = (ENTITY_TYPES as readonly string[]).includes(String(parsed.entityType))
    ? (parsed.entityType as PropertyDocEntityType)
    : "unknown";

  let confidence = Number(parsed.confidence);
  if (!Number.isFinite(confidence)) confidence = 0;
  confidence = Math.max(0, Math.min(1, confidence));

  const ownerNameRaw = typeof parsed.ownerName === "string" ? parsed.ownerName.trim() : "";
  const ownerName = ownerNameRaw ? ownerNameRaw.slice(0, 120) : undefined;

  const reasons = normalizeReasons(parsed.reasons);

  return {
    classification,
    confidence,
    entityType,
    ownerName,
    reasons,
    source: "ai",
  };
}

function normalizeReasons(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const r of raw.slice(0, 6)) {
    if (typeof r !== "string") continue;
    const s = r.trim().slice(0, 160);
    if (s) out.push(s);
  }
  return out;
}

function extractJson(text: string): string {
  const match = text.match(/\{[\s\S]*\}/);
  return match ? match[0] : text;
}
