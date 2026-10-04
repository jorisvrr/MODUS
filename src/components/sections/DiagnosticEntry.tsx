"use client";

import { useState } from "react";
import { Container } from "@/components/ui/Container";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { Reveal } from "@/components/ui/Reveal";
import { DiagnosticCTA } from "@/components/ui/DiagnosticCTA";
import { useIdentity } from "@/components/auth/IdentityProvider";
import { ENTRY_TEXT_MAX, saveEntryContext } from "@/lib/diagnostic/entryContext";
import { useDict } from "@/lib/i18n/context";

/**
 * "Start here" — the homepage's way into the diagnostic.
 *
 * ## What changed and why
 *
 * The chips used to read Website / Leads / Processes / Growth: categories
 * of a service offering, not things anyone says about their own week. They
 * now name the work itself — following up with customers, planning work,
 * repetitive admin, getting more enquiries — so choosing one is
 * recognition rather than classification. The heading asks the question a
 * business owner already has an answer to.
 *
 * ## How the answer travels
 *
 * In session storage, scoped to whoever is signed in, and only on the
 * press of the CTA. Three things follow from that:
 *
 * - **Not in the URL.** A free-text line about where a business is stuck
 *   does not belong in a query string, which is copied, pasted and logged.
 *   The old `?hint=` carried a single category; this carries their own
 *   words, so it travels where the browser keeps a conversation.
 * - **Not in the draft key.** `modus:diagnostic:v1` holds a real
 *   in-progress diagnostic, and anything in it makes the diagnostic offer
 *   to resume a saved session. Entry context has its own key and is read
 *   as start context, never as answers.
 * - **Nothing happens on a chip.** No request, no write. A chip is
 *   pressed, un-pressed and reconsidered; it is a selection, not a
 *   submission.
 *
 * Both fields are optional and neither gates the CTA: someone who knows
 * only that something is wrong should not be stopped at the door.
 */
export function DiagnosticEntry() {
  const dict = useDict();
  const t = dict.home.diagnosticEntry;
  const { identity } = useIdentity();
  const [text, setText] = useState("");
  const [selected, setSelected] = useState<string[]>([]);

  const exclusive = t.exclusiveCategory;

  function toggle(category: string) {
    setSelected((current) => {
      if (current.includes(category)) return current.filter((c) => c !== category);
      /*
       * "Not sure yet" is mutually exclusive with everything else, in both
       * directions: alongside three specific answers it would contradict
       * them, and a specific answer after it supersedes it.
       */
      if (category === exclusive) return [category];
      return [...current.filter((c) => c !== exclusive), category];
    });
  }

  return (
    <section className="border-t border-line bg-mineral py-24 md:py-32">
      <Container>
        <div className="mx-auto max-w-2xl">
          <Reveal className="flex justify-center">
            <SectionLabel id="SYS / 02">{t.label}</SectionLabel>
          </Reveal>
          <Reveal delay={0.06}>
            <h2 className="mt-5 text-balance text-center text-display-sm font-semibold text-ink md:text-display-md">
              {t.heading}
            </h2>
          </Reveal>
          <Reveal delay={0.1}>
            <p className="mx-auto mt-4 max-w-md text-balance text-center text-[14.5px] leading-relaxed text-graphite">
              {t.description}
            </p>
          </Reveal>

          <Reveal delay={0.14}>
            {/* A compact card, not a floating hero input: `shadow-lg`
                rather than the previous `shadow-2xl`, whose spread read as
                a separate object hovering over the section. */}
            <form
              className="mt-9 rounded-lg border border-line bg-paper p-5 shadow-lg sm:p-6"
              onSubmit={(e) => e.preventDefault()}
            >
              <label htmlFor="modus-entry-text" className="block text-[13.5px] font-medium text-ink">
                {t.fieldLabel}
              </label>
              <input
                id="modus-entry-text"
                type="text"
                value={text}
                maxLength={ENTRY_TEXT_MAX}
                onChange={(e) => setText(e.target.value)}
                placeholder={t.placeholder}
                className="mt-2.5 w-full rounded border border-line bg-paper px-3.5 py-3 text-[14px] text-ink placeholder:text-muted focus:border-modus focus:outline-none focus:ring-1 focus:ring-modus"
              />

              <div className="mt-6">
                {/*
                 * A real group label, so the chips are announced as a set
                 * rather than as five unrelated buttons. `aria-pressed`
                 * makes each one's state audible; a `<fieldset>` of
                 * checkboxes was the alternative, but these are
                 * press-to-filter controls, not form inputs that submit a
                 * value, and the CTA is a link.
                 */}
                <p id="modus-entry-chips" className="text-[12.5px] text-muted">
                  {t.chipsLabel}
                </p>
                <div
                  role="group"
                  aria-labelledby="modus-entry-chips"
                  className="mt-3 flex flex-wrap gap-2"
                >
                  {t.categories.map((c) => {
                    const on = selected.includes(c);
                    return (
                      <button
                        key={c}
                        type="button"
                        onClick={() => toggle(c)}
                        aria-pressed={on}
                        // Sentence case at 13px, not 11px uppercase mono:
                        // these are now phrases like "Following up with
                        // customers", and tracked-out uppercase made them
                        // both wide and slow to read.
                        className={`rounded-full border px-3.5 py-2 text-[13px] transition-colors ${
                          on
                            ? "border-modus bg-modus text-modus-foreground"
                            : "border-line text-graphite hover:border-ink/30 hover:text-ink"
                        }`}
                      >
                        {c}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mt-7 flex flex-col gap-3 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between">
                <p className="order-2 text-[12.5px] text-muted sm:order-1">{t.ctaNote}</p>
                <DiagnosticCTA
                  variant="inline"
                  source="homepage_entry"
                  newVisitorLabel={t.cta}
                  // Written once, here, on the press that navigates — not
                  // on every chip.
                  beforeNavigate={() => saveEntryContext(selected, text, identity ?? "guest")}
                  className="order-1 w-full justify-center sm:order-2 sm:w-auto"
                />
              </div>
            </form>
          </Reveal>
        </div>
      </Container>
    </section>
  );
}
