import { prisma } from "@/lib/db";
import {
  buildAdminEmail,
  buildCustomerEmail,
  type DiagnosticEmailInput,
  type EmailLocale,
} from "./email/diagnosticEmails";

/**
 * Durable outbox for internal notification email.
 *
 * The ordering rule is the whole point: a submission is COMMITTED first,
 * then a row is enqueued here. Mail is never on the critical path of a
 * save. So a mail outage cannot lose a lead, cannot make a successful
 * submission report failure to the visitor, and cannot cause a duplicate
 * submission when the visitor retries.
 *
 * `dedupeKey` is unique, so a retry of the same event resolves to the same
 * outbox row rather than sending twice.
 *
 * A submission produces TWO rows — one confirmation to the customer, one
 * notification to MODUS — and they are independent in every way that
 * matters. Separate dedupe keys, separate attempt counters, separate
 * backoff, and a dispatch loop that catches per row. So a customer address
 * that bounces retries only the customer mail, and can never cause the
 * internal notification to be sent a second time.
 */

/**
 * Where internal notifications go. Centralised server-side configuration —
 * NEVER taken from browser input, which would turn every form into an
 * open relay for whoever crafted the request.
 */
export const NOTIFICATION_RECIPIENT =
  process.env.FORM_NOTIFICATION_TO || "hello@withmodus.co";

const MAX_ATTEMPTS = 5;

/** Strips CR/LF so submitted content cannot inject extra mail headers. */
function headerSafe(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

export type SubmissionNotification = {
  diagnosticId: string;
  companyName: string;
  contactName: string;
  contactEmail: string;
  formType: string;
  submittedAt: Date;
  adminUrl: string;
};

/**
 * The previous text-only internal notification.
 *
 * Kept because its unit tests describe behaviour that still has to hold —
 * header-safe subjects, answers not being inlined — and because the admin
 * mail's dedupe key is unchanged, so a half-deployed state cannot produce
 * two internal notifications for one submission.
 */
export function buildSubmissionEmail(n: SubmissionNotification) {
  const subject = headerSafe(`New MODUS ${n.formType} — ${n.companyName}`);
  const body = [
    `A new ${n.formType} has been submitted and saved.`,
    ``,
    `Company:    ${n.companyName}`,
    `Contact:    ${n.contactName}`,
    `Email:      ${n.contactEmail}`,
    `Submitted:  ${n.submittedAt.toISOString()}`,
    `Reference:  ${n.diagnosticId}`,
    ``,
    `Open it in the admin inbox:`,
    n.adminUrl,
    ``,
    `The answers are not included here — they stay behind authentication.`,
  ].join("\n");
  return { subject, body };
}

/**
 * Enqueues one mail. Never throws into the request path.
 *
 * If enqueueing fails the submission is still saved and the visitor must
 * still be told it succeeded, because it did. The failure is logged for
 * reconciliation instead. Each call is independent: one failing does not
 * stop or repeat the other.
 */
async function enqueue(row: {
  kind: string;
  dedupeKey: string;
  recipient: string;
  subject: string;
  body: string;
  html?: string;
  replyTo?: string;
}): Promise<void> {
  try {
    await prisma.notificationOutbox.create({
      data: { ...row, nextAttemptAt: new Date() },
    });
  } catch (error) {
    const known = error as { code?: string };
    // P2002 = unique violation on dedupeKey: already enqueued. That is the
    // mechanism working, not a problem.
    if (known.code !== "P2002") {
      console.error(`[outbox] enqueue of ${row.kind} failed; submission is still saved`, error);
    }
  }
}

/**
 * Enqueues the confirmation and the internal notification for a saved
 * diagnostic. Call this AFTER the submission is committed.
 *
 * Both are composed here and stored, so a retry hours later sends what was
 * written at submission time rather than re-rendering against a record a
 * reviewer has since edited.
 */
export async function enqueueDiagnosticEmails(
  d: DiagnosticEmailInput,
  locale: EmailLocale,
  origin: string
): Promise<void> {
  const customer = buildCustomerEmail(d, locale, origin);
  const admin = buildAdminEmail(d, origin);

  await Promise.all([
    enqueue({
      kind: "diagnostic.received",
      dedupeKey: `diagnostic.received:${d.id}`,
      recipient: d.email,
      subject: customer.subject,
      body: customer.text,
      html: customer.html,
      replyTo: customer.replyTo,
    }),
    enqueue({
      kind: "diagnostic.submitted",
      // Unchanged from the text-only version on purpose: one internal
      // notification per submission, however many times the event is
      // replayed or whichever build enqueued it.
      dedupeKey: `diagnostic.submitted:${d.id}`,
      recipient: NOTIFICATION_RECIPIENT,
      subject: admin.subject,
      body: admin.text,
      html: admin.html,
      replyTo: admin.replyTo,
    }),
  ]);
}

/** @deprecated Use `enqueueDiagnosticEmails`. Kept for existing callers. */
export async function enqueueSubmissionNotification(
  n: SubmissionNotification
): Promise<void> {
  const { subject, body } = buildSubmissionEmail(n);
  await enqueue({
    kind: "diagnostic.submitted",
    dedupeKey: `diagnostic.submitted:${n.diagnosticId}`,
    recipient: NOTIFICATION_RECIPIENT,
    subject,
    body,
  });
}

/**
 * Delivers pending notifications.
 *
 * Intended to be driven by a scheduled invocation. Exponential backoff,
 * bounded attempts, and `status` moved to FAILED only after the bound is
 * reached so a permanently broken address stops being retried forever.
 */
export async function dispatchPending(limit = 20): Promise<{
  sent: number;
  failed: number;
  skipped: number;
}> {
  const { sendMail, isMailConfigured } = await import("./mailer");

  if (!isMailConfigured()) {
    // Explicit and loud rather than silently pretending to deliver.
    const pending = await prisma.notificationOutbox.count({ where: { status: "PENDING" } });
    console.warn(
      `[outbox] no mail provider configured; ${pending} notification(s) waiting. ` +
        `Set RESEND_API_KEY and MAIL_FROM to enable delivery.`
    );
    return { sent: 0, failed: 0, skipped: pending };
  }

  const due = await prisma.notificationOutbox.findMany({
    where: {
      status: "PENDING",
      OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: new Date() } }],
    },
    orderBy: { createdAt: "asc" },
    take: limit,
  });

  let sent = 0;
  let failed = 0;

  for (const row of due) {
    try {
      await sendMail({
        to: row.recipient,
        subject: row.subject,
        text: row.body,
        // Rows enqueued before the HTML part existed have neither of
        // these, and still send correctly as text with no Reply-To.
        ...(row.html ? { html: row.html } : {}),
        ...(row.replyTo ? { replyTo: row.replyTo } : {}),
      });
      await prisma.notificationOutbox.update({
        where: { id: row.id },
        data: { status: "SENT", sentAt: new Date(), attempts: row.attempts + 1, lastError: null },
      });
      sent++;
    } catch (error) {
      const attempts = row.attempts + 1;
      const exhausted = attempts >= MAX_ATTEMPTS;
      await prisma.notificationOutbox.update({
        where: { id: row.id },
        data: {
          attempts,
          status: exhausted ? "FAILED" : "PENDING",
          lastError: String(error).slice(0, 500),
          // 1m, 2m, 4m, 8m ...
          nextAttemptAt: exhausted ? null : new Date(Date.now() + 60_000 * 2 ** (attempts - 1)),
        },
      });
      failed++;
    }
  }

  return { sent, failed, skipped: 0 };
}
