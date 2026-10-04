"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { Copy, ExternalLink, Trash2 } from "lucide-react";
import { HoldToConfirm } from "@/components/ui/HoldToConfirm";
import {
  STATUSES,
  type ParsedDiagnostic,
  type Note,
  type ActivityEvent,
} from "@/lib/admin/types";
import { WORKFLOW_STATUSES, statusLabel } from "@/lib/admin/status";
import type { LeadFit } from "@/lib/admin/leadFit";
import { reviewBriefToText, type ReviewBrief } from "@/lib/admin/reviewBrief";
import {
  buildClientSummary,
  clientSummaryToText,
} from "@/lib/admin/clientSummary";
import { REVIEW_STEPS } from "@/lib/admin/workspace";
import { PricingCalculator } from "@/components/admin/PricingCalculator";

type Duplicate = {
  id: string;
  companyName: string;
  email: string;
  website: string | null;
  createdAt: Date;
};

export function DiagnosticDetailView({
  diagnostic,
  notes: initialNotes,
  activity,
  leadFit,
  tags,
  reviewBrief,
  duplicates,
}: {
  diagnostic: ParsedDiagnostic;
  notes: Note[];
  activity: ActivityEvent[];
  leadFit: LeadFit;
  tags: string[];
  reviewBrief: ReviewBrief;
  duplicates: Duplicate[];
}) {
  const router = useRouter();
  const [status, setStatus] = useState(diagnostic.status);
  const [notes, setNotes] = useState(initialNotes);
  const [noteText, setNoteText] = useState("");
  /*
   * Save outcomes, surfaced rather than swallowed. Both of these were
   * fire-and-forget `await fetch(...)` with no check on the response: a
   * failed status change left the new value on screen as though it had
   * been saved, and a failed note silently discarded what was typed.
   */
  const [statusSave, setStatusSave] = useState<"idle" | "saving" | "error">(
    "idle",
  );
  const [noteSave, setNoteSave] = useState<"idle" | "saving" | "error">("idle");
  const [showBrief, setShowBrief] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [deleteError, setDeleteError] = useState(false);
  const [deleteAttempt, setDeleteAttempt] = useState(0);
  const [requestedStatus, setRequestedStatus] = useState(diagnostic.status);

  async function savePricingOverride(
    patch: Record<string, number | string | boolean | null>,
  ) {
    const response = await fetch(`/api/private/diagnostics/${diagnostic.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!response.ok)
      throw new Error("The price could not be saved. Please try again.");
    router.refresh();
  }

  const clientSummary = buildClientSummary(diagnostic);

  async function updateStatus(next: string) {
    const previous = status;
    setRequestedStatus(next);
    setStatus(next);
    setStatusSave("saving");
    try {
      const res = await fetch(`/api/private/diagnostics/${diagnostic.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setStatusSave("idle");
      router.refresh();
    } catch {
      // Put the control back to what is actually stored. Leaving the new
      // value on screen would report a change that did not happen.
      setStatus(previous);
      setStatusSave("error");
    }
  }

  async function addNote() {
    if (!noteText.trim()) return;
    setNoteSave("saving");
    try {
      const res = await fetch(
        `/api/private/diagnostics/${diagnostic.id}/notes`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body: noteText }),
        },
      );
      if (!res.ok) throw new Error(String(res.status));
      const { note } = await res.json();
      setNotes((n) => [note, ...n]);
      // Cleared only after the save is confirmed, so a failure never
      // loses what was typed.
      setNoteText("");
      setNoteSave("idle");
    } catch {
      setNoteSave("error");
    }
  }

  async function handleDelete() {
    setDeleteError(false);
    try {
      const response = await fetch(
        `/api/private/diagnostics/${diagnostic.id}`,
        { method: "DELETE" },
      );
      if (!response.ok) throw new Error("Delete refused");
      setDeleted(true);
      window.setTimeout(() => router.push("/private/diagnostics"), 600);
    } catch {
      setDeleteError(true);
      setDeleteAttempt((value) => value + 1);
    }
  }

  function copy(value: string) {
    navigator.clipboard?.writeText(value);
  }

  if (deleted) {
    return <p className="text-[14px] text-muted">Diagnostic removed.</p>;
  }

  return (
    <div className="max-w-[1300px]">
      <a
        href="/private/diagnostics"
        className="mb-5 inline-block text-xs text-muted hover:text-ink"
      >
        ← Back to inbox
      </a>
      <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted">
        Diagnostic / {diagnostic.id.slice(-6).toUpperCase()}
      </p>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-ink">
            {diagnostic.companyName}
          </h1>
          <p className="mt-1 text-[13px] text-muted">
            {diagnostic.industry} · {diagnostic.employees} employees · Submitted{" "}
            {new Date(diagnostic.createdAt).toLocaleString("en-GB")}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <select
            value={status}
            disabled={statusSave === "saving"}
            onChange={(e) => updateStatus(e.target.value)}
            aria-label="Diagnostic status"
            className="h-9 rounded-md border border-line bg-surface px-3 text-[13px] text-ink outline-none transition-colors focus-visible:border-modus focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-modus/30 disabled:opacity-60"
          >
            {/* The workflow first, then any other stored value so a
                record that already holds one keeps it. */}
            <optgroup label="Workflow">
              {WORKFLOW_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {statusLabel(s)}
                </option>
              ))}
            </optgroup>
            <optgroup label="Other">
              {STATUSES.filter(
                (s) =>
                  !WORKFLOW_STATUSES.includes(
                    s as (typeof WORKFLOW_STATUSES)[number],
                  ),
              ).map((s) => (
                <option key={s} value={s}>
                  {statusLabel(s)}
                </option>
              ))}
            </optgroup>
          </select>
          {statusSave === "saving" && (
            <span className="text-[11.5px] text-muted" aria-live="polite">
              Saving…
            </span>
          )}
          {statusSave === "error" && (
            <span
              className="flex items-center gap-2 text-[11.5px] text-danger"
              role="alert"
            >
              Not saved.
              <button
                type="button"
                onClick={() => updateStatus(requestedStatus)}
                className="underline underline-offset-2 hover:text-ink"
              >
                Retry
              </button>
            </span>
          )}
        </div>
      </div>

      <div className="mt-5 rounded-xl border border-line bg-surface p-4 text-xs leading-relaxed text-graphite">
        <p className="workspace-eyebrow">Next step / {statusLabel(status)}</p>
        <p className="mt-2">
          {REVIEW_STEPS[status as keyof typeof REVIEW_STEPS]?.next ??
            "Review this record and record your next step."}
        </p>
        <details className="mt-3">
          <summary className="text-modus">Why this fit level?</summary>
          <p className="mt-3 text-muted">
            A rule-based indication of review priority, not a measure of
            business health or a guaranteed outcome.
          </p>
          <ul className="mt-2 list-inside list-disc">
            {leadFit.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </details>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span
          className={`rounded-sm px-2 py-1 font-mono text-[10px] uppercase tracking-[0.06em] ${
            leadFit.level === "HIGH"
              ? "bg-signal/10 text-signal"
              : leadFit.level === "MEDIUM"
                ? "bg-modus/10 text-modus"
                : "bg-line text-muted"
          }`}
        >
          {leadFit.level} FIT
        </span>
        {tags.map((tag) => (
          <span
            key={tag}
            className="rounded-sm border border-line px-2 py-1 font-mono text-[10px] uppercase tracking-[0.06em] text-graphite"
          >
            {tag}
          </span>
        ))}
      </div>

      <div className="mt-2">
        <p className="text-[12px] text-muted">
          Why this fit:{" "}
          {leadFit.reasons.join(" · ") || "Limited signal from answers alone."}
        </p>
      </div>

      {duplicates.length > 0 && (
        /*
         * Capped. This listed every match, which on a busy table ran to
         * dozens of lines and pushed the actual submission off the
         * screen — a hint that had become the page. The count is still
         * reported in full, so nothing is hidden, but only the few most
         * recent are spelled out.
         */
        <details
          className="mt-4 rounded-md border border-line bg-surface p-3"
          open={duplicates.length <= 5}
        >
          <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-[0.06em] text-muted marker:text-muted">
            {duplicates.length === 1
              ? "1 possible duplicate"
              : `${duplicates.length} possible duplicates`}
          </summary>
          <div className="mt-2 space-y-1">
            {duplicates.slice(0, 5).map((d) => (
              <p key={d.id} className="text-[13px] text-graphite">
                {d.companyName}, submitted{" "}
                {new Date(d.createdAt).toLocaleDateString("en-GB")}
              </p>
            ))}
            {duplicates.length > 5 && (
              <p className="pt-1 text-[12.5px] text-muted">
                and {duplicates.length - 5} more
              </p>
            )}
          </div>
        </details>
      )}

      <div className="mt-10 grid grid-cols-1 gap-10 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-10">
          <Section title="Business">
            <Field label="Company" value={diagnostic.companyName} />
            <Field label="Website" value={diagnostic.website || "Not set"} />
            <Field label="Industry" value={diagnostic.industry} />
            <Field label="Employees" value={diagnostic.employees} />
            <Field label="Locations" value={diagnostic.locations} />
            <Field
              label="Revenue range"
              value={diagnostic.revenueRange || "Not shared"}
            />
          </Section>

          <Section title="Operations">
            <Field
              label="Customer channels"
              value={diagnostic.customerChannels.join(", ")}
            />
            <Field
              label="Enquiry handling"
              value={diagnostic.enquiryHandling.join(", ")}
            />
            <Field label="Admin workload" value={diagnostic.adminWorkload} />
            {/*
              * New records carry the visitor's own answer. Records from
              * before October 2026 have only the old 1-5 rating, and are
              * shown as that, under the wording they were asked — a 3
              * still means what it meant when it was recorded.
              */}
            <Field
              label="Same steps for recurring tasks"
              value={
                diagnostic.taskConsistency ||
                (diagnostic.processStandardization != null
                  ? `${diagnostic.processStandardization} / 5 (asked as “How standardized are your processes?”)`
                  : "Not answered")
              }
            />
            <Field
              label="A colleague can take over"
              value={
                diagnostic.absenceCoverage ||
                (diagnostic.keyEmployeeDependency
                  ? `${diagnostic.keyEmployeeDependency} (asked as “How dependent is the business on specific employees?”)`
                  : "Not answered")
              }
            />
          </Section>

          <Section title="Systems">
            <Field
              label="Systems in use"
              value={diagnostic.systems.join(", ") || "None specified"}
            />
            <Field
              label="Specific tools"
              value={diagnostic.specificTools || "Not specified"}
            />
            <Field label="Connectivity" value={diagnostic.systemConnectivity} />
            <Field
              label="Spreadsheet dependency"
              value={diagnostic.spreadsheetDependency}
            />
            <Field
              label="Automation / AI usage"
              value={diagnostic.automationUsage.join(", ") || "None"}
            />
          </Section>

          <Section title="Friction">
            <Field
              label="Areas flagged"
              value={diagnostic.frictionAreas.join(", ")}
            />
            <Field
              label="Primary pain point"
              value={diagnostic.primaryPainPoint}
            />
            <Field label="Frequency" value={diagnostic.problemFrequency} />
            <Field label="Impact" value={diagnostic.impactAreas.join(", ")} />
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.06em] text-muted">
                In their words
              </p>
              <p className="mt-1.5 text-[14px] leading-relaxed text-graphite">
                {diagnostic.problemDescription || "Not provided"}
              </p>
            </div>
          </Section>

          <Section title="Priorities">
            <Field
              label="Primary interest"
              value={diagnostic.primaryInterest || "Not specified"}
            />
            <Field
              label="Top priorities (ranked)"
              value={diagnostic.priorities.join(" > ") || "Not specified"}
            />
            <Field label="Timing" value={diagnostic.timing} />
            <Field
              label="Decision context"
              value={diagnostic.decisionContext || "Not specified"}
            />
          </Section>

          <Section title="Pricing Calculator">
            <PricingCalculator
              diagnostic={diagnostic}
              onSave={savePricingOverride}
            />
          </Section>

          <Section title="Initial Profile">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {diagnostic.preliminaryProfile.map((ind) => (
                <div key={ind.label}>
                  <p className="font-mono text-[9px] uppercase tracking-[0.06em] text-muted">
                    {ind.label}
                  </p>
                  <p className="mt-1 text-[14px] font-medium text-ink">
                    {ind.value}
                  </p>
                </div>
              ))}
            </div>
          </Section>

          <Section title="Preliminary Signals">
            {diagnostic.preliminarySignals.length === 0 && (
              <p className="text-[13.5px] text-muted">
                No rule-based signals from this submission.
              </p>
            )}
            <div className="space-y-3">
              {diagnostic.preliminarySignals.map((s) => (
                <details
                  key={s.id}
                  className="rounded-lg border border-line bg-paper p-4"
                >
                  <p className="font-mono text-[9px] uppercase tracking-[0.06em] text-modus">
                    Preliminary / Requires Review
                  </p>
                  <summary className="mt-1 text-[14px] font-medium text-ink">
                    {s.headline}
                  </summary>
                  <p className="mt-3 text-[13px] leading-relaxed text-graphite">
                    {s.body}
                  </p>
                  <p className="mt-3 text-[13px] text-muted">
                    <strong>Why it matters: </strong>
                    {s.why}
                  </p>
                  <BriefBlock title="What to validate" items={s.inspect} />
                  <p className="mt-3 text-xs text-graphite">
                    <strong>Possible intervention: </strong>
                    {s.intervention}
                  </p>
                </details>
              ))}
            </div>
          </Section>

          <Section title="Client Summary">
            <p className="text-[11.5px] text-muted">
              A draft assembled from the submitted answers and preliminary
              signals. Review it for accuracy before sharing it with the client.
            </p>
            <button
              type="button"
              onClick={() => setShowSummary((v) => !v)}
              className="mt-2 text-[13px] font-medium text-modus hover:text-modus-light"
            >
              {showSummary ? "Hide" : "Generate Summary"}
            </button>
            <AnimatePresence>
              {showSummary && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mt-3 space-y-4 overflow-hidden rounded-sm border border-line bg-surface p-4"
                >
                  <div>
                    <p className="font-mono text-[9px] uppercase tracking-[0.06em] text-muted">
                      What We Understand
                    </p>
                    <p className="mt-1.5 text-[13.5px] leading-relaxed text-graphite">
                      {clientSummary.executiveSummary}
                    </p>
                  </div>
                  <BriefBlock
                    title="Where We Would Start"
                    items={clientSummary.propositionPlan}
                  />
                  <button
                    type="button"
                    onClick={() =>
                      copy(
                        clientSummaryToText(
                          clientSummary,
                          diagnostic.companyName,
                        ),
                      )
                    }
                    className="inline-flex items-center gap-1.5 text-[12.5px] text-graphite hover:text-ink"
                  >
                    <Copy className="h-3 w-3" strokeWidth={1.75} />
                    Copy as text
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </Section>

          <Section title="Review Brief">
            <button
              type="button"
              onClick={() => setShowBrief((v) => !v)}
              className="text-[13px] font-medium text-modus hover:text-modus-light"
            >
              {showBrief ? "Hide" : "Create Review Brief"}
            </button>
            <AnimatePresence>
              {showBrief && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mt-3 space-y-4 overflow-hidden rounded-sm border border-line bg-surface p-4"
                >
                  <BriefBlock title="Context" items={reviewBrief.context} />
                  <BriefBlock
                    title="What We Know"
                    items={reviewBrief.whatWeKnow}
                  />
                  <BriefBlock title="Signals" items={reviewBrief.signals} />
                  <BriefBlock
                    title="Questions To Validate"
                    items={reviewBrief.questionsToValidate}
                  />
                  <BriefBlock
                    title="Areas To Inspect"
                    items={reviewBrief.areasToInspect}
                  />
                  <BriefBlock
                    title="Possible Intervention Categories"
                    items={reviewBrief.interventionCategories}
                  />
                  <BriefBlock
                    title="Call Agenda"
                    items={reviewBrief.callAgenda}
                  />
                  <button
                    type="button"
                    onClick={() =>
                      copy(
                        reviewBriefToText(reviewBrief, diagnostic.companyName),
                      )
                    }
                    className="inline-flex items-center gap-1.5 text-[12.5px] text-graphite hover:text-ink"
                  >
                    <Copy className="h-3 w-3" strokeWidth={1.75} />
                    Copy as text
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </Section>
        </div>

        <div className="space-y-10">
          <Section title="Contact">
            <p className="text-[14px] font-medium text-ink">
              {diagnostic.firstName} {diagnostic.lastName}
            </p>
            <p className="text-[13px] text-muted">
              {diagnostic.role || "Role not specified"}
            </p>
            <div className="mt-3 space-y-2">
              <button
                type="button"
                onClick={() => copy(diagnostic.email)}
                className="flex w-full items-center justify-between rounded border border-line px-3 py-2 text-left text-[13px] text-graphite hover:border-modus"
              >
                {diagnostic.email}
                <Copy className="h-3 w-3 shrink-0" strokeWidth={1.75} />
              </button>
              {diagnostic.phone && (
                <button
                  type="button"
                  onClick={() => copy(diagnostic.phone!)}
                  className="flex w-full items-center justify-between rounded border border-line px-3 py-2 text-left text-[13px] text-graphite hover:border-modus"
                >
                  {diagnostic.phone}
                  <Copy className="h-3 w-3 shrink-0" strokeWidth={1.75} />
                </button>
              )}
              {diagnostic.website && (
                <a
                  href={
                    diagnostic.website.startsWith("http")
                      ? diagnostic.website
                      : `https://${diagnostic.website}`
                  }
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-between rounded border border-line px-3 py-2 text-[13px] text-graphite hover:border-modus"
                >
                  Open Website
                  <ExternalLink
                    className="h-3 w-3 shrink-0"
                    strokeWidth={1.75}
                  />
                </a>
              )}
            </div>
            {diagnostic.source && (
              <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.06em] text-muted">
                Source: {diagnostic.source}
              </p>
            )}
          </Section>

          <Section title="Internal Notes">
            <textarea
              value={noteText}
              disabled={noteSave === "saving"}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="Add a private note…"
              rows={3}
              className="w-full resize-none rounded-md border border-line bg-paper px-3 py-2.5 text-[13.5px] text-ink outline-none transition-colors placeholder:text-muted focus-visible:border-modus focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-modus/30 disabled:opacity-60"
            />
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={addNote}
                disabled={noteSave === "saving" || !noteText.trim()}
                className="rounded-full bg-modus px-4 py-2 text-[12.5px] font-medium text-white transition-colors hover:bg-modus-light disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-modus"
              >
                {noteSave === "saving" ? "Saving…" : "Save note"}
              </button>
              {noteSave === "error" && (
                <span
                  className="flex items-center gap-2 text-[12px] text-danger"
                  role="alert"
                >
                  Not saved — your note is still here.
                  <button
                    type="button"
                    onClick={addNote}
                    className="underline underline-offset-2 hover:text-ink"
                  >
                    Retry
                  </button>
                </span>
              )}
            </div>
            <div className="mt-4 space-y-3">
              {notes.map((n) => (
                <div
                  key={n.id}
                  className="border-t border-line pt-3 first:border-t-0 first:pt-0"
                >
                  <p className="font-mono text-[9px] uppercase tracking-[0.06em] text-muted">
                    {n.author} · {new Date(n.createdAt).toLocaleString("en-GB")}
                  </p>
                  <p className="mt-1 text-[13.5px] text-graphite">{n.body}</p>
                </div>
              ))}
              {notes.length === 0 && (
                <p className="text-[13px] text-muted">
                  No notes yet. Notes are private to MODUS and are never shown
                  to the client.
                </p>
              )}
            </div>
          </Section>

          <Section title="Activity Timeline">
            <div className="space-y-2.5">
              {activity.map((a) => (
                <div
                  key={a.id}
                  className="flex items-start gap-3 text-[12.5px]"
                >
                  <span className="w-20 shrink-0 font-mono text-muted">
                    {new Date(a.createdAt).toLocaleDateString("en-GB", {
                      day: "2-digit",
                      month: "short",
                    })}
                  </span>
                  <span className="text-graphite">{a.label}</span>
                </div>
              ))}
            </div>
          </Section>

          <Section title="Danger Zone">
            {deleteError && (
              <p role="alert" className="text-sm text-danger">
                Not deleted. Check your connection and access, then try again.
              </p>
            )}
            <HoldToConfirm
              key={deleteAttempt}
              idleLabel="Hold to Delete Diagnostic"
              holdingLabel="Deleting"
              completeLabel="Deleted"
              onConfirm={handleDelete}
            />
            <p className="mt-2 flex items-center gap-1.5 text-[11.5px] text-muted">
              <Trash2 className="h-3 w-3" strokeWidth={1.75} />
              This permanently removes the diagnostic and its notes.
            </p>
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="workspace-panel">
      <h2 className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted">
        {title}
      </h2>
      <div className="mt-3 space-y-3 border-t border-line pt-3">{children}</div>
    </section>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-1 gap-1 sm:grid-cols-[140px_minmax(0,1fr)] sm:gap-4">
      <p className="font-mono text-[10px] uppercase tracking-[0.06em] text-muted">
        {label}
      </p>
      <p className="break-words text-[13.5px] text-graphite">{value}</p>
    </div>
  );
}

function BriefBlock({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <p className="font-mono text-[9px] uppercase tracking-[0.06em] text-muted">
        {title}
      </p>
      <ul className="mt-1.5 space-y-1">
        {items.map((item) => (
          <li key={item} className="text-[13px] text-graphite">
            • {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
