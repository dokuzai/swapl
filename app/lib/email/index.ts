// Email adapter — falls back to console.log when RESEND_API_KEY is unset.
// Drop in the real Resend client by setting RESEND_API_KEY.

type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

export async function sendEmail(msg: EmailMessage): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.log(
      `[email:dev] -> ${msg.to}\n  subject: ${msg.subject}\n  ${msg.text.split("\n").join("\n  ")}`
    );
    return;
  }
  // Lazy-import so projects without Resend installed don't break the bundle.
  const { Resend } = await import("resend");
  const resend = new Resend(key);
  await resend.emails.send({
    from: process.env.RESEND_FROM ?? "swapl <hello@swapl.test>",
    to: msg.to,
    subject: msg.subject,
    text: msg.text,
    html: msg.html ?? msg.text.replace(/\n/g, "<br>"),
  });
}

export const emailTemplates = {
  betaWelcome: (email: string) => ({
    to: email,
    subject: "You're on the swapl beta list",
    text: `Welcome to swapl.\n\nYou'll be one of the first to swap homes when the beta opens. We'll send your invite link directly here.\n\n— The swapl team`,
  }),
  proposalReceived: (toEmail: string, proposerName: string, targetCity: string) => ({
    to: toEmail,
    subject: `${proposerName} proposed a swap for your ${targetCity} listing`,
    text: `${proposerName} just proposed a home swap on swapl.\n\nReview the dates and decide whether to accept, decline, or counter from your inbox: /swaps`,
  }),
  proposalAccepted: (toEmail: string) => ({
    to: toEmail,
    subject: "Your swap is on — keys for keys",
    text: `Great news: your swap was accepted. Your stay is automatically insured (€150k property + liability + trip interruption).\n\nA 24/7 support line and key-exchange instructions are in your /swaps thread.`,
  }),
  proposalDeclined: (toEmail: string) => ({
    to: toEmail,
    subject: "Your swap proposal was declined",
    text: `It happens. Browse other matches at /listings — there are plenty of homes waiting for yours.`,
  }),
  proposalCountered: (toEmail: string) => ({
    to: toEmail,
    subject: "You got a counter-offer on your swap",
    text: `The other side proposed different dates. Open the thread at /swaps to accept or counter back.`,
  }),
};
