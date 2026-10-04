"use client";

import { AnimatePresence } from "motion/react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { SystemSurface } from "@/components/system/SystemSurface";
import { useOverlaySlot } from "@/components/system/OverlayProvider";
import { useDict } from "@/lib/i18n/context";
import {
  acceptAll,
  listenOpenConsentPreferences,
  needsConsentDecision,
  rejectOptional,
} from "@/lib/privacy/consent";
import { track } from "@/lib/chatbot";
import { ConsentPreferencesDialog } from "./ConsentPreferencesDialog";

export function ConsentBanner() {
  const pathname = usePathname();
  const isPrivate = pathname?.startsWith("/private");
  const dict = useDict();
  const [decided, setDecided] = useState(() => !needsConsentDecision());
  const [managing, setManaging] = useState(false);

  useEffect(() => listenOpenConsentPreferences(() => setManaging(true)), []);

  const active = useOverlaySlot("consent", !decided && !managing && !isPrivate);

  function resolve(action: "acceptAll" | "rejectOptional") {
    const state = action === "acceptAll" ? acceptAll() : rejectOptional();
    track("privacy_preferences_changed", { source: "banner", ...state.categories });
    setDecided(true);
  }

  return (
    <>
      <AnimatePresence>
        {active && (
          <SystemSurface
            label={dict.privacy.bannerLabel}
            placement="bottom-center"
            reserveSpace
          >
            <p className="text-[13.5px] leading-relaxed text-graphite">{dict.privacy.bannerBody}</p>
            <div className="mt-3.5 flex flex-wrap gap-2.5">
              <button
                type="button"
                onClick={() => resolve("acceptAll")}
                className="rounded bg-modus px-3.5 py-2 text-[13px] font-medium text-modus-foreground transition-colors hover:bg-modus-light"
              >
                {dict.privacy.acceptAll}
              </button>
              <button
                type="button"
                onClick={() => resolve("rejectOptional")}
                className="rounded border border-line px-3.5 py-2 text-[13px] text-graphite transition-colors hover:border-modus hover:text-modus"
              >
                {dict.privacy.rejectOptional}
              </button>
              <button
                type="button"
                onClick={() => setManaging(true)}
                className="px-1 text-[13px] text-muted underline decoration-1 underline-offset-4 transition-colors hover:text-ink"
              >
                {dict.privacy.manage}
              </button>
            </div>
          </SystemSurface>
        )}
      </AnimatePresence>

      <ConsentPreferencesDialog
        open={managing}
        onOpenChange={(next) => {
          setManaging(next);
          if (!next) setDecided(!needsConsentDecision());
        }}
      />
    </>
  );
}
