// GET /api/auth/providers — which login methods are live on this deploy.
//
// Native clients call this on the login screen and hide the buttons for
// disabled providers (same env-gating philosophy as the rest of the app:
// unconfigured → hidden, never broken). Web uses NEXT_PUBLIC_* flags at
// build time but may also consume this endpoint.

import { NextResponse } from "next/server";
import { providersStatus } from "@/lib/auth/oauth/config";

export async function GET() {
  return NextResponse.json(providersStatus());
}
