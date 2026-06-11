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
};
