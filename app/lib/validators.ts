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
});

export type ListingCreateInput = z.infer<typeof listingCreateSchema>;

export const swapProposalSchema = z.object({
  proposerListingId: z.string().min(1),
  targetListingId: z.string().min(1),
  dateFrom: z.coerce.date(),
  dateTo: z.coerce.date(),
  message: z.string().max(2000).optional(),
});

export const swapCounterSchema = z.object({
  counterDateFrom: z.coerce.date(),
  counterDateTo: z.coerce.date(),
  counterMessage: z.string().max(2000).optional(),
});

export const betaSignupSchema = z.object({
  email: z.string().email(),
});

export const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6).max(128),
});

export const reportSchema = z.object({
  reason: z.string().min(2).max(80),
  detail: z.string().max(2000).optional(),
  listingId: z.string().optional(),
  targetUserId: z.string().optional(),
});
