import { headerSafe, oneLine } from "./html";
import {
  renderEmailHtml,
  renderEmailText,
  type Block,
  type EmailDocument,
} from "./layout";

/**
 * The two mails a submitted diagnostic produces.
 *
 * They are built here, once, at enqueue time — not at send time — so the
 * stored outbox row is exactly what will go out, and a retry three hours
 * later sends the same message rather than re-rendering against whatever
 * the record looks like by then.
 *
 * Neither mail promises a response time, and neither says the analysis is
 * finished. The customer mail says what has happened (the answers are in)
 * and what happens next (they get read, then a conversation) — nothing
 * about when, because nothing here knows when.
 */

/** Everything the two mails need, read off the saved record. */
export type DiagnosticEmailInput = {
  id: string;
  firstName: string;
  lastName: string;
  companyName: string;
  email: string;
  phone: string;
  /** What they said they most want to improve. May be empty. */
  primaryInterest: string;
  priorities: string[];
  /** Their own words about what goes wrong. May be empty. */
  problemDescription: string;
  industry: string;
  employees: string;
  locations: string;
  reachChannels: string[];
  systems: string[];
  connectionLevel: string;
  adminHours: string;
  friction: string[];
  primaryPain: string;
  timing: string;
  /** The stored automatic estimate, if the pricing model produced one. */
  estimateMin: number | null;
  estimateMax: number | null;
  pricingBand: string;
  manualScopeRequired: boolean;
  submittedAt: Date;
};

export type BuiltEmail = {
  subject: string;
  html: string;
  text: string;
  replyTo: string;
};

export type EmailLocale = "nl" | "en";

/** Where a reply to the customer mail should land. */
export const MODUS_REPLY_TO = "joris@withmodus.co";

const FOOTER = {
  nl: {
    siteLabel: "withmodus.co",
    contactEmail: MODUS_REPLY_TO,
    privacyLabel: "Privacybeleid",
    privacyPath: "/privacypolicy",
    text: { site: "Website", contact: "Contact", privacy: "Privacybeleid" },
  },
  en: {
    siteLabel: "withmodus.co",
    contactEmail: MODUS_REPLY_TO,
    privacyLabel: "Privacy policy",
    privacyPath: "/privacypolicy",
    text: { site: "Website", contact: "Contact", privacy: "Privacy policy" },
  },
} as const;

const SIGNATURE_NAME = "Joris van Rijn";
const SIGNATURE_ROLE_NL = "Oprichter · MODUS";
const SIGNATURE_ROLE_EN = "Founder · MODUS";

/**
 * The one thing they said they most want to improve.
 *
 * `primaryInterest` first, because it is the direct answer to that
 * question; the first chosen priority otherwise. Empty when they said
 * neither — and then the sentence that would have used it is left out
 * entirely rather than rendered with a gap in it.
 */
export function statedPriority(d: DiagnosticEmailInput): string {
  const direct = d.primaryInterest.trim();
  if (direct) return direct;
  return d.priorities.map((p) => p.trim()).find((p) => p.length > 0) ?? "";
}

export function fullName(d: DiagnosticEmailInput): string {
  return `${d.firstName} ${d.lastName}`.replace(/\s+/g, " ").trim();
}

/** Formatted in the timezone MODUS actually works in, not the server's. */
export function receivedAt(date: Date, locale: EmailLocale = "nl"): string {
  return new Intl.DateTimeFormat(locale === "nl" ? "nl-NL" : "en-GB", {
    timeZone: "Europe/Amsterdam",
    dateStyle: "full",
    timeStyle: "short",
  }).format(date);
}

/**
 * The stored estimate, stated as an indication.
 *
 * Empty when the model did not produce one, or when it decided the scope
 * needs a human — in which case a range would be a number dressed up as a
 * conclusion.
 */
export function estimateLine(d: DiagnosticEmailInput, locale: EmailLocale): string {
  if (d.manualScopeRequired) {
    return locale === "nl"
      ? "Handmatige scope nodig — het model gaf geen bereik"
      : "Manual scope required — the model produced no range";
  }
  if (d.estimateMin === null || d.estimateMax === null) return "";
  const fmt = new Intl.NumberFormat(locale === "nl" ? "nl-NL" : "en-GB", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  });
  const range = `${fmt.format(d.estimateMin)} – ${fmt.format(d.estimateMax)}`;
  return d.pricingBand.trim() ? `${range} (${d.pricingBand.trim()})` : range;
}

function list(values: string[]): string {
  return values.map((v) => v.trim()).filter(Boolean).join(", ");
}

// ---------------------------------------------------------------- customer

const CUSTOMER_COPY = {
  nl: {
    subject: "We hebben je antwoorden ontvangen · MODUS",
    preheader: "Je antwoorden zijn binnen. Ik kijk ernaar en neem contact op.",
    greeting: (name: string) => (name ? `Hoi ${name},` : "Hoi,"),
    received: (company: string) =>
      company
        ? `Bedankt voor het invullen. We hebben je antwoorden voor ${company} ontvangen.`
        : "Bedankt voor het invullen. We hebben je antwoorden ontvangen.",
    priority: (priority: string) =>
      `Je gaf aan dat je vooral ${priority} wilt verbeteren.`,
    next:
      "Ik bekijk je antwoorden om te bepalen waar we het beste kunnen beginnen. Daarna neem ik contact met je op om de mogelijkheden te bespreken.",
    invite: "Wil je ondertussen iets toevoegen? Antwoord gerust op deze mail.",
    signOff: "Groet,",
    role: SIGNATURE_ROLE_NL,
  },
  en: {
    subject: "We've received your answers · MODUS",
    preheader: "Your answers are in. I'll read them and get in touch.",
    greeting: (name: string) => (name ? `Hi ${name},` : "Hi,"),
    received: (company: string) =>
      company
        ? `Thanks for filling it in. We've received your answers for ${company}.`
        : "Thanks for filling it in. We've received your answers.",
    priority: (priority: string) =>
      `You said what you most want to improve is ${priority}.`,
    next:
      "I'll read through your answers to work out where it makes most sense to start. Then I'll get in touch to talk through the options.",
    invite: "Anything you'd like to add in the meantime? Just reply to this email.",
    signOff: "Best,",
    role: SIGNATURE_ROLE_EN,
  },
} as const;

/**
 * The confirmation that goes to the person who filled it in.
 *
 * Missing information is left out, never shown as a placeholder: no
 * company name means the sentence simply does not mention one, and no
 * stated priority means that sentence is not there at all. A mail that
 * says "your answers for [bedrijf]" is worse than one that says less.
 */
export function buildCustomerEmail(
  d: DiagnosticEmailInput,
  locale: EmailLocale,
  origin: string
): BuiltEmail {
  const t = CUSTOMER_COPY[locale];
  const priority = statedPriority(d);

  const blocks: Block[] = [
    { kind: "paragraph", text: t.greeting(d.firstName.trim()) },
    { kind: "paragraph", text: t.received(d.companyName.trim()) },
  ];
  if (priority) blocks.push({ kind: "paragraph", text: t.priority(priority) });
  blocks.push(
    { kind: "paragraph", text: t.next },
    { kind: "paragraph", text: t.invite },
    { kind: "paragraph", text: t.signOff },
    {
      kind: "signature",
      lines: [SIGNATURE_NAME, t.role, origin.replace(/\/$/, "")],
    }
  );

  const doc: EmailDocument = {
    origin,
    lang: locale,
    preheader: t.preheader,
    blocks,
    footer: FOOTER[locale],
  };

  return {
    subject: headerSafe(t.subject),
    html: renderEmailHtml(doc),
    text: renderEmailText(doc),
    replyTo: MODUS_REPLY_TO,
  };
}

// ------------------------------------------------------------------- admin

/**
 * The internal notification.
 *
 * Dutch regardless of the visitor's language: it goes to one configured
 * internal address, not to the customer, and its subject is specified as
 * "Nieuwe diagnose: [bedrijf]".
 *
 * Unlike the previous version, which deliberately carried only a link,
 * this one leads with what is needed to judge a lead without opening
 * anything — name, company, how to reach them, what they want and in
 * their own words. The link is still how you get the full record, and it
 * is a plain `/private` URL: normal admin authentication, no bypass and no
 * token in the mail. A link that let its holder in would make every
 * forwarded notification a key.
 */
export function buildAdminEmail(d: DiagnosticEmailInput, origin: string): BuiltEmail {
  const site = origin.replace(/\/$/, "");
  const priority = statedPriority(d);
  const estimate = estimateLine(d, "nl");

  const blocks: Block[] = [
    { kind: "heading", text: d.companyName.trim() || "Nieuwe diagnose" },
    {
      kind: "facts",
      rows: [
        { label: "Naam", value: fullName(d) },
        { label: "Bedrijf", value: d.companyName },
        { label: "E-mail", value: d.email },
        { label: "Telefoon", value: d.phone },
      ],
    },
    { kind: "button", label: "Open in MODUS", href: `${site}/private/diagnostics/${d.id}` },
    { kind: "divider" },
    {
      // A section, so a submission that answered none of this drops the
      // heading too rather than leaving it over a blank.
      kind: "section",
      heading: "Wat ze willen verbeteren",
      rows: [
        { label: "Prioriteit", value: priority },
        { label: "Alle prioriteiten", value: list(d.priorities) },
        { label: "Grootste knelpunt", value: d.primaryPain },
        { label: "Knelpunten", value: list(d.friction) },
        { label: "Timing", value: d.timing },
      ],
    },
    {
      kind: "facts",
      // Their own words, kept as they wrote them — line breaks and all.
      rows: [{ label: "In eigen woorden", value: d.problemDescription }],
    },
    { kind: "divider" },
    {
      kind: "section",
      heading: "Context",
      rows: [
        { label: "Branche", value: d.industry },
        { label: "Teamgrootte", value: d.employees },
        { label: "Vestigingen", value: d.locations },
        { label: "Huidige tools", value: list(d.systems) },
        { label: "Samenhang tools", value: d.connectionLevel },
        { label: "Klanten bereiken ze via", value: list(d.reachChannels) },
        { label: "Handmatig werk", value: d.adminHours },
      ],
    },
    { kind: "divider" },
    {
      kind: "facts",
      rows: [
        { label: "Prijsindicatie", value: estimate },
        { label: "Ontvangen", value: receivedAt(d.submittedAt, "nl") },
        { label: "Referentie", value: d.id },
      ],
    },
  ];

  if (estimate) {
    blocks.push({
      kind: "note",
      text: "De prijsindicatie komt uit het prijsmodel en is een indicatie, geen offerte.",
    });
  }

  const doc: EmailDocument = {
    origin: site,
    lang: "nl",
    preheader: oneLine(
      [fullName(d), d.companyName.trim(), priority].filter(Boolean).join(" · ")
    ),
    blocks,
    footer: FOOTER.nl,
  };

  return {
    subject: headerSafe(`Nieuwe diagnose: ${oneLine(d.companyName.trim() || d.email, 80)}`),
    html: renderEmailHtml(doc),
    text: renderEmailText(doc),
    // The person who submitted, so a reply goes to them rather than back
    // to MODUS's own notification address.
    replyTo: d.email,
  };
}
