// Mobile logout: revoke the presented Bearer token.

import { NextResponse } from "next/server";
import { revokeAuthToken } from "@/lib/auth/session";

export async function POST(req: Request) {
  const auth = req.headers.get("authorization") ?? req.headers.get("Authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(auth);
  if (!m) return NextResponse.json({ error: "Bearer token required" }, { status: 400 });
  await revokeAuthToken(m[1].trim());
  return NextResponse.json({ ok: true });
}
