// lib/sms — Twilio REST adapter (mocked fetch) + console fallback.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendSms } from "@/lib/sms";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.TWILIO_ACCOUNT_SID;
  delete process.env.TWILIO_AUTH_TOKEN;
  delete process.env.TWILIO_FROM;
});

describe("sendSms", () => {
  it("logs to console (no fetch) when Twilio is unconfigured", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await sendSms("+393331234567", "123456 is your code");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(expect.stringContaining("123456"));
    log.mockRestore();
  });

  it("POSTs to the Twilio Messages endpoint with basic auth", async () => {
    process.env.TWILIO_ACCOUNT_SID = "AC123";
    process.env.TWILIO_AUTH_TOKEN = "secret";
    process.env.TWILIO_FROM = "+15550001111";
    fetchMock.mockResolvedValue({ ok: true });

    await sendSms("+393331234567", "hello");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.twilio.com/2010-04-01/Accounts/AC123/Messages.json");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe(
      `Basic ${Buffer.from("AC123:secret").toString("base64")}`
    );
    const params = new URLSearchParams(init.body);
    expect(params.get("To")).toBe("+393331234567");
    expect(params.get("From")).toBe("+15550001111");
    expect(params.get("Body")).toBe("hello");
  });

  it("throws on a non-2xx Twilio response", async () => {
    process.env.TWILIO_ACCOUNT_SID = "AC123";
    process.env.TWILIO_AUTH_TOKEN = "secret";
    process.env.TWILIO_FROM = "+15550001111";
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => "auth error",
    });
    await expect(sendSms("+393331234567", "hello")).rejects.toThrow("Twilio send failed (401)");
  });
});
