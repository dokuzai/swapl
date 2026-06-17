// Granular notification preferences: the per-category gate that sendPush /
// sendEmail consult before delivering. Controllable categories require both the
// channel master switch and the category switch; safety/trust categories
// (disputes, account) always deliver.

import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "@/lib/settings";
import {
  KIND_CATEGORY,
  CATEGORY_SETTING,
  notificationAllowed,
  type NotificationKind,
} from "@/lib/notifications/categories";

describe("notificationAllowed", () => {
  it("delivers everything on default settings", () => {
    for (const kind of Object.keys(KIND_CATEGORY) as NotificationKind[]) {
      expect(notificationAllowed(DEFAULT_SETTINGS, "push", kind)).toBe(true);
      expect(notificationAllowed(DEFAULT_SETTINGS, "email", kind)).toBe(true);
    }
  });

  it("suppresses a controllable category on both channels when its flag is off", () => {
    const s = { ...DEFAULT_SETTINGS, notifyMessages: false };
    expect(notificationAllowed(s, "push", "swapMessageReceived")).toBe(false);
    expect(notificationAllowed(s, "email", "swapMessageReceived")).toBe(false);
    // other categories unaffected
    expect(notificationAllowed(s, "push", "proposalReceived")).toBe(true);
  });

  it("the channel master switch gates only its own channel", () => {
    const noPush = { ...DEFAULT_SETTINGS, pushNotifications: false };
    expect(notificationAllowed(noPush, "push", "proposalReceived")).toBe(false);
    expect(notificationAllowed(noPush, "email", "proposalReceived")).toBe(true);
  });

  it("always-on categories ignore every switch", () => {
    const off = {
      ...DEFAULT_SETTINGS,
      pushNotifications: false,
      emailNotifications: false,
    };
    for (const kind of ["disputeOpened", "disputeMessage", "identityVerified", "verificationRejected"] as NotificationKind[]) {
      expect(notificationAllowed(off, "push", kind)).toBe(true);
      expect(notificationAllowed(off, "email", kind)).toBe(true);
    }
  });

  it("every kind maps to a category, and controllable categories map to a real setting key", () => {
    for (const cat of Object.values(KIND_CATEGORY)) {
      const key = CATEGORY_SETTING[cat];
      if (key) expect(key in DEFAULT_SETTINGS).toBe(true);
    }
    // disputes + account are intentionally always-on (no setting key)
    expect(CATEGORY_SETTING.disputes).toBeUndefined();
    expect(CATEGORY_SETTING.account).toBeUndefined();
  });
});
