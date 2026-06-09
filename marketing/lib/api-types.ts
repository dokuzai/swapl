// Minimal request shapes used by marketing forms. The product app owns the
// full generated OpenAPI schema (app/lib/generated/api-schema.d.ts); the
// marketing site only needs the beta-waitlist payload, so it is mirrored here
// by hand to keep this package free of the codegen pipeline. Keep in sync
// with the `BetaSignupRequest` schema in @swapl/api-spec.
export type BetaSignupRequest = {
  email: string;
  source?: string;
  medium?: string;
  campaign?: string;
  term?: string;
  content?: string;
  landingPage?: string;
  referrer?: string;
  turnstileToken?: string;
  attestation?: string;
};
