"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { motion } from "motion/react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { Reveal } from "@/components/ui/Reveal";
import { MagneticButton } from "@/components/ui/MagneticButton";
import { ProgressBar } from "@/components/diagnostic/ProgressBar";
import { ReviewScreen } from "@/components/diagnostic/ReviewScreen";
import { SubmitTransition } from "@/components/diagnostic/SubmitTransition";
import { ResultView } from "@/components/diagnostic/ResultView";
import { DiagnosticRecoveryPrompt } from "@/components/diagnostic/DiagnosticRecoveryPrompt";
import { ProfileReadyScreen } from "@/components/diagnostic/ProfileReadyScreen";
import { useDict } from "@/lib/i18n/context";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { useIdentity } from "@/components/auth/IdentityProvider";
import { DiagnosticExplainer } from "@/components/diagnostic/DiagnosticExplainer";
import { StartContextPanel } from "@/components/diagnostic/StartContextPanel";
import { StepBusiness } from "@/components/diagnostic/StepBusiness";
import { StepOperations } from "@/components/diagnostic/StepOperations";
import { StepSystems } from "@/components/diagnostic/StepSystems";
import { StepFriction } from "@/components/diagnostic/StepFriction";
import { StepPriorities } from "@/components/diagnostic/StepPriorities";
import { StepContact } from "@/components/diagnostic/StepContact";
import {
  companyNameSchema,
  emailSchema,
  nameSchema,
  textareaSchema,
  validatePhone,
  websiteSchema,
} from "@/lib/diagnostic/schema";
import { emptyAnswers, type DiagnosticAnswers } from "@/lib/diagnostic/types";
import {
  loadDiagnosticState,
  saveDiagnosticState,
  clearDiagnosticState,
} from "@/lib/diagnostic/storage";
import { buildProfileIndicators, buildSignals } from "@/lib/diagnostic/rules";
import {
  type EntryContext,
  clearEntryContext,
  loadEntryContext,
  purgeForeignEntryContext,
  saveEntryContext,
} from "@/lib/diagnostic/entryContext";
import { submitDiagnostic } from "@/lib/diagnostic/submit";
import {
  saveContextReference,
  getContextReference,
  clearContextReference,
} from "@/lib/customerContext/storage";
import { useCustomerContext } from "@/lib/customerContext/useCustomerContext";
import { track } from "@/lib/chatbot";

type Screen =
  | "intro"
  | "form"
  | "review"
  | "submitting"
  | "submit_error"
  | "result"
  | "profile";

function canProceed(step: number, a: DiagnosticAnswers): boolean {
  if (step === 0) {
    return (
      companyNameSchema.safeParse(a.companyName).success &&
      websiteSchema.safeParse(a.website).success &&
      !!a.industry &&
      !!a.employees &&
      !!a.locations
    );
  }
  if (step === 1) return a.reachChannels.length > 0;
  if (step === 2) return !!a.connectionLevel;
  if (step === 3) {
    const hasFriction = a.friction.length > 0;
    // problemDescription is optional: empty is fine, but if they did write
    // something it should still clear the same bar the field enforces
    // while typing (see StepFriction's onValidate).
    const description = a.problemDescription.trim();
    const descriptionOk =
      !description ||
      textareaSchema(20, 500).safeParse(a.problemDescription).success;
    return hasFriction && descriptionOk;
  }
  if (step === 4) return a.priorities.length > 0 && !!a.timing;
  if (step === 5) {
    const phoneOk = !a.phone.trim() || validatePhone(a.phone).valid;
    return (
      nameSchema.safeParse(a.firstName).success &&
      nameSchema.safeParse(a.lastName).success &&
      emailSchema.safeParse(a.email).success &&
      phoneOk
    );
  }
  return false;
}

// This component is only ever rendered client-side (see page.tsx's
// dynamic ssr:false import), so it's safe to read sessionStorage
// synchronously in these lazy initializers — no server/client markup to
// mismatch.
function resumableState() {
  const saved = loadDiagnosticState();
  if (saved && (saved.answers.companyName || saved.step > 0)) return saved;
  return null;
}

// A stored profile reference only wins the initial screen if there's no
// in-progress draft to resume instead — an active draft always takes
// priority, since it's the more recent, more specific thing to return to.
function initialScreen(hasDraft: boolean, identity: string | null): Screen {
  if (hasDraft) return "intro";
  // Only this account's saved reference may open the profile screen.
  // Unscoped, this is what showed the previous user's profile after a
  // sign-out or an account switch.
  return getContextReference(identity) ? "profile" : "intro";
}

export function DiagnosticShell() {
  const dict = useDict();
  // Saved diagnostic state is per-account; see IdentityProvider.
  const { identity } = useIdentity();
  // Gated on the MOUNT, not on a CSS class.
  //
  // A `hidden 2xl:block` wrapper was tried first and is NOT equivalent: the
  // component still mounted, still created a WebGL context and still held
  // GPU memory on every narrower screen — invisible, but paid for.
  //
  // 1024px is the desktop threshold: the scene is the entry screen's main
  // visual, so it has to appear at ordinary desktop widths, while phones
  // and small tablets keep a form with no WebGL at all.
  // Two thresholds, because the screens do not have the same amount of
  // room. `intro`, `form` and `profile` are two-column layouts with a
  // genuinely empty right column at 1024px. `review`, `submitting`,
  // `submit_error` and `result` are a centred narrow column or a dense
  // grid, where the only free space is the page gutter — which is not
  // wide enough to hold the scene until about 1280px. Below each
  // threshold the scene is not mounted at all, so there is no WebGL
  // context and nothing to overlap.
  const wideEnoughForScene = useMediaQuery("(min-width: 1024px)");
  const wideEnoughForGutterScene = useMediaQuery("(min-width: 1280px)");
  const STEP_LABELS = dict.diagnosticShell.stepLabels;
  const STEP_HEADLINES = dict.diagnosticShell.stepHeadlines;
  const [resumedState] = useState(resumableState);
  const [screen, setScreen] = useState<Screen>(() =>
    initialScreen(!!resumedState, identity),
  );
  const {
    companyName: contextCompanyName,
    summary: contextSummary,
    summaryStatus: contextSummaryStatus,
  } = useCustomerContext();
  const [step, setStep] = useState(resumedState?.step ?? 0);
  const [answers, setAnswers] = useState<DiagnosticAnswers>(
    resumedState?.answers ?? emptyAnswers,
  );
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [showRecoveryPrompt, setShowRecoveryPrompt] = useState(!!resumedState);
  const [resumed, setResumed] = useState(false);

  /*
   * What the visitor wrote on the homepage, carried here as START CONTEXT
   * — shown, editable, and never an answer.
   *
   * Read lazily on the first render rather than in an effect, so it is
   * there for the entry screen's first paint instead of appearing a frame
   * later. `identity` is null until Clerk resolves, and `loadEntryContext`
   * returns nothing for a null identity, so a signed-in visitor's own
   * context arrives via the effect below once the account is known — which
   * is exactly the ordering that keeps one account's words from flashing
   * up for another.
   */
  const [startContext, setStartContext] = useState(() => loadEntryContext(identity));
  const settledStartContext = useRef(false);
  useEffect(() => {
    if (!identity) return;
    // Somebody else's words do not stay readable in this browser.
    purgeForeignEntryContext(identity);
    if (settledStartContext.current) return;
    settledStartContext.current = true;
    setStartContext((current) => current ?? loadEntryContext(identity));
  }, [identity]);


  /*
   * Edits are written back, not only held in state. "Editable" has to
   * survive a reload, or the visitor corrects their sentence, the page
   * reloads, and the original is back — which reads as the edit having
   * been ignored.
   *
   * Written under the record's OWN identity rather than the current one:
   * the record was only loaded because those matched, and reading
   * `identity` again here would write "guest" if Clerk happened to be
   * mid-refresh.
   */
  function persistStartContext(next: EntryContext | null) {
    if (!next) {
      clearEntryContext();
      setStartContext(null);
      return;
    }
    const saved = saveEntryContext(next.topics, next.text, next.identity);
    // `saveEntryContext` returns null when there is nothing left to carry.
    setStartContext(saved ? { ...saved, text: next.text } : null);
  }

  function removeStartTopic(topic: string) {
    if (!startContext) return;
    persistStartContext({
      ...startContext,
      topics: startContext.topics.filter((x) => x !== topic),
    });
  }

  function changeStartText(value: string) {
    if (!startContext) return;
    persistStartContext({ ...startContext, text: value });
  }

  function clearStartContext() {
    persistStartContext(null);
  }

  /*
   * The ONE path from start context into a real answer, and it is a press.
   * `problemDescription` is the optional free-text question that asks the
   * same thing the homepage field asked, so this is a copy into the field
   * the visitor can see, not a hidden write to an unrelated question.
   */
  function useStartTextAsDescription() {
    const text = startContext?.text.trim();
    if (!text) return;
    update("problemDescription", text);
  }

  // A stored token that no longer resolves (dev database reset, revoked,
  // malformed) falls back to the generic intro automatically — never gets
  // stuck showing "profile unavailable" as a dead end. Adjusted during
  // render (React's own pattern for reacting to a changing value) rather
  // than in an effect, so it lands before the next paint instead of after.
  const [lastSummaryStatus, setLastSummaryStatus] =
    useState(contextSummaryStatus);
  if (contextSummaryStatus !== lastSummaryStatus) {
    setLastSummaryStatus(contextSummaryStatus);
    if (screen === "profile" && contextSummaryStatus === "error") {
      clearContextReference();
      setScreen("intro");
    }
  }

  useEffect(() => {
    if (screen === "form") saveDiagnosticState({ step, answers });
  }, [screen, step, answers]);

  // Fires once, on tab close/refresh or on navigating away in-app, but only
  // if the visitor was actually mid-flow (not on the intro screen, and not
  // already at the result). Reads live state via refs since this effect's
  // own cleanup only ever runs with whatever `screen`/`step` were captured
  // when it was registered otherwise.
  /*
   * The initial screen is chosen on the first render, when Clerk has not
   * reported who this is yet — so the saved reference cannot be read and
   * the entry screen is shown. Once the identity is known, a visitor who
   * is still sitting on the entry screen with a reference of their own is
   * moved to their profile, which is where the unscoped version put them
   * immediately.
   *
   * Deliberately only from `intro`, and only once: someone who has
   * already begun answering must never be pulled out of the form by a
   * late identity resolution.
   */
  const settledInitialScreen = useRef(false);
  useEffect(() => {
    if (!identity || settledInitialScreen.current) return;
    settledInitialScreen.current = true;
    if (screen === "intro" && !resumedState && getContextReference(identity)) {
      setScreen("profile");
    }
  }, [identity, screen, resumedState]);

  const abandonRef = useRef({ screen, step });
  useEffect(() => {
    abandonRef.current = { screen, step };
  }, [screen, step]);
  useEffect(() => {
    function trackIfAbandoned() {
      const { screen: currentScreen, step: currentStep } = abandonRef.current;
      if (currentScreen === "form" || currentScreen === "review") {
        track("diagnostic_abandoned", {
          screen: currentScreen,
          step: currentStep,
        });
      }
    }
    window.addEventListener("beforeunload", trackIfAbandoned);
    return () => {
      window.removeEventListener("beforeunload", trackIfAbandoned);
      trackIfAbandoned();
    };
  }, []);

  // Section 21: after a step advances (forward or back), focus should land
  // on the new question rather than staying on a now-detached Next/Back
  // button or being left wherever the mouse happens to be — the heading is
  // the one thing guaranteed present on every step regardless of which
  // fields it contains. Skipped on the very first mount (`resumed` state
  // already covers "don't replay on resume"; this only reacts to `step`
  // actually changing while already on the form screen).
  const stepHeadingRef = useRef<HTMLHeadingElement>(null);
  const isFirstFormRender = useRef(true);
  useEffect(() => {
    if (screen !== "form") return;
    if (isFirstFormRender.current) {
      isFirstFormRender.current = false;
      return;
    }
    stepHeadingRef.current?.focus();
  }, [screen, step]);

  function continueDiagnostic() {
    setResumed(true);
    setShowRecoveryPrompt(false);
    setScreen("form");
  }

  function startAgainFresh() {
    clearDiagnosticState();
    setAnswers(emptyAnswers);
    setStep(0);
    setShowRecoveryPrompt(false);
  }

  function dismissRecovery() {
    // "Not now": leave the saved progress in storage untouched (so the
    // prompt can offer it again on a future visit), but start this visit
    // fresh in memory rather than silently continuing old answers.
    setAnswers(emptyAnswers);
    setStep(0);
    setShowRecoveryPrompt(false);
  }

  function update<K extends keyof DiagnosticAnswers>(
    key: K,
    value: DiagnosticAnswers[K],
  ) {
    setAnswers((a) => ({ ...a, [key]: value }));
  }

  function begin() {
    track("diagnostic_started");
    setScreen("form");
  }

  function startNewFromProfile() {
    clearContextReference();
    setScreen("intro");
  }

  function next() {
    if (!canProceed(step, answers)) return;
    track("diagnostic_step_completed", { step });
    if (step < STEP_LABELS.length - 1) {
      setStep((s) => s + 1);
    } else {
      setScreen("review");
    }
  }

  function back() {
    if (step > 0) setStep((s) => s - 1);
    else setScreen("intro");
  }

  // The in-flight request and `SubmitTransition`'s fixed-length animation
  // race independently — the ref lets `onSubmitDone` (fired by the
  // animation's own timers, Section 6/19 both want the loader to feel
  // quick and deterministic) pick up whichever result is ready, awaiting
  // it if the request is still outstanding.
  const submitResultRef = useRef<ReturnType<typeof submitDiagnostic> | null>(
    null,
  );

  function submit() {
    track("diagnostic_submitted");
    setScreen("submitting");
    const profile = buildProfileIndicators(answers);
    const signals = buildSignals(answers);
    submitResultRef.current = submitDiagnostic(answers, profile, signals);
  }

  async function onSubmitDone() {
    const result = await submitResultRef.current;
    if (!result?.ok) {
      track("diagnostic_submit_failed");
      setScreen("submit_error");
      return;
    }
    if (result.contextToken) {
      // Saved against whoever is signed in now. A guest submission is
      // saved as "guest" and is not handed to an account that signs in
      // later.
      saveContextReference(result.contextToken, answers.companyName, identity ?? "guest");
    }
    clearDiagnosticState();
    // The homepage context has done its job once the real answers are
    // filed. Leaving it would offer "you started with…" again to whoever
    // opens the diagnostic next in this tab.
    clearEntryContext();
    setStartContext(null);
    setScreen("result");
  }

  const stepComponents = [
    <StepBusiness key="0" answers={answers} update={update} />,
    <StepOperations key="1" answers={answers} update={update} />,
    <StepSystems key="2" answers={answers} update={update} />,
    <StepFriction key="3" answers={answers} update={update} />,
    <StepPriorities key="4" answers={answers} update={update} />,
    <StepContact
      key="5"
      answers={answers}
      update={update}
      errors={errors}
      setErrors={setErrors}
    />,
  ];

  // Checkpoint 6 pre-task — this used to be `<AnimatePresence
  // mode="popLayout">` wrapping these seven mutually-exclusive screens,
  // each with its own `exit`. That's the same pattern
  // `PageTransition.tsx` had (see that file's own comment for the full
  // root-cause writeup): `AnimatePresence`'s exit-completion bookkeeping
  // is unreliable under the installed React/Motion combination, so an
  // exited screen would occasionally never actually unmount, stacking
  // under the next one. Since exactly one of these `screen === "x"`
  // conditions is ever true at a time, there was never anything for
  // `AnimatePresence` to legitimately coexist — removing it entirely
  // (no exit animation, each screen just fades in on its own keyed
  // motion.div) is both simpler and, verified via Playwright, reliable
  // where the AnimatePresence version was not.
  const shellRef = useRef<HTMLDivElement>(null);

  /*
   * Where the scene sits on each screen.
   *
   * It is `pointer-events-none` and behind the content, but "behind" is
   * not sufficient on its own: the page has no opaque background, so
   * points drawn under a paragraph show through it and cost legibility.
   * Each screen therefore gets the region that is actually empty in its
   * own layout, and `null` means do not mount.
   *
   * `band` positions a full-width strip; `size` is the canvas inside it,
   * right-aligned to the content column. Widths are percentages of the
   * CONTAINER, not the viewport, which is what keeps the scene aligned
   * with the columns beside it. Measured at 1440: the container runs
   * x=120..1320, the form's right column x=823..1320 (41% of the
   * container), and the review column is `max-w-2xl` centred, leaving a
   * 264px right gutter (22%).
   */
  const scenePlacement:
    | { band: string; size: string; bandStyle?: CSSProperties; sizeStyle?: CSSProperties }
    | null = (() => {
    switch (screen) {
      case "intro":
        // The sphere is the entry screen's subject, so it takes the right
        // column at full strength.
        return wideEnoughForScene
          ? { band: "top-24", size: "h-[min(74vh,640px)] w-[48%]" }
          : null;
      case "form":
        /*
         * The whole right column now, because the panel that used to
         * occupy it is gone. `sticky` rather than `absolute`: the form is
         * long, and the profile the visitor is building should stay with
         * them as they answer — which is what the old panel's
         * `sticky top-24` provided and what replacing it must not lose.
         *
         * `position: fixed` is not an option here; `PageTransition`
         * leaves `filter: blur(0px)` on an ancestor and a filter creates
         * a containing block for fixed descendants. Verified with a
         * probe. Sticky is unaffected by that.
         */
        return wideEnoughForScene
          ? {
              band: "sticky top-24 h-0",
              size: "h-[calc(100svh-8rem)] w-[41%]",
            }
          : null;
      case "review":
      case "submitting":
      case "submit_error":
        // The review column is `max-w-2xl` and centred; the scene sits in
        // the gutter beside it, never over it.
        // Taller than the canvas alone needed: the three review groups
        // are written out beside it, and a 400px box cut the third one
        // off. The width is still the gutter's, so nothing moves closer
        // to the review column.
        return wideEnoughForGutterScene
          ? { band: "top-28", size: "h-[min(62vh,560px)] w-[30%]" }
          : null;
      case "result":
        // The estimate is dense and its numbers must stay readable, so
        // the closure is small and tucked into the header's right
        // whitespace, above the two-column grid.
        return wideEnoughForGutterScene
          ? { band: "top-16", size: "h-[min(26vh,215px)] w-[18%]" }
          : null;
      case "profile":
        // `ProfileReadyScreen` is a two-column grid with only one child,
        // so its right column is empty. The closure composition belongs
        // exactly there, and this is the one screen where it is the
        // subject rather than an accompaniment.
        return wideEnoughForScene
          ? {
              band: "top-1/2 -translate-y-1/2",
              size: "h-[min(60vh,520px)] w-[48%]",
            }
          : null;
      default:
        return null;
    }
  })();

  return (
    <div className="relative min-h-[100svh] pt-20" ref={shellRef}>
      {/*
       * The diagnostic's visual story, driven by the REAL screen and step
       * — not a parallel decorative counter. It holds the review
       * structure while submitting and can only reach its closing
       * composition once persistence is acknowledged (`result`).
       *
       * Decorative and `pointer-events-none`, placed behind the form so
       * it can never intercept input or cover a question. The accessible
       * description of each stage is the form's own heading and progress.
       */}
      {/*
       * The full sequence is mounted: entry sphere, separated topic
       * layers, review stack, and the closure that can only be reached
       * once the server has acknowledged persistence.
       *
       * This was previously restricted to `intro`. The reason given was
       * that mounting it through the submit screens destabilised three
       * specs at the estimate screen — but that was a misattribution. The
       * real cause was a stale-coordinate race in the test harness's
       * hold-to-confirm gesture (the review screen animates in; the
       * tests measured the button's position before it settled). With
       * that fixed the scene is no longer implicated, and the restriction
       * no longer buys anything. See PROJECT-STATUS.md §8.
       */}
      {scenePlacement && (
        <div
          /*
           * No longer `aria-hidden` on the wrapper. It used to hold only
           * a decorative canvas; it now also carries the profile readout,
           * which is real information about the visitor's own answers and
           * must reach assistive technology. The canvas, its labels and
           * the fallback mark themselves hidden inside `DiagnosticScene`,
           * so nothing decorative is announced.
           *
           * `pointer-events-none` still applies to the scene; the readout
           * re-enables them for its own controls.
           */
          className={`pointer-events-none z-0 ${
            scenePlacement.band.startsWith("sticky") ? "" : "absolute inset-x-0"
          } ${scenePlacement.band}`}
          style={scenePlacement.bandStyle}
        >
          {/*
           * Mirrors the page Container so the scene lines up with the
           * content columns. It was previously pinned to `right-0`, i.e.
           * the viewport edge, which put it 120px to the right of the
           * content on a wide screen — the canvas ran under the page
           * gutter and the projected topic labels were clipped by the
           * window.
           */}
          <Container>
            <div className={`ml-auto ${scenePlacement.size}`} style={scenePlacement.sizeStyle}>
              <DiagnosticExplainer
                screen={screen}
                step={step}
                answers={answers}
                withScene
                // See DiagnosticExplainer's `showText`: the estimate
                // screen's only free strip is too narrow to read in.
                showText={screen !== "result"}
                className="h-full w-full"
              />
            </div>
          </Container>
        </div>
      )}
      {screen === "intro" && (
        <motion.div
          key="intro"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4 }}
        >
          <Container className="grid grid-cols-1 items-center gap-14 py-16 lg:grid-cols-2 lg:py-24">
            <div>
              <Reveal>
                <SectionLabel id="SYS / 09">
                  {dict.diagnosticShell.label}
                </SectionLabel>
              </Reveal>
              <Reveal delay={0.06}>
                <h1 className="mt-5 text-balance text-display-md font-semibold text-ink">
                  {dict.diagnosticShell.introTitle}
                </h1>
              </Reveal>
              <Reveal delay={0.12}>
                <p className="mt-6 max-w-md text-[15px] leading-relaxed text-graphite">
                  {dict.diagnosticShell.introBody}
                </p>
              </Reveal>

              {/*
                * What they wrote on the homepage, shown back to them
                * before anything is asked again — the replacement for the
                * old one-line `?hint=` echo, which could only ever show a
                * single category and never their own words.
                */}
              {startContext && (
                <Reveal delay={0.16}>
                  <StartContextPanel
                    variant="intro"
                    topics={startContext.topics}
                    text={startContext.text}
                    onRemoveTopic={removeStartTopic}
                    onChangeText={changeStartText}
                    onClear={clearStartContext}
                    className="mt-7"
                  />
                </Reveal>
              )}

              <Reveal delay={0.18}>
                <div className="mt-6 flex flex-wrap items-center gap-4 font-mono text-[10px] uppercase tracking-[0.08em] text-muted">
                  <span>{dict.diagnosticShell.microTime}</span>
                  <span className="h-1 w-1 rounded-full bg-line" />
                  <span>{dict.diagnosticShell.microSections}</span>
                  <span className="h-1 w-1 rounded-full bg-line" />
                  <span>{dict.diagnosticShell.microAudit}</span>
                </div>
              </Reveal>

              <Reveal delay={0.24}>
                <div className="mt-9">
                  <MagneticButton>
                    <button
                      type="button"
                      onClick={begin}
                      className="inline-flex items-center gap-2 rounded bg-modus px-6 py-3.5 text-[14px] font-medium text-paper transition-colors hover:bg-modus-light"
                    >
                      {dict.diagnosticShell.begin}
                      <ArrowRight className="h-4 w-4" strokeWidth={1.75} />
                    </button>
                  </MagneticButton>
                </div>
              </Reveal>

              <DiagnosticRecoveryPrompt
                visible={showRecoveryPrompt}
                onContinue={continueDiagnostic}
                onStartAgain={startAgainFresh}
                onDismiss={dismissRecovery}
              />
            </div>

            {/*
             * Below the desktop threshold there is no canvas — so the
             * explanation is rendered on its own here, as ordinary text in
             * the page flow. A phone should spend its room on words, and
             * the words are the half that carries the information.
             */}
            {!wideEnoughForScene && (
              <Reveal delay={0.1}>
                <DiagnosticExplainer
                  screen={screen}
                  step={step}
                  answers={answers}
                  withScene={false}
                  className="rounded-md border border-line bg-mineral/50 p-5"
                />
              </Reveal>
            )}
          </Container>
        </motion.div>
      )}

      {screen === "form" && (
        <motion.div
          key="form"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
        >
          <Container className="py-10 lg:py-14">
            {resumed && (
              <p className="mb-6 font-mono text-[10px] uppercase tracking-[0.08em] text-modus">
                {dict.diagnosticRecovery.resumedBadge}
              </p>
            )}
            <ProgressBar step={step} />

            {/* No canvas at this width; the explanation stands on its own,
                above the question it explains. */}
            {!wideEnoughForScene && (
              <DiagnosticExplainer
                screen={screen}
                step={step}
                answers={answers}
                withScene={false}
                className="mt-8 rounded-md border border-line bg-mineral/50 p-5"
              />
            )}

            <div className="mt-12 grid grid-cols-1 gap-14 lg:grid-cols-[1.3fr_1fr]">
              <div>
                {/* Checkpoint 5: one continuous conversation, not a page
                    transition — the outgoing step softly shifts+blurs
                    out while the next occupies the same spatial role
                    (Section 6). Still a plain keyed motion.div (same
                    mechanism as before, not AnimatePresence — nothing
                    needs to coexist mid-transition since steps replace
                    each other entirely), just with blur added to the
                    existing opacity+y animation. */}
                <motion.div
                  key={step}
                  ref={stepHeadingRef}
                  /*
                   * A stable hook for the current step's own heading and
                   * fields. The explanation beside the form legitimately
                   * repeats words that appear in the questions — a summary
                   * of "Locations" says "Locations" — so a test that looks
                   * for question text by itself can match the summary
                   * instead. Scoping to this element is what makes those
                   * locators mean "the question", not "that word anywhere
                   * on the page".
                   */
                  data-diagnostic-step={step}
                  initial={{ opacity: 0, y: 10, filter: "blur(4px)" }}
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                >
                  <h2
                    tabIndex={-1}
                    className="text-balance text-display-sm font-semibold text-ink outline-none"
                  >
                    {STEP_HEADLINES[step]}
                  </h2>
                  {/*
                   * The friction step is the one place the homepage text
                   * can legitimately become an answer, because this step
                   * asks the same question. It is offered, not applied:
                   * "used" is derived from the field's actual value rather
                   * than a flag, so editing or clearing the field puts the
                   * offer back instead of leaving a stale confirmation.
                   */}
                  {step === 3 && startContext && startContext.text.trim().length > 0 && (
                    <StartContextPanel
                      variant="inline"
                      topics={startContext.topics}
                      text={startContext.text}
                      onRemoveTopic={removeStartTopic}
                      onChangeText={changeStartText}
                      onClear={clearStartContext}
                      onUseAsDescription={useStartTextAsDescription}
                      used={
                        answers.problemDescription.trim() === startContext.text.trim()
                      }
                      className="mt-6"
                    />
                  )}

                  <div className="mt-7">{stepComponents[step]}</div>
                </motion.div>

                <div className="mt-10 flex items-center justify-between border-t border-line pt-6">
                  <button
                    type="button"
                    onClick={back}
                    className="inline-flex items-center gap-1.5 text-[13px] text-graphite hover:text-ink"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} />
                    {dict.diagnosticShell.back}
                  </button>
                  <button
                    type="button"
                    onClick={next}
                    disabled={!canProceed(step, answers)}
                    className="inline-flex items-center gap-2 rounded bg-ink px-6 py-3 text-[13.5px] font-medium text-paper transition-colors hover:bg-graphite disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    {step === STEP_LABELS.length - 1
                      ? dict.diagnosticShell.review
                      : dict.diagnosticShell.next}
                    <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.75} />
                  </button>
                </div>
              </div>

              {/*
                * The "MODUS / INITIAL PROFILE" panel stood here: a
                * bordered card with a static node map and the facts,
                * above a second WebGL scene further down the page. Two
                * graphics competing on one screen, one of which never
                * responded to anything.
                *
                * It is replaced, not moved: the profile is now part of
                * the one composition that also carries the stage, which
                * is mounted once at shell level so its points persist
                * across the whole journey. The column is left empty here
                * deliberately — see `scenePlacement`.
                */}
            </div>
          </Container>
        </motion.div>
      )}

      {screen === "review" && (
        <motion.div
          key="review"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
        >
          {/*
           * `<Container className="max-w-2xl">` did not do what it reads
           * like it does. `Container` already sets `max-w-site`, a custom
           * `maxWidth` extension, and Tailwind emits extensions after the
           * core scale — so `max-w-site` won and the review column
           * rendered at the full 1200px rather than the intended 672px.
           * That is why each row had a label at the far left and its
           * `EDIT` affordance ~1200px away at the far right.
           *
           * Nesting the narrow wrapper inside is the pattern `Container`
           * documents for exactly this, and it cannot silently lose to a
           * utility on the same element.
           */}
          <Container className="py-16">
            {/*
             * Left-aligned, not centred. Centring it moved the submit
             * control to the middle of the page, where the fixed
             * bottom-centre consent banner covered it — the primary
             * action of the screen became unclickable, which Playwright's
             * actionability check caught immediately. Left alignment also
             * matches the intro and question screens, and leaves a wider
             * gutter for the scene.
             */}
            <div className="max-w-2xl">
              {/* The three groups are the framing for this screen, so they
                  must not be desktop-only: below the gutter threshold they
                  appear above the list instead of beside it. */}
              {!wideEnoughForGutterScene && (
                <DiagnosticExplainer
                  screen={screen}
                  step={step}
                  answers={answers}
                  withScene={false}
                  className="mb-10 rounded-md border border-line bg-mineral/50 p-5"
                />
              )}
              <ReviewScreen
                answers={answers}
                onEdit={(s) => {
                  setStep(s);
                  setScreen("form");
                }}
                onSubmit={submit}
              />
            </div>
          </Container>
        </motion.div>
      )}

      {screen === "submitting" && (
        <motion.div
          key="submitting"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <SubmitTransition onDone={onSubmitDone} />
        </motion.div>
      )}

      {screen === "submit_error" && (
        <motion.div
          key="submit_error"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <Container className="flex min-h-[50vh] flex-col items-center justify-center py-20 text-center">
            <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted">
              {dict.diagnosticSubmitError.label}
            </p>
            <h1 className="mt-4 text-balance text-display-sm font-semibold text-ink">
              {dict.diagnosticSubmitError.heading}
            </h1>
            <p className="mt-4 max-w-sm text-[15px] leading-relaxed text-graphite">
              {dict.diagnosticSubmitError.body}
            </p>
            <div className="mt-8 flex items-center gap-6">
              <button
                type="button"
                onClick={() => setScreen("review")}
                className="text-[13px] text-graphite hover:text-ink"
              >
                {dict.diagnosticSubmitError.backToReview}
              </button>
              <button
                type="button"
                onClick={submit}
                className="inline-flex items-center gap-2 rounded bg-ink px-6 py-3 text-[13.5px] font-medium text-paper transition-colors hover:bg-graphite"
              >
                {dict.diagnosticSubmitError.retry}
              </button>
            </div>
          </Container>
        </motion.div>
      )}

      {screen === "result" && (
        <motion.div
          key="result"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4 }}
        >
          <Container className="py-16">
            <ResultView answers={answers} />
          </Container>
        </motion.div>
      )}

      {screen === "profile" && (
        <motion.div
          key="profile"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4 }}
        >
          <ProfileReadyScreen
            companyName={contextCompanyName}
            summary={contextSummary}
            status={contextSummaryStatus}
            onStartNew={startNewFromProfile}
          />
        </motion.div>
      )}
    </div>
  );
}
