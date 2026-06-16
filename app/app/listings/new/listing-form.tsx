"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CITIES } from "@/lib/cities";
import { PROPERTY_TYPES, propertyTypeKey, type PropertyType } from "@/lib/types";
import { useT } from "@/lib/i18n/client";
import type { DictKey } from "@/lib/i18n/dict-en";
import { CityIllust, type CityMotif } from "@/components/illustrations";
import type { Palette } from "@/components/illustrations";
import type { Postcard } from "@/lib/ai/postcard-types";
import { CityCombobox } from "@/components/listing/city-combobox";
import { type PublishAckMode } from "@/lib/listing/publish-ack";

// Translation function shape shared with the step sub-components.
type T = (key: DictKey, vars?: Record<string, string | number>) => string;

type FormState = {
  // Step 1 — Location
  city: string;
  neighbourhood: string;
  country: string;
  address: string;
  floor: number;
  // Step 2 — Space
  propertyType: PropertyType;
  spaceType: "entire_place" | "private_room";
  roomsOffered: number;
  sizeSqm: number;
  bedrooms: number;
  sleeps: number;
  bathrooms: number;
  // Step 3 — Accessibility & pets
  stepFreeAccess: boolean;
  hasElevator: boolean;
  petsAllowed: boolean;
  petTypes: { dogs: boolean; cats: boolean; other: boolean };
  // Step 4 — Work & amenities
  wfhSetup: boolean;
  wfhDesks: number;
  bikeIncluded: boolean;
  hasParking: boolean;
  balcony: boolean;
  rooftop: boolean;
  garden: boolean;
  courtyard: boolean;
  piano: boolean;
  pool: boolean;
  gym: boolean;
  ac: boolean;
  dishwasher: boolean;
  washer: boolean;
  dryer: boolean;
  // Step 5 — Availability
  availableFrom: string;
  availableTo: string;
  minStayDays: number;
  maxStayDays: number;
  // Step 6 — Photos
  photos: string[];
  // Step 7 — Description
  title: string;
  description: string;
};

const TODAY = new Date();
TODAY.setHours(0, 0, 0, 0);
const PLUS_60 = new Date(TODAY.getTime() + 60 * 24 * 60 * 60 * 1000);
const PLUS_90 = new Date(TODAY.getTime() + 90 * 24 * 60 * 60 * 1000);

const INITIAL: FormState = {
  city: "",
  neighbourhood: "",
  country: "",
  address: "",
  floor: 0,
  propertyType: "APARTMENT",
  spaceType: "entire_place",
  roomsOffered: 1,
  sizeSqm: 80,
  bedrooms: 2,
  sleeps: 3,
  bathrooms: 1,
  stepFreeAccess: false,
  hasElevator: false,
  petsAllowed: false,
  petTypes: { dogs: false, cats: false, other: false },
  wfhSetup: false,
  wfhDesks: 0,
  bikeIncluded: false,
  hasParking: false,
  balcony: false,
  rooftop: false,
  garden: false,
  courtyard: false,
  piano: false,
  pool: false,
  gym: false,
  ac: false,
  dishwasher: false,
  washer: false,
  dryer: false,
  availableFrom: PLUS_60.toISOString().slice(0, 10),
  availableTo: PLUS_90.toISOString().slice(0, 10),
  minStayDays: 7,
  maxStayDays: 30,
  photos: [],
  title: "",
  description: "",
};

// Step titles as dict keys; translated at render so the wizard localizes.
const STEP_KEYS: DictKey[] = [
  "wizard.step.location",
  "wizard.step.space",
  "wizard.step.access",
  "wizard.step.amenities",
  "wizard.step.availability",
  "wizard.step.photos",
  "wizard.step.description",
  "wizard.step.review",
];

// Serializable slice of a Listing the edit page passes in. JSON-string columns
// (photos/tags/petTypes) must already be parsed into arrays by the caller.
export type ListingEditInitial = {
  id: string;
  title: string;
  description: string;
  propertyType: PropertyType;
  city: string;
  neighbourhood: string;
  country: string;
  address: string | null;
  floor: number | null;
  spaceType: "entire_place" | "private_room";
  roomsOffered: number | null;
  sizeSqm: number;
  sleeps: number;
  bedrooms: number;
  bathrooms: number;
  stepFreeAccess: boolean;
  hasElevator: boolean;
  petsAllowed: boolean;
  petTypes: string[];
  wfhSetup: boolean;
  wfhDesks: number;
  bikeIncluded: boolean;
  hasParking: boolean;
  balcony: boolean;
  rooftop: boolean;
  garden: boolean;
  courtyard: boolean;
  piano: boolean;
  pool: boolean;
  gym: boolean;
  ac: boolean;
  dishwasher: boolean;
  washer: boolean;
  dryer: boolean;
  availableFrom: string; // ISO datetime
  availableTo: string; // ISO datetime
  minStayDays: number;
  maxStayDays: number;
  photos: string[];
  tags: string[];
};

function stateFromListing(l: ListingEditInitial): FormState {
  return {
    city: l.city,
    neighbourhood: l.neighbourhood,
    country: l.country,
    address: l.address ?? "",
    floor: l.floor ?? 0,
    propertyType: l.propertyType,
    spaceType: l.spaceType ?? "entire_place",
    roomsOffered: l.roomsOffered ?? 1,
    sizeSqm: l.sizeSqm,
    bedrooms: l.bedrooms,
    sleeps: l.sleeps,
    bathrooms: l.bathrooms,
    stepFreeAccess: l.stepFreeAccess,
    hasElevator: l.hasElevator,
    petsAllowed: l.petsAllowed,
    petTypes: {
      dogs: l.petTypes.includes("dogs"),
      cats: l.petTypes.includes("cats"),
      other: l.petTypes.includes("other"),
    },
    wfhSetup: l.wfhSetup,
    wfhDesks: l.wfhDesks,
    bikeIncluded: l.bikeIncluded,
    hasParking: l.hasParking,
    balcony: l.balcony,
    rooftop: l.rooftop,
    garden: l.garden,
    courtyard: l.courtyard,
    piano: l.piano,
    pool: l.pool,
    gym: l.gym,
    ac: l.ac,
    dishwasher: l.dishwasher,
    washer: l.washer,
    dryer: l.dryer,
    availableFrom: l.availableFrom.slice(0, 10),
    availableTo: l.availableTo.slice(0, 10),
    minStayDays: l.minStayDays,
    maxStayDays: l.maxStayDays,
    photos: l.photos,
    title: l.title,
    description: l.description,
  };
}

export default function ListingForm({ listing }: { listing?: ListingEditInitial }) {
  const router = useRouter();
  const t = useT();
  const editing = Boolean(listing);
  const [step, setStep] = useState(0);
  const [state, setState] = useState<FormState>(() => (listing ? stateFromListing(listing) : INITIAL));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // Publish acknowledgment (DOK-162) — only at first publish (POST). A mandatory
  // self-attestation; the publish button stays blocked until the box is ticked.
  // Editing reuses this form via PUT, which the backend does not gate on the ack.
  const [publishMode, setPublishMode] = useState<PublishAckMode>("entire_home_while_away");
  const [ackAccepted, setAckAccepted] = useState(false);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setState((s) => ({ ...s, [key]: value }));
  }

  function next() {
    setError(null);
    const v = validateStep(step, state);
    if (v) {
      setError(t(v));
      return;
    }
    setStep((s) => Math.min(STEP_KEYS.length - 1, s + 1));
  }

  function prev() {
    setError(null);
    setStep((s) => Math.max(0, s - 1));
  }

  function submit() {
    const v = validateStep(step, state);
    if (v) return setError(t(v));

    // Publishing (create) requires the acknowledgment; editing does not.
    if (!editing && !ackAccepted) {
      return setError(t("wizard.ackRequired"));
    }

    const petTypes = (Object.keys(state.petTypes) as Array<keyof FormState["petTypes"]>).filter(
      (k) => state.petTypes[k]
    );

    const payload = {
      title: state.title,
      description: state.description,
      propertyType: state.propertyType,
      spaceType: state.spaceType,
      roomsOffered: state.spaceType === "private_room" ? state.roomsOffered : undefined,
      city: state.city,
      neighbourhood: state.neighbourhood,
      country: state.country,
      address: state.address || undefined,
      sizeSqm: state.sizeSqm,
      sleeps: state.sleeps,
      bedrooms: state.bedrooms,
      bathrooms: state.bathrooms,
      floor: state.floor,
      hasElevator: state.hasElevator,
      stepFreeAccess: state.stepFreeAccess,
      petsAllowed: state.petsAllowed,
      petTypes,
      wfhSetup: state.wfhSetup,
      wfhDesks: state.wfhDesks,
      hasParking: state.hasParking,
      bikeIncluded: state.bikeIncluded,
      rooftop: state.rooftop,
      balcony: state.balcony,
      garden: state.garden,
      courtyard: state.courtyard,
      piano: state.piano,
      pool: state.pool,
      gym: state.gym,
      ac: state.ac,
      dishwasher: state.dishwasher,
      washer: state.washer,
      dryer: state.dryer,
      availableFrom: state.availableFrom,
      availableTo: state.availableTo,
      minStayDays: state.minStayDays,
      maxStayDays: state.maxStayDays,
      photos: state.photos,
      // Free-text tags aren't editable in the form yet — keep what the
      // listing already has when editing, empty on create.
      tags: listing?.tags ?? [],
      // Publish acknowledgment (DOK-162) — required on create, ignored on PUT.
      ...(editing ? {} : { ackAccepted, mode: publishMode }),
    };

    start(async () => {
      const res = await fetch(listing ? `/api/listings/${listing.id}` : "/api/listings", {
        method: listing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const { id } = (await res.json()) as { id: string };
        router.push(`/listings/${id}`);
        router.refresh();
      } else {
        const j = await res.json().catch(() => ({}));
        // Backend rejects a missing/invalid ack with a 400 PUBLISH_ACK_REQUIRED.
        if (j.error === "PUBLISH_ACK_REQUIRED") {
          setError(t("wizard.ackRequired"));
        } else {
          setError(j.error ?? t(listing ? "wizard.errorSave" : "wizard.errorPublish"));
        }
      }
    });
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[280px_1fr]">
      {/* When editing, every step already holds valid data — allow free jumps. */}
      <Sidebar step={step} onJump={(i) => (editing || i < step) && setStep(i)} freeJump={editing} t={t} />

      <div className="surface-card p-7">
        <div className="font-mono text-[10px] uppercase tracking-[.1em] mb-1.5" style={{ color: "var(--navy-3)" }}>
          {t("wizard.stepOf", { n: step + 1, total: STEP_KEYS.length })}
        </div>
        <h2 className="font-display text-2xl tracking-[-0.01em] mb-6">{t(STEP_KEYS[step])}</h2>

        {step === 0 && <LocationStep state={state} set={set} t={t} />}
        {step === 1 && <SpaceStep state={state} set={set} t={t} />}
        {step === 2 && <AccessibilityStep state={state} set={set} t={t} />}
        {step === 3 && <AmenitiesStep state={state} set={set} t={t} />}
        {step === 4 && <AvailabilityStep state={state} set={set} t={t} />}
        {step === 5 && <PhotosStep state={state} set={set} t={t} />}
        {step === 6 && <DescriptionStep state={state} set={set} t={t} />}
        {step === 7 && (
          <ReviewStep
            state={state}
            editing={editing}
            publishMode={publishMode}
            onModeChange={setPublishMode}
            ackAccepted={ackAccepted}
            onAckChange={setAckAccepted}
            t={t}
          />
        )}

        {error && <p className="text-sm mt-4" style={{ color: "#dc2626" }}>{error}</p>}

        <div className="flex items-center justify-between mt-8 gap-3">
          <button onClick={prev} disabled={step === 0} className="pill-ghost disabled:opacity-40">
            {t("wizard.back")}
          </button>
          {step < STEP_KEYS.length - 1 ? (
            <button onClick={next} className="pill-primary">
              {t("wizard.continue")}
            </button>
          ) : (
            <button onClick={submit} disabled={pending || (!editing && !ackAccepted)} className="pill-primary disabled:opacity-40">
              {pending ? t(editing ? "wizard.saving" : "wizard.publishing") : t(editing ? "wizard.saveChanges" : "wizard.publish")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Sidebar({ step, onJump, freeJump = false, t }: { step: number; onJump: (i: number) => void; freeJump?: boolean; t: T }) {
  return (
    <aside className="lg:sticky lg:top-24 lg:self-start">
      <ol className="space-y-1">
        {STEP_KEYS.map((labelKey, i) => {
          const done = i < step;
          const current = i === step;
          return (
            <li key={labelKey}>
              <button
                onClick={() => onJump(i)}
                className="w-full text-left rounded-lg px-3 py-2 text-sm flex items-center gap-3 transition-colors"
                style={{
                  background: current ? "var(--pink-light)" : "transparent",
                  color: current ? "var(--navy)" : done ? "var(--navy-2)" : "var(--navy-3)",
                  cursor: freeJump || i <= step ? "pointer" : "default",
                }}
              >
                <span
                  className="w-6 h-6 rounded-full grid place-items-center font-mono text-[11px]"
                  style={{
                    background: done ? "var(--pink)" : current ? "var(--pink)" : "var(--cream-2)",
                    color: done || current ? "#fff" : "var(--navy-3)",
                  }}
                >
                  {done ? "✓" : i + 1}
                </span>
                {t(labelKey)}
              </button>
            </li>
          );
        })}
      </ol>
    </aside>
  );
}

// Returns a dict key for the first failing rule on a step, or null if valid.
function validateStep(step: number, s: FormState): DictKey | null {
  if (step === 0) {
    if (!s.city) return "wizard.err.city";
    if (!s.neighbourhood) return "wizard.err.neighbourhood";
    if (!s.country) return "wizard.err.country";
  }
  if (step === 1) {
    if (s.sizeSqm < 20) return "wizard.err.size";
    if (s.sleeps < 1) return "wizard.err.sleeps";
  }
  if (step === 4) {
    if (new Date(s.availableTo) <= new Date(s.availableFrom))
      return "wizard.err.dates";
  }
  if (step === 6) {
    if (s.title.trim().length < 4) return "wizard.err.titleShort";
    if (s.description.trim().length < 20) return "wizard.err.descShort";
  }
  return null;
}

// --------------------- step components ---------------------

function LocationStep({ state, set, t }: { state: FormState; set: <K extends keyof FormState>(k: K, v: FormState[K]) => void; t: T }) {
  const cityMatch = CITIES.find((c) => c.name.toLowerCase() === state.city.toLowerCase());
  const [customCity, setCustomCity] = useState("");
  const [art, setArt] = useState<{
    city: string;
    palette: Palette;
    motif: CityMotif[];
    postcard: Postcard | null;
    source: "ai" | "fallback" | "preset" | "cache";
  } | null>(null);
  const [genState, setGenState] = useState<"idle" | "loading" | "error">("idle");

  async function generateCover(city: string, country?: string) {
    if (!city) return;
    setGenState("loading");
    try {
      const res = await fetch("/api/ai/city-illustration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ city, country }),
      });
      if (!res.ok) throw new Error(await res.text());
      const j = (await res.json()) as {
        city: string;
        palette: Palette;
        motif: CityMotif[];
        postcard?: Postcard | null;
        source: "ai" | "fallback" | "preset" | "cache";
      };
      setArt({
        city: j.city,
        palette: j.palette,
        motif: j.motif ?? [],
        postcard: j.postcard ?? null,
        source: j.source,
      });
      setGenState("idle");
    } catch {
      setGenState("error");
    }
  }

  return (
    <div className="space-y-5">
      <Field label={t("wizard.loc.featuredCity")}>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {CITIES.map((c) => (
            <button
              key={c.name}
              type="button"
              className="text-left p-3 rounded-xl border transition-all"
              onClick={async () => {
                set("city", c.name);
                set("country", c.country);
                setCustomCity("");
                // Pull the preset postcard so the preview updates immediately.
                await generateCover(c.name, c.country);
              }}
              style={
                state.city === c.name
                  ? { borderColor: "var(--pink)", background: "var(--pink-light)" }
                  : { borderColor: "var(--line)", background: "var(--card-bg)" }
              }
            >
              <div className="font-display text-base">{c.name}</div>
              <div className="text-xs" style={{ color: "var(--navy-3)" }}>{c.country}</div>
            </button>
          ))}
        </div>
      </Field>

      <div className="rounded-xl border p-4" style={{ borderColor: "var(--line)", background: "var(--cream-2)" }}>
        <div className="font-mono text-[10px] uppercase tracking-[.1em] mb-2" style={{ color: "var(--navy-3)" }}>
          {t("wizard.loc.orCovered")}
        </div>
        <p className="text-xs mb-3" style={{ color: "var(--navy-3)" }}>
          {t("wizard.loc.coveredHint")}
        </p>
        <CityCombobox
          value={customCity}
          onSelect={async (city) => {
            setCustomCity(city.name);
            set("city", city.name);
            set("country", city.country);
            await generateCover(city.name, city.country);
          }}
        />
        {genState === "error" && (
          <p className="text-sm mt-2" style={{ color: "#dc2626" }}>
            {t("wizard.loc.coverError")}
          </p>
        )}
      </div>

      <Field label={t("wizard.loc.neighbourhood")}>
        <Input value={state.neighbourhood} onChange={(v) => set("neighbourhood", v)} placeholder={t("wizard.loc.neighbourhoodPlaceholder")} />
      </Field>
      <Field label={t("wizard.loc.country")} hint={t("wizard.loc.countryHint")}>
        <Input value={state.country} onChange={(v) => set("country", v)} />
      </Field>
      <Field label={t("wizard.loc.address")}>
        <Input value={state.address} onChange={(v) => set("address", v)} />
      </Field>
      <Field label={t("wizard.loc.floor", { floor: state.floor })}>
        <input
          type="range"
          min={-1}
          max={20}
          value={state.floor}
          onChange={(e) => set("floor", +e.target.value)}
          className="w-full"
        />
      </Field>

      {(art ?? cityMatch) && (
        <div className="rounded-xl overflow-hidden border" style={{ borderColor: "var(--line)" }}>
          <div className="aspect-[16/9]">
            <CityIllust
              city={art?.city ?? cityMatch?.name ?? state.city}
              palette={art?.palette ?? cityMatch?.palette ?? "warm"}
              motif={art?.motif ?? []}
              postcard={art?.postcard ?? null}
            />
          </div>
          <div className="px-4 py-2 flex items-center justify-between text-xs font-mono" style={{ color: "var(--navy-3)" }}>
            <span>
              {t("wizard.loc.postcardPreview")} <b style={{ color: "var(--navy)" }}>{art?.postcard?.palette ?? art?.palette ?? cityMatch?.palette}</b>
              {art?.postcard?.elements?.length ? (
                <>
                  {" · "}
                  <b style={{ color: "var(--navy)" }}>{t("wizard.loc.landmarks", { count: art.postcard.elements.length })}</b>
                </>
              ) : null}
            </span>
            {art?.source && (
              <span
                className="uppercase tracking-[.08em] px-2 py-0.5 rounded-full"
                style={{
                  background: art.source === "ai" ? "var(--pink-light)" : "var(--cream-2)",
                  color: art.source === "ai" ? "var(--pink)" : "var(--navy-3)",
                }}
              >
                {art.source === "ai" ? t("wizard.loc.source.ai") : art.source === "cache" ? t("wizard.loc.source.cached") : art.source === "preset" ? t("wizard.loc.source.preset") : t("wizard.loc.source.fallback")}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SpaceStep({ state, set, t }: { state: FormState; set: <K extends keyof FormState>(k: K, v: FormState[K]) => void; t: T }) {
  return (
    <div className="space-y-5">
      <Field label={t("wizard.space.propertyType")}>
        <div className="flex flex-wrap gap-2">
          {PROPERTY_TYPES.map((pt) => (
            <button
              key={pt}
              type="button"
              onClick={() => set("propertyType", pt)}
              className="px-4 py-2 rounded-full border text-sm"
              style={
                state.propertyType === pt
                  ? { background: "var(--pink)", color: "#fff", borderColor: "var(--pink)" }
                  : { borderColor: "var(--line)", background: "var(--card-bg)" }
              }
            >
              {t(propertyTypeKey(pt))}
            </button>
          ))}
        </div>
      </Field>
      <Field label={t("wizard.space.spaceType")}>
        <div className="flex flex-wrap gap-2">
          {(["entire_place", "private_room"] as const).map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => set("spaceType", st)}
              className="px-4 py-2 rounded-full border text-sm"
              style={
                state.spaceType === st
                  ? { background: "var(--pink)", color: "#fff", borderColor: "var(--pink)" }
                  : { borderColor: "var(--line)", background: "var(--card-bg)" }
              }
            >
              {t(st === "entire_place" ? "spaceType.entirePlace" : "spaceType.privateRoom")}
            </button>
          ))}
        </div>
        {state.spaceType === "private_room" && (
          <div className="mt-3 space-y-2">
            <label className="block text-sm" style={{ color: "var(--navy-3)" }}>
              {t("wizard.space.roomsOffered")}
            </label>
            <input
              type="number"
              min={1}
              max={15}
              value={state.roomsOffered}
              onChange={(e) =>
                set("roomsOffered", Math.max(1, Math.min(15, Math.round(+e.target.value) || 1)))
              }
              className="w-24 px-3 py-2 rounded border text-sm"
              style={{ background: "var(--card-bg)", borderColor: "var(--line)" }}
            />
            <p className="text-xs" style={{ color: "var(--navy-3)" }}>
              {t("wizard.space.privateRoomKeysHint")}
            </p>
          </div>
        )}
      </Field>
      <div className="grid grid-cols-2 gap-5">
        <Field label={t("wizard.space.size", { n: state.sizeSqm })}>
          <input
            type="range"
            min={20}
            max={400}
            value={state.sizeSqm}
            onChange={(e) => set("sizeSqm", +e.target.value)}
            className="w-full"
          />
        </Field>
        <Field label={t("wizard.space.sleeps", { n: state.sleeps })}>
          <input
            type="range"
            min={1}
            max={12}
            value={state.sleeps}
            onChange={(e) => set("sleeps", +e.target.value)}
            className="w-full"
          />
        </Field>
        <Field label={t("wizard.space.bedrooms", { n: state.bedrooms })}>
          <input
            type="range"
            min={0}
            max={8}
            value={state.bedrooms}
            onChange={(e) => set("bedrooms", +e.target.value)}
            className="w-full"
          />
        </Field>
        <Field label={t("wizard.space.bathrooms", { n: state.bathrooms })}>
          <input
            type="range"
            min={0}
            max={6}
            value={state.bathrooms}
            onChange={(e) => set("bathrooms", +e.target.value)}
            className="w-full"
          />
        </Field>
      </div>
    </div>
  );
}

function AccessibilityStep({ state, set, t }: { state: FormState; set: <K extends keyof FormState>(k: K, v: FormState[K]) => void; t: T }) {
  return (
    <div className="space-y-3">
      <Toggle label={t("wizard.access.stepFree")} on={state.stepFreeAccess} onChange={(v) => set("stepFreeAccess", v)} />
      <Toggle label={t("wizard.access.elevator")} on={state.hasElevator} onChange={(v) => set("hasElevator", v)} />
      <Toggle label={t("wizard.access.pets")} on={state.petsAllowed} onChange={(v) => set("petsAllowed", v)} />
      {state.petsAllowed && (
        <div className="ml-4 pl-4 border-l space-y-2" style={{ borderColor: "var(--line)" }}>
          <Toggle label={t("wizard.access.dogs")} on={state.petTypes.dogs} onChange={(v) => set("petTypes", { ...state.petTypes, dogs: v })} />
          <Toggle label={t("wizard.access.cats")} on={state.petTypes.cats} onChange={(v) => set("petTypes", { ...state.petTypes, cats: v })} />
          <Toggle label={t("wizard.access.other")} on={state.petTypes.other} onChange={(v) => set("petTypes", { ...state.petTypes, other: v })} />
        </div>
      )}
    </div>
  );
}

function AmenitiesStep({ state, set, t }: { state: FormState; set: <K extends keyof FormState>(k: K, v: FormState[K]) => void; t: T }) {
  return (
    <div className="space-y-5">
      <Field label={t("wizard.amen.wfhSetup")}>
        <div className="space-y-2">
          <Toggle label={t("wizard.amen.wfhSpace")} on={state.wfhSetup} onChange={(v) => set("wfhSetup", v)} />
          {state.wfhSetup && (
            <Field label={t("wizard.amen.desks", { n: state.wfhDesks })}>
              <input
                type="range"
                min={0}
                max={5}
                value={state.wfhDesks}
                onChange={(e) => set("wfhDesks", +e.target.value)}
                className="w-full"
              />
            </Field>
          )}
        </div>
      </Field>
      <Field label={t("wizard.amen.outdoor")}>
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              ["balcony", "wizard.amen.balcony"],
              ["rooftop", "wizard.amen.rooftop"],
              ["garden", "wizard.amen.garden"],
              ["courtyard", "wizard.amen.courtyard"],
              ["piano", "wizard.amen.piano"],
              ["pool", "wizard.amen.pool"],
              ["gym", "wizard.amen.gym"],
              ["bikeIncluded", "wizard.amen.bike"],
              ["hasParking", "wizard.amen.parking"],
            ] as const
          ).map(([key, labelKey]) => (
            <Toggle key={key} label={t(labelKey)} on={state[key] as boolean} onChange={(v) => set(key, v)} />
          ))}
        </div>
      </Field>
      <Field label={t("wizard.amen.climate")}>
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              ["ac", "wizard.amen.ac"],
              ["dishwasher", "wizard.amen.dishwasher"],
              ["washer", "wizard.amen.washer"],
              ["dryer", "wizard.amen.dryer"],
            ] as const
          ).map(([key, labelKey]) => (
            <Toggle key={key} label={t(labelKey)} on={state[key] as boolean} onChange={(v) => set(key, v)} />
          ))}
        </div>
      </Field>
    </div>
  );
}

function AvailabilityStep({ state, set, t }: { state: FormState; set: <K extends keyof FormState>(k: K, v: FormState[K]) => void; t: T }) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("wizard.avail.from")}>
          <Input type="date" value={state.availableFrom} onChange={(v) => set("availableFrom", v)} />
        </Field>
        <Field label={t("wizard.avail.to")}>
          <Input type="date" value={state.availableTo} onChange={(v) => set("availableTo", v)} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("wizard.avail.minStay", { n: state.minStayDays })}>
          <input
            type="range"
            min={1}
            max={60}
            value={state.minStayDays}
            onChange={(e) => set("minStayDays", +e.target.value)}
            className="w-full"
          />
        </Field>
        <Field label={t("wizard.avail.maxStay", { n: state.maxStayDays })}>
          <input
            type="range"
            min={3}
            max={180}
            value={state.maxStayDays}
            onChange={(e) => set("maxStayDays", +e.target.value)}
            className="w-full"
          />
        </Field>
      </div>
    </div>
  );
}

function PhotosStep({ state, set, t }: { state: FormState; set: <K extends keyof FormState>(k: K, v: FormState[K]) => void; t: T }) {
  const [url, setUrl] = useState("");
  function add() {
    if (!url) return;
    if (!/^https?:\/\//.test(url)) return;
    if (state.photos.length >= 20) return;
    set("photos", [...state.photos, url]);
    setUrl("");
  }
  return (
    <div className="space-y-4">
      <p className="text-sm" style={{ color: "var(--navy-2)" }}>
        {t("wizard.photos.intro")}
      </p>
      <div className="flex gap-2">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://…"
          className="flex-1 px-3 py-2.5 rounded-lg border outline-none"
          style={{ borderColor: "var(--line)", background: "var(--card-bg)" }}
        />
        <button onClick={add} className="pill-primary" type="button">{t("wizard.photos.add")}</button>
      </div>
      {state.photos.length > 0 && (
        <ol className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {state.photos.map((p, i) => (
            <li
              key={p + i}
              className="relative rounded-xl overflow-hidden border aspect-[4/3]"
              style={{ borderColor: "var(--line)", background: "var(--cream-2)" }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p} alt="" className="w-full h-full object-cover" loading="lazy" />
              <button
                type="button"
                onClick={() => set("photos", state.photos.filter((_, idx) => idx !== i))}
                className="absolute top-1 right-1 px-2 py-0.5 rounded-full text-xs"
                style={{ background: "var(--card-bg)", color: "var(--navy)" }}
              >
                ✕
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function DescriptionStep({ state, set, t }: { state: FormState; set: <K extends keyof FormState>(k: K, v: FormState[K]) => void; t: T }) {
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [source, setSource] = useState<"ai" | "fallback" | null>(null);
  const [err, setErr] = useState<string | null>(null);

  function selectedAmenities(): string[] {
    const out: string[] = [];
    if (state.balcony) out.push("Balcony");
    if (state.rooftop) out.push("Rooftop");
    if (state.garden) out.push("Garden");
    if (state.courtyard) out.push("Courtyard");
    if (state.pool) out.push("Pool");
    if (state.piano) out.push("Piano");
    if (state.bikeIncluded) out.push("Bike included");
    if (state.hasParking) out.push("Parking");
    if (state.ac) out.push("Air conditioning");
    if (state.dishwasher) out.push("Dishwasher");
    if (state.washer) out.push("Washer");
    if (state.dryer) out.push("Dryer");
    return out;
  }

  async function generate() {
    setErr(null);
    setBusy(true);
    setSource(null);
    try {
      const res = await fetch("/api/ai/listing-content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          city: state.city,
          neighbourhood: state.neighbourhood,
          country: state.country,
          propertyType: state.propertyType,
          sizeSqm: state.sizeSqm,
          sleeps: state.sleeps,
          bedrooms: state.bedrooms,
          bathrooms: state.bathrooms,
          floor: state.floor,
          hasElevator: state.hasElevator,
          stepFreeAccess: state.stepFreeAccess,
          petsAllowed: state.petsAllowed,
          petTypes: (Object.keys(state.petTypes) as Array<keyof FormState["petTypes"]>).filter((k) => state.petTypes[k]),
          wfhSetup: state.wfhSetup,
          wfhDesks: state.wfhDesks,
          amenities: selectedAmenities(),
          availableFrom: state.availableFrom,
          availableTo: state.availableTo,
          hostNotes: notes || undefined,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? t("wizard.desc.draftError"));
      set("title", j.title);
      set("description", j.description);
      setSource(j.source);
    } catch (e) {
      setErr(e instanceof Error ? e.message : t("wizard.desc.draftError"));
    } finally {
      setBusy(false);
    }
  }

  const ready = state.city && state.neighbourhood && state.sizeSqm > 0;

  return (
    <div className="space-y-5">
      <div
        className="rounded-xl border p-5"
        style={{ borderColor: "var(--line)", background: "var(--cream-2)" }}
      >
        <div className="font-mono text-[10px] uppercase tracking-[.1em] mb-2" style={{ color: "var(--navy-3)" }}>
          {t("wizard.desc.draftKicker")}
        </div>
        <p className="text-sm mb-3" style={{ color: "var(--navy-2)" }}>
          {t("wizard.desc.draftIntro")}
        </p>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder={t("wizard.desc.notesPlaceholder")}
          className="w-full px-3 py-2.5 rounded-lg border outline-none mb-3"
          style={{ borderColor: "var(--line)", background: "var(--card-bg)" }}
        />
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={generate}
            disabled={!ready || busy}
            className="pill-primary"
          >
            {busy ? t("wizard.desc.drafting") : t("wizard.desc.draft")}
          </button>
          {source && (
            <span
              className="font-mono text-[10px] uppercase tracking-[.08em] px-2 py-0.5 rounded-full"
              style={{
                background: source === "ai" ? "var(--pink-light)" : "var(--cream-2)",
                color: source === "ai" ? "var(--pink)" : "var(--navy-3)",
              }}
            >
              {source === "ai" ? t("wizard.desc.aiDraft") : t("wizard.desc.templateDraft")}
            </span>
          )}
          {err && <span className="text-sm" style={{ color: "#dc2626" }}>{err}</span>}
        </div>
        {!ready && (
          <p className="mt-2 text-xs" style={{ color: "var(--navy-3)" }}>
            {t("wizard.desc.notReady")}
          </p>
        )}
      </div>

      <Field label={t("wizard.desc.title")}>
        <Input
          value={state.title}
          onChange={(v) => set("title", v)}
          placeholder={t("wizard.desc.titlePlaceholder", { neighbourhood: state.neighbourhood ? state.neighbourhood + " " : "" })}
        />
      </Field>
      <Field label={t("wizard.desc.description")}>
        <textarea
          value={state.description}
          onChange={(e) => set("description", e.target.value)}
          rows={8}
          className="w-full px-3 py-2.5 rounded-lg border outline-none"
          style={{ borderColor: "var(--line)", background: "var(--card-bg)" }}
          placeholder={t("wizard.desc.descPlaceholder")}
        />
      </Field>
    </div>
  );
}

function ReviewStep({
  state,
  editing = false,
  publishMode,
  onModeChange,
  ackAccepted,
  onAckChange,
  t,
}: {
  state: FormState;
  editing?: boolean;
  publishMode: PublishAckMode;
  onModeChange: (m: PublishAckMode) => void;
  ackAccepted: boolean;
  onAckChange: (v: boolean) => void;
  t: T;
}) {
  const petKeyMap: Record<string, DictKey> = {
    dogs: "wizard.access.dogs",
    cats: "wizard.access.cats",
    other: "wizard.access.other",
  };
  const petLabels = Object.entries(state.petTypes)
    .filter(([, v]) => v)
    .map(([k]) => (petKeyMap[k] ? t(petKeyMap[k]) : k))
    .join(", ");
  return (
    <div className="space-y-5">
      <div className="surface-card p-5 space-y-2 text-sm">
        <Row label={t("wizard.review.where")} value={`${state.neighbourhood} · ${state.city}, ${state.country}`} />
        <Row label={t("wizard.review.type")} value={t("wizard.review.typeValue", { type: t(propertyTypeKey(state.propertyType)), size: state.sizeSqm, sleeps: state.sleeps })} />
        <Row label={t("wizard.review.bedBath")} value={`${state.bedrooms} / ${state.bathrooms}`} />
        <Row label={t("wizard.review.available")} value={t("wizard.review.availableValue", { from: state.availableFrom, to: state.availableTo, min: state.minStayDays, max: state.maxStayDays })} />
        <Row label={t("wizard.review.pets")} value={state.petsAllowed ? (petLabels || t("wizard.review.petsYes")) : t("wizard.review.petsNo")} />
        <Row label={t("wizard.review.wfh")} value={state.wfhSetup ? t(state.wfhDesks === 1 ? "wizard.review.desk" : "wizard.review.desks", { n: state.wfhDesks }) : "—"} />
        <Row label={t("wizard.review.photos")} value={t("wizard.review.photosValue", { n: state.photos.length })} />
      </div>

      {/* Publish acknowledgment (DOK-162). Only on first publish — a mandatory
          self-attestation. The variant (and its legal weight) depends on whether
          the host cedes the whole home or merely offers hospitality. */}
      {!editing && (
        <div className="rounded-xl border p-5" style={{ borderColor: "var(--line)", background: "var(--cream-2)" }}>
          <div className="font-mono text-[10px] uppercase tracking-[.1em] mb-3" style={{ color: "var(--navy-3)" }}>
            {t("wizard.review.beforePublish")}
          </div>

          <label className="block font-mono text-[10px] uppercase tracking-[.1em] mb-2" style={{ color: "var(--navy-3)" }}>
            {t("wizard.review.howHost")}
          </label>
          <div className="grid sm:grid-cols-2 gap-2 mb-4">
            {(
              [
                ["entire_home_while_away", "wizard.review.modeEntire"],
                ["room_or_host_present", "wizard.review.modeRoom"],
              ] as const
            ).map(([mode, labelKey]) => (
              <button
                key={mode}
                type="button"
                onClick={() => onModeChange(mode)}
                className="text-left p-3 rounded-xl border transition-all font-medium text-sm"
                style={
                  publishMode === mode
                    ? { borderColor: "var(--pink)", background: "var(--pink-light)" }
                    : { borderColor: "var(--line)", background: "var(--card-bg)" }
                }
              >
                {t(labelKey)}
              </button>
            ))}
          </div>

          <div className="mb-3">
            <p className="text-sm leading-[1.6]" style={{ color: "var(--navy-2)" }}>
              {t(publishMode === "entire_home_while_away" ? "wizard.review.ackEntireHeadline" : "wizard.review.ackRoomHeadline")}
            </p>
            <p className="text-xs leading-[1.6] mt-1" style={{ color: "var(--navy-3)" }}>
              {t(publishMode === "entire_home_while_away" ? "wizard.review.ackEntireFine" : "wizard.review.ackRoomFine")}
            </p>
          </div>

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={ackAccepted}
              onChange={(e) => onAckChange(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0"
              style={{ accentColor: "var(--pink)" }}
            />
            <span className="text-sm" style={{ color: "var(--navy)" }}>
              {t("wizard.review.ackConfirm")}
            </span>
          </label>
        </div>
      )}

      <p className="text-sm" style={{ color: "var(--navy-2)" }}>
        {t(editing ? "wizard.review.afterEdit" : "wizard.review.afterPublish")}
      </p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-3 py-1">
      <span className="font-mono text-[10px] uppercase tracking-[.1em] mt-0.5" style={{ color: "var(--navy-3)" }}>
        {label}
      </span>
      <span>{value}</span>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block font-mono text-[10px] uppercase tracking-[.1em] mb-2" style={{ color: "var(--navy-3)" }}>
        {label} {hint && <span style={{ color: "var(--navy-3)" }}>· {hint}</span>}
      </label>
      {children}
    </div>
  );
}

function Input({
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full px-3 py-2.5 rounded-lg border outline-none"
      style={{ borderColor: "var(--line)", background: "var(--card-bg)" }}
    />
  );
}

function Toggle({ label, on, onChange }: { label: React.ReactNode; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between py-2 px-3 rounded-lg" style={{ background: "var(--card-bg)" }}>
      <span className="text-sm">{label}</span>
      <div
        role="switch"
        tabIndex={0}
        aria-checked={on}
        className="swapl-switch"
        data-on={on}
        onClick={() => onChange(!on)}
        onKeyDown={(e) => (e.key === " " || e.key === "Enter") && onChange(!on)}
      />
    </div>
  );
}
