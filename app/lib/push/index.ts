// Push notification adapter — mirrors lib/email's shape so existing
// fan-out call sites add a parallel sendPush() with no other change.
//
// Falls back to console.log when FCM credentials aren't configured. In prod
// set FCM_SERVICE_ACCOUNT_JSON (the contents of a service-account JSON file)
// and the adapter will deliver via the FCM HTTP v1 API to every Device row
// the user owns. APNs delivery is handled by FCM's APNs bridge — no separate
// Apple credentials needed at this layer.
//
// Templates intentionally mirror the email templates in app/emails/templates.tsx
// (one factory per event) so a future codegen step can keep both in lock-step.

import { prisma } from "@/lib/db";

export type PushPayload = {
  title: string;
  body: string;
  // Used for deep-linking — clients route on `kind` + `id` (e.g. swap thread).
  data: {
    kind: PushKind;
    proposalId?: string;
    listingId?: string;
    deepLink: string; // e.g. "swapl://swaps/<id>"
  };
};

export type PushKind =
  | "proposalReceived"
  | "proposalAccepted"
  | "proposalDeclined"
  | "proposalCountered"
  | "swapMessageReceived"
  | "insurancePolicyCreated"
  | "preTripReminder"
  | "verificationApproved"
  | "verificationRejected"
  | "featuredActivated"
  | "addOnPurchased";

export async function sendPush(userId: string, payload: PushPayload): Promise<void> {
  const devices = await prisma.device.findMany({ where: { userId } });
  if (devices.length === 0) return;

  const sa = process.env.FCM_SERVICE_ACCOUNT_JSON;
  if (!sa) {
    devices.forEach((d) => {
      console.log(
        `[push:dev] -> user=${userId} platform=${d.platform}\n  title: ${payload.title}\n  body: ${payload.body}\n  deepLink: ${payload.data.deepLink}`
      );
    });
    return;
  }

  // Lazy-import googleapis so projects without it don't break the bundle.
  const { google } = await import("googleapis");
  const credentials = JSON.parse(sa);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/firebase.messaging"],
  });
  const accessToken = await auth.getAccessToken();
  const projectId: string = credentials.project_id;
  const url = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;

  await Promise.all(
    devices.map(async (d) => {
      const message = {
        token: d.pushToken,
        notification: { title: payload.title, body: payload.body },
        data: Object.fromEntries(
          Object.entries(payload.data).map(([k, v]) => [k, String(v ?? "")])
        ),
        apns: {
          payload: {
            aps: { sound: "default", "thread-id": payload.data.kind },
          },
        },
        android: { priority: "HIGH" as const },
      };
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ message }),
        });
        if (!res.ok) {
          const text = await res.text();
          console.error(`[push:fcm] device=${d.id} status=${res.status} ${text}`);
          // FCM tells us when a token is gone — clean up so we stop trying.
          if (res.status === 404 || /UNREGISTERED|INVALID_ARGUMENT/i.test(text)) {
            await prisma.device.delete({ where: { id: d.id } }).catch(() => {});
          }
        }
      } catch (err) {
        console.error("[push:fcm]", err);
      }
    })
  );
}

// ---------- templates ----------
// Keep these in lock-step with app/emails/templates.tsx so notifications and
// emails carry the same copy.

function deepLinkProposal(id: string): string {
  return `swapl://swaps/${id}`;
}

export const pushTemplates = {
  proposalReceived(proposalId: string, fromName: string, city: string): PushPayload {
    return {
      title: `${fromName} proposed a swap`,
      body: `For your home in ${city}. Tap to review.`,
      data: { kind: "proposalReceived", proposalId, deepLink: deepLinkProposal(proposalId) },
    };
  },
  proposalAccepted(proposalId: string): PushPayload {
    return {
      title: "Your swap is on — keys for keys",
      body: "Insurance is auto-issued. Tap to see your codes.",
      data: { kind: "proposalAccepted", proposalId, deepLink: deepLinkProposal(proposalId) },
    };
  },
  proposalDeclined(proposalId: string): PushPayload {
    return {
      title: "It happens",
      body: "Your proposal was declined. Tap to browse new matches.",
      data: { kind: "proposalDeclined", proposalId, deepLink: deepLinkProposal(proposalId) },
    };
  },
  proposalCountered(proposalId: string): PushPayload {
    return {
      title: "You got a counter-offer",
      body: "Tap to review the new dates.",
      data: { kind: "proposalCountered", proposalId, deepLink: deepLinkProposal(proposalId) },
    };
  },
  swapMessageReceived(proposalId: string, fromName: string): PushPayload {
    return {
      title: `${fromName} sent a message`,
      body: "Tap to open your swap thread.",
      data: { kind: "swapMessageReceived", proposalId, deepLink: deepLinkProposal(proposalId) },
    };
  },
  insurancePolicyCreated(proposalId: string, policyNumber: string): PushPayload {
    return {
      title: "Your swap is covered",
      body: `Policy ${policyNumber} — €150k cover.`,
      data: { kind: "insurancePolicyCreated", proposalId, deepLink: deepLinkProposal(proposalId) },
    };
  },
  preTripReminder(proposalId: string, city: string): PushPayload {
    return {
      title: `48 hours to ${city}`,
      body: "Key codes are in your swap thread.",
      data: { kind: "preTripReminder", proposalId, deepLink: deepLinkProposal(proposalId) },
    };
  },
  verificationApproved(listingId: string, listingTitle: string): PushPayload {
    return {
      title: `${listingTitle} is now verified`,
      body: "Your listing surfaces above standard results.",
      data: { kind: "verificationApproved", listingId, deepLink: `swapl://listings/${listingId}` },
    };
  },
  verificationRejected(listingId: string): PushPayload {
    return {
      title: "Verification rejected",
      body: "Your €39 has been refunded. Tap for details.",
      data: { kind: "verificationRejected", listingId, deepLink: `swapl://listings/${listingId}` },
    };
  },
  featuredActivated(listingId: string, listingTitle: string): PushPayload {
    return {
      title: `${listingTitle} is now featured`,
      body: "Top of city results until your end date.",
      data: { kind: "featuredActivated", listingId, deepLink: `swapl://listings/${listingId}` },
    };
  },
  addOnPurchased(proposalId: string, addOnName: string): PushPayload {
    return {
      title: "Add-on confirmed",
      body: `${addOnName} is booked for your swap.`,
      data: { kind: "addOnPurchased", proposalId, deepLink: deepLinkProposal(proposalId) },
    };
  },
};
