import { NextResponse } from "next/server";
import { clearSession } from "@/lib/auth/session";

// Plain <form action="/api/auth/logout" method="post"> from the dashboard and
// account pages → clear the cookie and land on the public home (303 turns the
// follow-up into a GET).
export async function POST(req: Request) {
  await clearSession();
  return NextResponse.redirect(new URL("/", req.url), 303);
}
