import type { Locale } from "@/lib/i18n/config";
import { en } from "@/lib/i18n/dictionaries/en";
import { dictFor } from "@/lib/i18n/context";

// Option lists shown across the diagnostic steps live in the locale
// dictionaries (src/lib/i18n/dictionaries) so the questionnaire switches
// language along with the rest of the site, the same way chatbot.ts sources
// its rule content from the dictionaries. Each list is positionally aligned
// between en/nl (same length, same order), so a value picked while a
// visitor is on one locale can still be located by English identifier below
// (see `pick`), which keeps comparisons in rules.ts stable and readable
// without hardcoding translated strings a second time.
export function getIndustries(locale: Locale) {
  return dictFor(locale).diagnosticQuestions.industries;
}
export function getEmployeeRanges(locale: Locale) {
  return dictFor(locale).diagnosticQuestions.employeeRanges;
}
export function getLocationOptions(locale: Locale) {
  return dictFor(locale).diagnosticQuestions.locationOptions;
}
export function getReachChannels(locale: Locale) {
  return dictFor(locale).diagnosticQuestions.reachChannels;
}
export function getEnquiryHandling(locale: Locale) {
  return dictFor(locale).diagnosticQuestions.enquiryHandling;
}
export function getAdminHoursOptions(locale: Locale) {
  return dictFor(locale).diagnosticQuestions.adminHoursOptions;
}
export function getDependencyLevels(locale: Locale) {
  return dictFor(locale).diagnosticQuestions.dependencyLevels;
}
export function getTaskConsistencyOptions(locale: Locale) {
  return dictFor(locale).diagnosticQuestions.taskConsistencyOptions;
}
export function getAbsenceCoverageOptions(locale: Locale) {
  return dictFor(locale).diagnosticQuestions.absenceCoverageOptions;
}
export function getSystemOptions(locale: Locale) {
  return dictFor(locale).diagnosticQuestions.systemOptions;
}
export function getConnectionLevels(locale: Locale) {
  return dictFor(locale).diagnosticQuestions.connectionLevels;
}
export function getSpreadsheetDependency(locale: Locale) {
  return dictFor(locale).diagnosticQuestions.spreadsheetDependency;
}
export function getAutomationUsage(locale: Locale) {
  return dictFor(locale).diagnosticQuestions.automationUsage;
}
export function getFrictionAreas(locale: Locale) {
  return dictFor(locale).diagnosticQuestions.frictionAreas;
}
export function getFrequencyOptions(locale: Locale) {
  return dictFor(locale).diagnosticQuestions.frequencyOptions;
}
export function getImpactOptions(locale: Locale) {
  return dictFor(locale).diagnosticQuestions.impactOptions;
}
export function getPriorityOptions(locale: Locale) {
  return dictFor(locale).diagnosticQuestions.priorityOptions;
}
export function getTimingOptions(locale: Locale) {
  return dictFor(locale).diagnosticQuestions.timingOptions;
}
export function getRoleOptions(locale: Locale) {
  return dictFor(locale).diagnosticQuestions.roleOptions;
}
export function getDecisionContextOptions(locale: Locale) {
  return dictFor(locale).diagnosticQuestions.decisionContextOptions;
}
export function getInterestOptions(locale: Locale) {
  return dictFor(locale).diagnosticQuestions.interestOptions;
}

type QuestionListKey = keyof typeof en.diagnosticQuestions;

/**
 * Looks up the value of an option list at the same position as its English
 * label. Lets non-component code (rules.ts) compare a stored answer against
 * "the Dutch (or English) version of X" without retyping translated text.
 */
export function pick(listKey: QuestionListKey, englishValue: string, locale: Locale): string {
  const englishList = en.diagnosticQuestions[listKey];
  const index = englishList.indexOf(englishValue);
  if (index === -1) return englishValue;
  return dictFor(locale).diagnosticQuestions[listKey][index] ?? englishValue;
}
