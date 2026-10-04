import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The outbound adapter, against a stubbed provider.
 *
 * The property that matters most here is the one that was missing: the
 * send response carries the provider's id, and throwing it away is what
 * made "what happened to that message?" unanswerable from our own data.
 */

const originalFetch = globalThis.fetch;
let captured: { url: string; init: RequestInit } | null = null;

function respond(status: number, body: unknown) {
  globalThis.fetch = vi.fn(async (url: string, init: RequestInit) => {
    captured = { url: String(url), init };
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => {
        if (body === "MALFORMED") throw new SyntaxError("Unexpected token");
        return body;
      },
    } as unknown as Response;
  }) as unknown as typeof fetch;
}

const { sendMail } = await import("../mailer");

const MAIL = { to: "someone@example.test", subject: "Subject", text: "Body" };

beforeEach(() => {
  captured = null;
  process.env.RESEND_API_KEY = "test-key-not-real";
  process.env.MAIL_FROM = "MODUS <noreply@notifications.example>";
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  delete process.env.RESEND_API_KEY;
  delete process.env.MAIL_FROM;
});

describe("the provider's message id is kept", () => {
  it("returns the id from the response", async () => {
    respond(200, { id: "re_2Xk9PqR_abcdef" });
    await expect(sendMail(MAIL)).resolves.toEqual({ id: "re_2Xk9PqR_abcdef" });
  });

  it("returns null rather than failing when the body carries no id", async () => {
    // The message was accepted. Losing the handle to it is not a failure.
    respond(200, { ok: true });
    await expect(sendMail(MAIL)).resolves.toEqual({ id: null });
  });

  it("returns null rather than failing on an unreadable body", async () => {
    respond(200, "MALFORMED");
    await expect(sendMail(MAIL)).resolves.toEqual({ id: null });
  });

  it("ignores a non-string id", async () => {
    respond(200, { id: 12345 });
    await expect(sendMail(MAIL)).resolves.toEqual({ id: null });
  });

  it("still throws when the provider rejects", async () => {
    respond(422, { error: "nope" });
    await expect(sendMail(MAIL)).rejects.toThrow(/rejected the message: 422/);
  });
});

describe("what goes on the wire", () => {
  it("sends no idempotency key", async () => {
    /*
     * Deliberate, and load-bearing for a deliberate re-send: an
     * idempotency key would make the provider return the ORIGINAL accepted
     * message instead of sending a new one. A message that was accepted
     * and then dropped — a suppressed recipient, say — could never be sent
     * again. Our own duplicate protection is the outbox's `dedupeKey`,
     * which is ours and which we can reason about.
     */
    respond(200, { id: "re_1" });
    await sendMail(MAIL);
    const headers = captured!.init.headers as Record<string, string>;
    const names = Object.keys(headers).map((h) => h.toLowerCase());
    expect(names).not.toContain("idempotency-key");
    expect(names).not.toContain("x-idempotency-key");
    expect(JSON.parse(String(captured!.init.body))).not.toHaveProperty("idempotency_key");
  });

  it("never puts the submitter's address in From", async () => {
    respond(200, { id: "re_1" });
    await sendMail({ ...MAIL, replyTo: "visitor@example.test" });
    const sent = JSON.parse(String(captured!.init.body));
    expect(sent.from).toBe("MODUS <noreply@notifications.example>");
    expect(sent.reply_to).toEqual(["visitor@example.test"]);
  });

  it("sends both parts when an HTML part exists, and text alone otherwise", async () => {
    respond(200, { id: "re_1" });
    await sendMail({ ...MAIL, html: "<p>hi</p>" });
    let sent = JSON.parse(String(captured!.init.body));
    expect(sent.text).toBe("Body");
    expect(sent.html).toBe("<p>hi</p>");

    await sendMail(MAIL);
    sent = JSON.parse(String(captured!.init.body));
    expect(sent.text).toBe("Body");
    expect(sent).not.toHaveProperty("html");
  });

  it("refuses to send when the provider is not configured", async () => {
    delete process.env.RESEND_API_KEY;
    respond(200, { id: "re_1" });
    await expect(sendMail(MAIL)).rejects.toThrow(/not configured/);
  });
});
