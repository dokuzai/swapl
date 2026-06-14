// Branded transactional templates. Each factory returns the complete
// `EmailMessage` (subject + plain text + rendered HTML) so callers can pass
// it straight to sendEmail() with no template knowledge.

import { render } from "@react-email/render";
import { Text } from "@react-email/components";
import { EmailShell } from "./_shell";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://swapl.vercel.app";
const MARKETING_URL = process.env.NEXT_PUBLIC_MARKETING_URL ?? "https://swapl.fun";

type RenderedEmail = { subject: string; text: string; html: string; to: string };

async function build(opts: {
  to: string;
  subject: string;
  text: string;
  preview: string;
  heading: string;
  intro?: string;
  body?: React.ReactNode;
  ctaLabel?: string;
  ctaHref?: string;
}): Promise<RenderedEmail> {
  const html = await render(
    <EmailShell
      preview={opts.preview}
      heading={opts.heading}
      intro={opts.intro}
      body={opts.body}
      ctaLabel={opts.ctaLabel}
      ctaHref={opts.ctaHref}
    />,
  );
  return { to: opts.to, subject: opts.subject, text: opts.text, html };
}

export const templates = {
  betaWelcome: (email: string) =>
    build({
      to: email,
      subject: "You're on the swapl list — see you in September",
      preview: "We're collecting listings — swaps go live September 2026.",
      heading: "You're on the list.",
      intro: "We're collecting listings now and launching swaps in September 2026. List your home before then and you'll surface above standard results when matches start.",
      ctaLabel: "List your home",
      ctaHref: `${APP_URL}/listings/new`,
      text: "You're on the swapl list. We're collecting listings ahead of the September 2026 launch. List your home now and you'll surface first when swaps go live.",
    }),

  betaInvite: (email: string) =>
    build({
      to: email,
      subject: "Your swapl invite is ready",
      preview: "The marketplace is open — come claim your spot.",
      heading: "You're in.",
      intro: "The marketplace is open — publish your home and start matching with homes around the world.",
      ctaLabel: "Create your account",
      ctaHref: `${APP_URL}/register?utm_source=waitlist&utm_campaign=beta_invite`,
      text: `Your swapl invite is ready. The marketplace is open — publish your home and start matching.\n\nCreate your account: ${APP_URL}/register?utm_source=waitlist&utm_campaign=beta_invite`,
    }),

  proposalReceived: (toEmail: string, proposerName: string, targetCity: string) =>
    build({
      to: toEmail,
      subject: `${proposerName} proposed a swap for your ${targetCity} listing`,
      preview: `${proposerName} just proposed a home swap.`,
      heading: `${proposerName} wants to swap.`,
      intro: `${proposerName} proposed a home swap on swapl. Review the dates and decide whether to accept, decline, or counter from your inbox.`,
      ctaLabel: "Open inbox",
      ctaHref: `${APP_URL}/swaps`,
      text: `${proposerName} just proposed a home swap on swapl.\n\nReview the dates and decide whether to accept, decline, or counter from your inbox: ${APP_URL}/swaps`,
    }),

  proposalAccepted: (toEmail: string) =>
    build({
      to: toEmail,
      subject: "Your swap is on — keys for keys",
      preview: "Your swap was accepted. Insurance is live.",
      heading: "Your swap is on.",
      intro: "Your stay is automatically insured (€150k property + liability + trip interruption). A 24/7 support line and key-exchange instructions are in your /swaps thread.",
      ctaLabel: "Open swap thread",
      ctaHref: `${APP_URL}/swaps`,
      text: `Your swap was accepted. Insurance is live (€150k cover + liability + trip interruption). Open the thread: ${APP_URL}/swaps`,
    }),

  proposalDeclined: (toEmail: string) =>
    build({
      to: toEmail,
      subject: "Your swap proposal was declined",
      preview: "Plenty of homes still waiting for yours.",
      heading: "It happens.",
      intro: "Browse other matches — there are plenty of homes waiting for yours.",
      ctaLabel: "See homes",
      ctaHref: `${APP_URL}/listings`,
      text: `Your proposal was declined. Browse other matches at ${APP_URL}/listings.`,
    }),

  proposalCountered: (toEmail: string) =>
    build({
      to: toEmail,
      subject: "You got a counter-offer on your swap",
      preview: "The other side proposed different dates.",
      heading: "You got a counter-offer.",
      intro: "The other side proposed different dates. Open the thread to accept or counter back.",
      ctaLabel: "View counter",
      ctaHref: `${APP_URL}/swaps`,
      text: `The other side proposed different dates. Open the thread at ${APP_URL}/swaps to accept or counter back.`,
    }),

  swapMessageReceived: (toEmail: string, fromName: string) =>
    build({
      to: toEmail,
      subject: `${fromName} sent you a message on swapl`,
      preview: `New message from ${fromName}.`,
      heading: `${fromName} wrote.`,
      intro: "There's a new message in your swap thread. Open it to keep the conversation moving.",
      ctaLabel: "Open thread",
      ctaHref: `${APP_URL}/swaps`,
      text: `${fromName} sent you a message in your swap thread. Read it: ${APP_URL}/swaps`,
    }),

  insurancePolicyCreated: (toEmail: string, policyNumber: string) =>
    build({
      to: toEmail,
      subject: "Your swap is covered",
      preview: `Policy ${policyNumber} active.`,
      heading: "Your swap is covered.",
      intro: `Policy ${policyNumber} is active for the duration of your stay plus 30 days. Property + liability + trip interruption — both directions, both homes.`,
      ctaLabel: "View coverage",
      ctaHref: `${MARKETING_URL}/insurance`,
      text: `Policy ${policyNumber} is active. Property + liability + trip interruption are covered both ways for the swap window plus 30 days.`,
    }),

  verificationApproved: (toEmail: string, listingTitle: string) =>
    build({
      to: toEmail,
      subject: `${listingTitle} is now verified on swapl`,
      preview: "Your listing is verified.",
      heading: "Verified.",
      intro: `Your listing ${listingTitle} now carries the verified badge across browse, detail and your profile. It also surfaces above standard results.`,
      ctaLabel: "View listing",
      ctaHref: `${APP_URL}/dashboard`,
      text: `Your listing ${listingTitle} is now verified. The badge is live across browse, detail and your profile.`,
    }),

  verificationRejected: (toEmail: string, listingTitle: string) =>
    build({
      to: toEmail,
      subject: "Your verification was rejected",
      preview: "We weren't able to approve verification — refunded.",
      heading: "We couldn't approve this one.",
      intro: `We weren't able to approve verification for ${listingTitle}. The €39 fee has been refunded. You can re-submit anytime from your listing's edit page.`,
      ctaLabel: "Resubmit",
      ctaHref: `${APP_URL}/dashboard`,
      text: `We couldn't approve verification for ${listingTitle}. The €39 fee has been refunded. Resubmit from your listing's edit page.`,
    }),

  featuredActivated: (toEmail: string, listingTitle: string, endsAt: Date) =>
    build({
      to: toEmail,
      subject: `${listingTitle} is now featured`,
      preview: "Featured placement is live.",
      heading: "You're featured.",
      intro: `${listingTitle} now sits in the Featured band of browse. Boost ends ${endsAt.toLocaleDateString("en-US", { month: "long", day: "numeric" })}.`,
      ctaLabel: "Open listing",
      ctaHref: `${APP_URL}/dashboard`,
      text: `${listingTitle} is now featured. Boost ends ${endsAt.toDateString()}.`,
    }),

  addOnPurchased: (toEmail: string, addOnName: string, agreementCity: string, amountCents: number) =>
    build({
      to: toEmail,
      subject: `Add-on confirmed: ${addOnName}`,
      preview: `${addOnName} for ${agreementCity}.`,
      heading: `${addOnName} is booked.`,
      intro: `Total €${(amountCents / 100).toFixed(2)}. Logistics will arrive 48 h before your stay in ${agreementCity}.`,
      ctaLabel: "View swap",
      ctaHref: `${APP_URL}/swaps`,
      text: `Your ${addOnName} for ${agreementCity} is booked. Total €${(amountCents / 100).toFixed(2)}. Logistics 48 h before your stay.`,
    }),

  preTripReminder: (toEmail: string, destinationCity: string, dateFrom: Date) =>
    build({
      to: toEmail,
      subject: `48 hours to ${destinationCity}`,
      preview: "A short pre-trip reminder.",
      heading: `Heading to ${destinationCity}.`,
      intro: `Your swap starts ${dateFrom.toDateString()}. The host's key codes and 24/7 support number are in your thread. Have a great stay.`,
      ctaLabel: "Open thread",
      ctaHref: `${APP_URL}/swaps`,
      text: `Your swap starts ${dateFrom.toDateString()}. Key codes + 24/7 support live in your thread: ${APP_URL}/swaps`,
    }),

  reviewReceived: (toEmail: string, fromName: string, rating: number) =>
    build({
      to: toEmail,
      subject: `You received a new review from ${fromName}`,
      preview: `${fromName} rated their swap ${rating}/5.`,
      heading: `${fromName} reviewed your swap.`,
      intro: `${fromName} left you a ${rating}/5 review. It's live on your public profile — open it to read the full text.`,
      ctaLabel: "View your profile",
      ctaHref: `${APP_URL}/account`,
      text: `${fromName} left you a ${rating}/5 review on swapl. Read it on your profile: ${APP_URL}/account`,
    }),

  swapCompleted: (toEmail: string, otherCity: string) =>
    build({
      to: toEmail,
      subject: "Your swap is complete — how was your stay?",
      preview: "Leave a review for your swap partner.",
      heading: "Welcome home.",
      intro: `Your swap with ${otherCity} is complete. Reviews build trust for the whole community — tell the next swapper how your stay went.`,
      ctaLabel: "Leave a review",
      ctaHref: `${APP_URL}/swaps`,
      text: `Your swap with ${otherCity} is complete. Leave a review from your swap thread: ${APP_URL}/swaps`,
    }),

  reviewReminder: (toEmail: string, otherCity: string) =>
    build({
      to: toEmail,
      subject: "Don't forget to review your swap",
      preview: "Your swap partner is waiting to hear from you.",
      heading: "How was your stay?",
      intro: `Your swap with ${otherCity} wrapped up a week ago and your review is still open. It takes two minutes and helps the next swapper decide.`,
      ctaLabel: "Leave a review",
      ctaHref: `${APP_URL}/swaps`,
      text: `Your swap with ${otherCity} completed a week ago — don't forget to leave a review: ${APP_URL}/swaps`,
    }),

  checkedIn: (toEmail: string, name: string) =>
    build({
      to: toEmail,
      subject: `${name} has checked in`,
      preview: "Your swap is now in progress.",
      heading: `${name} has checked in.`,
      intro: `${name} has arrived and checked in. Your swap is now in progress — open your trip cockpit to see the details and any check-in photos.`,
      ctaLabel: "Open swap",
      ctaHref: `${APP_URL}/swaps`,
      text: `${name} has checked in. Your swap is now in progress: ${APP_URL}/swaps`,
    }),

  checkedOut: (toEmail: string, name: string) =>
    build({
      to: toEmail,
      subject: `${name} has checked out`,
      preview: "The stay is wrapping up.",
      heading: `${name} has checked out.`,
      intro: `${name} has checked out. Once both sides have wrapped up, you'll be invited to leave a review.`,
      ctaLabel: "Open swap",
      ctaHref: `${APP_URL}/swaps`,
      text: `${name} has checked out: ${APP_URL}/swaps`,
    }),

  homeGuideReminder: (toEmail: string, guestCity: string) =>
    build({
      to: toEmail,
      subject: "Complete your home guide",
      preview: "Your guest arrives soon — fill in the essentials.",
      heading: "Complete your home guide.",
      intro: `Your guest arrives in ${guestCity} soon. Add your Wi-Fi, key pickup, and the house essentials so their arrival is smooth — it unlocks for them 48 hours before the stay.`,
      ctaLabel: "Complete your guide",
      ctaHref: `${APP_URL}/swaps`,
      text: `Your guest arrives in ${guestCity} soon — complete your home guide: ${APP_URL}/swaps`,
    }),

  checkInNudge: (toEmail: string, destinationCity: string) =>
    build({
      to: toEmail,
      subject: `Arrived in ${destinationCity}?`,
      preview: "Check in to let your host know.",
      heading: `Arrived in ${destinationCity}?`,
      intro: "Your swap starts today. Check in from your trip cockpit to let your host know you've arrived — you can add a photo or a quick note.",
      ctaLabel: "Check in",
      ctaHref: `${APP_URL}/swaps`,
      text: `Your swap in ${destinationCity} starts today — check in from your trip cockpit: ${APP_URL}/swaps`,
    }),

  identityVerified: (toEmail: string) =>
    build({
      to: toEmail,
      subject: "You're verified ✓",
      preview: "Your identity check is complete.",
      heading: "You're verified.",
      intro: "Your identity verification is complete. The verified badge now shows on your profile and your proposals carry extra trust across the marketplace.",
      ctaLabel: "View your profile",
      ctaHref: `${APP_URL}/account`,
      text: `Your identity verification is complete — the verified badge is live on your profile: ${APP_URL}/account`,
    }),

  identityVerificationFailed: (toEmail: string) =>
    build({
      to: toEmail,
      subject: "Verification couldn't be completed",
      preview: "Your identity check didn't go through.",
      heading: "We couldn't verify you this time.",
      intro: "Your identity verification couldn't be completed. You can start a new check anytime from your account — it usually takes under two minutes.",
      ctaLabel: "Try again",
      ctaHref: `${APP_URL}/account`,
      text: `Your identity verification couldn't be completed. Start a new check from your account: ${APP_URL}/account`,
    }),

  corporateInvite: (toEmail: string, companyName: string, inviteLink: string) =>
    build({
      to: toEmail,
      subject: `${companyName} added you to swapl`,
      preview: "Set up your swapl account.",
      heading: `${companyName} invited you.`,
      intro: "Your seat is paid for and includes Pro features. Click below to set up your account in 30 seconds.",
      ctaLabel: "Accept invite",
      ctaHref: inviteLink,
      text: `${companyName} added you to swapl. Set up your account: ${inviteLink}`,
    }),

  monthlyCorporateDigest: (toEmail: string, companyName: string, completedSwaps: number, savings: number) =>
    build({
      to: toEmail,
      subject: `${companyName} swapl digest — ${completedSwaps} swaps`,
      preview: `Estimated savings €${savings.toLocaleString()}.`,
      heading: "This month at swapl.",
      intro: `Your team completed ${completedSwaps} swaps. Estimated savings vs. serviced apartments: €${savings.toLocaleString()}.`,
      ctaLabel: "Open dashboard",
      ctaHref: `${APP_URL}/org`,
      text: `Your team completed ${completedSwaps} swaps this month. Estimated savings €${savings.toLocaleString()}.`,
    }),

  // ---- Auth flows ----

  verifyEmail: (toEmail: string, token: string) => {
    const link = `${APP_URL}/api/auth/verify-email/${token}`;
    return build({
      to: toEmail,
      subject: "Confirm your swapl email",
      preview: "Click to verify your email — link valid for 7 days.",
      heading: "Confirm your email.",
      intro: "Just one click to finish setting up your swapl account. The link works for 7 days; ignore this message if you didn't sign up.",
      ctaLabel: "Verify email",
      ctaHref: link,
      text: `Confirm your swapl email by opening this link (valid for 7 days):\n\n${link}\n\nIf you didn't sign up, ignore this message.`,
    });
  },

  loginCode: (toEmail: string, code: string) => {
    return build({
      to: toEmail,
      subject: `${code} is your swapl login code`,
      preview: "Your one-time login code — valid for 10 minutes.",
      heading: "Your login code.",
      intro: "Enter this code to sign in. It works for 10 minutes and only once. If you didn't request it, ignore this email — nobody can sign in without it.",
      body: (
        <Text
          style={{
            fontSize: "32px",
            fontWeight: 700,
            letterSpacing: "8px",
            textAlign: "center" as const,
            margin: "16px 0",
          }}
        >
          {code}
        </Text>
      ),
      text: `Your swapl login code is: ${code}\n\nIt works for 10 minutes and only once. If you didn't request it, ignore this email.`,
    });
  },

  resetPassword: (toEmail: string, token: string) => {
    const link = `${APP_URL}/reset-password?token=${token}`;
    return build({
      to: toEmail,
      subject: "Reset your swapl password",
      preview: "We received a request to reset your password.",
      heading: "Reset your password.",
      intro: "Click below to set a new password. The link works for 1 hour. If you didn't ask for this, ignore the email — your account stays untouched.",
      ctaLabel: "Set a new password",
      ctaHref: link,
      text: `We received a request to reset your swapl password. Open this link within the next hour:\n\n${link}\n\nIf you didn't ask for this, no action is needed.`,
    });
  },

  passwordChanged: (toEmail: string) =>
    build({
      to: toEmail,
      subject: "Your swapl password was changed",
      preview: "Your account password was just updated.",
      heading: "Your password was changed.",
      intro: "Your swapl password was just updated and other signed-in devices were logged out. If this was you, no action is needed. If it wasn't, reset your password immediately and contact support@swapl.com.",
      ctaLabel: "Reset your password",
      ctaHref: `${APP_URL}/forgot-password`,
      text: `Your swapl password was just changed and other signed-in devices were logged out.\n\nIf this was you, no action is needed. If it wasn't, reset your password immediately: ${APP_URL}/forgot-password — and contact support@swapl.com.`,
    }),
};
