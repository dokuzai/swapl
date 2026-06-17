// Email adapter — falls back to console.log when RESEND_API_KEY is unset.
// Drop in the real Resend client by setting RESEND_API_KEY.
//
// The branded React-Email templates live in app/emails/templates.tsx and
// return Promise<EmailMessage>. The legacy `emailTemplates` object preserved
// here is a thin sync façade over the same templates so older call sites
// don't break — both forms route through sendEmail().

import { prisma } from "@/lib/db";
import { notificationAllowed, type NotificationKind } from "@/lib/notifications/categories";
import { parseSettings } from "@/lib/settings";

type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

// Pass `{ kind }` for notification mail so it honours the recipient's
// preferences (granular notifications). Omit it for transactional mail
// (password reset, login codes, email verification, receipts) — those must
// always send and have no kind in the taxonomy.
type SendEmailOptions = { kind?: NotificationKind };

export async function sendEmail(
  msg: EmailMessage | Promise<EmailMessage>,
  opts: SendEmailOptions = {}
): Promise<void> {
  const m = msg instanceof Promise ? await msg : msg;

  if (opts.kind) {
    const user = await prisma.user.findUnique({
      where: { email: m.to },
      select: { settings: true },
    });
    // Unknown recipient (e.g. an invite to someone not yet registered) has no
    // preferences to honour — default to sending.
    if (user && !notificationAllowed(parseSettings(user.settings), "email", opts.kind)) {
      return;
    }
  }

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
