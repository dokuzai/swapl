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
  | "addOnPurchased"
  | "reviewReceived"
  | "swapCancelled"
  | "swapCompleted"
  | "reviewReminder"
  | "checkedIn"
  | "checkedOut"
  | "homeGuideReminder"
  | "checkInNudge"
  | "disputeOpened"
  | "disputeStatusChanged"
  | "disputeMessage"
  | "identityVerified"
  | "identityVerificationFailed";

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

  // Misconfigured credentials must not take down the calling request —
  // push is best-effort. Log loudly and skip delivery instead of throwing.
  let credentials: { project_id?: string };
  try {
    credentials = JSON.parse(sa);
  } catch (err) {
    console.error(
      "[push:fcm] FCM_SERVICE_ACCOUNT_JSON is set but is not valid JSON — skipping push delivery. Fix the env var (paste the raw service-account JSON).",
      err
    );
    return;
  }
  if (!credentials.project_id) {
    console.error(
      "[push:fcm] FCM_SERVICE_ACCOUNT_JSON parsed but has no project_id — skipping push delivery."
    );
    return;
  }

  // Lazy-import googleapis so projects without it don't break the bundle.
  const { google } = await import("googleapis");
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
  reviewReceived(fromName: string, rating: number): PushPayload {
    return {
      title: `You received a new review from ${fromName}`,
      body: `${fromName} rated your swap ${rating}/5. Tap to read it on your profile.`,
      data: { kind: "reviewReceived", deepLink: "swapl://profile" },
    };
  },
  swapCancelled(proposalId: string): PushPayload {
    return {
      title: "Your swap was cancelled",
      body: "Insurance is cancelled and any premium refunded. Tap for details.",
      data: { kind: "swapCancelled", proposalId, deepLink: deepLinkProposal(proposalId) },
    };
  },
  swapCompleted(proposalId: string): PushPayload {
    return {
      title: "Your swap is complete — how was your stay?",
      body: "Leave a review for your swap partner.",
      data: { kind: "swapCompleted", proposalId, deepLink: deepLinkProposal(proposalId) },
    };
  },
  reviewReminder(proposalId: string): PushPayload {
    return {
      title: "Don't forget to review your swap",
      body: "Your review is still open — it takes two minutes.",
      data: { kind: "reviewReminder", proposalId, deepLink: deepLinkProposal(proposalId) },
    };
  },
  checkedIn(proposalId: string, name: string): PushPayload {
    return {
      title: `${name} has checked in`,
      body: "Your swap is now in progress. Tap to see the details.",
      data: { kind: "checkedIn", proposalId, deepLink: deepLinkProposal(proposalId) },
    };
  },
  checkedOut(proposalId: string, name: string): PushPayload {
    return {
      title: `${name} has checked out`,
      body: "Tap to wrap up your swap.",
      data: { kind: "checkedOut", proposalId, deepLink: deepLinkProposal(proposalId) },
    };
  },
  homeGuideReminder(proposalId: string, city: string): PushPayload {
    return {
      title: "Complete your home guide",
      body: `Your guest arrives in ${city} soon — fill in the essentials.`,
      data: { kind: "homeGuideReminder", proposalId, deepLink: deepLinkProposal(proposalId) },
    };
  },
  checkInNudge(proposalId: string, city: string): PushPayload {
    return {
      title: `Arrived in ${city}?`,
      body: "Check in from your trip cockpit to let your host know.",
      data: { kind: "checkInNudge", proposalId, deepLink: deepLinkProposal(proposalId) },
    };
  },
  identityVerified(): PushPayload {
    return {
      title: "You're verified ✓",
      body: "The verified badge is live on your profile.",
      data: { kind: "identityVerified", deepLink: "swapl://profile" },
    };
  },
  identityVerificationFailed(): PushPayload {
    return {
      title: "Verification couldn't be completed",
      body: "Start a new check anytime from your account.",
      data: { kind: "identityVerificationFailed", deepLink: "swapl://profile" },
    };
  },
  // ---- Dispute / resolution center (DOK-153) ----
  disputeOpened(proposalId: string, category: string, urgent: boolean): PushPayload {
    return {
      title: urgent ? "Urgent issue on your swap" : "A problem was reported",
      body: urgent
        ? `A ${category} issue was reported. If anyone is unsafe, call the 24/7 line. Tap to respond.`
        : `Your swap partner reported a ${category} issue. Tap to respond.`,
      data: { kind: "disputeOpened", proposalId, deepLink: deepLinkProposal(proposalId) },
    };
  },
  disputeStatusChanged(proposalId: string, status: string): PushPayload {
    return {
      title: `Dispute ${status.replace(/_/g, " ")}`,
      body: "There's an update on your reported problem. Tap to view.",
      data: { kind: "disputeStatusChanged", proposalId, deepLink: deepLinkProposal(proposalId) },
    };
  },
  disputeMessage(proposalId: string, fromName: string): PushPayload {
    return {
      title: `${fromName} replied on your dispute`,
      body: "New reply in the resolution center. Tap to read.",
      data: { kind: "disputeMessage", proposalId, deepLink: deepLinkProposal(proposalId) },
    };
  },
};
