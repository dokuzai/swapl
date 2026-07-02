// Notification taxonomy + per-category delivery gate (granular notification
// preferences). Every push/email event maps to one NotificationCategory.
//
// Six categories are user-controllable from the account page; toggling one off
// suppresses both the push and the email for every event in it. The remaining
// two — `disputes` and `account` (security/identity/verification) — are
// safety- and trust-critical, so they bypass the toggles entirely and always
// deliver. The two channel master switches (emailNotifications /
// pushNotifications) only gate the controllable categories, never these.
//
// Single source of truth for both adapters: sendPush() reads the event from
// payload.data.kind, sendEmail() from its opts.kind.

import type { UserSettings } from "@/lib/settings";

export type NotificationKind =
  | "proposalReceived"
  | "proposalAccepted"
  | "proposalDeclined"
  | "proposalCountered"
  | "swapMessageReceived"
  | "conversationMessage"
  | "swapParticipantInvited"
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
  | "identityVerificationFailed"
  | "keysGiftReceived"
  | "keysStayRequested"
  | "keysStayConfirmed"
  | "keysStayDeclined"
  | "keysStayCompleted"
  | "referralRewarded"
  | "windowProposals";

export type NotificationCategory =
  | "messages"
  | "proposals"
  | "trips"
  | "reviews"
  | "keys"
  | "recommendations"
  | "disputes"
  | "account";

export const KIND_CATEGORY: Record<NotificationKind, NotificationCategory> = {
  // Conversations
  swapMessageReceived: "messages",
  conversationMessage: "messages",
  swapParticipantInvited: "messages",
  // Proposal lifecycle
  proposalReceived: "proposals",
  proposalAccepted: "proposals",
  proposalDeclined: "proposals",
  proposalCountered: "proposals",
  // Trips: reminders, check-in/out, swap outcome, logistics
  insurancePolicyCreated: "trips",
  preTripReminder: "trips",
  addOnPurchased: "trips",
  swapCancelled: "trips",
  swapCompleted: "trips",
  checkedIn: "trips",
  checkedOut: "trips",
  homeGuideReminder: "trips",
  checkInNudge: "trips",
  // Reviews
  reviewReceived: "reviews",
  reviewReminder: "reviews",
  // Keys economy + referrals
  keysGiftReceived: "keys",
  keysStayRequested: "keys",
  keysStayConfirmed: "keys",
  keysStayDeclined: "keys",
  keysStayCompleted: "keys",
  referralRewarded: "keys",
  // Suggestions / discovery
  windowProposals: "recommendations",
  // Always-on (safety + trust) — not user-controllable
  disputeOpened: "disputes",
  disputeStatusChanged: "disputes",
  disputeMessage: "disputes",
  verificationApproved: "account",
  verificationRejected: "account",
  featuredActivated: "account",
  identityVerified: "account",
  identityVerificationFailed: "account",
};

// Maps a controllable category to its UserSettings flag. Categories absent here
// (disputes, account) are always-on and bypass both the category and master
// switch — the user can never silence safety/security mail.
export const CATEGORY_SETTING: Partial<Record<NotificationCategory, keyof UserSettings>> = {
  messages: "notifyMessages",
  proposals: "notifyProposals",
  trips: "notifyTrips",
  reviews: "notifyReviews",
  keys: "notifyKeys",
  recommendations: "notifyRecommendations",
};

// The categories rendered as toggles on the account page, in display order.
export const CONTROLLABLE_CATEGORIES = [
  "messages",
  "proposals",
  "trips",
  "reviews",
  "keys",
  "recommendations",
] as const satisfies readonly NotificationCategory[];

/**
 * Whether a notification of `kind` should be delivered on `channel` given the
 * user's settings. Always-on categories return true regardless of any switch;
 * controllable categories require both the channel master switch and the
 * category switch to be on.
 */
export function notificationAllowed(
  settings: UserSettings,
  channel: "push" | "email",
  kind: NotificationKind
): boolean {
  const settingKey = CATEGORY_SETTING[KIND_CATEGORY[kind]];
  if (!settingKey) return true; // always-on (disputes / account)
  const master = channel === "push" ? settings.pushNotifications : settings.emailNotifications;
  return master && settings[settingKey];
}
