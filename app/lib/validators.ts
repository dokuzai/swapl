import { z } from "zod";
import { PROPERTY_TYPES } from "./types";

export const listingCreateSchema = z.object({
  title: z.string().min(4).max(120),
  description: z.string().min(20).max(4000),

  propertyType: z.enum(PROPERTY_TYPES),
  city: z.string().min(2),
  neighbourhood: z.string().min(2),
  country: z.string().min(2),
  address: z.string().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),

  sizeSqm: z.number().int().min(20).max(800),
  sleeps: z.number().int().min(1).max(20),
  bedrooms: z.number().int().min(0).max(15),
  bathrooms: z.number().int().min(0).max(10),
  floor: z.number().int().min(-2).max(60).optional(),

  hasElevator: z.boolean().default(false),
  stepFreeAccess: z.boolean().default(false),

  petsAllowed: z.boolean().default(false),
  petTypes: z.array(z.enum(["dogs", "cats", "other"])).default([]),

  wfhSetup: z.boolean().default(false),
  wfhDesks: z.number().int().min(0).max(10).default(0),

  hasParking: z.boolean().default(false),
  bikeIncluded: z.boolean().default(false),
  rooftop: z.boolean().default(false),
  balcony: z.boolean().default(false),
  garden: z.boolean().default(false),
  courtyard: z.boolean().default(false),
  piano: z.boolean().default(false),
  pool: z.boolean().default(false),
  gym: z.boolean().default(false),
  ac: z.boolean().default(false),
  dishwasher: z.boolean().default(false),
  washer: z.boolean().default(false),
  dryer: z.boolean().default(false),

  availableFrom: z.coerce.date(),
  availableTo: z.coerce.date(),
  minStayDays: z.number().int().min(1).max(180).default(3),
  maxStayDays: z.number().int().min(1).max(365).default(30),

  photos: z.array(z.string().url()).max(20).default([]),
  tags: z.array(z.string()).max(20).default([]),

  // What's offered (DOK-160). Defaults keep every listing a whole-home offer.
  spaceType: z.enum(["entire_place", "private_room"]).default("entire_place"),
  roomsOffered: z.number().int().min(1).max(15).optional(),

  // Closed-by-default availability (DOK-219). When present, the listing is
  // bookable ONLY on these ranges (the rest of the window is closed). An empty
  // array means nothing is bookable until the host opens dates. When omitted
  // (legacy/web clients), the whole window stays open as before.
  openRanges: z
    .array(z.object({ dateFrom: z.coerce.date(), dateTo: z.coerce.date() }))
    .max(366)
    .optional(),
}).refine((data) => data.availableTo > data.availableFrom, {
  message: "availableTo must be after availableFrom",
  path: ["availableTo"],
}).refine((data) => data.maxStayDays >= data.minStayDays, {
  message: "maxStayDays must be >= minStayDays",
  path: ["maxStayDays"],
});

export type ListingCreateInput = z.infer<typeof listingCreateSchema>;

export const swapProposalSchema = z.object({
  proposerListingId: z.string().min(1),
  targetListingId: z.string().min(1),
  dateFrom: z.coerce.date(),
  dateTo: z.coerce.date(),
  message: z.string().max(2000).optional(),
  // Guests travelling to the target home (DOK-219). Validated against the
  // target's capacity in the route. Optional for back-compat with older clients.
  guestCount: z.number().int().min(1).max(50).optional(),
}).refine((data) => data.dateTo > data.dateFrom, {
  message: "dateTo must be after dateFrom",
  path: ["dateTo"],
});

export const swapCounterSchema = z.object({
  counterDateFrom: z.coerce.date(),
  counterDateTo: z.coerce.date(),
  counterMessage: z.string().max(2000).optional(),
}).refine((data) => data.counterDateTo > data.counterDateFrom, {
  message: "counterDateTo must be after counterDateFrom",
  path: ["counterDateTo"],
});

export const betaSignupSchema = z.object({
  email: z.string().email(),
  source: z.string().max(80).optional(),
  medium: z.string().max(80).optional(),
  campaign: z.string().max(120).optional(),
  term: z.string().max(120).optional(),
  content: z.string().max(120).optional(),
  landingPage: z.string().max(500).optional(),
  referrer: z.string().max(500).optional(),
});

export const marketingEventSchema = z.object({
  eventName: z.string().min(1).max(80),
  path: z.string().max(500).optional(),
  source: z.string().max(80).optional(),
  medium: z.string().max(80).optional(),
  campaign: z.string().max(120).optional(),
  term: z.string().max(120).optional(),
  content: z.string().max(120).optional(),
  referrer: z.string().max(500).optional(),
  metadata: z.record(z.string(), z.unknown()).optional().refine(
    (value) => !value || JSON.stringify(value).length <= 2000,
    "Metadata too large",
  ),
});

export const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6).max(128),
  // Growth engine (DOK-157): optional referral code from a ?ref=CODE link,
  // forwarded by the client at signup so attribution can be recorded.
  ref: z.string().min(3).max(32).optional(),
  // Optional invite-to-stay token from a ?invite=TOKEN link.
  invite: z.string().min(8).max(64).optional(),
});

// Mobile-only: same fields as credentials plus device metadata so we can stamp
// the issued AuthToken with platform info.
export const tokenIssueSchema = credentialsSchema.extend({
  platform: z.enum(["ios", "android", "web-pwa"]),
  appVersion: z.string().max(40).optional(),
});

export const deviceRegisterSchema = z.object({
  platform: z.enum(["ios", "android"]),
  pushToken: z.string().min(8).max(4096),
  locale: z.string().max(20).optional(),
  appVersion: z.string().max(40).optional(),
});

// ---- Multi-provider auth (OAuth + OTP) ----
// `platform` optional on every login-style endpoint: present → bearer token
// (native), absent → cookie session (web). Mirrors register's behaviour.

const optionalPlatform = z.enum(["ios", "android", "web-pwa"]).optional();

// Growth engine (DOK-157): optional referral code + invite token carried
// through OAuth signup.
const optionalRef = z.string().min(3).max(32).optional();
const optionalInvite = z.string().min(8).max(64).optional();

export const oauthGoogleSchema = z.object({
  idToken: z.string().min(20).max(8192),
  platform: optionalPlatform,
  appVersion: z.string().max(40).optional(),
  ref: optionalRef,
  invite: optionalInvite,
});

export const oauthAppleSchema = z.object({
  identityToken: z.string().min(20).max(8192),
  // Apple sends the name ONLY on first authorization, client-side; used solely
  // at account creation.
  fullName: z.string().max(200).optional(),
  platform: optionalPlatform,
  appVersion: z.string().max(40).optional(),
  ref: optionalRef,
  invite: optionalInvite,
});

export const oauthTelegramSchema = z.object({
  // Raw payload from the Telegram Login Widget (id, auth_date, hash, ...).
  authData: z.record(z.string(), z.union([z.string(), z.number()])),
  platform: optionalPlatform,
  appVersion: z.string().max(40).optional(),
});

const E164 = /^\+[1-9]\d{6,14}$/;

export const otpRequestSchema = z
  .object({
    channel: z.enum(["email", "sms"]),
    destination: z.string().min(3).max(254),
  })
  .superRefine((val, ctx) => {
    if (val.channel === "email" && !z.string().email().safeParse(val.destination).success) {
      ctx.addIssue({ code: "custom", path: ["destination"], message: "Invalid email address" });
    }
    if (val.channel === "sms" && !E164.test(val.destination.replace(/[\s\-()]/g, ""))) {
      ctx.addIssue({
        code: "custom",
        path: ["destination"],
        message: "Phone must be E.164, e.g. +393331234567",
      });
    }
  });

export const otpVerifySchema = z.object({
  destination: z.string().min(3).max(254),
  code: z.string().regex(/^\d{6}$/),
  platform: optionalPlatform,
  appVersion: z.string().max(40).optional(),
  // Growth engine (DOK-157): optional referral code / invite token, used only
  // on first-time account creation via OTP.
  ref: z.string().min(3).max(32).optional(),
  invite: z.string().min(8).max(64).optional(),
});

export const reportSchema = z.object({
  reason: z.string().min(2).max(80),
  detail: z.string().max(2000).optional(),
  listingId: z.string().optional(),
  targetUserId: z.string().optional(),
});

// App-experience feedback (functional-spec A.4): rates the APP itself, not the
// other traveller. score 1..5, optional comment, client source tag, and an
// optional context payload that the route serializes to a JSON String column.
export const appFeedbackSchema = z.object({
  score: z.number().int().min(1).max(5),
  comment: z.string().trim().max(1000).optional(),
  source: z.enum(["web", "ios", "android"]),
  surface: z.enum(["account", "post-swap", "post-review"]).default("account"),
  contextKey: z.string().max(200).default(""),
  context: z.record(z.string(), z.unknown()).optional(), // serialized to String before persist
});
