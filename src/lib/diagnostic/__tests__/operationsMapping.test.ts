import { describe, expect, it } from "vitest";
import {
  legacyStandardization,
  legacyDependency,
  isUnknownTaskConsistency,
  isUnknownAbsenceCoverage,
} from "../operationsMapping";
import { getTaskConsistencyOptions, getAbsenceCoverageOptions } from "../questions";

/**
 * The mapping is the only place the new answers meet the old scoring, so
 * it is where "do not falsify missing information" is actually enforced.
 */
for (const locale of ["en", "nl"] as const) {
  describe(`operations mapping (${locale})`, () => {
    const consistency = getTaskConsistencyOptions(locale);
    const coverage = getAbsenceCoverageOptions(locale);

    it("maps the three substantive consistency answers onto the old scale", () => {
      expect(legacyStandardization(consistency[0])).toBe(1);
      expect(legacyStandardization(consistency[1])).toBe(3);
      expect(legacyStandardization(consistency[2])).toBe(5);
    });

    it("records 'not sure' as nothing, never as a low score", () => {
      // The decisive assertion: a number here would be read downstream as
      // a complexity signal the visitor never reported.
      expect(legacyStandardization(consistency[3])).toBeNull();
      expect(isUnknownTaskConsistency(consistency[3])).toBe(true);
      expect(isUnknownTaskConsistency(consistency[0])).toBe(false);
    });

    it("maps the three substantive coverage answers onto the old levels", () => {
      expect(legacyDependency(coverage[0])).toBe("Low");
      expect(legacyDependency(coverage[1])).toBe("Medium");
      expect(legacyDependency(coverage[2])).toBe("High");
    });

    it("does not record working alone as high dependency", () => {
      // "I work alone" is not a report that the business is fragile.
      expect(legacyDependency(coverage[3])).toBe("");
      expect(isUnknownAbsenceCoverage(coverage[3])).toBe(true);
    });

    it("treats an unrecognised answer as unknown rather than guessing", () => {
      expect(legacyStandardization("something else entirely")).toBeNull();
      expect(legacyDependency("something else entirely")).toBe("");
    });

    it("resolves an answer saved in the other language to the same meaning", () => {
      /*
       * Deliberate behaviour change. The mapping used to be scoped to one
       * locale, so an answer stored in Dutch and read as English fell
       * through to "unknown" — a visitor who switched language mid-form
       * would have had their answer silently discarded. It now resolves
       * against every locale, and the two must agree.
       */
      const other = locale === "en" ? "nl" : "en";
      const foreignConsistency = getTaskConsistencyOptions(other);
      const foreignCoverage = getAbsenceCoverageOptions(other);
      for (let i = 0; i < consistency.length; i++) {
        expect(legacyStandardization(foreignConsistency[i])).toBe(
          legacyStandardization(consistency[i])
        );
        expect(legacyDependency(foreignCoverage[i])).toBe(legacyDependency(coverage[i]));
      }
    });
  });
}
