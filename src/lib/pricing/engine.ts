import { PRICING_CONFIG, type ImplementationScope, type PricingBandId } from "./config";
import type {
  ComplexityBreakdown,
  EngagementEstimate,
  EngagementEstimateInput,
  QualitativeLevel,
} from "./types";

/**
 * MODUS Pricing Model V1 — deterministic scoring engine.
 *
 * Implements the five-dimension complexity score from the "MODUS Pricing
 * Model V1" internal framework document exactly as specified (section 04),
 * maps the total to the given engagement bands (section 02) with the given
 * guardrails (section 07), and applies the implementation-scope adjustment
 * (section 05). No LLM, no randomness, no hidden logic: the same input
 * always produces the same output.
 *
 * Two things below are genuinely interpretive, because the source document
 * doesn't map them 1:1 onto a diagnostic field, and are called out inline:
 *  - which diagnostic answers indicate LIGHT/STANDARD/SUBSTANTIAL
 *    implementation scope (the document defines the three tiers and their
 *    price effect, not which inputs select a tier)
 *  - the "Unsure" option for problem frequency, which the document's
 *    occasionally/weekly/several-times-weekly/daily scale doesn't cover
 */

function scaleEmployees(employees: string): number {
  switch (employees) {
    case "1–5":
      return 0;
    case "6–20":
      return 1;
    case "21–50":
      return 2;
    case "51–100":
      return 3;
    case "101–250":
    case "250+":
      return 4;
    default:
      return 0;
  }
}

function scaleLocations(locations: string): number {
  switch (locations) {
    case "Online only":
    case "1":
      return 0;
    case "2–5":
      return 1;
    case "6–10":
      return 2;
    case "11+":
      return 3;
    default:
      return 0;
  }
}

function businessScaleScore(input: EngagementEstimateInput): number {
  const raw = scaleEmployees(input.employees) + scaleLocations(input.locations);
  return Math.min(raw, 4);
}

function meaningfulSystemsScore(count: number): number {
  if (count >= 10) return 3;
  if (count >= 6) return 2;
  if (count >= 3) return 1;
  return 0;
}

function connectivityScore(connectionLevel: string): number {
  switch (connectionLevel) {
    case "Mostly connected":
      return 0;
    case "Some connections":
      return 1;
    case "Mostly manual":
      return 2;
    case "Not sure":
      return 1;
    default:
      return 0;
  }
}

function spreadsheetDependencyScore(spreadsheetDependency: string): number {
  switch (spreadsheetDependency) {
    case "Almost none":
    case "Occasional":
      return 0;
    case "Important":
      return 1;
    case "Critical":
    case "We'd stop without them":
      return 2;
    default:
      return 0;
  }
}

function systemComplexityScore(input: EngagementEstimateInput): number {
  const raw =
    meaningfulSystemsScore(input.systems.length) +
    connectivityScore(input.connectionLevel) +
    spreadsheetDependencyScore(input.spreadsheetDependency);
  return Math.min(raw, 5);
}

function adminHoursScore(adminHours: string): number {
  switch (adminHours) {
    case "Very little":
      return 0;
    case "A few hours":
      return 1;
    case "5–10 hours":
      return 2;
    case "10–25 hours":
      return 3;
    case "25+ hours":
      return 4;
    case "Unsure":
      return 1;
    default:
      return 0;
  }
}

function keyPersonDependencyScore(dependency: EngagementEstimateInput["dependency"]): number {
  switch (dependency) {
    case "Low":
      return 0;
    case "Medium":
      return 1;
    case "High":
      return 2;
    default:
      return 0;
  }
}

function operationalComplexityScore(input: EngagementEstimateInput): number {
  /*
   * `null` means the visitor said they do not know, or that the question
   * does not apply. That is not evidence of low consistency, so it adds
   * nothing. Written as an explicit null check rather than relying on
   * coercion, because `null <= 1` is true in JavaScript and would have
   * quietly priced an unknown as a complexity signal.
   */
  const lowStandardizationBonus =
    input.processStandardization !== null && input.processStandardization <= 1 ? 1 : 0;
  const raw =
    adminHoursScore(input.adminHours) +
    keyPersonDependencyScore(input.dependency) +
    lowStandardizationBonus;
  return Math.min(raw, 5);
}

function frictionAreaCountScore(count: number): number {
  if (count >= 7) return 3;
  if (count >= 4) return 2;
  if (count >= 2) return 1;
  return 0;
}

// The document doesn't cover "Unsure" on this scale explicitly; treated as
// the lowest defined tier rather than guessed at a higher one.
function frequencyScore(frequency: string): number {
  switch (frequency) {
    case "Daily":
      return 2;
    case "Several times per week":
      return 1;
    case "Weekly":
      return 1;
    case "Occasionally":
      return 0;
    case "Unsure":
      return 0;
    default:
      return 0;
  }
}

function frictionScore(input: EngagementEstimateInput): number {
  const multipleImpactBonus = input.impact.length >= 2 ? 1 : 0;
  const raw = frictionAreaCountScore(input.friction.length) + frequencyScore(input.frequency) + multipleImpactBonus;
  return Math.min(raw, 4);
}

function timingScore(timing: string): number {
  switch (timing) {
    case "Immediately":
    case "Within 30 days":
      return 3;
    case "Within 3 months":
      return 2;
    case "This year":
      return 1;
    case "Exploring for now":
      return 0;
    default:
      return 0;
  }
}

function improvementIntensityScore(input: EngagementEstimateInput): number {
  const threePrioritiesBonus = input.priorities.length >= 3 ? 1 : 0;
  const raw = timingScore(input.timing) + threePrioritiesBonus;
  return Math.min(raw, 4);
}

export function computeComplexityScore(input: EngagementEstimateInput): ComplexityBreakdown {
  const businessScale = businessScaleScore(input);
  const systemComplexity = systemComplexityScore(input);
  const operationalComplexity = operationalComplexityScore(input);
  const friction = frictionScore(input);
  const improvementIntensity = improvementIntensityScore(input);

  return {
    businessScale,
    systemComplexity,
    operationalComplexity,
    friction,
    improvementIntensity,
    total: businessScale + systemComplexity + operationalComplexity + friction + improvementIntensity,
  };
}

/**
 * Implementation scope classifier. Interpretive (see file header): derives
 * LIGHT / STANDARD / SUBSTANTIAL from the same systems/connectivity signals
 * already collected, since the source document specifies the three tiers'
 * pricing effect but not which diagnostic answers select a tier.
 */
export function classifyImplementationScope(input: EngagementEstimateInput): ImplementationScope {
  const systemCount = input.systems.length;

  if (
    systemCount >= 10 ||
    input.spreadsheetDependency === "We'd stop without them" ||
    (systemCount >= 6 && input.connectionLevel === "Mostly manual")
  ) {
    return "substantial";
  }

  if (
    systemCount >= 3 ||
    input.connectionLevel === "Some connections" ||
    input.connectionLevel === "Mostly manual" ||
    input.friction.length >= 4
  ) {
    return "standard";
  }

  return "light";
}

function findBand(totalScore: number) {
  return PRICING_CONFIG.monthly.bands.find(
    (band) => totalScore >= band.scoreMin && totalScore <= band.scoreMax
  )!;
}

function roundToIncrement(value: number): number {
  const increment = PRICING_CONFIG.estimate.roundingIncrement;
  return Math.round(value / increment) * increment;
}

function levelFromScore(score: number, max: number): QualitativeLevel {
  const ratio = max === 0 ? 0 : score / max;
  if (ratio >= 2 / 3) return "high";
  if (ratio >= 1 / 3) return "moderate";
  return "low";
}

/**
 * The single entry point. Deterministic: identical input always returns
 * an identical estimate. Never fabricates precision, always a range,
 * rounded to the configured increment, and falls back to a manual-scope
 * result rather than an inflated automatic number per the guardrails in
 * section 07 of the source document.
 */
export function calculateEngagementEstimate(input: EngagementEstimateInput): EngagementEstimate {
  const complexityScore = computeComplexityScore(input);
  const implementationScope = classifyImplementationScope(input);
  const band = findBand(complexityScore.total);

  const reasoning: string[] = [];
  reasoning.push(`Complexity score ${complexityScore.total}/22 (band: ${band.id}).`);
  reasoning.push(
    `Business scale ${complexityScore.businessScale}/4, systems ${complexityScore.systemComplexity}/5, operations ${complexityScore.operationalComplexity}/5, friction ${complexityScore.friction}/4, improvement intensity ${complexityScore.improvementIntensity}/4.`
  );
  reasoning.push(`Implementation scope classified as ${implementationScope}.`);

  const substantialImplementation = implementationScope === "substantial";
  const bandForcesManualScope = "manualScope" in band && band.manualScope === true;
  const manualScope = bandForcesManualScope || substantialImplementation;

  if (manualScope) {
    const startingAt =
      "startingAt" in band && typeof band.startingAt === "number" ? band.startingAt : PRICING_CONFIG.monthly.minimum;
    reasoning.push(
      substantialImplementation && !bandForcesManualScope
        ? "Substantial implementation scope requires manual review regardless of complexity score."
        : "Complexity score falls in the manual-scope band."
    );
    return {
      pricingVersion: PRICING_CONFIG.estimate.version,
      complexityScore,
      band: band.id,
      implementationScope,
      estimatedMin: Math.max(startingAt, PRICING_CONFIG.monthly.minimum),
      estimatedMax: Math.max(startingAt, PRICING_CONFIG.monthly.minimum),
      manualScope: true,
      confidence: "requires_review",
      reasoning,
      businessScaleLevel: levelFromScore(complexityScore.businessScale, 4),
      systemFragmentationLevel: levelFromScore(complexityScore.systemComplexity, 5),
      operationalComplexityLevel: levelFromScore(complexityScore.operationalComplexity, 5),
      implementationScopeLevel: "high",
    };
  }

  const bandMin = "estimateMin" in band ? band.estimateMin : PRICING_CONFIG.monthly.minimum;
  const bandMax = "estimateMax" in band ? band.estimateMax : PRICING_CONFIG.monthly.minimum;

  const adjustment = PRICING_CONFIG.implementation[implementationScope as "light" | "standard"] ?? {
    adjustmentMin: 0,
    adjustmentMax: 0,
  };

  const adjustmentMin = "adjustmentMin" in adjustment ? adjustment.adjustmentMin : 0;
  const adjustmentMax = "adjustmentMax" in adjustment ? adjustment.adjustmentMax : 0;

  // The configured band bounds (200, 650, 900, ...) are the business's own
  // chosen figures, not arbitrary sums, so they're used as-is when nothing
  // is added to them. Rounding to the nearest €50 only applies once an
  // implementation-scope adjustment actually changes the number, so it
  // never silently overrides a deliberately-chosen floor like €200.
  let estimatedMin = adjustmentMin === 0 ? bandMin : roundToIncrement(bandMin + adjustmentMin);
  let estimatedMax = adjustmentMax === 0 ? bandMax : roundToIncrement(bandMax + adjustmentMax);

  estimatedMin = Math.max(estimatedMin, PRICING_CONFIG.monthly.minimum);

  // Guardrail: automatic estimate ceiling. Beyond this, defer to manual scope
  // rather than publish an inflated automatic number (section 07).
  if (estimatedMax > 2000) {
    estimatedMax = 2000;
    reasoning.push("Estimate capped at the automatic-estimate ceiling of €2,000/month.");
  }
  if (estimatedMin > estimatedMax) estimatedMin = estimatedMax;

  if (implementationScope === "standard") {
    reasoning.push("Standard implementation scope adds €150 to €350/month to the base band.");
  }

  return {
    pricingVersion: PRICING_CONFIG.estimate.version,
    complexityScore,
    band: band.id,
    implementationScope,
    estimatedMin,
    estimatedMax,
    manualScope: false,
    confidence: complexityScore.total <= 2 ? "initial" : "good_indication",
    reasoning,
    businessScaleLevel: levelFromScore(complexityScore.businessScale, 4),
    systemFragmentationLevel: levelFromScore(complexityScore.systemComplexity, 5),
    operationalComplexityLevel: levelFromScore(complexityScore.operationalComplexity, 5),
    implementationScopeLevel:
      implementationScope === "light" ? "low" : implementationScope === "standard" ? "moderate" : "high",
  };
}

/**
 * Recomputes a band's monthly range under a hypothetical implementation
 * scope, without needing the full raw survey answers — just the band
 * already assigned to a submission. This is what powers the admin pricing
 * calculator's "what if scope were X instead" control: the same band +
 * implementation-adjustment + rounding + guardrail logic as
 * calculateEngagementEstimate() above (kept in this one file so the math
 * never drifts out of sync), just entered from a band id rather than a
 * fresh complexity score.
 */
export function recomputeForScopeOverride(
  bandId: PricingBandId,
  scope: ImplementationScope
): { estimatedMin: number; estimatedMax: number; manualScope: boolean } {
  const band = PRICING_CONFIG.monthly.bands.find((b) => b.id === bandId) ?? PRICING_CONFIG.monthly.bands[0];
  const bandForcesManualScope = "manualScope" in band && band.manualScope === true;

  if (bandForcesManualScope || scope === "substantial") {
    const startingAt =
      "startingAt" in band && typeof band.startingAt === "number" ? band.startingAt : PRICING_CONFIG.monthly.minimum;
    const value = Math.max(startingAt, PRICING_CONFIG.monthly.minimum);
    return { estimatedMin: value, estimatedMax: value, manualScope: true };
  }

  const bandMin = "estimateMin" in band ? band.estimateMin : PRICING_CONFIG.monthly.minimum;
  const bandMax = "estimateMax" in band ? band.estimateMax : PRICING_CONFIG.monthly.minimum;
  const adjustment = PRICING_CONFIG.implementation[scope as "light" | "standard"] ?? {
    adjustmentMin: 0,
    adjustmentMax: 0,
  };
  const adjustmentMin = "adjustmentMin" in adjustment ? adjustment.adjustmentMin : 0;
  const adjustmentMax = "adjustmentMax" in adjustment ? adjustment.adjustmentMax : 0;

  let estimatedMin = adjustmentMin === 0 ? bandMin : roundToIncrement(bandMin + adjustmentMin);
  let estimatedMax = adjustmentMax === 0 ? bandMax : roundToIncrement(bandMax + adjustmentMax);
  estimatedMin = Math.max(estimatedMin, PRICING_CONFIG.monthly.minimum);
  if (estimatedMax > 2000) estimatedMax = 2000;
  if (estimatedMin > estimatedMax) estimatedMin = estimatedMax;

  return { estimatedMin, estimatedMax, manualScope: false };
}
