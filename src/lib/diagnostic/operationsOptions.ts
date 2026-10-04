import type { Locale } from "@/lib/i18n/config";

/**
 * The answer options for the two October 2026 operations questions.
 *
 * Deliberately a plain module with no dictionary lookup. The mapping that
 * turns these answers into the legacy scoring runs on the SERVER, inside
 * the submission route, and `questions.ts` reaches `dictFor()`, which is
 * client-only — importing it there failed the request with "Attempted to
 * call dictFor() from the server".
 *
 * The i18n dictionaries import these lists, so there is still one source
 * of truth and the two cannot drift apart.
 */
export const TASK_CONSISTENCY_OPTIONS: Record<Locale, readonly string[]> = {
  en: [
    "Everyone has their own way.",
    "We follow some shared steps.",
    "We usually follow the same steps.",
    "Not sure / not applicable.",
  ],
  nl: [
    "Iedereen doet het op zijn eigen manier.",
    "We volgen een aantal gedeelde stappen.",
    "We volgen meestal dezelfde stappen.",
    "Weet ik niet / niet van toepassing.",
  ],
};

export const ABSENCE_COVERAGE_OPTIONS: Record<Locale, readonly string[]> = {
  en: [
    "Yes, they can take over easily.",
    "Yes, but they need some explanation.",
    "No, they would struggle without that person.",
    "Not applicable — I work alone.",
  ],
  nl: [
    "Ja, dat kan een collega makkelijk overnemen.",
    "Ja, maar er is wat uitleg nodig.",
    "Nee, zonder die persoon wordt het lastig.",
    "Niet van toepassing — ik werk alleen.",
  ],
};
