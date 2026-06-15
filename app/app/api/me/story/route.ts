// GET /api/me/story (DOK-158) — the caller's personal Swapl story: a date-desc
// timeline of trips (places they stayed) and hostings (people they hosted),
// drawn from COMPLETED swap agreements and completed Keys stays, plus distinct
// city/country counts. Also returns the caller's referralCode (minted lazily,
// as in lib/growth) so the share UI can compose the ?ref= link client-side.
//
// Privacy: the only counterpart data exposed is the other party's display name
// and the city/country of the stay — never their email, exact address, etc.

import { NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth/session";
import { buildStory } from "@/lib/story";
import { ensureReferralCode, referralShareUrl } from "@/lib/growth/referrals";

export async function GET(req: Request) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  const [story, referralCode] = await Promise.all([
    buildStory(session.userId),
    ensureReferralCode(session.userId),
  ]);

  return NextResponse.json({
    timeline: story.timeline,
    counts: story.counts,
    share: {
      referralCode,
      referralUrl: referralShareUrl(referralCode),
    },
  });
}
