import type { ImplementationScope, PricingBandId } from "./config";

export type ComplexityBreakdown = {
  businessScale: number; // capped 0-4
  systemComplexity: number; // capped 0-5
  operationalComplexity: number; // capped 0-5
  friction: number; // capped 0-4
  improvementIntensity: number; // capped 0-4
  total: number; // 0-22
};

export type QualitativeLevel = "low" | "moderate" | "high";

export type EstimateConfidence = "initial" | "good_indication" | "requires_review";

export type EngagementEstimateInput = {
  employees: string;
  locations: string;
  systems: string[];
  connectionLevel: string;
  spreadsheetDependency: string;
  adminHours: string;
  dependency: "Low" | "Medium" | "High" | "";
  /**
   * 1–5, or null when the visitor answered "not sure / not applicable".
   * Null is scored as no signal — see `operationalComplexityScore`.
   */
  processStandardization: number | null;
  friction: string[];
  frequency: string;
  impact: string[];
  timing: string;
  priorities: string[];
};

export type EngagementEstimate = {
  pricingVersion: string;
  complexityScore: ComplexityBreakdown;
  band: PricingBandId;
  implementationScope: ImplementationScope;
  estimatedMin: number;
  estimatedMax: number;
  manualScope: boolean;
  confidence: EstimateConfidence;
  reasoning: string[];
  businessScaleLevel: QualitativeLevel;
  systemFragmentationLevel: QualitativeLevel;
  operationalComplexityLevel: QualitativeLevel;
  implementationScopeLevel: QualitativeLevel;
};
