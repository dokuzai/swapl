import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { LOCALE_COOKIE, isLocale } from "@/lib/i18n/locales";

// One-year sticky cookie. The next request to a server component picks this up
// in getLocale() before falling back to Accept-Language.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const locale = body?.locale;
  if (!isLocale(locale)) {
    return NextResponse.json({ error: "Unsupported locale" }, { status: 400 });
  }
  const c = await cookies();
  c.set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    httpOnly: false,
  });
  return NextResponse.json({ ok: true, locale });
}
