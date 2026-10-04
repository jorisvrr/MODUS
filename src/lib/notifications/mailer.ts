/**
 * Outbound mail adapter.
 *
 * `hello@withmodus.co` is a RECEIVING alias (Namecheap forwarding). An
 * alias that forwards cannot send — outbound delivery needs a separately
 * verified transactional provider with a verified sending domain. Until
 * one is configured this module reports "not configured" rather than
 * pretending mail went out.
 *
 * Resend is used because it needs only an API key and a verified domain.
 * Swapping providers means replacing this file alone; the outbox, the
 * retry policy and the call sites do not change.
 *
 * The sending identity is `MAIL_FROM` and nothing here changes it: the
 * verified domain is configuration, not something a template picks. A
 * submitter's address goes in Reply-To only — putting it in From would
 * fail SPF/DKIM and get the domain classified as a forger.
 *
 * No tracking is requested of the provider. Resend only rewrites links
 * for open/click tracking when it is switched on, and it is not: a
 * confirmation mail does not need to know whether it was opened, and a
 * rewritten link would carry a per-recipient identifier through a third
 * party for no benefit to the person receiving it.
 */

export function isMailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.MAIL_FROM);
}

export type OutgoingMail = {
  to: string;
  subject: string;
  /**
   * The plain-text part. Always sent, even alongside HTML: it is what a
   * text-only client, a screen reader in text mode and most spam filters
   * actually read, and a message with no text part scores worse for it.
   */
  text: string;
  /** The HTML part, where one was composed. */
  html?: string;
  /** Where a reply should go. Never used as the From address. */
  replyTo?: string;
};

export async function sendMail(mail: OutgoingMail): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM;
  if (!apiKey || !from) throw new Error("Mail provider is not configured");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      // `from` is always the verified sending domain. A submitter's
      // address goes in Reply-To and is never spoofed into From, which
      // would fail SPF/DKIM and get the domain classified as a forger.
      from,
      to: [mail.to],
      subject: mail.subject,
      text: mail.text,
      ...(mail.html ? { html: mail.html } : {}),
      ...(mail.replyTo ? { reply_to: [mail.replyTo] } : {}),
    }),
  });

  if (!response.ok) {
    throw new Error(`Mail provider rejected the message: ${response.status}`);
  }
}
