"use client";

import Link from "next/link";
import { useCustomerContext } from "@/lib/customerContext/useCustomerContext";
import { useDict } from "@/lib/i18n/context";
import { MagneticButton } from "@/components/ui/MagneticButton";
import { AnimatedChars } from "@/components/ui/AnimatedChars";
import { track } from "@/lib/chatbot";

type Variant = "nav" | "hero" | "inline" | "dark" | "footer" | "accent-invert" | "hero-round";

/**
 * Shape and size per variant. Two changes from before:
 *
 * 1. Every pill variant is now `rounded-full` (999px), so the nav, hero,
 *    section and closing diagnostic CTAs all read as the same control.
 *    They previously used `rounded` (3px), which made them squared-off
 *    next to the genuinely pill-shaped nav capsules. Padding, height and
 *    typography are untouched — this is a radius change only.
 * 2. The background colour moved OFF the control and onto the decorative
 *    `[data-chars-bg]` layer below, because the PDF's effect insets that
 *    surface on hover. At rest (inset 0) it is pixel-identical to the
 *    previous solid fill; the colours themselves are unchanged.
 */
const VARIANT_CLASS: Record<Variant, string> = {
  nav: "rounded-full px-4 py-2 text-[13px] font-medium text-modus-foreground",
  hero: "rounded-full px-6 py-3.5 text-[14px] font-medium text-modus-foreground",
  inline: "rounded-full px-5 py-2.5 text-[13px] font-medium text-modus-foreground",
  // "dark" = a highlighted pill CTA placed on a dark/inverted section
  // (e.g. a future Philosophy-style dark section, Checkpoint 4+) — a
  // bordered outline rather than the usual solid modus-green fill, which
  // would otherwise read as a green pill on a near-black background.
  // Uses the fixed inverted-foreground token (not paper), since this
  // sits on a section that's meant to stay dark regardless of site
  // theme — see globals.css's --surface-inverted comment.
  dark: "rounded-full border border-inverted-foreground/30 px-6 py-3.5 text-[14px] font-medium text-inverted-foreground hover:border-inverted-foreground/60",
  // "footer" = a plain text link matching the footer's own nav-column
  // list style, not a pill — the footer already has enough visual weight
  // from its own layout; every diagnostic action there reads as a link
  // alongside "Talk to MODUS", not a second competing button.
  footer: "text-[13.5px] font-normal text-inverted-foreground/70 hover:text-inverted-foreground",
  // "accent-invert" = a solid pill that inverts *away* from a `bg-modus`
  // section (FinalCTA), not a full-page-always-dark one — uses the
  // ordinary theme-relative `paper`/`ink` tokens deliberately, not the
  // fixed inverted ones: paper/ink swap correctly with the site theme
  // (near-white/near-black in light mode, near-black/near-white in dark
  // mode), which happens to always contrast correctly against whichever
  // shade of green `bg-modus` currently resolves to in either theme. A
  // real mistake caught before shipping: `footer`'s fixed
  // inverted-foreground text on this section would stay near-white even
  // in dark mode, when bg-modus turns bright — poor contrast.
  "accent-invert": "rounded-full px-6 py-3.5 text-[14px] font-medium text-ink",
  // "hero-round" = the compact circular forward action inside the hero's
  // floating diagnostic shell (Checkpoint 5.5, third pass). The shell
  // itself is a forced-light surface in both themes, so this uses fixed
  // near-black/white rather than theme-relative tokens — it must stay
  // dark-on-light regardless of site theme, same reasoning as the shell.
  // Icon-only visually; the real label is still the accessible name (see
  // `aria-label` below), so nothing is lost for screen readers.
  "hero-round":
    "h-11 w-11 justify-center rounded-full bg-neutral-900 text-white hover:bg-neutral-700",
};

const BASE = "relative inline-flex items-center gap-2 transition-colors duration-200 ease-modus";

/**
 * The decorative filled surface, per variant. `null` means this variant
 * has no background of its own (a bordered or plain-text action), so it
 * gets the character roll without an inset layer — the brief is explicit
 * that plain links must not gain a background just to carry the effect.
 *
 * These layers are `pointer-events-none` via the shared `[data-chars-bg]`
 * rule, so the control's hit area is exactly what it was.
 */
const VARIANT_BG: Record<Variant, string | null> = {
  nav: "bg-modus group-hover/cta:bg-modus-light",
  hero: "bg-modus group-hover/cta:bg-modus-light",
  inline: "bg-modus group-hover/cta:bg-modus-light",
  dark: null,
  footer: null,
  "accent-invert": "bg-paper group-hover/cta:bg-paper/90",
  // Icon-only; keeps its own solid fill and is excluded from the effect.
  "hero-round": null,
};

/**
 * The one canonical Free Diagnostic CTA — every existing hardcoded
 * `href="/diagnostic"` link elsewhere in the codebase (Hero, FinalCTA,
 * PricingHero, PricingEstimateCTA, HomeContextBanner) is untouched by
 * this checkpoint since each has its own established personalization
 * wiring already; this component is for the *new* Checkpoint 3 shell
 * surfaces (Navigation, mobile nav, footer) so they don't each reinvent
 * the label/href logic. Every variant routes through the same
 * `useCustomerContext()` next-best-action system Navigation.tsx already
 * used — "Free Diagnostic" for a new visitor, "Continue Diagnostic" /
 * "View Proposal" / "View Profile" for a returning one — never a second,
 * competing CTA implementation.
 */
export function DiagnosticCTA({
  variant = "inline",
  magnetic = false,
  className = "",
  source,
  newVisitorLabel,
  beforeNavigate,
  icon,
}: {
  variant?: Variant;
  magnetic?: boolean;
  className?: string;
  /** Passed to `track("diagnostic_click", { source })` — matches the
   * established convention every other diagnostic CTA in the codebase
   * already follows (FinalCTA, PricingHero, PricingEstimateCTA). */
  source: string;
  /**
   * Replaces the label for a genuinely NEW visitor only (`RUN_DIAGNOSTIC`).
   *
   * A returning visitor keeps their personalised next-best-action wording
   * and href — "Continue Diagnostic", "View Proposal", "View Profile" —
   * because those describe where the link actually goes, and a section's
   * own phrasing must not overwrite that. Same condition the old `?hint=`
   * used, for the same reason.
   */
  newVisitorLabel?: string;
  /**
   * Run just before navigation. The homepage entry section uses it to save
   * what the visitor typed and selected, on the press that leaves the page
   * rather than on every keystroke or chip.
   *
   * Synchronous by contract: this fires inside the link's click handler, so
   * anything asynchronous would not be guaranteed to finish.
   */
  beforeNavigate?: () => void;
  /** Replaces the visible label with an icon (used by `hero-round`). The
   * label is still applied as `aria-label`, so the accessible name — and
   * therefore the personalised next-best-action wording — is unchanged. */
  icon?: React.ReactNode;
}) {
  const dict = useDict();
  const { nextBestAction } = useCustomerContext();
  const label =
    nextBestAction.id === "CONTINUE_DIAGNOSTIC"
      ? dict.customerContext.diagnosticInProgress.cta
      : nextBestAction.id === "VIEW_PROPOSAL"
        ? dict.customerContext.proposalReady.cta
        : nextBestAction.id === "VIEW_PROFILE"
          ? dict.customerContext.profileReady.cta
          : (newVisitorLabel ?? dict.nav.runDiagnostic);

  const href = nextBestAction.href;

  const bg = VARIANT_BG[variant];

  const link = (
    <Link
      href={href}
      onClick={() => {
        beforeNavigate?.();
        track("diagnostic_click", { source });
      }}
      // Icon-only variants keep the label as their accessible name. For
      // text variants the name comes from `AnimatedChars`' hidden span, so
      // adding an aria-label here as well would be a second, competing
      // name for the same control.
      aria-label={icon ? label : undefined}
      // `data-chars-root` is what the CSS hooks hover and :focus-visible
      // on; `group/cta` only drives the background colour swap, which
      // Tailwind cannot express from a parent selector otherwise.
      data-chars-root={icon ? undefined : ""}
      className={`group/cta ${BASE} ${VARIANT_CLASS[variant]} ${className}`}
    >
      {/* Rendered whenever the variant has a fill, icon or not — an
          icon-only variant simply never gets `data-chars-root`, so the
          layer sits statically at inset 0 and the button keeps its solid
          surface instead of losing it. */}
      {bg ? <span data-chars-bg className={bg} aria-hidden="true" /> : null}
      {icon ?? <AnimatedChars text={label} />}
    </Link>
  );

  return magnetic ? <MagneticButton range={3}>{link}</MagneticButton> : link;
}
