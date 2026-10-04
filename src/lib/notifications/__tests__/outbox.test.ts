import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * The outbox's durability guarantees, exercised against the real logic
 * with the database and the mail provider mocked.
 *
 * These are the properties that decide whether a lead can be lost, and
 * whether a retry can bill a customer's inbox twice.
 */

type Row = {
  id: string;
  dedupeKey: string;
  recipient: string;
  subject: string;
  body: string;
  providerMessageId: string | null;
  deliveryState: string | null;
  deliveryStateAt: Date | null;
  html: string | null;
  replyTo: string | null;
  kind: string;
  status: string;
  attempts: number;
  lastError: string | null;
  sentAt: Date | null;
  nextAttemptAt: Date | null;
  createdAt: Date;
};

let rows: Row[] = [];

const prismaMock = {
  notificationOutbox: {
    create: vi.fn(async ({ data }: { data: Partial<Row> }) => {
      if (rows.some((r) => r.dedupeKey === data.dedupeKey)) {
        // Mirrors Postgres' unique violation on dedupeKey.
        throw Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
      }
      const row = {
        id: `o${rows.length + 1}`,
        providerMessageId: null,
        deliveryState: null,
        deliveryStateAt: null,
        html: null,
        replyTo: null,
        status: "PENDING",
        attempts: 0,
        lastError: null,
        sentAt: null,
        nextAttemptAt: new Date(),
        createdAt: new Date(),
        ...data,
      } as Row;
      rows.push(row);
      return row;
    }),
    findMany: vi.fn(async ({ take }: { take?: number } = {}) =>
      rows
        .filter(
          (r) =>
            r.status === "PENDING" && (!r.nextAttemptAt || r.nextAttemptAt.getTime() <= Date.now())
        )
        .slice(0, take ?? 50)
    ),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<Row> }) => {
      const row = rows.find((r) => r.id === where.id)!;
      Object.assign(row, data);
      return row;
    }),
    count: vi.fn(async () => rows.filter((r) => r.status === "PENDING").length),
  },
};

vi.mock("@/lib/db", () => ({ prisma: prismaMock }));

/*
 * Typed as the real adapter now is: a send resolves to the provider's
 * result, so a test that stubs it has to resolve to one too. The default
 * is "accepted, no id", which is the shape a provider that returns an
 * unreadable body produces.
 */
const sendMail =
  vi.fn<(mail: unknown) => Promise<{ id: string | null }>>(async () => ({ id: null }));
const isMailConfigured = vi.fn(() => true);
vi.mock("../mailer", () => ({
  sendMail: (mail: unknown) => sendMail(mail),
  isMailConfigured: () => isMailConfigured(),
}));

const { enqueueSubmissionNotification, enqueueDiagnosticEmails, dispatchPending, buildSubmissionEmail } =
  await import("../outbox");
const { base } = await import("../email/__tests__/fixtures");

const ORIGIN = "https://www.withmodus.co";

const notification = {
  diagnosticId: "diag_1",
  companyName: "Acme BV",
  contactName: "Ada Lovelace",
  contactEmail: "ada@example.com",
  formType: "diagnostic submission",
  submittedAt: new Date("2026-10-02T12:00:00Z"),
  adminUrl: "https://www.withmodus.co/private/diagnostics/diag_1",
};

beforeEach(() => {
  rows = [];
  sendMail.mockReset();
  // `mockReset` clears the implementation too, so the default has to be
  // restored here: without it every send resolves to `undefined` and the
  // dispatcher sees a malformed result rather than a successful send.
  sendMail.mockResolvedValue({ id: null });
  isMailConfigured.mockReturnValue(true);
});

describe("a mail failure never loses the record", () => {
  it("keeps the row PENDING and schedules a retry", async () => {
    await enqueueSubmissionNotification(notification);
    sendMail.mockRejectedValue(new Error("provider is down"));

    const result = await dispatchPending();

    expect(result).toMatchObject({ sent: 0, failed: 1 });
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("PENDING");
    expect(rows[0].attempts).toBe(1);
    expect(rows[0].lastError).toContain("provider is down");
    // Backed off, so the next sweep does not hammer a provider that is down.
    expect(rows[0].nextAttemptAt!.getTime()).toBeGreaterThan(Date.now());
    expect(rows[0].sentAt).toBeNull();
  });

  it("backs off further with each attempt and gives up only after a bound", async () => {
    await enqueueSubmissionNotification(notification);
    sendMail.mockRejectedValue(new Error("still down"));

    // Clearing the backoff through a function call, rather than inline in
    // the loop, keeps TypeScript from narrowing `nextAttemptAt` to `null`
    // for the rest of the body and making the read below unreachable.
    const makeDueAgain = () => {
      rows[0].nextAttemptAt = null;
    };

    const delays: number[] = [];
    for (let i = 0; i < 5; i++) {
      makeDueAgain();
      await dispatchPending();
      const next = rows[0].nextAttemptAt;
      if (next) delays.push(next.getTime() - Date.now());
    }

    expect(rows[0].attempts).toBe(5);
    // Only after the bound does it stop, so a permanently bad address is
    // not retried forever.
    expect(rows[0].status).toBe("FAILED");
    for (let i = 1; i < delays.length; i++) {
      expect(delays[i]).toBeGreaterThan(delays[i - 1]);
    }
  });

  it("does not throw into the request path when enqueueing fails", async () => {
    prismaMock.notificationOutbox.create.mockRejectedValueOnce(new Error("db unavailable"));
    // The submission is already committed at this point: this must never
    // turn a saved record into a reported failure.
    await expect(enqueueSubmissionNotification(notification)).resolves.toBeUndefined();
  });
});

describe("retries never deliver twice", () => {
  it("collapses a repeated event onto one row", async () => {
    await enqueueSubmissionNotification(notification);
    await enqueueSubmissionNotification(notification);
    await enqueueSubmissionNotification(notification);

    expect(rows).toHaveLength(1);
    expect(rows[0].dedupeKey).toBe("diagnostic.submitted:diag_1");
  });

  it("sends once, then stops considering the row", async () => {
    await enqueueSubmissionNotification(notification);
    sendMail.mockResolvedValue({ id: null });

    const first = await dispatchPending();
    expect(first.sent).toBe(1);
    expect(rows[0].status).toBe("SENT");
    expect(rows[0].sentAt).toBeInstanceOf(Date);

    // A second sweep, a duplicate cron tick, a manual run — none may
    // re-send an already-delivered notification.
    const second = await dispatchPending();
    expect(second.sent).toBe(0);
    expect(sendMail).toHaveBeenCalledTimes(1);
  });

  it("re-enqueueing after a successful send does not resurrect it", async () => {
    await enqueueSubmissionNotification(notification);
    sendMail.mockResolvedValue({ id: null });
    await dispatchPending();

    await enqueueSubmissionNotification(notification);
    await dispatchPending();

    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(rows).toHaveLength(1);
  });
});

describe("no provider configured", () => {
  it("reports the backlog and sends nothing, rather than pretending", async () => {
    await enqueueSubmissionNotification(notification);
    isMailConfigured.mockReturnValue(false);

    const result = await dispatchPending();

    expect(result).toEqual({ sent: 0, failed: 0, skipped: 1 });
    expect(sendMail).not.toHaveBeenCalled();
    expect(rows[0].status).toBe("PENDING");
  });
});

describe("the email itself", () => {
  it("summarises without leaking the submission", () => {
    const { subject, body } = buildSubmissionEmail(notification);
    expect(subject).toBe("New MODUS diagnostic submission — Acme BV");
    expect(body).toContain("diag_1");
    expect(body).toContain(notification.adminUrl);
    // Answers stay behind authentication, not in an inbox and every mail
    // server along the way.
    expect(body).toContain("not included here");
  });

  it("strips CR/LF so submitted content cannot inject mail headers", () => {
    const { subject } = buildSubmissionEmail({
      ...notification,
      companyName: "Acme\r\nBcc: attacker@evil.test",
    });
    expect(subject).not.toContain("\n");
    expect(subject).not.toContain("\r");
  });
});


describe("a submission produces two independent mails", () => {
  it("enqueues a confirmation to the customer and a notification to MODUS", async () => {
    await enqueueDiagnosticEmails(base, "nl", ORIGIN);

    expect(rows).toHaveLength(2);
    const customer = rows.find((r) => r.kind === "diagnostic.received")!;
    const admin = rows.find((r) => r.kind === "diagnostic.submitted")!;

    expect(customer.recipient).toBe(base.email);
    // Never the customer's address: it is centralised server-side
    // configuration, or every form becomes an open relay.
    expect(admin.recipient).not.toBe(base.email);
    expect(customer.dedupeKey).not.toBe(admin.dedupeKey);
  });

  it("keeps the internal notification's dedupe key unchanged", async () => {
    // A half-deployed state must not be able to send two internal
    // notifications for one submission.
    await enqueueDiagnosticEmails(base, "nl", ORIGIN);
    expect(rows.find((r) => r.kind === "diagnostic.submitted")!.dedupeKey).toBe(
      `diagnostic.submitted:${base.id}`
    );
  });

  it("stores both parts and a reply address", async () => {
    await enqueueDiagnosticEmails(base, "nl", ORIGIN);
    for (const row of rows) {
      expect(row.body.length).toBeGreaterThan(40);
      expect(row.html).toContain("<!doctype html>");
      expect(row.replyTo).toBeTruthy();
    }
  });

  it("a failing customer mail does NOT resend the internal notification", async () => {
    await enqueueDiagnosticEmails(base, "nl", ORIGIN);
    // The customer's provider rejects; MODUS's own address is fine.
    sendMail.mockImplementation(async (mail) => {
      if ((mail as { to: string }).to === base.email) throw new Error("mailbox full");
      return { id: null };
    });

    await dispatchPending();
    await dispatchPending();

    const toAdmin = sendMail.mock.calls.filter(([m]) => (m as { to: string }).to !== base.email);
    expect(toAdmin, "the internal notification should be sent exactly once").toHaveLength(1);
    // And the customer row is still retrying on its own counter.
    const customer = rows.find((r) => r.kind === "diagnostic.received")!;
    const admin = rows.find((r) => r.kind === "diagnostic.submitted")!;
    expect(customer.status).toBe("PENDING");
    expect(customer.attempts).toBeGreaterThan(0);
    expect(admin.status).toBe("SENT");
    expect(admin.attempts).toBe(1);
  });

  it("enqueues both exactly once however often the event is replayed", async () => {
    await enqueueDiagnosticEmails(base, "nl", ORIGIN);
    await enqueueDiagnosticEmails(base, "nl", ORIGIN);
    await enqueueDiagnosticEmails(base, "nl", ORIGIN);
    expect(rows).toHaveLength(2);
  });

  it("composes at enqueue time, so a retry sends what was written then", async () => {
    await enqueueDiagnosticEmails(base, "nl", ORIGIN);
    const stored = rows.find((r) => r.kind === "diagnostic.received")!.html;
    sendMail.mockRejectedValueOnce(new Error("down"));
    await dispatchPending();
    rows.forEach((r) => {
      r.nextAttemptAt = new Date(0);
    });
    sendMail.mockReset();
    await dispatchPending();
    const sentHtml = (sendMail.mock.calls.find(([m]) => (m as { to: string }).to === base.email)?.[0] as
      | { html?: string }
      | undefined)?.html;
    expect(sentHtml).toBe(stored);
  });
});

describe("rows written before HTML mail existed still send", () => {
  it("sends the text part alone, with no Reply-To", async () => {
    // The deprecated text-only path, which is what those rows look like.
    await enqueueSubmissionNotification(notification);
    await dispatchPending();

    expect(sendMail).toHaveBeenCalledTimes(1);
    const sent = sendMail.mock.calls[0][0] as Record<string, unknown>;
    expect(sent.text).toContain("Acme BV");
    expect(sent).not.toHaveProperty("html");
    expect(sent).not.toHaveProperty("replyTo");
  });
});


describe("acceptance is recorded as acceptance, not as delivery", () => {
  it("stores the provider's message id so the send can be looked up later", async () => {
    sendMail.mockResolvedValue({ id: "re_abc123" });
    await enqueueDiagnosticEmails(base, "nl", ORIGIN);
    await dispatchPending();

    for (const row of rows) {
      expect(row.providerMessageId, `${row.kind} should carry the id`).toBe("re_abc123");
    }
  });

  it('records ACCEPTED, never DELIVERED', () => {
    /*
     * The distinction this whole change exists for. A 2xx from the
     * provider means it took the message. A suppressed recipient is
     * accepted exactly the same way and then never delivered, which is how
     * five notifications read as clean sends while none arrived.
     */
    return (async () => {
      sendMail.mockResolvedValue({ id: "re_xyz" });
      await enqueueDiagnosticEmails(base, "nl", ORIGIN);
      await dispatchPending();
      for (const row of rows) {
        expect(row.status).toBe("SENT");
        expect(row.deliveryState).toBe("ACCEPTED");
        expect(row.deliveryState).not.toBe("DELIVERED");
        expect(row.deliveryStateAt).toBeInstanceOf(Date);
      }
    })();
  });

  it("still succeeds when the provider returns no id", async () => {
    // Losing the ability to look a message up is not a reason to treat an
    // accepted message as failed.
    sendMail.mockResolvedValue({ id: null });
    await enqueueDiagnosticEmails(base, "nl", ORIGIN);
    const result = await dispatchPending();

    expect(result.sent).toBe(2);
    for (const row of rows) {
      expect(row.status).toBe("SENT");
      expect(row.providerMessageId).toBeNull();
      expect(row.deliveryState).toBe("ACCEPTED");
    }
  });

  it("leaves a failed send with no id and no delivery claim", async () => {
    sendMail.mockRejectedValue(new Error("provider is down"));
    await enqueueDiagnosticEmails(base, "nl", ORIGIN);
    await dispatchPending();

    for (const row of rows) {
      expect(row.status).toBe("PENDING");
      expect(row.providerMessageId).toBeNull();
      expect(row.deliveryState).toBeNull();
    }
  });

  it("does not change retries or deduplication", async () => {
    // The queue behaviour this is bolted onto must be exactly as before.
    sendMail.mockResolvedValue({ id: "re_1" });
    await enqueueDiagnosticEmails(base, "nl", ORIGIN);
    await enqueueDiagnosticEmails(base, "nl", ORIGIN);
    expect(rows).toHaveLength(2);

    sendMail.mockReset();
    sendMail.mockResolvedValue({ id: "re_2" });
    sendMail.mockRejectedValueOnce(new Error("down"));
    await dispatchPending();
    const failed = rows.find((r) => r.status === "PENDING");
    expect(failed, "a failure still schedules its own retry").toBeTruthy();
    expect(failed!.nextAttemptAt).toBeInstanceOf(Date);
    expect(failed!.attempts).toBe(1);
  });
});
