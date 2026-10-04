"use client";

import { useState } from "react";
import { isUnknownAbsenceCoverage } from "@/lib/diagnostic/operationsMapping";
import { motion, AnimatePresence, LayoutGroup } from "motion/react";
import { LogoMark } from "@/components/ui/Logo";
import { SystemMap } from "@/components/diagnostic/SystemMap";
import { SignalCard } from "@/components/diagnostic/SignalCard";
import { WarpDetail } from "@/components/diagnostic/WarpDetail";
import { buildSignals } from "@/lib/diagnostic/rules";
import { pick } from "@/lib/diagnostic/questions";
import type { DiagnosticAnswers, Signal } from "@/lib/diagnostic/types";
import { useDict, useLocale } from "@/lib/i18n/context";

export function ProfilePanel({
  answers,
  sticky = true,
}: {
  answers: DiagnosticAnswers;
  /**
   * Whether the panel follows the scroll. Off when the diagnostic scene's
   * topic layers are shown beneath it in the same column: a sticky panel
   * moves relative to the layers, so no fixed offset can clear it at
   * every scroll position — at the top of the page the panel sits at its
   * natural y, lower than where it sticks. Anchoring both in the document
   * is what makes them provably disjoint. See DiagnosticShell.
   */
  sticky?: boolean;
}) {
  const dict = useDict();
  const { locale } = useLocale();
  const t = dict.diagnosticProfilePanel;
  const [openSignal, setOpenSignal] = useState<Signal | null>(null);
  const signals = buildSignals(answers, locale);
  const otherIndustry = pick("industries", "Other", locale);

  const facts: { label: string; value: string }[] = [];
  if (answers.industry && answers.industry !== otherIndustry) facts.push({ label: t.factIndustry, value: answers.industry });
  if (answers.industry === otherIndustry && answers.industryOther) facts.push({ label: t.factIndustry, value: answers.industryOther });
  if (answers.employees) facts.push({ label: t.factTeam, value: answers.employees });
  if (answers.locations) facts.push({ label: t.factLocations, value: answers.locations });
  if (answers.systems.length > 0) facts.push({ label: t.factSystems, value: `${answers.systems.length} ${t.factSystemsIdentified}` });
  if (answers.adminHours) facts.push({ label: t.factManualWork, value: answers.adminHours });
  if (answers.primaryPain) facts.push({ label: t.factPrimaryFriction, value: answers.primaryPain });
  else if (answers.friction.length > 0) facts.push({ label: t.factFriction, value: answers.friction[0] });
  /*
   * Only when the visitor actually told us. "Not sure" and "I work
   * alone" are deliberately not summarised as a fact about the business:
   * they say what the visitor knows, not what is true of their work.
   */
  if (answers.absenceCoverage && !isUnknownAbsenceCoverage(answers.absenceCoverage)) {
    facts.push({ label: t.factDependency, value: answers.absenceCoverage });
  }

  return (
    <LayoutGroup>
      <div
        className={`rounded-md border border-line bg-white p-6 ${
          sticky ? "sticky top-24" : ""
        }`}
      >
        <div className="flex items-center gap-2">
          <LogoMark className="h-4 w-4" />
          <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted">
            {t.label}
          </span>
        </div>

        <div className="mt-6">
          <SystemMap systems={answers.systems} connectionLevel={answers.connectionLevel} />
        </div>

        <motion.div layout className="mt-6 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-line pt-5">
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
                layout
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
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
          <motion.div layout className="mt-3 space-y-2.5">
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

      <WarpDetail signal={openSignal} onClose={() => setOpenSignal(null)} />
    </LayoutGroup>
  );
}
