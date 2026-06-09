// Convenience aliases over the generated OpenAPI types (@swapl/api-spec).
// Import these instead of hand-writing request/response shapes so the web
// client stays in lockstep with the API contract. Regenerate with:
//   pnpm --filter @swapl/api-spec gen:ts
//
// The schema is generated into app/lib/generated/ (synced by gen:ts) so the
// web build is self-contained: no workspace dep (Vercel installs with npm) and
// no reliance on files outside the app/ root directory.
import type { components } from "./generated/api-schema";

export type Schemas = components["schemas"];

export type BetaSignupRequest = Schemas["BetaSignupRequest"];
export type RegisterRequest = Schemas["RegisterRequest"];
export type TokenResponse = Schemas["TokenResponse"];
export type MeResponse = Schemas["MeResponse"];
export type Listing = Schemas["Listing"];
export type ListingWithScore = Schemas["ListingWithScore"];
export type ListingSearchResponse = Schemas["ListingSearchResponse"];
export type ListingDetailResponse = Schemas["ListingDetailResponse"];
export type ListingCreateDraft = Schemas["ListingCreateDraft"];
export type ProposalDraft = Schemas["ProposalDraft"];
export type InboxResponse = Schemas["InboxResponse"];
