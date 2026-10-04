import { DEFAULT_TOPICS, GROUP_OF_TOPIC, REVIEW_GROUP_COUNT } from "@/lib/three/diagnosticScene";
import {
  isUnknownAbsenceCoverage,
  isUnknownTaskConsistency,
} from "@/lib/diagnostic/operationsMapping";
import type { DiagnosticAnswers } from "@/lib/diagnostic/types";

/**
 * The words beside the diagnostic's composition.
 *
 * Two jobs, kept apart on purpose:
 *
 * 1. **Why we are asking.** A fixed sentence per topic, authored copy, the
 *    same for everyone. This is the part that gives the graphic a purpose:
 *    without it the composition is decoration, however well it moves.
 * 2. **What has been recorded.** Facts read straight off the visitor's own
 *    answers. A fact exists only when the corresponding answer is actually
 *    filled in — there is no sample data, no placeholder, and nothing is
 *    inferred, scored or concluded here.
 *
 * Deliberately NOT included: any judgement about the business. The signals
 * engine has its own place on the result screen, after a real submission.
 * While answering, a half-finished answer set would only produce a
 * half-true verdict, which is worse than none.
 *
 * Pure functions over answers plus the dictionary, so both halves are unit
 * testable without a browser.
 */

export type Fact = { label: string; value: string };

export type TopicNarration = {
  topic: number;
  name: string;
  /** Why this topic is asked about. Authored copy, never generated. */
  purpose: string;
  /** True once this topic holds at least one real answer. */
  recorded: boolean;
  facts: Fact[];
};

export type GroupNarration = {
  group: number;
  name: string;
  body: string;
  facts: Fact[];
};

/** Just the dictionary slice this module needs, so tests need no full dict. */
export type NarrationDict = {
  topics: readonly { name: string; purpose: string }[];
  groups: readonly { name: string; body: string }[];
  facts: {
    company: string;
    industry: string;
    team: string;
    locations: string;
    channels: string;
    handling: string;
    manualWork: string;
    consistency: string;
    coverage: string;
    systems: string;
    systemsIdentified: string;
    connected: string;
    spreadsheets: string;
    automation: string;
    friction: string;
    primaryFriction: string;
    frequency: string;
    impact: string;
    interest: string;
    priorities: string;
    timing: string;
    role: string;
    sendTo: string;
  };
  /** e.g. "3 of 6 topics recorded" — the one number the graphic is about. */
  recordedCount: (filled: number, total: number) => string;
};

function list(values: readonly string[]): string {
  return values.filter((v) => v.trim().length > 0).join(" · ");
}

/**
 * The facts for one topic.
 *
 * Every branch is guarded on the answer being non-empty, which is what
 * keeps "only when actually filled" true by construction rather than by a
 * caller remembering to check. "Not sure" and "not applicable" operations
 * answers are left out as well: they record what the visitor knows, not
 * something true about their business, and summarising them as a fact
 * about the work would be exactly the invented conclusion to avoid.
 */
export function factsForTopic(
  topic: number,
  a: DiagnosticAnswers,
  d: NarrationDict,
  otherIndustryLabel: string,
  otherRoleLabel: string
): Fact[] {
  const f: Fact[] = [];
  const push = (label: string, value: string) => {
    if (value && value.trim().length > 0) f.push({ label, value: value.trim() });
  };

  switch (topic) {
    case 0:
      push(d.facts.company, a.companyName);
      push(
        d.facts.industry,
        a.industry === otherIndustryLabel ? a.industryOther : a.industry
      );
      push(d.facts.team, a.employees);
      push(d.facts.locations, a.locations);
      break;
    case 1:
      push(d.facts.channels, list(a.reachChannels));
      push(d.facts.handling, list(a.enquiryHandling));
      push(d.facts.manualWork, a.adminHours);
      if (a.taskConsistency && !isUnknownTaskConsistency(a.taskConsistency)) {
        push(d.facts.consistency, a.taskConsistency);
      }
      if (a.absenceCoverage && !isUnknownAbsenceCoverage(a.absenceCoverage)) {
        push(d.facts.coverage, a.absenceCoverage);
      }
      break;
    case 2:
      if (a.systems.length > 0) {
        push(d.facts.systems, `${a.systems.length} ${d.facts.systemsIdentified}`);
      }
      push(d.facts.connected, a.connectionLevel);
      push(d.facts.spreadsheets, a.spreadsheetDependency);
      push(d.facts.automation, list(a.automationUsage));
      break;
    case 3:
      push(d.facts.friction, list(a.friction));
      push(d.facts.primaryFriction, a.primaryPain);
      push(d.facts.frequency, a.frequency);
      push(d.facts.impact, list(a.impact));
      break;
    case 4:
      push(d.facts.interest, a.primaryInterest);
      push(d.facts.priorities, list(a.priorities));
      push(d.facts.timing, a.timing);
      break;
    case 5:
      push(d.facts.role, a.role === otherRoleLabel ? a.roleOther : a.role);
      // The address itself, not a "contact details added" stand-in: it is
      // where their profile will be sent and they should be able to see
      // that it is right without going back a step.
      push(d.facts.sendTo, a.email);
      break;
  }
  return f;
}

export function narrateTopics(
  a: DiagnosticAnswers,
  d: NarrationDict,
  otherIndustryLabel: string,
  otherRoleLabel: string,
  topics = DEFAULT_TOPICS
): TopicNarration[] {
  const out: TopicNarration[] = [];
  for (let topic = 0; topic < topics; topic++) {
    const facts = factsForTopic(topic, a, d, otherIndustryLabel, otherRoleLabel);
    out.push({
      topic,
      name: d.topics[topic]?.name ?? "",
      purpose: d.topics[topic]?.purpose ?? "",
      recorded: facts.length > 0,
      facts,
    });
  }
  return out;
}

/** The mask the composition grows by: one boolean per topic. */
export function recordedTopics(
  a: DiagnosticAnswers,
  d: NarrationDict,
  otherIndustryLabel: string,
  otherRoleLabel: string,
  topics = DEFAULT_TOPICS
): boolean[] {
  return narrateTopics(a, d, otherIndustryLabel, otherRoleLabel, topics).map((t) => t.recorded);
}

/**
 * The same facts, regrouped into the review screen's own three groups.
 *
 * `GROUP_OF_TOPIC` is shared with the geometry, so the three clusters the
 * visitor sees and the three headings they read cannot drift apart.
 */
export function narrateGroups(
  a: DiagnosticAnswers,
  d: NarrationDict,
  otherIndustryLabel: string,
  otherRoleLabel: string,
  topics = DEFAULT_TOPICS
): GroupNarration[] {
  const groups: GroupNarration[] = [];
  for (let g = 0; g < REVIEW_GROUP_COUNT; g++) {
    groups.push({ group: g, name: d.groups[g]?.name ?? "", body: d.groups[g]?.body ?? "", facts: [] });
  }
  for (const topic of narrateTopics(a, d, otherIndustryLabel, otherRoleLabel, topics)) {
    const g = GROUP_OF_TOPIC[topic.topic] ?? 0;
    groups[g]?.facts.push(...topic.facts);
  }
  return groups;
}
