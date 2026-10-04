import { describe, expect, it } from "vitest";
import {
  factsForTopic,
  narrateGroups,
  narrateTopics,
  recordedTopics,
  type NarrationDict,
} from "../sceneNarration";
import { emptyAnswers, type DiagnosticAnswers } from "../types";
import { TASK_CONSISTENCY_OPTIONS, ABSENCE_COVERAGE_OPTIONS } from "../operationsOptions";
import { UNKNOWN_INDEX } from "../operationsMapping";

/** A dictionary stand-in: the labels are identifiable, nothing else. */
const D: NarrationDict = {
  topics: [
    { name: "T0", purpose: "P0" },
    { name: "T1", purpose: "P1" },
    { name: "T2", purpose: "P2" },
    { name: "T3", purpose: "P3" },
    { name: "T4", purpose: "P4" },
    { name: "T5", purpose: "P5" },
  ],
  groups: [
    { name: "G0", body: "B0" },
    { name: "G1", body: "B1" },
    { name: "G2", body: "B2" },
  ],
  facts: {
    company: "company",
    industry: "industry",
    team: "team",
    locations: "locations",
    channels: "channels",
    handling: "handling",
    manualWork: "manualWork",
    consistency: "consistency",
    coverage: "coverage",
    systems: "systems",
    systemsIdentified: "identified",
    connected: "connected",
    spreadsheets: "spreadsheets",
    automation: "automation",
    friction: "friction",
    primaryFriction: "primaryFriction",
    frequency: "frequency",
    impact: "impact",
    interest: "interest",
    priorities: "priorities",
    timing: "timing",
    role: "role",
    sendTo: "sendTo",
  },
  recordedCount: (f, t) => `${f}/${t}`,
};

const OTHER_INDUSTRY = "Other";
const OTHER_ROLE = "Other";
const facts = (topic: number, a: DiagnosticAnswers) =>
  factsForTopic(topic, a, D, OTHER_INDUSTRY, OTHER_ROLE);
const labels = (topic: number, a: DiagnosticAnswers) => facts(topic, a).map((f) => f.label);

describe("nothing is summarised that was not answered", () => {
  it("produces no facts at all for an empty answer set", () => {
    for (let topic = 0; topic < 6; topic++) {
      expect(facts(topic, emptyAnswers)).toEqual([]);
    }
  });

  it("reports every topic as not recorded, so the graphic cannot grow on nothing", () => {
    expect(recordedTopics(emptyAnswers, D, OTHER_INDUSTRY, OTHER_ROLE)).toEqual([
      false,
      false,
      false,
      false,
      false,
      false,
    ]);
  });

  it("ignores whitespace-only answers rather than recording a blank fact", () => {
    const a = { ...emptyAnswers, companyName: "   ", adminHours: "\t" };
    expect(facts(0, a)).toEqual([]);
    expect(facts(1, a)).toEqual([]);
  });

  it("records a topic as soon as it holds one real answer, and not before", () => {
    const a = { ...emptyAnswers, connectionLevel: "Mostly manual" };
    const recorded = recordedTopics(a, D, OTHER_INDUSTRY, OTHER_ROLE);
    expect(recorded[2]).toBe(true);
    expect(recorded.filter(Boolean)).toHaveLength(1);
  });
});

describe('"not sure" and "not applicable" are not turned into findings', () => {
  it("leaves the unknown operations answers out of the summary entirely", () => {
    const a: DiagnosticAnswers = {
      ...emptyAnswers,
      taskConsistency: TASK_CONSISTENCY_OPTIONS.en[UNKNOWN_INDEX],
      absenceCoverage: ABSENCE_COVERAGE_OPTIONS.en[UNKNOWN_INDEX],
    };
    // They record what the visitor knows, not something true of the work,
    // so summarising them as a fact about the business would be inventing
    // a conclusion.
    expect(labels(1, a)).not.toContain("consistency");
    expect(labels(1, a)).not.toContain("coverage");
    expect(facts(1, a)).toEqual([]);
  });

  it("still summarises a real operations answer", () => {
    const a: DiagnosticAnswers = {
      ...emptyAnswers,
      taskConsistency: TASK_CONSISTENCY_OPTIONS.en[0],
      absenceCoverage: ABSENCE_COVERAGE_OPTIONS.en[0],
    };
    expect(labels(1, a)).toEqual(["consistency", "coverage"]);
  });

  it("recognises the unknown answers in either language", () => {
    const a: DiagnosticAnswers = {
      ...emptyAnswers,
      taskConsistency: TASK_CONSISTENCY_OPTIONS.nl[UNKNOWN_INDEX],
      absenceCoverage: ABSENCE_COVERAGE_OPTIONS.nl[UNKNOWN_INDEX],
    };
    expect(facts(1, a)).toEqual([]);
  });
});

describe("the facts are the visitor's own answers", () => {
  const answered: DiagnosticAnswers = {
    ...emptyAnswers,
    companyName: "Bagel Alley",
    industry: "Hospitality",
    employees: "6–20",
    locations: "2–5",
    reachChannels: ["Phone", "Website form"],
    systems: ["CRM", "Bookkeeping", "Scheduling"],
    connectionLevel: "Mostly manual",
    friction: ["Quoting", "Follow-up"],
    primaryPain: "Quoting",
    priorities: ["Save time"],
    timing: "Within 30 days",
    role: "Owner / Founder",
    email: "owner@bagelalley.nl",
  };

  it("passes values through verbatim", () => {
    expect(facts(0, answered)).toEqual([
      { label: "company", value: "Bagel Alley" },
      { label: "industry", value: "Hospitality" },
      { label: "team", value: "6–20" },
      { label: "locations", value: "2–5" },
    ]);
  });

  it("joins multi-select answers instead of dropping all but the first", () => {
    expect(facts(3, answered)[0]).toEqual({
      label: "friction",
      value: "Quoting · Follow-up",
    });
  });

  it("counts systems rather than listing them, which is what was asked", () => {
    expect(facts(2, answered)[0]).toEqual({ label: "systems", value: "3 identified" });
  });

  it("uses the free-text industry when the visitor chose Other", () => {
    const a = { ...answered, industry: OTHER_INDUSTRY, industryOther: "Bagel wholesale" };
    expect(facts(0, a)).toContainEqual({ label: "industry", value: "Bagel wholesale" });
  });

  it("does not fall back to the literal 'Other' when its free text is blank", () => {
    const a = { ...answered, industry: OTHER_INDUSTRY, industryOther: "" };
    expect(labels(0, a)).not.toContain("industry");
  });

  it("carries the authored purpose for every topic, answered or not", () => {
    const narrated = narrateTopics(emptyAnswers, D, OTHER_INDUSTRY, OTHER_ROLE);
    expect(narrated.map((x) => x.purpose)).toEqual(["P0", "P1", "P2", "P3", "P4", "P5"]);
  });
});

describe("the review grouping", () => {
  const a: DiagnosticAnswers = {
    ...emptyAnswers,
    companyName: "Bagel Alley",
    friction: ["Quoting"],
    timing: "Within 30 days",
  };

  it("sorts each topic's facts into the group the geometry uses", () => {
    const groups = narrateGroups(a, D, OTHER_INDUSTRY, OTHER_ROLE);
    expect(groups).toHaveLength(3);
    expect(groups[0].facts).toEqual([{ label: "company", value: "Bagel Alley" }]);
    expect(groups[1].facts).toEqual([{ label: "friction", value: "Quoting" }]);
    expect(groups[2].facts).toEqual([{ label: "timing", value: "Within 30 days" }]);
  });

  it("leaves a group empty rather than filling it with a placeholder", () => {
    const groups = narrateGroups(emptyAnswers, D, OTHER_INDUSTRY, OTHER_ROLE);
    expect(groups.every((g) => g.facts.length === 0)).toBe(true);
    // The names and bodies are authored copy and are always present.
    expect(groups.map((g) => g.name)).toEqual(["G0", "G1", "G2"]);
  });
});
