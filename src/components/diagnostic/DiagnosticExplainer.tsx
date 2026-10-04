"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { DiagnosticScene } from "@/components/diagnostic/DiagnosticScene";
import { completeness, DEFAULT_TOPICS } from "@/lib/three/diagnosticScene";
import {
  narrateGroups,
  narrateTopics,
  type Fact,
} from "@/lib/diagnostic/sceneNarration";
import { pick } from "@/lib/diagnostic/questions";
import type { DiagnosticAnswers } from "@/lib/diagnostic/types";
import { useDict, useLocale } from "@/lib/i18n/context";

/**
 * The diagnostic's one composition, and the words that give it a purpose.
 *
 * ## The point of this component
 *
 * A moving point cloud beside a form is decoration. What makes it worth
 * the space is that it answers the question a visitor six questions into a
 * form is actually asking — *why are you asking me this?* So the canvas
 * never travels alone: every stage pairs it with one short authored
 * sentence explaining what that topic is for, and with the facts already
 * recorded, read straight off the visitor's own answers.
 *
 * ## Which half carries the information
 *
 * The HTML does. The canvas is `aria-hidden` and says nothing that is not
 * also written beside it, which is what makes three otherwise awkward
 * cases complete rather than degraded:
 *
 * - **No WebGL.** The explanation is unaffected.
 * - **Reduced motion.** The scene renders each stage statically; the text
 *   is identical either way.
 * - **Phones.** The canvas is not mounted at all below the desktop
 *   threshold — no WebGL context, no GPU memory — and the explanation is
 *   rendered on its own, in the page flow above the question. Text is what
 *   a narrow screen should spend its room on.
 *
 * ## What is deliberately absent
 *
 * Any conclusion. No score, no "preliminary signals", no verdict while the
 * answers are half given — a partial answer set would only support a
 * partial verdict, which is worse than none. The signals engine runs on
 * the result screen, after a real submission. Equally absent: placeholder
 * copy standing in for facts that do not exist yet. A topic with nothing
 * recorded simply shows nothing.
 */
export function DiagnosticExplainer({
  screen,
  step,
  answers,
  withScene,
  showText = true,
  className = "",
}: {
  screen: string;
  step: number;
  answers: DiagnosticAnswers;
  /** Mount the canvas. False on phones and small tablets: text only. */
  withScene: boolean;
  /**
   * Render the written half. False only on the estimate screen, where the
   * single free strip of the layout is 18% of the container wide — too
   * narrow for a readable paragraph, and `ResultView` right beside it
   * already states that the diagnostic was received. The composition still
   * settles there, which is the part that cannot be said twice.
   */
  showText?: boolean;
  className?: string;
}) {
  const dict = useDict();
  const { locale } = useLocale();
  const t = dict.diagnosticGraphic;
  const reduced = useReducedMotion();

  const otherIndustry = pick("industries", "Other", locale);
  const otherRole = pick("roleOptions", "Other", locale);
  const topics = narrateTopics(answers, t, otherIndustry, otherRole);
  const recorded = topics.map((x) => x.recorded);
  const filled = topics.filter((x) => x.recorded).length;

  const fade = reduced
    ? { duration: 0 }
    : { duration: 0.3, ease: [0.16, 1, 0.3, 1] as const };

  const activeTopic = topics[Math.min(DEFAULT_TOPICS - 1, Math.max(0, step))];
  const groups = narrateGroups(answers, t, otherIndustry, otherRole);

  /* Which block of copy this stage gets. The screens share a structure on
     purpose: review, submitting and a failed submission all read the same,
     because nothing has been persisted in any of them. */
  const stageBody = (() => {
    switch (screen) {
      case "form":
        return (
          <>
            <Eyebrow>{t.purposeLabel}</Eyebrow>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={activeTopic?.topic ?? 0}
                initial={reduced ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduced ? undefined : { opacity: 0 }}
                transition={fade}
              >
                <h2 className="mt-3 text-[15px] font-semibold text-ink">
                  {activeTopic?.name}
                </h2>
                <p className="mt-2 text-[13.5px] leading-relaxed text-graphite">
                  {activeTopic?.purpose}
                </p>
              </motion.div>
            </AnimatePresence>

            {filled > 0 && (
              <div className="mt-7 border-t border-line pt-5">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <Eyebrow>{t.recordedLabel}</Eyebrow>
                  <p className="font-mono text-[10px] uppercase tracking-[0.06em] text-muted">
                    {t.recordedCount(filled, DEFAULT_TOPICS)}
                  </p>
                </div>
                <div className="mt-4 space-y-4">
                  {topics
                    .filter((x) => x.recorded)
                    .map((x) => (
                      <motion.div
                        key={x.topic}
                        layout={!reduced}
                        initial={reduced ? false : { opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={fade}
                      >
                        <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-muted/70">
                          {x.name}
                        </p>
                        <FactList facts={x.facts} />
                      </motion.div>
                    ))}
                </div>
              </div>
            )}
          </>
        );

      case "review":
      case "submitting":
      case "submit_error":
        return (
          <>
            <Eyebrow>{t.reviewLabel}</Eyebrow>
            <p className="mt-3 text-[13.5px] leading-relaxed text-graphite">
              {t.reviewBody}
            </p>
            <div className="mt-6 space-y-5">
              {groups.map((g) => (
                <div key={g.group} className="border-t border-line pt-4">
                  <h2 className="text-[14px] font-semibold text-ink">{g.name}</h2>
                  <p className="mt-1 text-[12.5px] leading-relaxed text-muted">{g.body}</p>
                  {/*
                   * The count, not the facts themselves. The review screen
                   * standing next to this already lists every answer with
                   * its own EDIT control; repeating them here in a 264px
                   * gutter would be a cramped second copy of a better
                   * list. What this adds is the grouping — how MODUS reads
                   * the answers — plus the honest size of each group.
                   */}
                  {g.facts.length > 0 && (
                    <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.06em] text-muted/70">
                      {t.groupRecorded(g.facts.length)}
                    </p>
                  )}
                </div>
              ))}
            </div>
            {screen === "submitting" && (
              <p className="mt-6 font-mono text-[10px] uppercase tracking-[0.06em] text-muted">
                {t.submittingNote}
              </p>
            )}
          </>
        );

      // Reached only once a submission has actually been acknowledged, or
      // for a visitor returning to a profile that is already on file.
      case "result":
      case "profile":
        return (
          <>
            <Eyebrow>{t.savedLabel}</Eyebrow>
            <h2 className="mt-3 text-[15px] font-semibold text-ink">{t.savedTitle}</h2>
            <p className="mt-2 text-[13.5px] leading-relaxed text-graphite">{t.savedBody}</p>
          </>
        );

      default:
        return (
          <>
            <Eyebrow>{t.purposeLabel}</Eyebrow>
            <h2 className="mt-3 text-[15px] font-semibold text-ink">{t.entryTitle}</h2>
            <p className="mt-2 text-[13.5px] leading-relaxed text-graphite">{t.entryBody}</p>
          </>
        );
    }
  })();

  return (
    <div className={`flex min-h-0 flex-col ${className}`}>
      {withScene && (
        <DiagnosticScene
          screen={screen}
          step={step}
          recorded={recorded}
          /*
           * A share of the host, not a viewport height. The host is sized
           * per screen by the shell, and a `vh` value would overflow the
           * shorter bands — `shrink-0` means it would not give the space
           * back, so the canvas would spill over the content below it.
           */
          className={
            showText ? "h-[45%] min-h-[150px] w-full shrink-0" : "h-full w-full"
          }
        />
      )}
      {/*
       * `pointer-events-auto` because the shell's scene band is
       * `pointer-events-none` so the canvas can never intercept a click on
       * the form. That must not also make the explanation unselectable.
       */}
      {showText && (
        <div
          className={`pointer-events-auto min-h-0 flex-1 overflow-y-auto pr-1 ${
            withScene ? "mt-5" : ""
          }`}
        >
          {stageBody}
        </div>
      )}
    </div>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted">{children}</p>
  );
}

/**
 * The visitor's own answers. Renders nothing at all when there are none —
 * an empty list here is the honest state at the start of the form, and a
 * placeholder sentence in its place said less than the silence does.
 */
function FactList({ facts }: { facts: Fact[] }) {
  if (facts.length === 0) return null;
  return (
    <dl // Single column deliberately. This renders inside a 30-41%
      // column, not a page-width grid, so a `sm:`-prefixed second column
      // would be chosen by the VIEWPORT width and then be far too narrow
      // for a label and its value.
      className="mt-2 grid grid-cols-1 gap-y-2">
      {facts.map((f) => (
        <div key={`${f.label}:${f.value}`}>
          <dt className="font-mono text-[9px] uppercase tracking-[0.06em] text-muted">
            {f.label}
          </dt>
          <dd className="mt-0.5 text-[13px] font-medium text-ink">{f.value}</dd>
        </div>
      ))}
    </dl>
  );
}
