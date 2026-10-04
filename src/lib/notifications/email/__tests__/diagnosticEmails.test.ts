import { describe, expect, it } from "vitest";
import {
  buildAdminEmail,
  buildCustomerEmail,
  estimateLine,
  MODUS_REPLY_TO,
  receivedAt,
  statedPriority,
} from "../diagnosticEmails";
import {
  base,
  headerInjection,
  historical,
  injection,
  long,
  manualScope,
  sparse,
  worksAlone,
  worksAloneEnglish,
} from "./fixtures";

const ORIGIN = "https://www.withmodus.co";

describe("the customer confirmation leaves gaps out rather than showing them", () => {
  it("names the company when there is one", () => {
    const { text } = buildCustomerEmail(base, "nl", ORIGIN);
    expect(text).toContain("je antwoorden voor Bakkerij de Vries ontvangen");
  });

  it("says the same thing without a company, not with an empty slot", () => {
    const { text, html } = buildCustomerEmail(sparse, "nl", ORIGIN);
    expect(text).toContain("We hebben je antwoorden ontvangen.");
    // The failure this guards is a template that renders its own
    // placeholder at the reader.
    for (const part of [text, html]) {
      expect(part).not.toMatch(/\[bedrijf\]|\[naam\]|\[prioriteit\]|undefined|null/);
    }
  });

  it("drops the priority sentence entirely when none was given", () => {
    const { text } = buildCustomerEmail(sparse, "nl", ORIGIN);
    expect(text).not.toContain("Je gaf aan");
  });

  it("falls back to the first chosen priority when the direct answer is empty", () => {
    expect(statedPriority(manualScope)).toBe("Meer aanvragen krijgen");
    expect(buildCustomerEmail(manualScope, "nl", ORIGIN).text).toContain(
      "Je gaf aan dat je vooral Meer aanvragen krijgen wilt verbeteren."
    );
  });

  it("greets without a name rather than with a blank one", () => {
    const { text } = buildCustomerEmail({ ...sparse, firstName: "  " }, "nl", ORIGIN);
    expect(text.startsWith("Hoi,")).toBe(true);
  });

  it("promises no response time and claims no finished analysis", () => {
    const { text } = buildCustomerEmail(base, "nl", ORIGIN);
    expect(text).not.toMatch(/binnen \d|within \d|24 uur|werkdag|business day/i);
    expect(text).not.toMatch(/analyse is (klaar|af)|rapport|conclusie/i);
  });

  it("is written in the language the visitor was reading", () => {
    expect(buildCustomerEmail(base, "nl", ORIGIN).subject).toBe(
      "We hebben je antwoorden ontvangen · MODUS"
    );
    expect(buildCustomerEmail(base, "en", ORIGIN).subject).toBe(
      "We've received your answers · MODUS"
    );
    expect(buildCustomerEmail(base, "en", ORIGIN).html).toContain('lang="en"');
  });

  it("invites a reply, and a reply reaches MODUS", () => {
    const mail = buildCustomerEmail(base, "nl", ORIGIN);
    expect(mail.text).toContain("Antwoord gerust op deze mail.");
    expect(mail.replyTo).toBe(MODUS_REPLY_TO);
  });
});

describe("the internal notification is readable without opening anything", () => {
  const mail = buildAdminEmail(base, ORIGIN);

  it("names the company in the subject", () => {
    expect(mail.subject).toBe("Nieuwe diagnose: Bakkerij de Vries");
  });

  it("leads with who it is and how to reach them", () => {
    for (const value of ["Sanne de Vries", "Bakkerij de Vries", base.email, base.phone]) {
      expect(mail.text).toContain(value);
    }
  });

  it("carries the priority, their own words, and the context", () => {
    expect(mail.text).toContain("klanten opvolgen");
    expect(mail.text).toContain("Niemand weet wie wat heeft nagebeld");
    expect(mail.text).toContain("6–20");
    expect(mail.text).toContain("Kassa, Boekhouding, Planning");
  });

  it("states the stored estimate AS an indication", () => {
    expect(mail.text).toMatch(/Prijsindicatie/);
    expect(mail.text).toContain("Focused");
    expect(mail.text).toContain("indicatie, geen offerte");
  });

  it("says so when the model produced no range, instead of implying zero", () => {
    const noRange = buildAdminEmail(manualScope, ORIGIN);
    expect(estimateLine(manualScope, "nl")).toContain("Handmatige scope");
    expect(noRange.text).not.toMatch(/€\s?0/);
  });

  it("omits the estimate rows entirely when there is nothing stored", () => {
    const none = buildAdminEmail(sparse, ORIGIN);
    expect(none.text).not.toContain("Prijsindicatie");
    expect(none.text).not.toContain("indicatie, geen offerte");
  });

  it("times the receipt in Europe/Amsterdam, not the server's zone", () => {
    // 09:58 UTC in October is 11:58 in Amsterdam.
    expect(receivedAt(base.submittedAt, "nl")).toContain("11:58");
  });

  it("drops a whole section when nothing in it was answered", () => {
    // A heading over a blank is the empty space to avoid.
    const none = buildAdminEmail(sparse, ORIGIN);
    expect(none.text).not.toContain("Wat ze willen verbeteren");
    expect(none.html).not.toContain("Wat ze willen verbeteren");
  });

  it("replies to the person who submitted", () => {
    expect(mail.replyTo).toBe(base.email);
  });
});

describe("the link into /private grants nothing", () => {
  const mail = buildAdminEmail(base, ORIGIN);

  it("points at the record behind normal admin authentication", () => {
    expect(mail.html).toContain(`${ORIGIN}/private/diagnostics/${base.id}`);
    expect(mail.text).toContain(`${ORIGIN}/private/diagnostics/${base.id}`);
  });

  it("carries no token, key or bypass", () => {
    // A link that let its holder in would make every forwarded
    // notification a key to the inbox.
    const links = [...mail.html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
    for (const link of links) {
      expect(link).not.toMatch(/token|key|secret|auth|bypass|signature/i);
    }
    expect(mail.html).not.toContain(`${ORIGIN}/private/diagnostics/${base.id}?`);
  });

  it("puts no personal data in any link", () => {
    // No tracking, and nothing identifying smuggled into a query string.
    const links = [...mail.html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
    for (const link of links) {
      if (link.startsWith("mailto:")) continue;
      const url = new URL(link);
      expect([...url.searchParams.keys()], `query params on ${link}`).toEqual([]);
      expect(link).not.toContain(base.email);
      expect(link).not.toContain("utm_");
    }
  });
});

describe("submitted content cannot break out of the markup", () => {
  it("escapes HTML in every field it renders", () => {
    const customer = buildCustomerEmail(injection, "nl", ORIGIN);
    const admin = buildAdminEmail(injection, ORIGIN);
    for (const { html } of [customer, admin]) {
      expect(html).not.toContain("<script>alert");
      expect(html).toContain("&lt;script&gt;");
      expect(html).not.toContain("<img src=x");
      expect(html).toContain("&amp; Zn");
    }
  });

  it("leaves the text part as the person actually wrote it", () => {
    // The text part is not markup, so escaping it would corrupt the
    // reader's own words.
    const admin = buildAdminEmail(injection, ORIGIN);
    expect(admin.text).toContain("<img src=x onerror=alert(1)>");
  });

  it("strips CR/LF from the subject, so no extra header can be injected", () => {
    const mail = buildAdminEmail(headerInjection, ORIGIN);
    // The line break is what would end the Subject header and start a new
    // one. Without it the rest is inert text in the subject line, which is
    // ugly but cannot add a recipient — so that is what is asserted,
    // rather than the absence of a word that is harmless once flattened.
    expect(mail.subject).not.toMatch(/[\r\n]/);
    expect(mail.subject).toBe("Nieuwe diagnose: Evil BV Bcc: someone@elsewhere.example");
  });

  it("keeps a long answer whole rather than cutting it off", () => {
    const admin = buildAdminEmail(long, ORIGIN);
    expect(admin.text).toContain("vanzelf meegaat naar de offerte, de planning en de factuur.");
    // And its paragraph breaks survive into the HTML.
    expect(admin.html).toContain("<br />");
  });
});

describe("the two parts say the same thing", () => {
  it("every case renders both, carrying the same facts", () => {
    for (const d of [base, long, sparse, manualScope, injection]) {
      for (const mail of [buildCustomerEmail(d, "nl", ORIGIN), buildAdminEmail(d, ORIGIN)]) {
        expect(mail.html.length).toBeGreaterThan(400);
        expect(mail.text.trim().length).toBeGreaterThan(40);
        if (d.companyName.trim()) {
          // Present in both, escaped in one and plain in the other.
          expect(mail.text).toContain(d.companyName);
        }
      }
    }
  });
});


describe("an honest unknown is never turned into a finding", () => {
  it("lists the operations answers when they are real", () => {
    const mail = buildAdminEmail(base, ORIGIN);
    expect(mail.text).toContain("Terugkerende taken");
    expect(mail.text).toContain("Overname bij afwezigheid");
  });

  it('omits "not sure" and "I work alone" entirely, rather than reporting them', () => {
    // The failure to avoid is a notification that lists "I work alone"
    // under what the business is like. That records what the visitor
    // knows, not something true of their work.
    const mail = buildAdminEmail(worksAlone, ORIGIN);
    expect(mail.text).not.toContain("Terugkerende taken");
    expect(mail.text).not.toContain("Overname bij afwezigheid");
    expect(mail.text).not.toMatch(/werk alleen|niet van toepassing|weet ik niet/i);
    expect(mail.html).not.toMatch(/werk alleen|niet van toepassing/i);
  });

  it("applies the rule whichever language the option was answered in", () => {
    const mail = buildAdminEmail(worksAloneEnglish, ORIGIN);
    expect(mail.text).not.toContain("Terugkerende taken");
    expect(mail.text).not.toMatch(/work alone|not applicable|not sure/i);
  });

  it("leaves the rest of the notification intact", () => {
    // Dropping two rows must not drop the section they live in, nor
    // anything else about the submission.
    const mail = buildAdminEmail(worksAlone, ORIGIN);
    expect(mail.text).toContain("Context");
    expect(mail.text).toContain("Bakkerij / Food");
    expect(mail.subject).toBe("Nieuwe diagnose: Eenmanszaak Jansen");
  });

  it("says nothing about operations for a historical submission", () => {
    // Answered before the questions were rewritten, so it carries neither
    // new answer. Absent, not guessed at from the legacy columns.
    const mail = buildAdminEmail(historical, ORIGIN);
    expect(mail.text).not.toContain("Terugkerende taken");
    expect(mail.text).not.toContain("Overname bij afwezigheid");
    expect(mail.text).not.toMatch(/\b[1-5] ?\/ ?5\b/);
    expect(mail.text).not.toMatch(/\b(Low|Medium|High)\b/);
  });

  it("never reaches the customer confirmation at all", () => {
    // The confirmation is prose about what happens next. It carries no
    // operations answer in any case, which is the strongest form of this
    // guarantee.
    for (const d of [worksAlone, worksAloneEnglish, historical]) {
      for (const loc of ["nl", "en"] as const) {
        const mail = buildCustomerEmail(d, loc, ORIGIN);
        expect(mail.text).not.toMatch(/work alone|werk alleen|Terugkerende taken|Recurring tasks/i);
      }
    }
  });
});

describe("both customer languages are complete", () => {
  it("translates everything authored, and nothing the visitor wrote", () => {
    const nl = buildCustomerEmail(long, "nl", ORIGIN);
    const en = buildCustomerEmail(long, "en", ORIGIN);

    // Authored copy differs: subject, greeting, body, sign-off, footer.
    expect(nl.subject).not.toBe(en.subject);
    expect(nl.text).toContain("Hoi Alexandra-Wilhelmina,");
    expect(en.text).toContain("Hi Alexandra-Wilhelmina,");
    expect(nl.text).toContain("Groet,");
    expect(en.text).toContain("Best,");
    expect(nl.text).toContain("Oprichter · MODUS");
    expect(en.text).toContain("Founder · MODUS");
    expect(nl.text).toContain("Privacybeleid");
    expect(en.text).toContain("Privacy policy");
    expect(nl.html).toContain('lang="nl"');
    expect(en.html).toContain('lang="en"');

    // Their own words, their name and their company are identical in both.
    for (const mail of [nl, en]) {
      expect(mail.text).toContain("Van der Heijden Installatietechniek");
      expect(mail.text).toContain("de volledige offerte- en nacalculatiestroom van begin tot eind");
    }
  });

  it("has no untranslated leftovers in either direction", () => {
    const nl = buildCustomerEmail(base, "nl", ORIGIN).text;
    const en = buildCustomerEmail(base, "en", ORIGIN).text;
    expect(nl).not.toMatch(/\b(Thanks for filling|Best,|Founder ·|Privacy policy)\b/);
    // "Hoi" only appears in the Dutch one; the English body carries no
    // Dutch fixed copy.
    expect(en).not.toMatch(/\b(Hoi|Bedankt voor het invullen|Groet,|Oprichter ·|Privacybeleid)\b/);
  });

  it("keeps the internal notification Dutch whatever the customer chose", () => {
    // Two mails from one submission, two audiences, one of which is
    // always the same person.
    expect(buildAdminEmail(base, ORIGIN).subject.startsWith("Nieuwe diagnose:")).toBe(true);
    expect(buildAdminEmail(base, ORIGIN).html).toContain('lang="nl"');
  });
});
