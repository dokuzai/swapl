// GET /api/admin/metrics — JSON mirror of the /admin/metrics server page so
// the native iOS/Android apps can show the founder dashboard. Accepts the web
// cookie OR a mobile bearer token (requireAdminFromRequest); same 403 contract
// as the other /api/admin/* routes. The AdminMetrics payload is plain numbers
// and strings (no Date instances), so JSON serialisation is lossless;
// `generatedAt` carries the snapshot time as an ISO string.

import { NextResponse } from "next/server";
import { requireAdminFromRequest } from "@/lib/auth/abilities";
import { getAdminMetrics } from "@/lib/admin/metrics";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await requireAdminFromRequest(req);
  } catch {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const now = new Date();
  const metrics = await getAdminMetrics(now);
  return NextResponse.json({ ...metrics, generatedAt: now.toISOString() });
}
