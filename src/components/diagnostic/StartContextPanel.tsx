"use client";

import { X } from "lucide-react";
import { ENTRY_TEXT_MAX } from "@/lib/diagnostic/entryContext";
import { useDict } from "@/lib/i18n/context";

/**
 * What the visitor told us on the homepage, shown back to them.
 *
 * ## Why it is shown at all
 *
 * Carrying their words forward silently would be worse than not carrying
 * them: they would have typed something, seen it vanish, and then been
 * asked similar questions from scratch. So it is stated plainly, labelled
 * as carried over, and editable — including clearable, which is the part
 * that makes it theirs rather than ours.
 *
 * ## What it is NOT
 *
 * Not an answer. Nothing here is written into `DiagnosticAnswers`, nothing
 * is read by `canProceed`, and no required question is skipped or
 * pre-filled because of it. The one route into a real answer is the
 * explicit "use this as my description" button on the friction step — the
 * visitor presses it, having seen both the text and the field it goes
 * into. An automatic prefill would be the silent save this must not be,
 * and it could also drop a four-word sentence into a field that asks for
 * twenty characters, producing a validation error the visitor never
 * caused.
 */
export function StartContextPanel({
  topics,
  text,
  variant,
  onRemoveTopic,
  onChangeText,
  onClear,
  onUseAsDescription,
  used = false,
  className = "",
}: {
  topics: readonly string[];
  text: string;
  /** "intro" is the full editable panel; "inline" is the friction-step reminder. */
  variant: "intro" | "inline";
  onRemoveTopic: (topic: string) => void;
  onChangeText: (value: string) => void;
  onClear: () => void;
  /** Only passed on the friction step, where a description field exists. */
  onUseAsDescription?: () => void;
  used?: boolean;
  className?: string;
}) {
  const t = useDict().diagnosticStartContext;
  if (topics.length === 0 && text.trim().length === 0) return null;

  return (
    <section
      aria-label={t.label}
      className={`rounded-md border border-line bg-mineral/60 p-4 sm:p-5 ${className}`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted">{t.label}</p>
        <button
          type="button"
          onClick={onClear}
          className="text-[12px] text-graphite underline decoration-line-strong underline-offset-2 hover:text-ink"
        >
          {t.clear}
        </button>
      </div>

      {topics.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2">
          {topics.map((topic) => (
            <li key={topic}>
              {/* Removable, so the carried selection is editable in the
                  same sense the text is — not a read-only receipt. */}
              <button
                type="button"
                onClick={() => onRemoveTopic(topic)}
                className="group inline-flex items-center gap-1.5 rounded-full border border-line bg-paper px-3 py-1.5 text-[12.5px] text-ink transition-colors hover:border-ink/30"
              >
                {topic}
                <X
                  className="h-3 w-3 text-muted transition-colors group-hover:text-ink"
                  strokeWidth={2}
                  aria-hidden
                />
                <span className="sr-only">{t.removeTopic}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {variant === "intro" ? (
        <div className="mt-4">
          <label
            htmlFor="modus-start-context"
            className="block text-[12.5px] font-medium text-ink"
          >
            {t.textLabel}
          </label>
          <textarea
            id="modus-start-context"
            value={text}
            maxLength={ENTRY_TEXT_MAX}
            rows={3}
            placeholder={t.textPlaceholder}
            onChange={(e) => onChangeText(e.target.value)}
            className="mt-2 w-full resize-y rounded border border-line bg-paper px-3 py-2.5 text-[13.5px] leading-relaxed text-ink placeholder:text-muted focus:border-modus focus:outline-none focus:ring-1 focus:ring-modus"
          />
          <p className="mt-2 text-[12px] leading-relaxed text-muted">{t.note}</p>
        </div>
      ) : (
        text.trim().length > 0 && (
          <>
            <p className="mt-3 text-[13.5px] leading-relaxed text-graphite">{text}</p>
            {onUseAsDescription && (
              <div className="mt-3">
                {used ? (
                  <p className="font-mono text-[10px] uppercase tracking-[0.06em] text-modus">
                    {t.used}
                  </p>
                ) : (
                  <button
                    type="button"
                    onClick={onUseAsDescription}
                    className="rounded border border-line bg-paper px-3 py-2 text-[12.5px] font-medium text-ink transition-colors hover:border-ink/30"
                  >
                    {t.useAsDescription}
                  </button>
                )}
              </div>
            )}
          </>
        )
      )}
    </section>
  );
}
