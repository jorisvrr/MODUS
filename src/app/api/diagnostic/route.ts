import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { after } from "next/server";
import { dispatchPending, enqueueDiagnosticEmails } from "@/lib/notifications/outbox";
import { LOCALE_COOKIE, isLocale } from "@/lib/i18n/config";
import type { EmailLocale } from "@/lib/notifications/email/diagnosticEmails";
import { SITE_ORIGIN } from "@/lib/legal/site";
import {
  legacyDependency,
  legacyStandardization,
} from "@/lib/diagnostic/operationsMapping";
import {
  companyNameSchema,
  emailSchema,
  nameSchema,
  roleSchema,
  shortTextSchema,
  textareaSchema,
  validatePhone,
  websiteSchema,
} from "@/lib/diagnostic/schema";
import { calculateEngagementEstimate } from "@/lib/pricing/engine";
import { generateContextToken } from "@/lib/customerContext/token";

const stringArray = z.array(z.string().trim().max(80)).max(30);

const submissionSchema = z.object({
  // honeypot — real users never fill this in; bots often do
  website2: z.string().max(0, "spam").optional().default(""),

  companyName: companyNameSchema,
  website: websiteSchema,
  industry: shortTextSchema(60),
  industryOther: shortTextSchema(60).optional().default(""),
  employees: shortTextSchema(20),
  locations: shortTextSchema(20),
  revenueRange: shortTextSchema(30).optional().default(""),

  reachChannels: stringArray,
  enquiryHandling: stringArray,
  adminHours: shortTextSchema(30),
  /*
   * The October 2026 operations answers, accepted as the visitor's own
   * text. The legacy numeric/level fields are DERIVED on the server
   * (see operationsMapping) rather than accepted from the client, so a
   * crafted request cannot post a score that no answer supports.
   */
  taskConsistency: z.string().max(120).optional().default(""),
  absenceCoverage: z.string().max(120).optional().default(""),

  systems: stringArray,
  specificTools: shortTextSchema(200).optional().default(""),
  connectionLevel: shortTextSchema(30),
  spreadsheetDependency: shortTextSchema(30),
  automationUsage: stringArray,

  friction: stringArray,
  primaryPain: shortTextSchema(80).optional().default(""),
  // Optional: empty is valid, but non-empty content still has to clear the
  // same bar as before (see the matching client-side check in
  // DiagnosticShell's canProceed).
  problemDescription: z.union([z.literal(""), textareaSchema(20, 500)]).optional().default(""),
  frequency: shortTextSchema(30),
  impact: stringArray,

  primaryInterest: shortTextSchema(60).optional().default(""),
  priorities: stringArray,
  timing: shortTextSchema(30),
  decisionContext: shortTextSchema(60).optional().default(""),

  firstName: nameSchema,
  lastName: nameSchema,
  email: emailSchema,
  phone: z.string().max(30).optional().default(""),
  role: roleSchema.optional().default(""),
  roleOther: shortTextSchema(80).optional().default(""),

  preliminaryProfile: z.array(z.object({ label: z.string(), value: z.string(), tone: z.string() })).max(20),
  preliminarySignals: z
    .array(
      z.object({
        id: z.string(),
        headline: z.string(),
        body: z.string(),
        why: z.string(),
        inspect: z.array(z.string()),
        intervention: z.string(),
      })
    )
    .max(20),

  source: z.string().max(60).optional().default(""),
  referrer: z.string().max(300).optional().default(""),
  utmSource: z.string().max(100).optional().default(""),
  utmMedium: z.string().max(100).optional().default(""),
  utmCampaign: z.string().max(100).optional().default(""),
});

/**
 * The site language the visitor was reading, read from the cookie the
 * language switch sets. Unrecognised or absent is stored as null rather
 * than as a guess.
 */
function submittedLocale(request: NextRequest): string | null {
  const value = request.cookies.get(LOCALE_COOKIE)?.value;
  return isLocale(value) ? value : null;
}

/**
 * The language to write the confirmation in.
 *
 * The documented fallback for a submission with no recorded language —
 * every record from before the column existed — is the site default,
 * English, which is how those were already treated. It is stated once,
 * here, rather than each caller choosing.
 */
function emailLocaleOf(stored: string | null): EmailLocale {
  return stored === "nl" ? "nl" : "en";
}

/**
 * Reads back a column that stores a JSON array as text.
 *
 * Tolerant on purpose: this runs AFTER the row is committed, to compose a
 * notification. A malformed column must cost a line in an email, never the
 * saved submission.
 */
function parseJsonArray(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = submissionSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid submission.", issues: parsed.error.issues.map((i) => i.message) },
      { status: 400 }
    );
  }
  const data = parsed.data;

  // honeypot tripped — pretend success, don't persist
  if (data.website2) {
    return NextResponse.json({ ok: true, id: "ok" });
  }

  // Idempotency.
  //
  // The browser sends a key it generates once per submission attempt. A
  // double-click, or a retry after a response timed out on the way back,
  // resolves to the SAME record instead of creating a second lead. The
  // original contextToken is returned, so the visitor's stored profile
  // reference stays valid across the retry.
  const idempotencyKey = request.headers.get("idempotency-key");
  if (idempotencyKey) {
    const existing = await prisma.diagnostic.findUnique({
      where: { idempotencyKey },
      select: { id: true, contextToken: true },
    });
    if (existing) {
      return NextResponse.json({
        ok: true,
        id: existing.id,
        contextToken: existing.contextToken,
        deduplicated: true,
      });
    }
  }

  if (data.phone) {
    const phoneCheck = validatePhone(data.phone);
    if (!phoneCheck.valid) {
      return NextResponse.json({ error: "Invalid phone number." }, { status: 400 });
    }
  }

  const since = new Date(Date.now() - 60 * 1000);
  const recentDuplicate = await prisma.diagnostic.count({
    where: { email: data.email, createdAt: { gte: since } },
  });
  if (recentDuplicate > 0) {
    return NextResponse.json(
      { error: "A submission with this email was just received. Please wait a moment." },
      { status: 429 }
    );
  }

  // Computed server-side, authoritatively, from the validated submission,
  // never trusted from a client-sent value: this is commercial data.
  const estimate = calculateEngagementEstimate({
    employees: data.employees,
    locations: data.locations,
    systems: data.systems,
    connectionLevel: data.connectionLevel,
    spreadsheetDependency: data.spreadsheetDependency,
    adminHours: data.adminHours,
    dependency: legacyDependency(data.absenceCoverage),
    processStandardization: legacyStandardization(data.taskConsistency),
    friction: data.friction,
    frequency: data.frequency,
    impact: data.impact,
    timing: data.timing,
    priorities: data.priorities,
  });

  const diagnostic = await prisma.diagnostic.create({
    data: {
      companyName: data.companyName,
      website: data.website || null,
      industry: data.industry === "Other" ? data.industryOther : data.industry,
      employees: data.employees,
      locations: data.locations,
      revenueRange: data.revenueRange || null,

      customerChannels: JSON.stringify(data.reachChannels),
      enquiryHandling: JSON.stringify(data.enquiryHandling),
      adminWorkload: data.adminHours,
      /*
       * Verbatim answers are the record; the legacy columns are the
       * explicit mapping, left unset where the visitor said they do not
       * know. Historical rows keep the values they were saved with.
       */
      taskConsistency: data.taskConsistency,
      absenceCoverage: data.absenceCoverage,
      processStandardization: legacyStandardization(data.taskConsistency),
      keyEmployeeDependency: legacyDependency(data.absenceCoverage),

      systems: JSON.stringify(data.systems),
      specificTools: data.specificTools || null,
      systemConnectivity: data.connectionLevel,
      spreadsheetDependency: data.spreadsheetDependency,
      automationUsage: JSON.stringify(data.automationUsage),

      frictionAreas: JSON.stringify(data.friction),
      primaryPainPoint: data.primaryPain || data.friction[0] || "",
      problemDescription: data.problemDescription,
      problemFrequency: data.frequency,
      impactAreas: JSON.stringify(data.impact),

      primaryInterest: data.primaryInterest || null,
      priorities: JSON.stringify(data.priorities),
      timing: data.timing,
      decisionContext: data.decisionContext || null,

      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      phone: data.phone || null,
      role: data.role === "Other" ? data.roleOther : data.role || null,
      privacyConsent: true,

      preliminaryProfile: JSON.stringify(data.preliminaryProfile),
      preliminarySignals: JSON.stringify(data.preliminarySignals),

      pricingVersion: estimate.pricingVersion,
      complexityScoreTotal: estimate.complexityScore.total,
      pricingBand: estimate.band,
      implementationScope: estimate.implementationScope,
      calculatedEstimateMin: estimate.estimatedMin,
      calculatedEstimateMax: estimate.estimatedMax,
      manualScopeRequired: estimate.manualScope,
      pricingReasoning: JSON.stringify(estimate.reasoning),
      pricingFactors: JSON.stringify({
        businessScale: estimate.businessScaleLevel,
        systemFragmentation: estimate.systemFragmentationLevel,
        operationalComplexity: estimate.operationalComplexityLevel,
        implementationScope: estimate.implementationScopeLevel,
      }),
      contextToken: generateContextToken(),

      source: data.source || null,
      referrer: data.referrer || null,
      utmSource: data.utmSource || null,
      utmMedium: data.utmMedium || null,
      utmCampaign: data.utmCampaign || null,

      idempotencyKey: idempotencyKey ?? null,

      /*
       * The site language at the moment of submission, from the same
       * cookie the language switch sets — the website's own record of the
       * choice, not a guess from a browser header, a country or the
       * domain of an email address.
       *
       * Stored with the submission so the choice is a fact about the
       * record rather than something re-derived later: a resend months
       * from now uses the language they chose, not whatever this browser
       * is set to then.
       */
      locale: submittedLocale(request),

      activityEvents: {
        create: { label: "Diagnostic submitted" },
      },
    },
  });

  // Notification is enqueued only now that the submission is committed,
  // and it deliberately cannot fail this request: a mail problem must
  // never tell the visitor their submission failed when it is safely
  // saved, nor push them into resubmitting. Delivery is retried from the
  // outbox separately.
  // Enqueue AFTER the record is committed. A mail problem must never tell
  // the visitor their submission failed when it is safely saved, nor push
  // them into resubmitting.
  const locale = emailLocaleOf(diagnostic.locale);

  await enqueueDiagnosticEmails(
    {
      id: diagnostic.id,
      firstName: diagnostic.firstName,
      lastName: diagnostic.lastName,
      companyName: diagnostic.companyName,
      email: diagnostic.email,
      phone: diagnostic.phone ?? "",
      primaryInterest: diagnostic.primaryInterest ?? "",
      priorities: parseJsonArray(diagnostic.priorities),
      problemDescription: diagnostic.problemDescription,
      // Verbatim. The "not sure" / "I work alone" options are filtered out
      // inside the template, which is where the rule belongs — see
      // `withoutUnknownOperations`.
      taskConsistency: diagnostic.taskConsistency ?? "",
      absenceCoverage: diagnostic.absenceCoverage ?? "",
      industry: diagnostic.industry,
      employees: diagnostic.employees,
      locations: diagnostic.locations,
      reachChannels: parseJsonArray(diagnostic.customerChannels),
      systems: parseJsonArray(diagnostic.systems),
      connectionLevel: diagnostic.systemConnectivity,
      adminHours: diagnostic.adminWorkload,
      friction: parseJsonArray(diagnostic.frictionAreas),
      primaryPain: diagnostic.primaryPainPoint,
      timing: diagnostic.timing,
      estimateMin: diagnostic.calculatedEstimateMin,
      estimateMax: diagnostic.calculatedEstimateMax,
      pricingBand: diagnostic.pricingBand ?? "",
      manualScopeRequired: diagnostic.manualScopeRequired,
      submittedAt: diagnostic.createdAt,
    },
    locale,
    SITE_ORIGIN
  );

  // Prompt delivery, off the response path.
  //
  // `after()` runs once the response has been sent, so the visitor never
  // waits on the mail provider, but the notification still goes out in
  // seconds rather than waiting for the daily sweep. If it throws — the
  // provider is down, the function is killed — the row simply stays
  // PENDING with its backoff and the sweep retries it. Delivery is never
  // dependent on this succeeding.
  after(async () => {
    try {
      await dispatchPending(5);
    } catch (error) {
      console.error("[diagnostic] prompt notification dispatch failed", error);
    }
  });

  return NextResponse.json({ ok: true, id: diagnostic.id, contextToken: diagnostic.contextToken });
}
