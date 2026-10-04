"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { isUnknownAbsenceCoverage } from "@/lib/diagnostic/operationsMapping";
import { useState } from "react";
import { DiagnosticScene } from "@/components/diagnostic/DiagnosticScene";
import { SignalCard } from "@/components/diagnostic/SignalCard";
import { WarpDetail } from "@/components/diagnostic/WarpDetail";
import { buildSignals } from "@/lib/diagnostic/rules";
import { pick } from "@/lib/diagnostic/questions";
import type { DiagnosticAnswers, Signal } from "@/lib/diagnostic/types";
import { useDict, useLocale } from "@/lib/i18n/context";

/**
 * The diagnostic's single profile visualization.
 *
 * This replaces the "MODUS / INITIAL PROFILE" card, which was a separate
 * bordered panel containing a static node map and a list of facts, sat
 * above a second WebGL scene. Two competing graphics on one screen, one
 * of which never changed.
 *
 * There is now one composition: the scene itself carries the state
 * (entry sphere, answer-driven topic structure, review stack, closure),
 * and the profile the visitor is building is read out beneath it as part
 * of the same object — same column, no card, no second header, no second
 * mark.
 *
 * Nothing is invented here. The facts are the visitor's own answers and
 * the signals come from `buildSignals`, the same scoring the rest of the
 * diagnostic uses; both are unchanged from the panel this replaces.
 */
export function DiagnosticProfile({
  screen,
  step,
  answers,
  labels,
  showReadout,
  className = "",
}: {
  screen: string;
  step: number;
  answers: DiagnosticAnswers;
  labels: readonly string[];
  /** The readout belongs to the answering stages, not the entry sphere. */
  showReadout: boolean;
  className?: string;
}) {
  const dict = useDict();
  const { locale } = useLocale();
  const t = dict.diagnosticProfilePanel;
  const [openSignal, setOpenSignal] = useState<Signal | null>(null);
  const reduced = useReducedMotion();

  const signals = buildSignals(answers, locale);
  const otherIndustry = pick("industries", "Other", locale);

  // Exactly the facts the panel showed, in the same order.
  const facts: { label: string; value: string }[] = [];
  if (answers.industry && answers.industry !== otherIndustry)
    facts.push({ label: t.factIndustry, value: answers.industry });
  if (answers.industry === otherIndustry && answers.industryOther)
    facts.push({ label: t.factIndustry, value: answers.industryOther });
  if (answers.employees) facts.push({ label: t.factTeam, value: answers.employees });
  if (answers.locations) facts.push({ label: t.factLocations, value: answers.locations });
  if (answers.systems.length > 0)
    facts.push({ label: t.factSystems, value: `${answers.systems.length} ${t.factSystemsIdentified}` });
  if (answers.adminHours) facts.push({ label: t.factManualWork, value: answers.adminHours });
  if (answers.primaryPain) facts.push({ label: t.factPrimaryFriction, value: answers.primaryPain });
  else if (answers.friction.length > 0)
    facts.push({ label: t.factFriction, value: answers.friction[0] });
  /*
   * Only when the visitor actually told us. "Not sure" and "I work
   * alone" are deliberately not summarised as a fact about the business:
   * they say what the visitor knows, not what is true of their work.
   */
  if (answers.absenceCoverage && !isUnknownAbsenceCoverage(answers.absenceCoverage)) {
    facts.push({ label: t.factDependency, value: answers.absenceCoverage });
  }

  const fade = reduced ? { duration: 0 } : { duration: 0.3, ease: [0.16, 1, 0.3, 1] as const };

  return (
    <div className={`flex flex-col ${className}`}>
      {/* The scene takes the room it needs; the readout sits under it in
          the same column, not in a card of its own. */}
      <DiagnosticScene
        screen={screen}
        step={step}
        labels={labels}
        className={showReadout ? "h-[min(46vh,420px)] w-full shrink-0" : "h-full w-full"}
      />

      {showReadout && (
        <div className="pointer-events-auto mt-6 min-h-0 flex-1 overflow-y-auto pr-1">
          <motion.div layout={!reduced} className="grid grid-cols-2 gap-x-4 gap-y-3">
            <AnimatePresence initial={false}>
              {facts.length === 0 && (
                <motion.p
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="col-span-2 text-[12.5px] text-muted"
                >
                  {t.emptyProfile}
                </motion.p>
              )}
              {facts.map((fact) => (
                <motion.div
                  key={fact.label}
                  layout={!reduced}
                  initial={reduced ? false : { opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={fade}
                >
                  <p className="font-mono text-[9px] uppercase tracking-[0.06em] text-muted">
                    {fact.label}
                  </p>
                  <p className="mt-0.5 text-[13px] font-medium text-ink">{fact.value}</p>
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>

          <div className="mt-6 border-t border-line pt-5">
            <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted">
              {t.preliminarySignals}
            </p>
            <motion.div layout={!reduced} className="mt-3 space-y-2.5">
              <AnimatePresence initial={false}>
                {signals.length === 0 && (
                  <motion.p
                    key="empty-signals"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="text-[12.5px] text-muted"
                  >
                    {t.emptySignals}
                  </motion.p>
                )}
                {signals.map((signal) => (
                  <SignalCard key={signal.id} signal={signal} onOpen={() => setOpenSignal(signal)} />
                ))}
              </AnimatePresence>
            </motion.div>
          </div>
        </div>
      )}

      <WarpDetail signal={openSignal} onClose={() => setOpenSignal(null)} />
    </div>
  );
}
