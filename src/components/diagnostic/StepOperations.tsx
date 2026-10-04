"use client";

import { OptionGrid } from "@/components/diagnostic/OptionGrid";
import { toggleInArray } from "@/lib/diagnostic/utils";
import {
  getReachChannels,
  getEnquiryHandling,
  getAdminHoursOptions,
  getTaskConsistencyOptions,
  getAbsenceCoverageOptions,
} from "@/lib/diagnostic/questions";
import type { DiagnosticAnswers } from "@/lib/diagnostic/types";
import { useDict, useLocale } from "@/lib/i18n/context";

export function StepOperations({
  answers,
  update,
}: {
  answers: DiagnosticAnswers;
  update: <K extends keyof DiagnosticAnswers>(key: K, value: DiagnosticAnswers[K]) => void;
}) {
  const dict = useDict();
  const { locale } = useLocale();
  const t = dict.diagnosticSteps.operations;
  const reachChannels = getReachChannels(locale);
  const enquiryHandling = getEnquiryHandling(locale);
  const adminHoursOptions = getAdminHoursOptions(locale);
  const taskConsistencyOptions = getTaskConsistencyOptions(locale);
  const absenceCoverageOptions = getAbsenceCoverageOptions(locale);

  return (
    <div className="space-y-8">
      <div>
        <p className="text-[14px] font-medium text-ink">{t.reachTitle}</p>
        <p className="mt-1 text-[12.5px] text-muted">{t.selectAll}</p>
        <div className="mt-3">
          <OptionGrid
            options={reachChannels}
            selected={answers.reachChannels}
            onToggle={(v) => update("reachChannels", toggleInArray(answers.reachChannels, v))}
            columns={3}
          />
        </div>
      </div>

      <div>
        <p className="text-[14px] font-medium text-ink">{t.enquiryTitle}</p>
        <div className="mt-3">
          <OptionGrid
            options={enquiryHandling}
            selected={answers.enquiryHandling}
            onToggle={(v) => update("enquiryHandling", toggleInArray(answers.enquiryHandling, v))}
            columns={3}
          />
        </div>
      </div>

      <div>
        <p className="text-[14px] font-medium text-ink">{t.adminTitle}</p>
        <div className="mt-3">
          <OptionGrid
            options={adminHoursOptions}
            selected={answers.adminHours ? [answers.adminHours] : []}
            onToggle={(v) => update("adminHours", v)}
            columns={3}
          />
        </div>
      </div>

      <div>
        <p className="text-[14px] font-medium text-ink">{t.taskConsistencyTitle}</p>
        <p className="mt-1 text-[12.5px] text-muted">{t.taskConsistencyHelper}</p>
        <div className="mt-3">
          <OptionGrid
            options={[...taskConsistencyOptions]}
            selected={answers.taskConsistency ? [answers.taskConsistency] : []}
            onToggle={(v) => update("taskConsistency", v)}
            columns={2}
          />
        </div>
      </div>

      <div>
        <p className="text-[14px] font-medium text-ink">{t.absenceCoverageTitle}</p>
        <p className="mt-1 text-[12.5px] text-muted">{t.absenceCoverageHelper}</p>
        <div className="mt-3">
          <OptionGrid
            options={[...absenceCoverageOptions]}
            selected={answers.absenceCoverage ? [answers.absenceCoverage] : []}
            onToggle={(v) => update("absenceCoverage", v)}
            columns={2}
          />
        </div>
      </div>
    </div>
  );
}
