"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { STATUSES, type ParsedDiagnostic } from "@/lib/admin/types";
import {
  STATUS_LABELS,
  WORKFLOW_STATUSES,
  statusLabel,
} from "@/lib/admin/status";

/**
 * The submitted-diagnostics inbox.
 *
 * Rebuilt on the MODUS surface — warm canvas, restrained cream rows,
 * green only where something is actually actionable — and given the
 * working parts it was missing: server-side pagination, a date range,
 * and real loading / empty / error states instead of a list that was
 * simply blank while it waited or when it failed.
 *
 * No decorative metrics and no sample rows. When there is nothing to
 * show, it says so.
 */

const PAGE_SIZE = 25;

type Response = {
  diagnostics: ParsedDiagnostic[];
  total: number;
  page: number;
  pageCount: number;
};

/**
 * Reads the list, retrying ONCE on a 401.
 *
 * A 401 here means the server saw no session, not a session without
 * membership — that answers 403. Both are possible; only one is worth
 * retrying.
 *
 * This exists because of a real failure: in a full suite run the list
 * answered 401 to a request carrying a valid, one-second-old session
 * token, with the same user, session and claims as a call that had
 * answered 200 a second earlier. Eight isolated attempts could not
 * reproduce it, so the cause is NOT established — but the symptom was an
 * admin being told "That didn't load" when nothing was wrong with their
 * access, and a second attempt is the proportionate answer to that
 * whatever the cause turns out to be.
 *
 * It does not hide a genuine denial. A revoked admin's retry fails the
 * same way, one request later, and the error state still appears.
 */
async function fetchList(url: string): Promise<Response> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(url, { cache: "no-store" });
    if (res.ok) return res.json();
    if (res.status !== 401 || attempt === 1) {
      throw new Error(String(res.status));
    }
    // Long enough for a token refresh in flight to land, short enough
    // that a real failure still surfaces promptly.
    await new Promise((r) => setTimeout(r, 600));
  }
  throw new Error("unreachable");
}

export default function DiagnosticsPage() {
  return (
    <Suspense fallback={<LoadingRows />}>
      <DiagnosticsInbox />
    </Suspense>
  );
}

function DiagnosticsInbox() {
  const searchParams = useSearchParams();
  const [data, setData] = useState<Response | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [q, setQ] = useState(searchParams.get("q") ?? "");
  const [status, setStatus] = useState(
    STATUSES.includes(searchParams.get("status") as (typeof STATUSES)[number])
      ? searchParams.get("status")!
      : "ALL",
  );
  const [from, setFrom] = useState(searchParams.get("from") ?? "");
  const [to, setTo] = useState(searchParams.get("to") ?? "");
  const [page, setPage] = useState(1);
  // Bumped to force a retry after an error, without changing any filter.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const refresh = () => setAttempt((value) => value + 1);
    window.addEventListener("modus:refresh", refresh);
    return () => window.removeEventListener("modus:refresh", refresh);
  }, []);

  // Any filter change returns to the first page: staying on page 4 of a
  // result set that now has one page shows an empty list that looks like
  // "no matches".
  const resetTo = useCallback(
    <T,>(set: (v: T) => void) =>
      (v: T) => {
        set(v);
        setPage(1);
      },
    [],
  );

  useEffect(() => {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(PAGE_SIZE),
    });
    if (q) params.set("q", q);
    if (status !== "ALL") params.set("status", status);
    if (from) params.set("from", from);
    if (to) params.set("to", to);

    let cancelled = false;
    const timer = window.setTimeout(() => {
      setState("loading");
      fetchList(`/api/private/diagnostics?${params.toString()}`)
        .then((json: Response) => {
          if (cancelled) return;
          setData(json);
          setState("ready");
        })
        .catch(() => {
          if (!cancelled) setState("error");
        });
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [q, status, from, to, page, attempt]);

  const rows = data?.diagnostics ?? [];
  const showing = state === "ready" && rows.length > 0;

  return (
    <div className="max-w-[1100px]">
      <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted">
        MODUS / Diagnostics
      </p>
      <h1 className="mt-2 font-serif text-[26px] leading-tight text-ink">
        Submitted diagnostics.
      </h1>

      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-graphite">
        Read the original answers, validate the signals, then record a decision.
        Status describes your workflow; it does not send a notification.
      </p>

      {/* Filters */}
      <div className="mt-7 flex flex-wrap items-end gap-3">
        <label className="relative min-w-[240px] flex-1">
          <span className="sr-only">Search diagnostics</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
          <input
            value={q}
            onChange={(e) => resetTo(setQ)(e.target.value)}
            placeholder="Company, contact, email or website"
            className="h-10 w-full rounded-md border border-line bg-surface pl-9 pr-3 text-[13.5px] text-ink outline-none transition-colors placeholder:text-muted focus-visible:border-modus focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-modus/30"
          />
        </label>

        <Field label="Status">
          <select
            value={status}
            onChange={(e) => resetTo(setStatus)(e.target.value)}
            className="h-10 rounded-md border border-line bg-surface px-3 text-[13px] text-ink outline-none focus-visible:border-modus"
          >
            <option value="ALL">All</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s] ?? s}
              </option>
            ))}
          </select>
        </Field>

        <Field label="From">
          <input
            type="date"
            value={from}
            onChange={(e) => resetTo(setFrom)(e.target.value)}
            className="h-10 rounded-md border border-line bg-surface px-3 text-[13px] text-ink outline-none focus-visible:border-modus"
          />
        </Field>
        <Field label="To">
          <input
            type="date"
            value={to}
            onChange={(e) => resetTo(setTo)(e.target.value)}
            className="h-10 rounded-md border border-line bg-surface px-3 text-[13px] text-ink outline-none focus-visible:border-modus"
          />
        </Field>

        {(q || status !== "ALL" || from || to) && (
          <button
            type="button"
            onClick={() => {
              setQ("");
              setStatus("ALL");
              setFrom("");
              setTo("");
              setPage(1);
            }}
            className="h-10 rounded-md px-3 text-[13px] text-graphite underline underline-offset-4 hover:text-ink"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Results */}
      <div className="mt-6">
        {state === "loading" && <LoadingRows />}

        {state === "error" && (
          <Panel>
            <p className="text-[14px] text-ink">That didn&apos;t load.</p>
            <p className="mt-1 text-[13px] text-graphite">
              The diagnostics list could not be fetched. Nothing has been
              changed.
            </p>
            <button
              type="button"
              onClick={() => setAttempt((a) => a + 1)}
              className="mt-4 inline-flex h-9 items-center rounded-lg workspace-primary px-4 text-[13px] font-medium transition-colors hover:bg-modus-light"
            >
              Try again
            </button>
          </Panel>
        )}

        {state === "ready" && rows.length === 0 && (
          <Panel>
            <p className="text-[14px] text-ink">
              No diagnostics match these filters.
            </p>
            <p className="mt-1 text-[13px] text-graphite">
              {q || status !== "ALL" || from || to
                ? "Try widening the date range or clearing the search."
                : "Submitted diagnostics will appear here."}
            </p>
          </Panel>
        )}

        {showing && (
          <>
            <div className="workspace-table-scroll rounded-xl border border-line">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-line bg-surface">
                    {["Company", "Contact", "Submitted", "Status"].map((h) => (
                      <th
                        key={h}
                        scope="col"
                        className="px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.08em] text-muted"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((d) => (
                    <tr
                      key={d.id}
                      className="border-b border-line/70 last:border-0 hover:bg-surface/60"
                    >
                      <td className="px-4 py-3">
                        <Link
                          href={`/private/diagnostics/${d.id}`}
                          className="text-[13.5px] font-medium text-ink underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-modus"
                        >
                          {d.companyName}
                        </Link>
                        <p className="mt-0.5 text-[12px] text-muted">
                          {d.industry}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-[13px] text-graphite">
                        {d.firstName} {d.lastName}
                        <p className="mt-0.5 text-[12px] text-muted">
                          {d.email}
                        </p>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-[13px] text-graphite">
                        {new Date(d.createdAt).toLocaleDateString("en-GB", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
                      </td>
                      <td className="px-4 py-3">
                        <StatusPill status={d.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Pagination
              page={data!.page}
              pageCount={data!.pageCount}
              total={data!.total}
              shown={rows.length}
              onPage={setPage}
            />
          </>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-muted">
        {label}
      </span>
      {children}
    </label>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-line bg-surface px-5 py-6">
      {children}
    </div>
  );
}

/** Skeleton rows, so the inbox has a shape while it loads. */
function LoadingRows() {
  return (
    <div
      className="overflow-hidden rounded-md border border-line"
      aria-busy="true"
      aria-live="polite"
    >
      <span className="sr-only">Loading diagnostics…</span>
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-4 border-b border-line/70 px-4 py-3.5 last:border-0"
        >
          <span className="h-3 w-[22%] animate-pulse rounded bg-line/70" />
          <span className="h-3 w-[26%] animate-pulse rounded bg-line/50" />
          <span className="h-3 w-[14%] animate-pulse rounded bg-line/50" />
          <span className="h-3 w-[12%] animate-pulse rounded bg-line/40" />
        </div>
      ))}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const known = WORKFLOW_STATUSES.includes(
    status as (typeof WORKFLOW_STATUSES)[number],
  );
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.08em] ${
        status === "NEW"
          ? "border-modus/30 bg-modus/5 text-modus"
          : known
            ? "border-line bg-surface text-graphite"
            : // A value outside the workflow, shown as it is rather than
              // relabelled into one of the four.
              "border-line-strong/40 bg-paper text-muted"
      }`}
    >
      {statusLabel(status)}
    </span>
  );
}

function Pagination({
  page,
  pageCount,
  total,
  shown,
  onPage,
}: {
  page: number;
  pageCount: number;
  total: number;
  shown: number;
  onPage: (p: number) => void;
}) {
  const first = (page - 1) * PAGE_SIZE + 1;
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
      <p className="text-[12.5px] text-muted">
        {total === 0
          ? "No results"
          : `${first}–${first + shown - 1} of ${total}`}
      </p>
      {pageCount > 1 && (
        <div className="flex items-center gap-2">
          <PageButton disabled={page <= 1} onClick={() => onPage(page - 1)}>
            Previous
          </PageButton>
          <span className="px-1 text-[12.5px] text-graphite">
            Page {page} of {pageCount}
          </span>
          <PageButton
            disabled={page >= pageCount}
            onClick={() => onPage(page + 1)}
          >
            Next
          </PageButton>
        </div>
      )}
    </div>
  );
}

function PageButton({
  disabled,
  onClick,
  children,
}: {
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="h-9 rounded-full border border-line bg-surface px-3.5 text-[13px] text-ink transition-colors hover:border-line-strong disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-modus"
    >
      {children}
    </button>
  );
}
