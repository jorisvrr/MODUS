"use client";

import Link from "next/link";
import { Linkedin } from "lucide-react";
import { WideBleed } from "@/components/ui/Container";
import { Logo } from "@/components/ui/Logo";
import { Reveal } from "@/components/ui/Reveal";
import { openChatbot, track } from "@/lib/chatbot";
import { useDict } from "@/lib/i18n/context";
import { LanguageSwitch } from "@/components/language/LanguageSwitch";
import { openConsentPreferences } from "@/lib/privacy/consent";
import { DiagnosticCTA } from "@/components/ui/DiagnosticCTA";

export function Footer() {
  const dict = useDict();
  const navLinks = [
    { label: dict.nav.howItWorks, href: "/how-it-works" },
    { label: dict.nav.platform, href: "/platform" },
    { label: dict.nav.pricing, href: "/pricing" },
    { label: dict.nav.capabilities, href: "/capabilities" },
    { label: dict.nav.results, href: "/results" },
    { label: dict.nav.company, href: "/company" },
  ];

  return (
    <footer className="border-t border-line bg-inverted text-inverted-foreground">
      <WideBleed className="pb-10 pt-16 md:pt-20">
        <Reveal>
          <Logo variant="wordmark" tone="light" size="xl" />
        </Reveal>
        <Reveal delay={0.08}>
          <p className="mt-4 max-w-lg text-balance text-2xl font-medium text-inverted-foreground/80 md:text-3xl">
            {dict.footer.tagline}
          </p>
        </Reveal>

        <div className="mt-16 grid grid-cols-1 gap-10 border-t border-inverted-foreground/10 pt-10 md:mt-20 md:grid-cols-3 md:gap-8">
          <Reveal delay={0.14}>
            <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-inverted-foreground/40">
              {dict.footer.modusLabel}
            </p>
            <p className="mt-3 max-w-[220px] text-[13px] leading-relaxed text-inverted-foreground/60">
              {dict.footer.modusBlurb}
            </p>
          </Reveal>

          <Reveal delay={0.18}>
            <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-inverted-foreground/40">
              {dict.footer.navigateLabel}
            </p>
            <ul className="mt-3 space-y-2.5">
              {navLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-[13.5px] text-inverted-foreground/70 transition-colors hover:text-inverted-foreground"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </Reveal>

          <Reveal delay={0.22}>
            <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-inverted-foreground/40">
              {dict.footer.getStartedLabel}
            </p>
            <div className="mt-3 flex flex-col items-start gap-3">
              <DiagnosticCTA variant="footer" source="footer" />
              <button
                type="button"
                onClick={() => {
                  track("talk_to_modus_click", { source: "footer" });
                  openChatbot();
                }}
                className="text-[13.5px] text-inverted-foreground/70 transition-colors hover:text-inverted-foreground"
              >
                {dict.footer.talkToModus}
              </button>
            </div>
          </Reveal>
        </div>

        <Reveal delay={0.28}>
          <div className="mt-14 flex items-center gap-2 border-t border-inverted-foreground/10 pt-6 font-mono text-[10px] uppercase tracking-[0.1em] text-modus-light">
            <span className="h-1.5 w-1.5 rounded-full bg-modus-light" aria-hidden />
            {dict.footer.statusLine}
          </div>
        </Reveal>

        <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-4">
            <p className="text-[12.5px] text-inverted-foreground/45">{dict.footer.copyright}</p>
            <LanguageSwitch tone="light" />
          </div>
          <div className="flex items-center gap-5">
            {/* Was href="#": a dead placeholder. Now the real route. */}
            <Link
              href="/privacypolicy"
              aria-label={dict.footer.privacy}
              className="text-[12.5px] text-inverted-foreground/45 hover:text-inverted-foreground/80"
            >
              {dict.footer.privacy}
            </Link>
            <button
              type="button"
              onClick={() => openConsentPreferences()}
              className="text-[12.5px] text-inverted-foreground/45 hover:text-inverted-foreground/80"
            >
              {dict.footer.privacyPreferences}
            </button>
            <Link
              href="/legal"
              aria-label={dict.footer.legal}
              className="text-[12.5px] text-inverted-foreground/45 hover:text-inverted-foreground/80"
            >
              {dict.footer.legal}
            </Link>
            {/* Was href="#", a dead placeholder, like the policy links
                above it. `rel="noopener"` because this opens in a new tab;
                the icon is decorative, so `aria-label` carries the name. */}
            <a
              href="https://www.linkedin.com/company/withmodus"
              target="_blank"
              rel="noopener noreferrer"
              aria-label={dict.footer.linkedin}
              className="text-inverted-foreground/45 hover:text-inverted-foreground/80"
            >
              <Linkedin className="h-4 w-4" strokeWidth={1.6} aria-hidden />
            </a>
          </div>
        </div>
      </WideBleed>
    </footer>
  );
}
