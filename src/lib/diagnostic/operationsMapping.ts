import { LOCALES, type Locale } from "@/lib/i18n/config";
import { TASK_CONSISTENCY_OPTIONS, ABSENCE_COVERAGE_OPTIONS } from "./operationsOptions";

/**
 * The explicit mapping from the October 2026 operations answers onto the
 * legacy representation the rest of the system already understands.
 *
 * It is deliberately index-based rather than string-matched: the answers
 * are stored in the visitor's own language, and comparing translated
 * sentences is both fragile and invisible when it breaks.
 *
 * The rule that matters: **an unknown answer maps to nothing, never to a
 * level.** "Not sure" and "Not applicable" are real answers about the
 * limits of what the visitor knows, not evidence of a problem, so they
 * must not arrive downstream looking like a low score.
 */

export const UNKNOWN_INDEX = 3;

function indexOfAnswer(options: readonly string[], answer: string): number {
  return options.findIndex((option) => option === answer);
}

/*
 * Resolve the answer against EVERY locale, not just the current one.
 *
 * The server has no reliable locale for the submission, and a visitor
 * can switch language part-way through the form, so an answer saved in
 * Dutch could arrive while the request is read as English. Scanning all
 * locales means the stored sentence always resolves to the answer it
 * actually is. The option lists do not overlap between locales, so there
 * is no ambiguity to resolve.
 */
function indexInAnyLocale(
  lists: Record<Locale, readonly string[]>,
  answer: string
): number {
  for (const locale of LOCALES) {
    const index = indexOfAnswer(lists[locale], answer);
    if (index >= 0) return index;
  }
  return -1;
}

/**
 * "Does your team follow the same steps for recurring tasks?" onto the
 * old 1–5 self-rated standardization scale.
 *
 *   Everyone has their own way        → 1  (least consistent)
 *   We follow some shared steps       → 3  (the old scale's midpoint)
 *   We usually follow the same steps  → 5  (most consistent)
 *   Not sure / not applicable         → null
 *
 * `null` rather than a number, because no value on a 1–5 scale means
 * "not answered" — and `operationalComplexityScore` reads `<= 1` as a
 * complexity signal, so any number here would be scored as a finding the
 * visitor never reported.
 */
export function legacyStandardization(taskConsistency: string): number | null {
  const index = indexInAnyLocale(TASK_CONSISTENCY_OPTIONS, taskConsistency);
  if (index < 0 || index === UNKNOWN_INDEX) return null;
  return [1, 3, 5][index] ?? null;
}

/**
 * "If someone is away, can a colleague take over their work?" onto the
 * old Low/Medium/High key-person dependency judgement.
 *
 *   Yes, easily                       → "Low"
 *   Yes, but needs some explanation   → "Medium"
 *   No, they would struggle           → "High"
 *   Not applicable — I work alone     → ""   (scores 0, i.e. no signal)
 *
 * Working alone is NOT recorded as high dependency. It might look like
 * the same thing, but the question is about whether knowledge is
 * transferable between colleagues, and someone with no colleagues has
 * not told us their business is fragile — they have told us the question
 * does not apply. Inferring "High" would put a judgement in their mouth.
 */
export function legacyDependency(absenceCoverage: string): "Low" | "Medium" | "High" | "" {
  const index = indexInAnyLocale(ABSENCE_COVERAGE_OPTIONS, absenceCoverage);
  if (index < 0 || index === UNKNOWN_INDEX) return "";
  return (["Low", "Medium", "High"] as const)[index] ?? "";
}

/** Whether the visitor explicitly said they do not know / it does not apply. */
export function isUnknownTaskConsistency(answer: string): boolean {
  return indexInAnyLocale(TASK_CONSISTENCY_OPTIONS, answer) === UNKNOWN_INDEX;
}

export function isUnknownAbsenceCoverage(answer: string): boolean {
  return indexInAnyLocale(ABSENCE_COVERAGE_OPTIONS, answer) === UNKNOWN_INDEX;
}

/**
 * The legacy-shaped view of an answer set.
 *
 * Scoring, signals, the PDF and the estimate all read
 * `dependency` / `processStandardization`. Rather than rewrite each of
 * them — and risk changing how a historical record scores — they are
 * handed this projection. The new answers stay the source of truth; this
 * is only the translation at the boundary.
 */
export function withLegacyOperations<T extends { taskConsistency: string; absenceCoverage: string }>(
  answers: T
): T & { dependency: "Low" | "Medium" | "High" | ""; processStandardization: number | null } {
  return {
    ...answers,
    dependency: legacyDependency(answers.absenceCoverage),
    processStandardization: legacyStandardization(answers.taskConsistency),
  };
}
