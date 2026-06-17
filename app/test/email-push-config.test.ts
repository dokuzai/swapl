// Hardening for misconfigured email/push env vars (DOK-131):
// - sendEmail refuses the hello@swapl.test placeholder in production and logs
//   an explicit error instead of handing Resend an unverified sender.
// - sendPush survives a malformed FCM_SERVICE_ACCOUNT_JSON (logs + skips)
//   instead of throwing JSON.parse errors into the calling request.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resendSend: vi.fn().mockResolvedValue({ id: "email-1" }),
  deviceFindMany: vi.fn(),
  deviceDelete: vi.fn(),
  userFindUnique: vi.fn(),
}));

vi.mock("resend", () => ({
  Resend: class {
    emails = { send: mocks.resendSend };
  },
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    device: { findMany: mocks.deviceFindMany, delete: mocks.deviceDelete },
    // Notification-preference lookup in sendPush/sendEmail — null settings
    // means "all defaults", i.e. everything is allowed.
    user: { findUnique: mocks.userFindUnique },
  },
}));

// templates import pulls in react-email; stub it so the unit stays hermetic.
vi.mock("@/emails/templates", () => ({ templates: {} }));

import { sendEmail } from "@/lib/email";
import { sendPush, pushTemplates } from "@/lib/push";

const msg = { to: "ana@swapl.test", subject: "Hi", text: "Hello" };

let errorSpy: ReturnType<typeof vi.spyOn>;
let logSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  mocks.userFindUnique.mockResolvedValue({ settings: null });
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  errorSpy.mockRestore();
  logSpy.mockRestore();
});

describe("sendEmail RESEND_FROM hardening", () => {
  it("in production without RESEND_FROM: logs an explicit error and does not send", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_123");
    vi.stubEnv("RESEND_FROM", "");
    vi.stubEnv("NODE_ENV", "production");

    await sendEmail(msg);

    expect(mocks.resendSend).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(String(errorSpy.mock.calls[0][0])).toContain("RESEND_FROM");
  });

  it("in production with RESEND_FROM set: sends from the configured address", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_123");
    vi.stubEnv("RESEND_FROM", "swapl <hello@swapl.com>");
    vi.stubEnv("NODE_ENV", "production");

    await sendEmail(msg);

    expect(mocks.resendSend).toHaveBeenCalledTimes(1);
    expect(mocks.resendSend.mock.calls[0][0].from).toBe("swapl <hello@swapl.com>");
  });

  it("outside production without RESEND_FROM: keeps the dev placeholder sender", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_123");
    vi.stubEnv("RESEND_FROM", "");
    vi.stubEnv("NODE_ENV", "test");

    await sendEmail(msg);

    expect(mocks.resendSend).toHaveBeenCalledTimes(1);
    expect(mocks.resendSend.mock.calls[0][0].from).toBe("swapl <hello@swapl.test>");
  });
});

describe("sendPush FCM_SERVICE_ACCOUNT_JSON hardening", () => {
  const payload = pushTemplates.proposalAccepted("p-1");

  it("malformed JSON: logs an error and resolves without throwing", async () => {
    mocks.deviceFindMany.mockResolvedValue([
      { id: "d-1", userId: "u-1", platform: "ios", pushToken: "tok" },
    ]);
    vi.stubEnv("FCM_SERVICE_ACCOUNT_JSON", "{not json");

    await expect(sendPush("u-1", payload)).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalled();
    expect(String(errorSpy.mock.calls[0][0])).toContain("FCM_SERVICE_ACCOUNT_JSON");
  });

  it("valid JSON without project_id: logs an error and skips delivery", async () => {
    mocks.deviceFindMany.mockResolvedValue([
      { id: "d-1", userId: "u-1", platform: "ios", pushToken: "tok" },
    ]);
    vi.stubEnv("FCM_SERVICE_ACCOUNT_JSON", "{}");

    await expect(sendPush("u-1", payload)).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalled();
    expect(String(errorSpy.mock.calls[0][0])).toContain("project_id");
  });

  it("no devices: returns before touching credentials at all", async () => {
    mocks.deviceFindMany.mockResolvedValue([]);
    vi.stubEnv("FCM_SERVICE_ACCOUNT_JSON", "{not json");

    await expect(sendPush("u-1", payload)).resolves.toBeUndefined();
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
