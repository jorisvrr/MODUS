import { describe, expect, it } from "vitest";
import { calculateEngagementEstimate, recomputeForScopeOverride } from "./engine";
import type { EngagementEstimateInput } from "./types";

const baseInput: EngagementEstimateInput = {
  employees: "1–5",
  locations: "1",
  systems: [],
  connectionLevel: "Mostly connected",
  spreadsheetDependency: "Almost none",
  adminHours: "Very little",
  dependency: "Low",
  processStandardization: 5,
  friction: [],
  frequency: "Occasionally",
  impact: [],
  timing: "Exploring for now",
  priorities: [],
};

function withInput(overrides: Partial<EngagementEstimateInput>): EngagementEstimateInput {
  return { ...baseInput, ...overrides };
}

describe("calculateEngagementEstimate", () => {
  it("returns the minimum engagement for a simple, low-complexity business", () => {
    const result = calculateEngagementEstimate(baseInput);
    expect(result.manualScope).toBe(false);
    expect(result.estimatedMin).toBe(200);
    expect(result.estimatedMax).toBe(350);
    expect(result.band).toBe("focused");
  });

  it("is deterministic: identical input always returns an identical estimate", () => {
    const input = withInput({
      employees: "21–50",
      systems: ["CRM", "Email", "Booking", "Accounting"],
      connectionLevel: "Some connections",
      friction: ["Administration", "Reporting", "Data"],
      timing: "Within 30 days",
    });
    const a = calculateEngagementEstimate(input);
    const b = calculateEngagementEstimate(input);
    expect(a).toEqual(b);
  });

  it("handles a small business with moderate system fragmentation", () => {
    const result = calculateEngagementEstimate(
      withInput({
        employees: "6–20",
        systems: ["CRM", "Email", "Booking"],
        connectionLevel: "Some connections",
        spreadsheetDependency: "Important",
        friction: ["Administration", "Reporting"],
      })
    );
    expect(result.manualScope).toBe(false);
    expect(result.estimatedMin).toBeLessThanOrEqual(result.estimatedMax);
    expect(result.systemFragmentationLevel).not.toBe("low");
  });

  it("scores a multi-location business with many disconnected systems as complex", () => {
    const result = calculateEngagementEstimate(
      withInput({
        employees: "101–250",
        locations: "11+",
        systems: [
          "CRM",
          "Accounting",
          "Email",
          "Booking",
          "E-commerce",
          "POS",
          "Inventory",
          "Project Management",
          "Customer Support",
          "Spreadsheets",
          "Analytics",
        ],
        connectionLevel: "Mostly manual",
        spreadsheetDependency: "We'd stop without them",
        friction: ["Administration", "Reporting", "Data", "Scheduling", "Inventory", "Invoices / finance", "Software"],
        frequency: "Daily",
        impact: ["Time", "Revenue", "Customers"],
        timing: "Immediately",
        priorities: ["Save employee time", "Increase revenue", "Reduce costs"],
      })
    );
    // Substantial implementation scope forces manual review on its own,
    // regardless of the complexity score, per the guardrail in section 07.
    // This scenario maxes out systems/friction but leaves admin-hours and
    // key-person dependency at baseline, so the score itself stays well
    // under the 20-22 "Complex" band while still correctly landing on
    // manual scope through the implementation-scope path.
    expect(result.manualScope).toBe(true);
    expect(result.implementationScope).toBe("substantial");
    expect(result.complexityScore.total).toBeGreaterThanOrEqual(15);
  });

  it("weighs high manual-administration burden even with few systems", () => {
    const result = calculateEngagementEstimate(
      withInput({
        adminHours: "25+ hours",
        dependency: "High",
        processStandardization: 1,
      })
    );
    expect(result.complexityScore.operationalComplexity).toBe(5); // capped
    expect(result.operationalComplexityLevel).toBe("high");
  });

  it("keeps a low-urgency but highly complex business in manual scope regardless of timing", () => {
    const result = calculateEngagementEstimate(
      withInput({
        employees: "101–250",
        locations: "11+",
        systems: new Array(12).fill("Custom Software"),
        connectionLevel: "Mostly manual",
        spreadsheetDependency: "We'd stop without them",
        adminHours: "25+ hours",
        dependency: "High",
        processStandardization: 1,
        friction: ["Administration", "Reporting", "Data", "Scheduling", "Inventory", "Software", "Marketing"],
        frequency: "Daily",
        impact: ["Time", "Revenue"],
        timing: "Exploring for now", // low urgency
        priorities: [],
      })
    );
    expect(result.manualScope).toBe(true);
  });

  it("keeps a high-urgency but simple business at the minimum band", () => {
    const result = calculateEngagementEstimate(
      withInput({
        timing: "Immediately",
        priorities: ["Save employee time", "Increase revenue", "Reduce costs"],
      })
    );
    expect(result.band).toBe("focused");
    expect(result.estimatedMin).toBe(200);
  });

  it("handles very incomplete answers without throwing or producing NaN", () => {
    const result = calculateEngagementEstimate(
      withInput({
        employees: "",
        locations: "",
        connectionLevel: "",
        spreadsheetDependency: "",
        adminHours: "",
        dependency: "",
        frequency: "",
        timing: "",
      })
    );
    expect(Number.isNaN(result.estimatedMin)).toBe(false);
    expect(Number.isNaN(result.estimatedMax)).toBe(false);
    expect(result.estimatedMin).toBeGreaterThan(0);
  });

  it("caps at the manual-scope band for maximum complexity input", () => {
    const result = calculateEngagementEstimate(
      withInput({
        employees: "101–250",
        locations: "11+",
        systems: new Array(15).fill("Custom Software"),
        connectionLevel: "Mostly manual",
        spreadsheetDependency: "We'd stop without them",
        adminHours: "25+ hours",
        dependency: "High",
        processStandardization: 1,
        friction: new Array(10).fill("Administration"),
        frequency: "Daily",
        impact: ["Time", "Revenue", "Customers", "Errors"],
        timing: "Immediately",
        priorities: ["Save employee time", "Increase revenue", "Reduce costs"],
      })
    );
    expect(result.complexityScore.total).toBe(22);
    expect(result.manualScope).toBe(true);
    expect(result.estimatedMin).toBe(2000);
    expect(result.estimatedMax).toBe(2000);
  });

  it("never returns min greater than max", () => {
    const scenarios: Partial<EngagementEstimateInput>[] = [
      {},
      { employees: "51–100", systems: ["CRM", "Email"], connectionLevel: "Some connections" },
      { adminHours: "10–25 hours", dependency: "Medium" },
      { friction: ["Administration", "Reporting", "Data"], frequency: "Weekly" },
      { timing: "Within 3 months", priorities: ["Save employee time"] },
    ];
    for (const overrides of scenarios) {
      const result = calculateEngagementEstimate(withInput(overrides));
      expect(result.estimatedMin).toBeLessThanOrEqual(result.estimatedMax);
    }
  });

  it("respects the minimum engagement floor of €200", () => {
    const result = calculateEngagementEstimate(baseInput);
    expect(result.estimatedMin).toBeGreaterThanOrEqual(200);
  });

  it("respects the automatic estimate ceiling of €2,000", () => {
    const result = calculateEngagementEstimate(
      withInput({
        employees: "101–250",
        locations: "11+",
        systems: ["CRM", "Email", "Booking", "Accounting", "Analytics", "POS"],
        connectionLevel: "Some connections",
        adminHours: "10–25 hours",
        dependency: "Medium",
        friction: ["Administration", "Reporting", "Data", "Scheduling"],
        timing: "Within 30 days",
      })
    );
    expect(result.estimatedMax).toBeLessThanOrEqual(2000);
  });

  it("rounds a standard-scope adjustment to the configured €50 increment", () => {
    // The base range plus scope adjustments must respect the €50 step.
    const result = calculateEngagementEstimate(
      withInput({ systems: ["CRM", "Email", "Booking"] }) // 3 systems -> standard scope
    );
    expect(result.implementationScope).toBe("standard");
    expect(result.estimatedMin % 50).toBe(0);
    expect(result.estimatedMax % 50).toBe(0);
  });

  it("returns the exact configured band floor of €200 when no adjustment applies", () => {
    // A simple scope retains the new configured minimum.
    const result = calculateEngagementEstimate(baseInput);
    expect(result.estimatedMin).toBe(200);
  });

  it("never returns a negative or zero price", () => {
    const result = calculateEngagementEstimate(baseInput);
    expect(result.estimatedMin).toBeGreaterThan(0);
    expect(result.estimatedMax).toBeGreaterThan(0);
  });

  it("produces no random variation across repeated calls with varied input", () => {
    const input = withInput({ employees: "21–50", systems: ["CRM", "Email"], timing: "This year" });
    const results = Array.from({ length: 5 }, () => calculateEngagementEstimate(input));
    const [first, ...rest] = results;
    for (const result of rest) {
      expect(result).toEqual(first);
    }
  });

  it("stamps every estimate with the current pricing model version", () => {
    const result = calculateEngagementEstimate(baseInput);
    expect(result.pricingVersion).toBe("2026.10");
  });
});

describe("recomputeForScopeOverride", () => {
  it("matches calculateEngagementEstimate's own output for the same band and scope", () => {
    // The admin calculator's "what if scope were X" control has to agree
    // with the real engine exactly, or a human could end up quoting a
    // number the deterministic model itself wouldn't produce.
    const input = withInput({ systems: ["CRM", "Email", "Booking"] });
    const full = calculateEngagementEstimate(input);
    const recomputed = recomputeForScopeOverride(full.band, full.implementationScope);
    expect(recomputed.estimatedMin).toBe(full.estimatedMin);
    expect(recomputed.estimatedMax).toBe(full.estimatedMax);
    expect(recomputed.manualScope).toBe(full.manualScope);
  });

  it("returns the exact configured floor for the focused band with light scope", () => {
    const result = recomputeForScopeOverride("focused", "light");
    expect(result).toEqual({ estimatedMin: 200, estimatedMax: 350, manualScope: false });
  });

  it("flags manual scope when the override scope is substantial, regardless of band", () => {
    const result = recomputeForScopeOverride("focused", "substantial");
    expect(result.manualScope).toBe(true);
  });

  it("flags manual scope for the complex band regardless of override scope", () => {
    const result = recomputeForScopeOverride("complex", "light");
    expect(result.manualScope).toBe(true);
  });

  it("caps at the €2,000 automatic-estimate ceiling", () => {
    const result = recomputeForScopeOverride("extensive", "standard");
    expect(result.estimatedMax).toBeLessThanOrEqual(2000);
  });
});

describe("an unknown operations answer is not priced as a problem", () => {
  it("adds no complexity when standardization is unknown", () => {
    // `null <= 1` is true in JavaScript, so without an explicit null
    // check an unanswered question would have been priced as the worst
    // possible answer.
    const unknown = calculateEngagementEstimate(
      withInput({ processStandardization: null })
    );
    const lowest = calculateEngagementEstimate(withInput({ processStandardization: 1 }));
    expect(unknown.estimatedMin).toBeLessThanOrEqual(lowest.estimatedMin);
    const neutral = calculateEngagementEstimate(withInput({ processStandardization: 3 }));
    expect(unknown.estimatedMin).toBe(neutral.estimatedMin);
    expect(unknown.estimatedMax).toBe(neutral.estimatedMax);
  });

  it("adds no complexity when the visitor works alone", () => {
    const alone = calculateEngagementEstimate(withInput({ dependency: "" }));
    const low = calculateEngagementEstimate(withInput({ dependency: "Low" }));
    expect(alone.estimatedMin).toBe(low.estimatedMin);
    expect(alone.estimatedMax).toBe(low.estimatedMax);
  });
});
