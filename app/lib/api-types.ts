// Convenience aliases over the generated OpenAPI types (@swapl/api-spec).
// Import these instead of hand-writing request/response shapes so the web
// client stays in lockstep with the API contract. Regenerate with:
//   pnpm --filter @swapl/api-spec gen:ts
//
// Imported by relative path (types only — erased at runtime) so the web app
// doesn't take a workspace dependency that Vercel's `npm install` can't resolve.
import type { components } from "../../packages/api-spec/generated/ts/schema";

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
