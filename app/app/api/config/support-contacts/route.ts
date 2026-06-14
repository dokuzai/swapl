// GET /api/config/support-contacts — public support contact configuration.
//
// Single source of truth for the 24/7 phone line and help-centre URL that the
// web cockpit, iOS and Android all surface from the "Report a problem" flow.
// These were hardcoded per-client (e.g. "+44 800 000 swap"); now they come from
// env (SUPPORT_PHONE, HELP_URL_24_7) so ops can change them without a release.
//
// Public, no auth: the numbers are shown to every member in trouble and carry
// no secrets. Values fall back to the launch defaults when env is unset so the
// app degrades gracefully (same pattern as the rest of the codebase).

import { NextResponse } from "next/server";

const DEFAULT_PHONE = "+44 800 000 swap";
const DEFAULT_HELP_URL = "https://swapl.fun/help";

export async function GET() {
  const phone = process.env.SUPPORT_PHONE?.trim() || DEFAULT_PHONE;
  const helpUrl = process.env.HELP_URL_24_7?.trim() || DEFAULT_HELP_URL;

  return NextResponse.json({ phone, helpUrl });
}
