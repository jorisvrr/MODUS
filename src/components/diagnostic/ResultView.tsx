"use client";

import { useState } from "react";
import { withLegacyOperations } from "@/lib/diagnostic/operationsMapping";
import Link from "next/link";
import { Download } from "lucide-react";
import { LayoutGroup } from "motion/react";
import { Reveal } from "@/components/ui/Reveal";
import { SignalCard } from "@/components/diagnostic/SignalCard";
import { WarpDetail } from "@/components/diagnostic/WarpDetail";
import { buildSignals, buildProfileIndicators, buildFocusAreas } from "@/lib/diagnostic/rules";
import { pick } from "@/lib/diagnostic/questions";
import { buildEmailSummary } from "@/lib/diagnostic/emailSummary";
import { downloadDiagnosticPdf } from "@/lib/diagnostic/pdf";
import { openChatbot, track } from "@/lib/chatbot";
import type { DiagnosticAnswers, Signal } from "@/lib/diagnostic/types";
import { useDict, useLocale } from "@/lib/i18n/context";
import { calculateEngagementEstimate } from "@/lib/pricing/engine";
import { PRICING_CONFIG } from "@/lib/pricing/config";
import { PriceCompositionNote } from "@/components/pricing/PriceCompositionNote";
import { ReviewSchedulingPanel } from "@/components/scheduling/ReviewSchedulingPanel";

const toneColor = {
  low: "text-modus",
  moderate: "text-graphite",
  high: "text-signal",
  early: "text-graphite",
};

export function ResultView({ answers }: { answers: DiagnosticAnswers }) {
  const dict = useDict();
  const { locale } = useLocale();
  const t = dict.diagnosticResult;
  const [openSignal, setOpenSignal] = useState<Signal | null>(null);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const indicators = buildProfileIndicators(answers, locale);
  const signals = buildSignals(answers, locale);
  const focusAreas = buildFocusAreas(answers, locale);
  const estimate = calculateEngagementEstimate(withLegacyOperations(answers));
  const te = t.estimate;
  const levelLabel = { low: te.levelLow, moderate: te.levelModerate, high: te.levelHigh };
  const scopeCeiling = PRICING_CONFIG.monthly.bands[4].estimateMax; // "extensive" band's top, the ceiling before manual scope
  const scopeFloor = PRICING_CONFIG.monthly.minimum;
  const scopeMarker = Math.min(
    100,
    Math.max(0, ((estimate.estimatedMin - scopeFloor) / (scopeCeiling - scopeFloor)) * 100)
  );

  const timeline = [
    { label: t.timelineSubmitted, done: true },
    { label: t.timelineReview, done: false },
    { label: t.timeline30Min, done: false },
    { label: t.timelinePriority, done: false },
    { label: t.timelineEngagement, done: false },
  ];

  async function handleDownloadPdf() {
    track("diagnostic_pdf_downloaded");
    setGeneratingPdf(true);
    try {
      await downloadDiagnosticPdf(answers, indicators, signals, focusAreas);
    } finally {
      setGeneratingPdf(false);
    }
  }

  const scheduleReviewHref = `mailto:hello@modus.example.com?subject=${encodeURIComponent(
    t.emailSubject(answers.companyName || t.newBusinessFallback)
  )}&body=${encodeURIComponent(buildEmailSummary(answers, indicators, signals))}`;

  return (
    <LayoutGroup>
      <div>
        <Reveal>
          <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted">
            {t.received}
          </p>
        </Reveal>
        <Reveal delay={0.06}>
          <h1 className="mt-4 text-balance text-display-md font-semibold text-ink">
            {t.heading}
          </h1>
        </Reveal>
        <Reveal delay={0.12}>
          <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-graphite">
            {t.intro}
          </p>
        </Reveal>
        <Reveal delay={0.16}>
          <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
            {t.preliminaryNote}
          </p>
        </Reveal>

        <div className="mt-12 grid grid-cols-1 gap-12 lg:grid-cols-[1fr_1fr]">
          <div>
            <Reveal delay={0.2}>
              <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted">
                {t.initialIndication}
              </p>
            </Reveal>
            <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-5 border-t border-line pt-5">
              {indicators.map((ind, i) => (
                <Reveal key={ind.label} delay={0.24 + i * 0.06}>
                  <p className="font-mono text-[9px] uppercase tracking-[0.06em] text-muted">
                    {ind.label}
                  </p>
                  <p className={`mt-1 text-lg font-semibold ${toneColor[ind.tone]}`}>
                    {ind.value}
                  </p>
                </Reveal>
              ))}
            </div>

            <Reveal delay={0.5} className="mt-10">
              <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted">
                {t.whereModusWouldLookFirst}
              </p>
              <div className="mt-4 space-y-3">
                {focusAreas.map((area, i) => (
                  <div key={area.name} className="rounded-sm border border-line p-4">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[10px] text-muted">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span
                        className={`font-mono text-[9px] uppercase tracking-[0.06em] ${
                          area.priority === "HIGH" ? "text-signal" : "text-modus"
                        }`}
                      >
                        {area.priority}
                      </span>
                    </div>
                    <p className="mt-2 text-[14.5px] font-medium text-ink">{area.name}</p>
                    <p className="mt-1 text-[12.5px] text-muted">{area.why}</p>
                  </div>
                ))}
              </div>
            </Reveal>
          </div>

          <div>
            <Reveal delay={0.3}>
              <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted">
                {t.initialSignals}
              </p>
            </Reveal>
            <div className="mt-4 space-y-3">
              {signals.length === 0 && (
                <Reveal delay={0.34}>
                  <p className="text-[13.5px] text-muted">
                    {t.noSignals}
                  </p>
                </Reveal>
              )}
              {signals.map((signal, i) => (
                <Reveal key={signal.id} delay={0.34 + i * 0.08}>
                  <SignalCard signal={signal} onOpen={() => setOpenSignal(signal)} />
                </Reveal>
              ))}
            </div>
          </div>
        </div>

        <Reveal delay={0.6} className="mt-14 border-t border-line pt-10">
          <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted">
            {t.directionalOpportunity}
          </p>
          <div className="mt-4 grid grid-cols-1 gap-6 sm:grid-cols-3">
            <OpportunityStat
              label={t.timeRecovery}
              value={signals.length >= 2 ? t.high : t.medium}
              directionalLabel={t.directional}
            />
            <OpportunityStat
              label={t.revenueImpact}
              value={answers.impact.includes(pick("impactOptions", "Revenue", locale)) ? t.medium : t.low}
              directionalLabel={t.directional}
            />
            <OpportunityStat
              label={t.systemSimplification}
              value={answers.connectionLevel === pick("connectionLevels", "Mostly manual", locale) ? t.high : t.medium}
              directionalLabel={t.directional}
            />
          </div>
        </Reveal>

        <Reveal delay={0.64} className="mt-14 rounded-md border border-line bg-paper p-6 sm:p-8">
          <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-modus">{te.label}</p>

          {estimate.manualScope ? (
            <>
              <p className="mt-3 text-3xl font-semibold text-ink sm:text-4xl">
                {te.manualScopeFrom} €{estimate.estimatedMin.toLocaleString("en-US")}
                <span className="text-base font-normal text-muted"> {te.perMonth}</span>
              </p>
              <p className="mt-2 inline-block rounded-sm bg-signal/10 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.06em] text-signal">
                {te.manualScopeLabel}
              </p>
              <p className="mt-3 max-w-lg text-[14px] leading-relaxed text-graphite">
                {te.manualScopeBody}
              </p>
            </>
          ) : (
            <>
              <p className="mt-3 text-3xl font-semibold text-ink sm:text-4xl">
                €{estimate.estimatedMin.toLocaleString("en-US")} – €{estimate.estimatedMax.toLocaleString("en-US")}
                <span className="text-base font-normal text-muted"> {te.perMonth}</span>
              </p>
              <p className="mt-1 text-[13px] text-muted">{te.basedOn}</p>

              <div className="mt-5 flex items-center gap-3">
                <span className="font-mono text-[9px] uppercase tracking-[0.06em] text-muted">
                  {te.lowerScope}
                </span>
                <div className="relative h-px flex-1 bg-line">
                  <span
                    className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-modus"
                    style={{ left: `${scopeMarker}%` }}
                    aria-hidden
                  />
                </div>
                <span className="font-mono text-[9px] uppercase tracking-[0.06em] text-muted">
                  {te.higherScope}
                </span>
              </div>

              <div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-line pt-5 sm:grid-cols-4">
                <EstimateFactor label={te.factorBusinessScale} value={levelLabel[estimate.businessScaleLevel]} />
                <EstimateFactor
                  label={te.factorSystemFragmentation}
                  value={levelLabel[estimate.systemFragmentationLevel]}
                />
                <EstimateFactor
                  label={te.factorOperationalComplexity}
                  value={levelLabel[estimate.operationalComplexityLevel]}
                />
                <EstimateFactor
                  label={te.factorImplementationScope}
                  value={levelLabel[estimate.implementationScopeLevel]}
                />
              </div>
            </>
          )}

          <PriceCompositionNote className="mt-5" />

          <p className="mt-3 max-w-lg text-[12px] leading-relaxed text-muted">{te.disclaimer}</p>

          <Link
            href="/pricing"
            className="mt-3 inline-block text-[12.5px] font-medium text-ink underline decoration-line underline-offset-4 hover:text-modus"
          >
            {te.howPricingWorks}
          </Link>
        </Reveal>

        <Reveal delay={0.68} className="mt-8 rounded-md border border-line bg-paper p-6 sm:p-8">
          <p className="text-xl font-semibold text-ink">{t.reviewTitle}</p>
          <p className="mt-2 max-w-lg text-[14px] leading-relaxed text-graphite">
            {t.reviewBody}
          </p>

          <div className="mt-6">
            <ReviewSchedulingPanel
              prefill={{
                name: `${answers.firstName} ${answers.lastName}`.trim() || undefined,
                email: answers.email || undefined,
              }}
            />
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-5 border-t border-line pt-5">
            <a
              href={scheduleReviewHref}
              onClick={() => track("diagnostic_review_clicked")}
              className="text-[13.5px] font-medium text-ink underline decoration-line underline-offset-4 hover:text-modus"
            >
              {t.scheduleReview}
            </a>
            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={generatingPdf}
              className="inline-flex items-center gap-1.5 text-[13.5px] font-medium text-ink underline decoration-line underline-offset-4 hover:text-modus disabled:opacity-50"
            >
              <Download className="h-3.5 w-3.5" strokeWidth={1.75} />
              {generatingPdf ? t.preparingPdf : t.downloadPdf}
            </button>
            <button
              type="button"
              onClick={() => {
                track("diagnostic_chat_clicked");
                openChatbot();
              }}
              className="text-[13.5px] font-medium text-ink underline decoration-line underline-offset-4 hover:text-modus"
            >
              {t.talkToModus}
            </button>
          </div>
          <p className="mt-3 text-[12px] text-muted">
            {t.emailNote}
          </p>

          <div className="mt-8 flex flex-wrap gap-x-8 gap-y-3 border-t border-line pt-6">
            {timeline.map((item) => (
              <span
                key={item.label}
                className={`font-mono text-[10px] uppercase tracking-[0.06em] ${
                  item.done ? "text-modus" : "text-muted"
                }`}
              >
                {item.done ? "✓ " : "○ "}
                {item.label}
              </span>
            ))}
          </div>
        </Reveal>

        <Reveal delay={0.74}>
          <Link href="/" className="mt-8 inline-block text-[13px] text-muted hover:text-graphite">
            {t.backToHome}
          </Link>
        </Reveal>
      </div>

      <WarpDetail signal={openSignal} onClose={() => setOpenSignal(null)} />
    </LayoutGroup>
  );
}

function OpportunityStat({
  label,
  value,
  directionalLabel,
}: {
  label: string;
  value: string;
  directionalLabel: string;
}) {
  return (
    <div>
      <p className="font-mono text-[9px] uppercase tracking-[0.06em] text-muted">{label}</p>
      <p className="mt-1 text-lg font-semibold text-ink">{value}</p>
      <p className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.06em] text-muted">
        {directionalLabel}
      </p>
    </div>
  );
}

function EstimateFactor({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-mono text-[9px] uppercase tracking-[0.06em] text-muted">{label}</p>
      <p className="mt-1 text-[13.5px] font-medium text-ink">{value}</p>
    </div>
  );
}
