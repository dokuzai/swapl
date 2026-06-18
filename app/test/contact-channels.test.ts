import { describe, it, expect } from "vitest";
import {
  normalizeContactChannels,
  serializeContactChannels,
  ownContactChannels,
  publicContactChannels,
} from "@/lib/contact-channels";

describe("normalizeContactChannels", () => {
  it("normalizes and keeps valid channels", () => {
    const out = normalizeContactChannels({
      email: "  Gert@Example.COM ",
      phone: "+1 (555) 010-2030",
      telegram: "https://t.me/gert",
      instagram: "@gert",
      website: "swapl.fun",
      discord: "gert#1234",
    });
    expect(out.email).toBe("gert@example.com");
    expect(out.phone).toBe("+15550102030");
    expect(out.telegram).toBe("gert");
    expect(out.instagram).toBe("gert");
    expect(out.website).toBe("https://swapl.fun/");
    expect(out.discord).toBe("gert#1234");
  });

  it("drops invalid or empty values rather than throwing", () => {
    const out = normalizeContactChannels({
      email: "not-an-email",
      phone: "123", // too short
      telegram: "",
      website: "  ",
    });
    expect(out).toEqual({});
  });

  it("drops handle/website payloads that could become stored-XSS or link injection", () => {
    const out = normalizeContactChannels({
      telegram: "<b>x</b>",
      instagram: 'a"onmouseover="x',
      discord: "<img src=x onerror=alert(1)>",
      website: "javascript:alert(1)",
    });
    expect(out).toEqual({});
  });

  it("accepts the legacy discord name#1234 form", () => {
    expect(normalizeContactChannels({ discord: "Gert.M#1234" })).toEqual({ discord: "Gert.M#1234" });
  });
});

describe("serializeContactChannels", () => {
  it("returns null when nothing usable remains (clears the column)", () => {
    expect(serializeContactChannels({ email: "", phone: null })).toBeNull();
  });

  it("round-trips through ownContactChannels", () => {
    const stored = serializeContactChannels({ telegram: "@gert", email: "g@x.io" });
    expect(stored).not.toBeNull();
    expect(ownContactChannels(stored)).toEqual({ telegram: "gert", email: "g@x.io" });
  });
});

describe("publicContactChannels — privacy gate", () => {
  const stored = serializeContactChannels({ email: "g@x.io", telegram: "@gert" });

  it("returns null to a viewer without an accepted swap (locked by default)", () => {
    expect(publicContactChannels(stored, { unlocked: false })).toBeNull();
  });

  it("reveals channels only once the swap is accepted (unlocked)", () => {
    expect(publicContactChannels(stored, { unlocked: true })).toEqual({
      email: "g@x.io",
      telegram: "gert",
    });
  });

  it("returns null when the owner set no channels, even if unlocked", () => {
    expect(publicContactChannels(null, { unlocked: true })).toBeNull();
  });
});
