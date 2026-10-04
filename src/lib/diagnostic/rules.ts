import type { DiagnosticAnswers, ProfileIndicator, Signal } from "./types";
import { legacyDependency } from "./operationsMapping";
import type { Locale } from "@/lib/i18n/config";
import { dictFor } from "@/lib/i18n/context";
import { pick } from "./questions";

// buildSignals/buildProfileIndicators/buildFocusAreas generate the
// qualitative profile and signal text shown in ProfilePanel and ResultView.
// `locale` defaults to "en" so existing callers that don't pass it (the
// diagnostic's own submission payload in DiagnosticShell, and the PDF/email
// export helpers) keep working unchanged; the live UI (ProfilePanel,
// ResultView) passes the visitor's actual locale so what they read on
// screen is translated. What each signal/indicator detects is unchanged by
// locale, only the words used to describe it are.

function highAdmin(a: DiagnosticAnswers, locale: Locale): boolean {
  return (
    a.adminHours === pick("adminHoursOptions", "10–25 hours", locale) ||
    a.adminHours === pick("adminHoursOptions", "25+ hours", locale)
  );
}

export function buildSignals(a: DiagnosticAnswers, locale: Locale = "en"): Signal[] {
  const dict = dictFor(locale).diagnosticRules.signals;
  const signals: Signal[] = [];

  if (
    (a.spreadsheetDependency === pick("spreadsheetDependency", "Critical", locale) ||
      a.spreadsheetDependency === pick("spreadsheetDependency", "We'd stop without them", locale)) &&
    (a.connectionLevel === pick("connectionLevels", "Mostly manual", locale) ||
      a.connectionLevel === pick("connectionLevels", "Some connections", locale))
  ) {
    signals.push({
      id: "spreadsheet-dependency",
      headline: dict.spreadsheetDependency.headline,
      body: dict.spreadsheetDependency.body,
      why: dict.spreadsheetDependency.why,
      inspect: dict.spreadsheetDependency.inspect,
      intervention: dict.spreadsheetDependency.intervention,
    });
  }

  if (highAdmin(a, locale)) {
    signals.push({
      id: "admin-load",
      headline: dict.adminLoad.headline,
      body: dict.adminLoad.body(a.adminHours),
      why: dict.adminLoad.why,
      inspect: dict.adminLoad.inspect,
      intervention: dict.adminLoad.intervention,
    });
  }

  if (a.friction.includes(pick("frictionAreas", "Customer enquiries", locale)) && a.reachChannels.length >= 3) {
    signals.push({
      id: "fragmented-intake",
      headline: dict.fragmentedIntake.headline,
      body: dict.fragmentedIntake.body(a.reachChannels.length),
      why: dict.fragmentedIntake.why,
      inspect: dict.fragmentedIntake.inspect,
      intervention: dict.fragmentedIntake.intervention,
    });
  }

  // Derived from "can a colleague take over?" — see operationsMapping.
  // "I work alone" maps to "", so it never raises this signal.
  if (legacyDependency(a.absenceCoverage) === "High") {
    signals.push({
      id: "key-person-risk",
      headline: dict.keyPersonRisk.headline,
      body: dict.keyPersonRisk.body,
      why: dict.keyPersonRisk.why,
      inspect: dict.keyPersonRisk.inspect,
      intervention: dict.keyPersonRisk.intervention,
    });
  }

  if (a.systems.length >= 4 && a.connectionLevel === pick("connectionLevels", "Mostly manual", locale)) {
    signals.push({
      id: "system-fragmentation",
      headline: dict.systemFragmentation.headline,
      body: dict.systemFragmentation.body(a.systems.length),
      why: dict.systemFragmentation.why,
      inspect: dict.systemFragmentation.inspect,
      intervention: dict.systemFragmentation.intervention,
    });
  }

  if (
    a.friction.includes(pick("frictionAreas", "Sales follow-up", locale)) ||
    a.impact.includes(pick("impactOptions", "Revenue", locale))
  ) {
    signals.push({
      id: "followup-gap",
      headline: dict.followupGap.headline,
      body: dict.followupGap.body,
      why: dict.followupGap.why,
      inspect: dict.followupGap.inspect,
      intervention: dict.followupGap.intervention,
    });
  }

  return signals;
}

function complexityScore(a: DiagnosticAnswers, locale: Locale): number {
  let score = 0;
  const complexEmployees = ["21–50", "51–100", "101–250", "250+"].map((v) => pick("employeeRanges", v, locale));
  const complexLocations = ["6–10", "11+"].map((v) => pick("locationOptions", v, locale));
  if (complexEmployees.includes(a.employees)) score += 1;
  if (complexLocations.includes(a.locations)) score += 1;
  if (a.systems.length >= 5) score += 1;
  if (highAdmin(a, locale)) score += 1;
  if (a.friction.length >= 4) score += 1;
  return score;
}

export function buildProfileIndicators(a: DiagnosticAnswers, locale: Locale = "en"): ProfileIndicator[] {
  const dict = dictFor(locale).diagnosticRules.indicators;
  const complexity = complexityScore(a, locale);

  const mostlyManual = pick("connectionLevels", "Mostly manual", locale);
  const someConnections = pick("connectionLevels", "Some connections", locale);
  const mostlyConnected = pick("connectionLevels", "Mostly connected", locale);
  const customAutomation = pick("automationUsage", "Custom automation", locale);
  const aiIntegrated = pick("automationUsage", "AI integrated into workflows", locale);
  const noAutomation = pick("automationUsage", "No", locale);
  const dependency = legacyDependency(a.absenceCoverage);

  const fragmentation: ProfileIndicator["tone"] =
    a.connectionLevel === mostlyManual ? "high" : a.connectionLevel === someConnections ? "moderate" : "low";

  const maturity: ProfileIndicator["tone"] =
    a.automationUsage.includes(customAutomation) || a.automationUsage.includes(aiIntegrated)
      ? "moderate"
      : a.automationUsage.includes(noAutomation) || a.automationUsage.length === 0
        ? "early"
        : "early";

  const dependencyTone: ProfileIndicator["tone"] =
    dependency === "High" ? "high" : dependency === "Medium" ? "moderate" : "low";

  const visibility: ProfileIndicator["tone"] = a.connectionLevel === mostlyConnected ? "moderate" : "low";

  const toneLabel = (tone: ProfileIndicator["tone"]) => dict[tone];

  return [
    {
      label: dict.operationalComplexity,
      value: complexity >= 4 ? dict.high : complexity >= 2 ? dict.moderate : dict.low,
      tone: complexity >= 4 ? "high" : complexity >= 2 ? "moderate" : "low",
    },
    { label: dict.systemFragmentation, value: toneLabel(fragmentation), tone: fragmentation },
    { label: dict.automationMaturity, value: dict.early, tone: maturity },
    { label: dict.processDependency, value: toneLabel(dependencyTone), tone: dependencyTone },
    { label: dict.visibility, value: toneLabel(visibility), tone: visibility },
  ];
}

export function buildFocusAreas(a: DiagnosticAnswers, locale: Locale = "en") {
  const dict = dictFor(locale).diagnosticRules.focusAreas;
  const areas: { name: string; priority: "HIGH" | "MEDIUM"; why: string }[] = [];

  const customerEnquiries = pick("frictionAreas", "Customer enquiries", locale);
  const salesFollowUp = pick("frictionAreas", "Sales follow-up", locale);
  const mostlyManual = pick("connectionLevels", "Mostly manual", locale);
  const someConnections = pick("connectionLevels", "Some connections", locale);

  if (a.friction.includes(customerEnquiries) || a.friction.includes(salesFollowUp)) {
    areas.push({
      name: dict.customerIntake.name,
      priority: "HIGH",
      why: dict.customerIntake.why(a.reachChannels.length || dict.multipleFallback),
    });
  }
  if (a.connectionLevel === mostlyManual || a.connectionLevel === someConnections) {
    areas.push({
      name: dict.systemConnections.name,
      priority: a.systems.length >= 4 ? "HIGH" : "MEDIUM",
      why: dict.systemConnections.why(a.systems.length),
    });
  }
  if (highAdmin(a, locale)) {
    areas.push({
      name: dict.administration.name,
      priority: "MEDIUM",
      why: dict.administration.why(a.adminHours),
    });
  }
  if (areas.length === 0) {
    areas.push({
      name: a.primaryPain || dict.generalOperations.name,
      priority: "MEDIUM",
      why: dict.generalOperations.why,
    });
  }
  return areas.slice(0, 3);
}
