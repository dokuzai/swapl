// GET /api/config/support-contacts — public support config: 24/7 phone line +
// help-centre URL from env (SUPPORT_PHONE, HELP_URL_24_7), with launch defaults
// when unset/blank. No auth, no DB.

import { afterEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/config/support-contacts/route";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /api/config/support-contacts", () => {
  it("returns env-configured phone and helpUrl", async () => {
    vi.stubEnv("SUPPORT_PHONE", "+1 555 0100");
    vi.stubEnv("HELP_URL_24_7", "https://help.example.com");

    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      phone: "+1 555 0100",
      helpUrl: "https://help.example.com",
    });
  });

  it("falls back to launch defaults when env is unset", async () => {
    vi.stubEnv("SUPPORT_PHONE", "");
    vi.stubEnv("HELP_URL_24_7", "");

    const json = await (await GET()).json();
    expect(json).toEqual({
      phone: "+44 800 000 swap",
      helpUrl: "https://swapl.fun/help",
    });
  });

  it("trims surrounding whitespace and falls back on blank-only values", async () => {
    vi.stubEnv("SUPPORT_PHONE", "  +49 30 0  ");
    vi.stubEnv("HELP_URL_24_7", "   ");

    const json = await (await GET()).json();
    expect(json).toEqual({
      phone: "+49 30 0",
      helpUrl: "https://swapl.fun/help",
    });
  });
});
