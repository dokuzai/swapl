// Email adapter — falls back to console.log when RESEND_API_KEY is unset.
// Drop in the real Resend client by setting RESEND_API_KEY.
//
// The branded React-Email templates live in app/emails/templates.tsx and
// return Promise<EmailMessage>. The legacy `emailTemplates` object preserved
// here is a thin sync façade over the same templates so older call sites
// don't break — both forms route through sendEmail().

type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

export async function sendEmail(msg: EmailMessage | Promise<EmailMessage>): Promise<void> {
  const m = msg instanceof Promise ? await msg : msg;
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.log(
      `[email:dev] -> ${m.to}\n  subject: ${m.subject}\n  ${m.text.split("\n").join("\n  ")}`
    );
    return;
  }
  // In production a missing RESEND_FROM is a config bug: the swapl.test
  // fallback would silently fail (or bounce) at Resend. Log an explicit
  // error and skip the send instead of papering over it.
  let from = process.env.RESEND_FROM;
  if (!from) {
    if (process.env.NODE_ENV === "production") {
      console.error(
        `[email] RESEND_FROM is not set in production — refusing to send "${m.subject}" to ${m.to} from the placeholder hello@swapl.test. Set RESEND_FROM to a verified sender (e.g. "swapl <hello@swapl.com>").`
      );
      return;
    }
    from = "swapl <hello@swapl.test>";
  }

  // Lazy-import so projects without Resend installed don't break the bundle.
  const { Resend } = await import("resend");
  const resend = new Resend(key);
  await resend.emails.send({
    from,
    to: m.to,
    subject: m.subject,
    text: m.text,
    html: m.html ?? m.text.replace(/\n/g, "<br>"),
  });
}

// Re-export the branded templates so existing imports keep working. Each
// factory now returns a Promise<EmailMessage>; sendEmail awaits them.
export { templates as emailTemplates } from "@/emails/templates";
