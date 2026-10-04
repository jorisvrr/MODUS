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

/**
 * What the provider said when it took the message.
 *
 * `id` is the provider's own handle for it, and the only way to ask later
 * what became of it. `null` when the response carried none — the send
 * still succeeded, we simply cannot look it up, which is the situation
 * this return value exists to stop happening again.
 */
export type SendResult = { id: string | null };

export async function sendMail(mail: OutgoingMail): Promise<SendResult> {
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

  /*
   * Read the id out of the response rather than discarding the body.
   *
   * A 2xx here means ACCEPTED and nothing more. Resend accepts a message
   * for a suppressed recipient exactly like any other and then does not
   * deliver it — which is how five internal notifications all recorded a
   * clean send while none arrived. Keeping the id is what makes that
   * answerable from the database instead of from a dashboard.
   *
   * A malformed or empty body is not a failure: the message was accepted.
   * We lose the ability to look it up, which is worth logging and not
   * worth throwing over.
   */
  try {
    const body = (await response.json()) as { id?: unknown };
    return { id: typeof body?.id === "string" ? body.id : null };
  } catch {
    return { id: null };
  }
}
