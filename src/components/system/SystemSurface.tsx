"use client";

import { motion, useReducedMotion, type Variants } from "motion/react";
import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";

const ease = [0.16, 1, 0.3, 1] as const;

/**
 * Shared reveal for MODUS system prompts: DATUM -> LINE -> PLANE -> INTERFACE.
 * A small dot appears, a horizontal rule extends from it, the surface then
 * expands to its full size, and content/actions fade in last. Closing runs
 * the same sequence in reverse. Used by every unsolicited system surface
 * (language suggestion, consent banner, diagnostic recovery) so they all
 * share one motion identity instead of each inventing their own.
 */
function useDatumVariants(): { datum: Variants; line: Variants; plane: Variants; content: Variants } {
  const reduce = useReducedMotion();
  if (reduce) {
    const instant: Variants = { hidden: { opacity: 1 }, visible: { opacity: 1 } };
    return { datum: instant, line: instant, plane: instant, content: instant };
  }
  return {
    datum: {
      hidden: { opacity: 0, scale: 0.4 },
      visible: { opacity: 1, scale: 1, transition: { duration: 0.16, ease } },
    },
    line: {
      hidden: { scaleX: 0, opacity: 0 },
      visible: { scaleX: 1, opacity: 1, transition: { duration: 0.2, delay: 0.1, ease } },
    },
    plane: {
      hidden: { opacity: 0, y: 14, scale: 0.98 },
      visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.28, delay: 0.16, ease } },
    },
    content: {
      hidden: { opacity: 0, y: 6 },
      visible: { opacity: 1, y: 0, transition: { duration: 0.24, delay: 0.3, ease } },
    },
  };
}

export function SystemSurface({
  label,
  onClose,
  closeLabel = "Close",
  children,
  className = "",
  placement = "bottom-left",
  reserveSpace = false,
}: {
  label: ReactNode;
  onClose?: () => void;
  closeLabel?: string;
  children: ReactNode;
  className?: string;
  placement?: "bottom-left" | "bottom-center";
  /**
   * Reserve room at the bottom of the document while this surface spans
   * the viewport, so it cannot cover the page's own controls.
   *
   * Set by the consent banner, which is the one surface a visitor cannot
   * simply ignore. Below `sm` it is full-bleed (`inset-x-3`), and a
   * full-width fixed bar at the bottom of a phone sits exactly where a
   * form's "Continue" button ends up — it made the diagnostic's primary
   * action unclickable, which Playwright's actionability check caught as
   * "subtree intercepts pointer events". From `sm` up it is a 380px card
   * and padding the whole document for it would add a strip of empty
   * space to every page, so the reservation is keyed on the measured
   * width rather than on a duplicated breakpoint.
   */
  reserveSpace?: boolean;
}) {
  const variants = useDatumVariants();
  const labelId = useId();
  const surfaceRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!reserveSpace) return;
    const el = surfaceRef.current;
    if (!el) return;
    const root = document.documentElement;
    const apply = () => {
      const r = el.getBoundingClientRect();
      const spansViewport = r.width / window.innerWidth > 0.9;
      // The surface animates in from `scale: 0.98` and `y: 14`, so an
      // early measurement is slightly short. Rounding up by the gap it
      // already sits in covers that without watching the animation.
      if (spansViewport) root.style.setProperty("--system-surface-reserve", `${Math.ceil(r.height) + 24}px`);
      else root.style.removeProperty("--system-surface-reserve");
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    window.addEventListener("resize", apply);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", apply);
      root.style.removeProperty("--system-surface-reserve");
    };
  }, [reserveSpace]);

  useEffect(() => {
    if (!onClose) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose?.();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const placementClass =
    placement === "bottom-center"
      ? "sm:left-1/2 sm:-translate-x-1/2"
      : "sm:left-6";

  return (
    <motion.div
      ref={surfaceRef}
      role="dialog"
      aria-labelledby={labelId}
      initial="hidden"
      animate="visible"
      exit="hidden"
      className={`fixed inset-x-3 bottom-3 z-[68] sm:inset-x-auto sm:bottom-6 sm:w-[380px] ${placementClass} ${className}`}
    >
      <motion.div
        variants={variants.plane}
        className="overflow-hidden rounded-md border border-line bg-paper shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-line px-4 pt-3.5">
          <div className="flex items-center gap-2 pb-2">
            <motion.span
              variants={variants.datum}
              className="h-1.5 w-1.5 rounded-full bg-modus"
              aria-hidden
            />
            <motion.span
              variants={variants.line}
              style={{ transformOrigin: "left" }}
              className="h-px w-4 bg-line"
              aria-hidden
            />
            <span id={labelId} className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
              {label}
            </span>
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label={closeLabel}
              className="mb-2 flex h-6 w-6 items-center justify-center text-muted hover:text-ink"
            >
              <X className="h-3.5 w-3.5" strokeWidth={1.75} />
            </button>
          )}
        </div>

        <motion.div variants={variants.content} className="px-4 pb-4 pt-3">
          {children}
        </motion.div>
      </motion.div>
    </motion.div>
  );
}
