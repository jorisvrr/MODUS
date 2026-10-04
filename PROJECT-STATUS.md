# MODUS — project status

Updated after each task. Separates **code complete**, **dashboard
configured** and **connected and verified** — they are not the same thing.

Last updated: 2 October 2026.

---

## Deployment readiness: DEPLOYED (3 October 2026)

8 commits unpushed. The previous blocker is resolved.

**Previously:** a production server with no Clerk keys returned 500 on `/`
and `/diagnostic`. **Now,** measured with no environment at all:

| Route | Result |
|---|---|
| `/`, `/diagnostic`, `/pricing`, `/legal`, `/privacypolicy` | **200** |
| `/sitemap.xml`, `/robots.txt` | **200** |
| `/private`, `/private/diagnostics` | **307** to login |
| `/api/private/diagnostics` | **401** `{"error":"Unauthorized."}` |

So a misconfigured deployment degrades instead of going down, and the
protected surfaces fail closed rather than opening. Production keys being
present makes it better, not merely functional.

Readiness detail in §4.

---

## 1. Verified — measured, not asserted

| Area | Evidence |
|---|---|
| Postgres migration | All 4 original diagnostics in Supabase, **0 missing** (compared against the export by id). Importer idempotent: a second run inserts 0. |
| Orphaned rows | 347/356 activity events and 2/3 notes referenced deleted diagnostics (SQLite does not enforce FKs). Excluded, written to `prisma/export/orphaned-rows.json`, never silently dropped. |
| RLS — SQL layer | On the live Supabase DB: **10/10** app tables, 10 policies. Owner sees own row; other signed-in user **0**; anon **denied**; admin sees all 4; `AdminMember` denied to ordinary accounts; planting a row owned by someone else **rejected**; editing submitted answers affects **0 rows**. |
| RLS — browser path | Through Supabase PostgREST with a **genuine development** Clerk session token: anon denied on `Diagnostic`/`AdminMember`/`Profile` (`42501`); authenticated user saw **exactly 1** owned record with guest and other-user rows hidden. Test ownership reverted; all 4 originals are guest/unowned again. |
| Migration history | `public._prisma_migrations`: RLS on, **0 policies** (deny-all), grants only `postgres`/`service_role`, `anon` and `authenticated` both denied. Now applied by a repeatable, idempotent migration, not by hand. `prisma migrate status` against Supabase: 4 migrations, up to date. |
| Idempotent submission | Same `Idempotency-Key` twice → one row, same id and `contextToken`, `deduplicated: true`. |
| Notification enqueue | One outbox row per submission, recipient `hello@withmodus.co`, enqueued only **after** commit. |
| Authorization logic | 9 unit tests: anonymous → 401; signed-in without membership → 403; membership query always filters `revokedAt: null`; client entitlement is a separate lookup and never implies admin; guest records never match an ownership check. |
| Environment isolation | Dev server, Playwright and Prisma CLI all target local Postgres; only the two Supabase scripts read `.env.supabase.local`. |
| Regression | 45 Playwright passed / 1 failed / 1 skipped + 9 vitest. The single failure is pre-existing, proven by reproducing it on baseline `643cfad`. |

---

## 2. Configured in a dashboard but NOT verified in the app

Configuration is not evidence of working behaviour.

- **Clerk production instance** (`clerk.withmodus.co`), DNS, JWKS, Supabase trust for the production issuer. No production token has been exercised against PostgREST — all browser-path evidence so far uses the **development** issuer.
- **Google sign-in**: OAuth client created, Clerk shows enabled, audience in **Testing** with `withmodus@gmail.com` as the sole test user. **Never signed in through the deployed app.**
- **Resend**: domain `notifications.withmodus.co` and keys reported configured. **No mail has been sent or received.**
- **Vercel variables**: names recorded in `MODUS_PROVIDER_SETUP.md`. Values not inspected.

---

## 3. Known limitations and risks

- **Application-enforced MFA is intentionally deferred** (user decision, 2 Oct 2026). `ADMIN_MFA_REQUIRED` defaults to false. The enforcement path is retained and tested so enabling it is a one-line change. Google two-step verification protects the Google login only and is **not** application-enforced MFA. This is a recorded limitation, never to be reported as implemented or as verified.
- **No admin exists yet.** No production Clerk identity has been verified or granted. Signup grants nothing.
- **Preview shares the production database** per the latest Vercel screenshot. Do not run destructive fixtures or cleanup against it.
- ~~**The Clerk admin path is not wired to any route.**~~ **Resolved** —
  `/private` and every private API now run on Clerk plus `AdminMember`;
  the password mechanism is deleted. See §11.
- **GitHub sign-in is offered but unconfigured** on the auth screens. A
  Clerk dashboard setting, not code — disable it in Clerk Production or it
  presents a broken path. See §14.
- **Live notification retry is unverified** — with no mail provider the
  worker skips rather than attempts, so no real failure path runs. Backoff
  and give-up bounds are covered at unit level only. See §10.
- **Diagnostic graphic — all stages active and verified through the real
  journey.** See §9 for the evidence and the two remaining limitations.

  | Stage | State |
  |---|---|
  | Entry sphere | **Active**, desktop ≥1024px |
  | Topic layers (question stages) | **Active**, desktop ≥1024px |
  | Review stack (review / submitting / submit error) | **Active**, desktop ≥1280px |
  | Mark closure (result / profile) | **Active**, result ≥1280px, profile ≥1024px |

  The earlier note here said these were unmounted because running the
  scene through the question and submit screens destabilised submission.
  That was a misattribution: the cause was a stale-coordinate race in the
  test harness (§8), not the scene. With it fixed, the full journey runs
  with the scene mounted throughout, and the sticky-panel occlusion is
  resolved rather than tolerated — see §9.

- ~~**The estimate-screen transition is flaky under load.**~~ **Resolved** — it was a stale-coordinate race in the test harness, not a product defect. Diagnosed, measured and fixed; see §8. `workers: 1` stays, for the separate WebGL-contention reason.
- **Auth screen visual parity unverified** against the MODUS reference.

---

## 4. Deployment readiness checklist

| Item | State |
|---|---|
| Build succeeds with no env vars | Yes (exit 0) |
| Runtime survives missing Clerk keys | **Yes.** Public 200, protected 307/401 |
| Clerk production keys in Vercel Production | User-reported added, copied from the production instance. Not independently verified |
| `DATABASE_URL`/`DIRECT_URL` in Vercel | Reported added; migrations already applied to Supabase |
| Guest diagnostic works without an account | Yes, locally (`/diagnostic` 200 signed out) |
| Admin inbox rejects anonymous access | Yes, locally |
| Mail worker scheduled in deployment | **Yes, Hobby-compatible.** Prompt drain via `after()` on each submission + one daily sweep at 07:00 in `vercel.json`. Worker requires `CRON_SECRET`; rejects everything without it |
| Production issuer verified end to end | **No** |

---

## 5. Next actions, in order

1. Confirm Clerk **production** keys are present in Vercel Production, then push and deploy.
2. Sign in at the deployed site with **Continue with Google** as `withmodus@gmail.com`.
3. Find that user in Clerk **Production → Users**, verify the identity, take its `user_…` id.
4. Grant admin explicitly: `node scripts/grant-admin.mjs user_…` against the production database. Never from an email match or provider.
5. Test in production: admin reaches the inbox; a second ordinary account and an anonymous request are both rejected on page, API and mutation; revocation takes effect on the next request.
6. Agree a test arrangement before sending to `hello@withmodus.co`; confirm **user-reported receipt**, not just provider acceptance.
7. ~~Finish the sphere→stack graphic~~ **done, see §9**; the auth-screen visual comparison is still open.

---

## 6. Unresolved policy facts

Tracked in `MODUS_POLICY_RESOLUTION.md` and unchanged: retention periods,
international transfers, the authentication provider name in the published
policy, account deletion, and the final provider/region list. None may be
guessed; all are release blockers for the final policy text, not for code.


---

## 7. Notification worker — scope and guarantees

**`CRON_SECRET` gates the scheduled sweep only.** The submission-triggered
drain calls `dispatchPending()` as a direct function import inside
`after()` — it makes no HTTP request, so it never passes through the
authenticated endpoint. A deployment with no `CRON_SECRET` still delivers
promptly on submission; it loses only the daily retry sweep, and the
endpoint rejects every caller rather than becoming public.

Verified by test (9 cases, `src/lib/notifications/__tests__/outbox.test.ts`):

| Guarantee | Result |
|---|---|
| Mail failure keeps the record | Row stays `PENDING`, `attempts` incremented, error recorded, `sentAt` still null |
| Failure backs off | Each retry schedules strictly later than the last |
| Permanent failure stops | `FAILED` only after the attempt bound, so a bad address is not retried forever |
| Enqueue failure never breaks submission | Resolves silently — a committed record is never reported as failed |
| Repeated event collapses | Three enqueues of the same submission → **one** row |
| Delivered once | Second sweep sends nothing; `sendMail` called exactly once |
| Re-enqueue after success | Does not resurrect a sent notification |
| No provider configured | Reports the backlog, sends nothing, keeps rows `PENDING` |
| Header injection | CR/LF stripped from the subject |

### What the "skipped" count was

The `{"skipped": 74}` from the worker test is **PENDING rows in the local
development database** (`modus_dev` @ localhost), accumulated by repeated
Playwright runs submitting diagnostics. It is not production data and not
a backlog of real leads.

- Local `modus_dev` outbox: 107 PENDING at last count, all test artefacts.
- **Supabase outbox: 0 rows.**

`skipped` means "pending and not attempted, because no mail provider is
configured" — the worker reporting the backlog rather than pretending to
deliver.

## 8. The estimate-screen flake — found and fixed

**Resolved.** It was a defect in the test harness, not in the product.

### What it was

Five call sites hand-rolled the hold-to-confirm gesture: read
`boundingBox()`, then `mouse.move` to the measured centre, `mouse.down`,
wait, `mouse.up`. The review screen animates in, so those coordinates
were stale by the time the press landed.

Traced against the running app, from the instant `toBeVisible()` resolves
on the review screen:

```
t=   0ms  scrollY=122  box.y=619
t= 300ms  scrollY=123  box.y=619
t= 400ms  scrollY=123  box.y=615
t= 500ms  scrollY=123  box.y=606
t= 600ms  scrollY=123  box.y=603   <- settles
```

`scrollY` is flat across the whole trace, so this is the entrance
animation, not scrolling. The button is 53.5px tall and drifts 16px
upward. A press aimed at the t=0 centre (645) against the settled box
(603–656.5) has about 11px of slack: usually lands, occasionally not.
Under CPU contention — the suite already runs `workers: 1` because these
pages hold WebGL contexts — not.

A missed press landed on the page behind the button. Nothing threw. No
hold began, no submission was sent, and the test waited out its 15s
timeout for an estimate screen that could never arrive. Three of the five
sites also wrapped the press in `if (box)`, so a null box skipped the
gesture silently and produced that same timeout. **That silent skip is
why this always presented as "ESTIMATE not visible" and never as
anything to do with the button** — which is what kept it unexplained
across several checkpoints.

### The fix

`e2e/holdToSubmit.ts`, one shared helper, replacing all five copies. It
uses `locator.hover()`, whose actionability check waits for the element
to be visible, enabled, receiving events, and **stable** (unchanged
bounding box across two consecutive animation frames) before positioning
the pointer. The race is removed rather than the margin widened; there is
no coordinate left for the animation to invalidate.

Two earlier attempts are recorded because they were wrong and the reason
is useful: `scrollIntoViewIfNeeded` before measuring (the probe showed
the button was already inside the viewport, so this fixed nothing), and
`after()` being the cause (disabling it made things worse — 2 failures
vs 1).

### Evidence

- `--repeat-each=3` across all three submit specs: **30/30 passed.**
- Full suite: **46 passed, 1 skipped** (the skip needs
  `E2E_ADMIN_PASSWORD`). Previously 45 passed.
- `npx tsc --noEmit`: clean.
- `npx vitest run`: 50 passed.

Three clean repeats is good evidence, not proof, for a defect that was
intermittent. The mechanism is now understood and measured, which the
repeat count alone would not give.

### What this unblocks

Re-enabling the diagnostic graphic's later stages (topic layers, review
stack, mark closure) was blocked on this. They have since been re-enabled
and verified through the real journey — see §9. (At the time of writing
this section they were still **unmounted and unfinished**,
and their passing unit tests covered the state mapping only.)

`workers: 1` stays. It was set for GPU contention between concurrent
WebGL contexts, which is a separate and still-real constraint.

## 9. Diagnostic graphic — re-enabled and verified

All four stages are mounted and driven by the real screen and step. The
unit tests were never evidence that they worked: they assert the state
mapping only. What follows was verified against the running app.

### Verified through the journey

`e2e/diagnosticScene.spec.ts`, at 1440×900:

- **Every stage mounts and renders.** Entry sphere, topic layers, review
  stack, and the closure on both `result` and `profile`.
- **The active topic tracks the real step.** Asserted on the projected
  labels' own inline opacity, which is written by the render path — so it
  reports what actually rendered, not what the mapping function returns.
  Step 1 emphasises `Business`, step 2 `Customers`, and pressing Back
  resolves to the earlier layer rather than queueing.
- **Labels belong to the question stages only.** Naming topics at entry
  would imply progress that has not happened; the stack and closure are
  unlabelled.
- **Submission failure holds the review stack.** The scene never
  anticipates success: on a 500 it stays in the stack, stays unlabelled,
  and the estimate screen is asserted absent.
- **Reduced motion advances the stages without animating them.** This
  caught a real bug — see below.
- **Below each layout's threshold nothing is mounted**, so there is no
  WebGL context at all, rather than a hidden canvas.
- **The scene stays clear of the content.** Asserted geometrically
  against the fields, the question heading, the submit control, every
  per-row EDIT control, and each screen's heading. Headings are measured
  by their rendered glyphs (via `Range.getClientRects`) rather than their
  border box, because a block heading fills its column even when its text
  does not.

Screenshots: `e2e-screens/` (gitignored), 11 captures across the journey,
including the reduced-motion stages. Each is taken after the stage has
settled and with the page scroll parked, so it shows what a visitor sees
rather than a mid-morph frame.

### Three bugs this found

1. **Reduced motion froze the scene.** With no frame loop running,
   nothing picked up a stage change — a visitor who prefers reduced
   motion would have seen the entry sphere for the entire journey. It was
   invisible while the scene only mounted on `intro`, where the stage
   never changes. The composition is now re-rendered once per stage
   change: no motion, but not no information.

2. **The review column was never the width it was written to be.**
   `<Container className="max-w-2xl">` could not work — `Container`
   already sets `max-w-site`, a custom `maxWidth` extension, and Tailwind
   emits extensions after the core scale, so `max-w-site` won. The review
   column rendered at the full 1200px, which is why each row had its
   label at the far left and its `EDIT` control ~1200px away at the far
   right. The narrow wrapper is now nested inside, per the pattern
   `Container` documents.

3. **Centring that column put the submit control under the consent
   banner.** The banner is fixed bottom-centre; centring the review
   column moved the primary action beneath it. Playwright's actionability
   check caught it immediately, where the old hand-rolled press would
   have clicked the banner and reported a timeout somewhere else
   entirely. The column is left-aligned, matching the intro and question
   screens.

The scene was also pinned to `right-0` — the viewport edge, not the
content container — so on a wide screen it sat 120px right of the content
and its projected labels were clipped by the window. It now mirrors the
page `Container`.

### The sticky panel, resolved

The topic layers share the right column with `ProfilePanel`, which was
`sticky top-24`. That made the two impossible to separate with any fixed
offset, because the panel moves relative to the document: at the top of
the page it sits at its natural y (199 at 1440x900, bottom 723); once
stuck it rises to y=96 (bottom 621). Anchoring the layers to the stuck
bottom overlapped at scroll 0; anchoring to the natural bottom left 121px,
below anything worth rendering.

So the panel stops following the scroll **only while the layers are shown
beside it** (`<ProfilePanel sticky={false}>` — it still sticks at
viewports where the layers are not drawn). Both are then anchored in the
document, and the layers sit at the panel's measured bottom edge. That
measurement is taken from the column's top plus the panel's height, not
the panel's live rect, which would feed back on itself since the
measurement is what decides whether the panel is sticky at all. A
`ResizeObserver` keeps it current as the panel grows with the answers
(588px to 635px at 1024 across the six steps). Where the column cannot
give the layers at least 170px, they are not drawn.

`position: fixed` would be the obvious tool and does not work here:
`PageTransition` leaves `filter: blur(0px)` on an ancestor, and a filter
creates a containing block for fixed descendants. Verified with a probe —
a fixed element scrolled with the page instead of staying put.

**Point identities are preserved across every stage.** The scene is never
unmounted, including on the frame before the band has been measured —
returning `null` there would have taken the WebGL context and every point
position with it, and the four stages would then read as four unrelated
illustrations rather than one object being reorganised. The spec tags the
live canvas at the entry screen and re-checks that tag at the layers, the
stack and the closure, so a remount fails the test instead of passing
quietly.

### Remaining limitation

**The review-family and result stages need ≥1280px**, not 1024px: those
layouts are a narrow column or a dense grid whose only free space is the
page gutter. Between 1024 and 1280 the entry sphere, the topic layers and
the profile closure appear; the review stack and the result closure do
not. Asserted at all three widths rather than assumed.

### Evidence

- `e2e/diagnosticScene.spec.ts`: **7 tests** — the journey, the submission
  failure, reduced motion, the mount thresholds, and the whole flow
  captured and asserted at 1024 / 1280 / 1440.
- Panel/layer clearance asserted at the top of the page, half way down and
  scrolled to the bottom, on more than one step, at every width where the
  layers are drawn.
- Scene identity asserted across sphere → layers → stack → closure.
- Full e2e suite: **60 passed, 1 skipped** (61 total); `tsc --noEmit` clean;
  `vitest run` 50 passed.
- Submit specs plus the scene spec at `--repeat-each=2`: **34/34**.
- `workers: 1` unchanged, as asked.
- Screenshots: `e2e-screens/` (gitignored).

## 10. Notifications — what CRON_SECRET does and does not gate

**It gates the scheduled worker only.** Verified both ways.

- The submission route imports `dispatchPending` directly and calls it
  inside `after()` (`src/app/api/diagnostic/route.ts`). That is an
  in-process function call, not an HTTP request to the cron endpoint, so
  it never reaches the secret check. A submission still enqueues and still
  attempts prompt delivery with `CRON_SECRET` unset.
- `src/app/api/cron/notifications/route.ts` is the only reader of
  `CRON_SECRET`, and with none configured it rejects everything —
  including a request carrying Vercel's own cron header.

Live, against the running app:

| Request | Result |
|---|---|
| No credentials | **401** |
| Wrong secret | **401** |
| `x-vercel-cron: 1` alone | **401** |
| Correct secret | 200 `{"ok":true,"sent":0,"failed":0,"skipped":199}` |

`skipped` is the pending backlog in the local `modus_dev` database (test
artefacts from repeated Playwright runs), reported rather than pretended
delivered because no mail provider is configured locally.

### Duplicate prevention — verified live

Two submissions with the same `Idempotency-Key`:

- Second response returned the **same record id** with
  `deduplicated: true`.
- **One** diagnostic row and **one** outbox row for that submission.
- Inserting a second outbox row with the same `dedupeKey` is rejected by
  the database: Prisma `P2002`, `target: ["dedupeKey"]`.

The first run of that last check was **vacuous** — it failed on a missing
required column rather than the constraint, and reported "rejected"
anyway. Re-run with a complete row, it fails on the constraint itself.
Worth recording, because a dedupe check that passes for the wrong reason
is worse than none.

### Retries — unit-level only

The nine tests in `src/lib/notifications/__tests__/outbox.test.ts` cover
retention and backoff: a mail failure keeps the row `PENDING`, increments
`attempts`, records `lastError`, schedules `nextAttemptAt` in the future,
backs off further each attempt, gives up only after a bound, and a sent
row is never reconsidered or resurrected.

**Live retry behaviour is still unverified**, and cannot be verified here:
with no mail provider configured the worker skips rather than attempts, so
no real failure path runs. This is the same gap as the unconfirmed
delivery receipt at `hello@withmodus.co`.

## 11. /private is now wired to Clerk

The admin surface was guarded by a shared password in an encrypted
cookie, while `requireAdminSession`, `isAdmin` and `AdminMember` sat
implemented, unit-tested and uncalled. That is closed: every admin page,
API and mutation is now gated on Clerk identity plus a current,
server-controlled `AdminMember` row, re-read per request.

### Code complete

| Surface | Before | Now |
|---|---|---|
| `/private` and its pages | `isAuthenticated()` session cookie | `requireAdminSession()`, redirect to `/sign-in` |
| `/api/private/*` | `requireAuth()` → session cookie | `requireAuth()` → Clerk + `AdminMember` |
| `/private/login` page | Password form | Redirect to `/sign-in` |
| `/api/private/login` | Verified a password | **Deleted** |
| `/api/private/logout` | Cleared the session cookie | **Deleted** — Clerk owns sign-out |
| `src/lib/auth/session.ts` | Iron-session | **Deleted** |
| `src/lib/auth/rateLimit.ts` | Login-attempt throttling | **Deleted** |
| `LoginForm.tsx` | Password UI | **Deleted** |

Removed, not disabled: there is no second way in left to drift out of
sync. The `LoginAttempt` table is left in place — dropping it is a
migration and the rows are a record, not a credential.

The admin shell's Settings panel used to report Argon2id hashing, the
session cookie and failed-login counts. Those described a door no longer
on the building, so that panel now reports the authentication provider,
that authorization is an `AdminMember` row re-read per request, that
revocation applies on the next request, and — stated plainly rather than
omitted — that multi-factor is **not enforced**.

### Verified

`src/lib/auth/__tests__/privateRoutes.test.ts` drives the **real route
handlers**, not the helpers in isolation:

- Anonymous → **401**.
- Ordinary signed-in account → **403**, with a body identical to the 401
  so the surface cannot be probed to discover who holds admin.
- Active admin → **200**.
- Revoked admin → **403 on the very next request**, with no sign-out and
  no cache to wait out.
- Provider unconfigured → **401**: fails closed.
- Private notes (`POST .../notes`) and the record detail and delete
  routes → 403 for an ordinary account, 401 for anonymous.

`e2e/private.spec.ts` covers what a browser can assert without a secret,
and now runs on every pass instead of being skipped: four admin pages
each **307** to `/sign-in`, three private APIs each **401** with no
submission fields in the body, `/private/login` redirects to Clerk, and
`/api/private/login` returns **404** — the handler is gone.

The old `E2E_ADMIN_PASSWORD` test is deleted with the mechanism it tested.
Driving a real Google sign-in from Playwright needs Clerk's test tooling
and live credentials, so the signed-in cases are covered server-side as
above. **The suite now has no skipped tests.**

### Still requires deployment to verify

- Production Clerk token acceptance through PostgREST. The genuine
  evidence to date used the **development** issuer.
- The production Clerk user id for `withmodus@gmail.com`, which does not
  exist until the first production Google sign-in. It must be read from
  the production instance and granted explicitly via
  `scripts/grant-admin.mjs`. **The development user id must not be
  reused.** Access is never granted by email match, by Google sign-in, by
  being first to sign up, or by anything the client supplies.
- MFA remains **intentionally deferred** by your decision. All other
  membership and authorization protections are retained.

## 12. Admin opens in a second tab

After sign-in, the MODUS tab stays where it is and the admin inbox opens
beside it — for administrators only, decided by the server.

`GET /api/admin/status` answers only about the caller's own verified
session. It takes no user id, so it cannot be asked about anyone else,
and "not signed in" and "signed in without membership" return the same
`{ admin: false }`.

`AdminInboxLauncher` (mounted in the marketing layout) probes once, and
on `{ admin: true }` opens `/private` with `window.open`. Specifically:

- **Popup blocking is expected**, not an edge case: a `window.open` that
  is not tied to a user gesture is routinely blocked, which is exactly
  the case straight after an OAuth redirect. When blocked, a dismissible
  **"Open admin inbox"** link is shown instead — a real anchor, so the
  click is a gesture and always opens.
- **No repeat tabs.** The outcome is recorded per account in
  `sessionStorage`, so a refresh or a later navigation does not open a
  second tab. If storage throws, the attempt is treated as already
  handled rather than retried.
- **Never from inside `/private`**, which would spawn a tab per load.
- **Ordinary users and signed-out visitors** get nothing; one cached
  probe, then silence.
- **The tab grants nothing.** `/private` re-checks identity and
  membership on every request, so a tab opened by any means still lands
  on sign-in unless the membership is real and current.

## 13. The live /private error — diagnosed

**Not caused by the unpushed work.** The deployed commit is `611be43`;
HEAD is 17 commits ahead and nothing has been pushed.

The actual exception, reproduced by checking out `611be43` into a
worktree and running it with no `SESSION_SECRET`:

```
⨯ Error: SESSION_SECRET is missing or too short. Set a 32+ byte secret in .env
    at secret (src/lib/auth/session.ts:34:11)
    at sessionOptions (src/lib/auth/session.ts:43:15)
    at getSession (src/lib/auth/session.ts:56:51)
    at async isAuthenticated (src/lib/auth/session.ts:60:19)
    at async PrivateAppLayout (src/app/private/(app)/layout.tsx:12:9)
```

Live behaviour matches that signature exactly:

| Route | Live status |
|---|---|
| `/` | 200 |
| `/diagnostic` | 200 |
| `/private` | **500** |
| `/private/login` | **500** |
| `/api/private/overview` | **500** |

`/api/private/overview` is the tell: it is built to answer **401** to an
anonymous caller and instead throws, because `requireAuth()` →
`isAuthenticated()` → `getSession()` raises before any authorization
decision is reached. The public site is unaffected, which rules out a
build or database-wide fault.

**Honest limit:** the local digest is `385869121`, not the live
`2989066277`. Digests are build-specific, so this confirms the code path
and failure mode, not that specific production instance. Definitive
confirmation needs the Vercel runtime log for that request — I am not
authenticated to the Vercel CLI and this session cannot run the OAuth
flow, so **please confirm from Vercel → Logs**, or simply check whether
`SESSION_SECRET` is set in Production.

**Either way this is already fixed at HEAD, twice over:** the guard
`sessionSecretAvailable()` was added after the deployed commit, and the
Clerk migration deletes `session.ts` entirely — `/private` no longer
reads `SESSION_SECRET` at all. No fake-login bypass was introduced.

## 14. Auth screens — styled and verified

`/sign-in` and `/sign-up` were bare `<SignIn />` on a white flex
container: Clerk's card, Clerk's typeface, Clerk's blue button. They now
sit on the MODUS surface — warm ground `#D7D7D0`, the bare ink mark
linking home, the serif display face, a cream card and a rounded MODUS
green action.

Asserted against the rendered page at **1440×900 and 390×844**, for both
routes:

- `body` background is exactly `rgb(215, 215, 208)`.
- The bare mark renders and links home.
- The `h1` resolves to the serif stack, so the font actually loaded.
- The primary action computes to `rgb(30, 59, 46)` with white label text.
- Keyboard focus produces a visible indicator, not a suppressed default.
- The guest diagnostic stays reachable from the auth screen.

Screenshots: `e2e-screens/auth-{sign-in,sign-up}-{desktop,mobile}.png`.

### Two bugs the screenshots caught that the assertions did not

1. **The primary button was invisible** — white label on a transparent
   background. Clerk's `appearance.variables.colorPrimary` injects its own
   `--accent` custom property onto its subtree, shadowing the MODUS token
   of the same name, so `rgb(var(--accent))` resolved to `rgb(#1E3B2E)`,
   which is invalid and was dropped. The border and text colour in the
   same rule applied normally, which made it look like a cascade problem.
   Fixed with `--modus-*` aliases computed on `:root`. A separate earlier
   attempt failed for a different reason worth recording: Tailwind classes
   passed through `appearance.elements` live in a `.ts` file, and only
   those utilities already used elsewhere in the project were ever
   emitted.
2. **The consent banner covered the footer links**, so "run a diagnostic
   as a guest" could not be clicked until consent was answered. The screen
   now reserves space for the banner.

### Not fixable from code

**GitHub is still offered as a sign-in provider** on both screens while
being unconfigured — it is a Clerk dashboard setting. It should be
disabled in Clerk Production, or it will present a broken path to anyone
who clicks it.

## 15. Notifications and provider configuration

### Code complete

The three environment variable names in the code match what you reported
saving: `FORM_NOTIFICATION_TO` (recipient, defaulting to
`hello@withmodus.co`), `RESEND_API_KEY` and `MAIL_FROM`. Mail is treated
as configured only when **both** `RESEND_API_KEY` and `MAIL_FROM` are
present.

### Verified live, against the running app

- `CRON_SECRET` gates the scheduled worker **only**. The submission path
  imports `dispatchPending` directly and calls it inside `after()` — an
  in-process call that never reaches the secret check.
- Unauthorized worker requests rejected: no credentials **401**, wrong
  secret **401**, bare `x-vercel-cron` header **401**. Correct secret 200.
- Duplicate prevention: same `Idempotency-Key` returned the same record id
  with `deduplicated: true`; one diagnostic row, one outbox row; a second
  outbox row with the same `dedupeKey` rejected with Prisma `P2002` on
  `["dedupeKey"]`.

### Not verified, and cannot be here

- **Live retry and backoff.** With no mail provider configured locally the
  worker skips rather than attempts, so no real failure path runs. Covered
  at unit level only (retention, backoff growth, give-up bound, no
  resurrection, no double send).
- **Actual inbox receipt at `hello@withmodus.co`.**
- **Scheduled execution on Vercel.**
- **Whether `CRON_SECRET` is saved in Vercel Production.** I cannot read
  Vercel's environment from here. Please confirm it is **present** — do
  not send the value.

Per your instruction, no production submission or test email has been
created. Both need an explicit test arrangement from you.

## 16. Database safety — re-verified

- Local commands target `localhost:5432/modus_dev`; the production
  connection strings remain isolated in `.env.supabase.local`, loaded
  explicitly by the Supabase scripts. Verified by inspecting each file's
  host without printing credentials.
- Against production, read-only: **4 migrations found, schema up to
  date.**
- `public._prisma_migrations`: RLS **enabled**, **0 policies** (RLS on
  with no policy is deny-all), and **no grants** to `anon`,
  `authenticated` or `public`. Denial proven by actually attempting a read
  under each browser role — both were refused. `prisma migrate status`
  still works, because it connects as the table owner and
  `FORCE ROW LEVEL SECURITY` is deliberately not set.
- The four original diagnostics and the separately recorded orphaned rows
  are untouched.

## 17. Deployment, 3 October 2026 — results

Pushed `611be43..0504f33` and deployed. Authorized by the user, including
one clearly-labelled synthetic production diagnostic.

### The first deployment failed, and not for the reason I guessed

`c0374c7` failed in **three seconds**, before compiling:

```
Error: Invalid vercel.json - `crons[0]` should NOT have additional property `comment`. Please remove it.
```

I had attributed the delay to the GitHub repository rename
(`jorisvrr/modus` → `jorisvrr/MODUS`) preventing the integration from
firing. That was wrong: the deployment was triggered normally and failed
on schema validation. `vercel.json` accepts only `path` and `schedule` in
a cron entry; the explanatory comment moved to
`MODUS_PROVIDER_SETUP.md` §3c, together with the reason it cannot live in
that file.

Because the failed build never reached compilation, it proved nothing
about the new code. A full `next build` was therefore run locally before
pushing the fix, and succeeded — including `/sign-in`, `/sign-up`,
`/api/admin/status` and the rewired `/private` routes.

`0504f33` deployed successfully.

### Verified live (`scripts/verify-production.mjs`)

**Public and guest routes** — `/`, `/diagnostic`, `/pricing`,
`/how-it-works`, `/legal`, `/privacypolicy`, `/sitemap.xml`,
`/robots.txt` all **200**.

**Admin surface closed** — `/private`, `/private/diagnostics`,
`/private/settings` each **307** to
`/sign-in?redirect_url=%2Fprivate`. `/api/private/diagnostics`,
`/api/private/overview`, `/api/private/diagnostics/export` each **401**
with no submission fields in the body. `/api/admin/status` returns
`{"admin": false}` to an anonymous caller. The §13 `SESSION_SECRET` 500
is gone.

**The password endpoint has no handler.** Worth recording precisely,
because the first check reported this as a failure and it was the check
that was wrong: a POST to `/api/private/login` returns **200** in
production, since Next renders the not-found *page* for a POST to a path
with no handler. `x-matched-path` is `/_not-found`, the body is the 404
page, and **no session cookie is issued**. A GET returns 404. Both the
script and `e2e/private.spec.ts` now assert "no handler ran and no
session was issued" rather than a status code, which is the property that
actually matters and which does not differ between dev and production.

**Notification worker** — no credentials **401**, wrong secret **401**,
bare `x-vercel-cron` header **401**.

**Guest submission, persistence and safe retry** — one synthetic record
created; a retry with the same `Idempotency-Key` returned the **same
record id** with `deduplicated: true`; the table went from 4 rows to
exactly 5; **all four original diagnostics preserved**.

**Notification delivery** — exactly one outbox row for the submission,
`status=SENT`, `attempts=1`, `recipient=hello@withmodus.co`, `sentAt`
14:31:47 CEST, no error. The provider accepted it; **receipt in the
inbox is the user's to confirm.**

### The synthetic record

| | |
|---|---|
| id | `cmusdftjk0000js04pm4tad9o` |
| company | `SYNTHETIC TEST RECORD — MODUS deployment check` |
| email | `synthetic-test+2026-10-03T12-31-44-652Z@withmodus.co` |

No real customer information. It is the fifth row; the four originals are
untouched. Remove it whenever you like — it is identifiable by the
company name or the `synthetic-test+` email prefix.

### Still blocked on the first Google sign-in

The production Clerk instance currently holds **0 users**, confirmed
through the Clerk Backend API with the production key. Until
`withmodus@gmail.com` signs in at `https://www.withmodus.co/sign-in`:

- its production Clerk user id does not exist, so admin membership cannot
  be granted;
- production Clerk-token → PostgREST access cannot be verified, because
  minting a session token requires a real user. **The existing genuine
  evidence used the development issuer and does not carry over.**

Once that sign-in has happened: read the id from the production instance
(never reuse the development id, never grant by email match), grant with
`scripts/grant-admin.mjs`, then test allow / deny / revoke-and-deny, and
restore the intended membership.

**MFA remains intentionally deferred** by the user's decision. All other
membership and authorization protections are in force: membership is a
server-controlled row, re-read on every protected request, and revocation
takes effect on the very next request.

## 18. Production admin bootstrap — 3 October 2026

### Identity verified against the production Clerk instance

| | |
|---|---|
| user id | `user_3KBVdozubSltDS4W58CkOj9BLcB` |
| email | `withmodus@gmail.com`, verified |
| provider | `oauth_google` |
| `two_factor_enabled` | **false** |
| created | 2026-10-03T12:37:17Z |

Read from the production instance with the `sk_live` key, which was
checked for that prefix first. The instance holds exactly one user. The
**development** user id was not reused, and membership was granted to
this id explicitly — never by email match, provider, or being the first
account.

### Admin allow / deny / revoke — verified on the live site

Driven with a real production session token against
`https://www.withmodus.co`, not inferred
(`scripts/verify-admin-production.mjs`):

| Case | `/api/admin/status` | `/api/private/overview` |
|---|---|---|
| Anonymous | `admin:false` | **401** |
| Signed in, membership active | `admin:true` | **200** |
| Signed in, membership revoked | `admin:false` | **403** |
| Membership restored | `admin:true` | **200** |

The revoked case is also the "ordinary signed-in account" case: the same
real production session, with no membership row, is refused. **Revocation
took effect on the very next request** — no sign-out, no new session, no
cache to wait out.

Final state: exactly **one active membership row** for that user. The
intended membership is restored.

A second production Clerk account was **not** created to test an ordinary
user separately — that was not authorized, and the revoked case covers
the same path with a real session.

### Why a new script was needed

`scripts/grant-admin.mjs` uses the default `DATABASE_URL`, which locally
is `modus_dev`. Running it unmodified would have granted admin on the
development database. `scripts/with-production-db.mjs` loads
`.env.supabase.local` in Node, refuses any host that is not the Supabase
project, prints the host and never the credentials. A first attempt that
extracted the URL with shell tools produced a mangled connection string
and a Prisma validation error — **nothing was written anywhere**, which
the production row count confirms.

### MFA — still deferred, and now measurable

`two_factor_enabled` is **false** on the production admin account, and
`ADMIN_MFA_REQUIRED` is unset, so the application does not enforce a
second factor. This remains the user's explicit decision. Any two-step
verification on the underlying Google account protects the Google login
only and is **not** application-enforced MFA.

## 19. Clerk → Supabase on production — RESOLVED, then verified properly

### The `role` claim was missing; it is now present

Found while verifying production PostgREST access. **The previous
evidence used the development issuer and did not carry over.**

What is correct:

- `https://clerk.withmodus.co/.well-known/jwks.json` publishes a key.
- A real production session token mints and verifies: `sub` is the
  production user id, `iss` is `https://clerk.withmodus.co`.
- Anonymous PostgREST access is refused on `Diagnostic`, `AdminMember`
  and `Profile` (Postgres `42501`).
- `AdminMember` is not readable by the browser role.
- The grants are right: `authenticated` holds SELECT on `Diagnostic`.

What is wrong:

- An **authenticated** request is refused with
  `permission denied for table Diagnostic`.
- The production session token's claims are
  `exp, fva, iat, iss, nbf, sid, sts, sub, v` — there is **no `role`
  claim**.

Supabase's native third-party auth assumes the Postgres role named in the
token's `role` claim. Without it the request is treated as `anon`, which
holds no grants — hence the refusal, despite `authenticated` being
correctly granted.

**This is a Clerk dashboard setting on the production instance, not a code
defect.** Enable the Supabase integration for the production instance, or
add `"role": "authenticated"` to its session-token claims. The
development instance evidently has this and production does not, which is
exactly why the earlier evidence did not transfer.

**Current impact: none at runtime.** `src/lib/supabase/client.ts` is not
imported by any application code — the app reads and writes through
Prisma server-side. This is a latent gap that must be closed before any
browser-side Supabase access is relied on, not a live fault.

### Resolved — fresh token, 3 October 2026

The Clerk production instance now issues the claim. A fresh token minted
through the sign-in-token flow carries:

```
claims: exp, fva, iat, iss, nbf, role, sid, sts, sub, v
iss   = https://clerk.withmodus.co
sub   = user_3KBVdozubSltDS4W58CkOj9BLcB
role  = authenticated
```

The token itself was never printed. `role` is present where it was
absent, so Supabase now assumes the `authenticated` Postgres role instead
of falling back to `anon`.

### The first ownership check failed, and the assertion was wrong

Assigning the synthetic record to the production user and reading as that
user returned **all five rows**, which looked like the four guest records
being exposed. The policies are correct and so was the result:

```
diagnostic_select_own    USING ("ownerId" = current_clerk_id())
diagnostic_select_admin  USING (is_modus_admin())
```

Postgres combines permissive policies with **OR**, and the account under
test had just been granted admin membership (§18), so `is_modus_admin()`
was true and it saw everything *by design*. Ownership isolation cannot be
measured with an account that bypasses it.

This is worth recording because the failure looked exactly like a data
leak. It was a test that measured the wrong thing.

### Ownership isolation, measured with admin OFF

`scripts/verify-ownership-isolation.mjs` revokes admin membership for the
duration, runs the check, and restores both the membership and the
record's ownership in a `finally` block so a failed assertion cannot
leave either changed.

| Check | Result |
|---|---|
| `iss` | `https://clerk.withmodus.co` |
| `role` | `authenticated` |
| Anonymous — `Diagnostic`, `AdminMember`, `Profile` | rejected, `42501` |
| Authenticated read returned | **1 row — non-empty** |
| The owned record returned to its owner | yes |
| Guest records visible | **none of the 4** |
| Rows visible in total | exactly 1, the owned one |
| `AdminMember` readable | no |

**A zero-row result is treated as a failure by this script, not a pass.**
An empty read is what a broken token also produces, so the owner case has
to return the specific record — and it did.

### Restored, and confirmed afterwards

| | |
|---|---|
| Synthetic record ownership | back to `null` (guest) |
| Admin membership | 1 active row |
| Original diagnostics | all 4 present and still unowned |
| `/api/admin/status` (live, as the admin) | `200`, `admin: true` |
| `/api/private/overview` (live, as the admin) | `200` |
| Diagnostics in production | 5 total, 5 unowned |

So both behaviours are now evidenced on production: an administrator sees
every record through `diagnostic_select_admin`, and an ordinary
authenticated account sees only what it owns through
`diagnostic_select_own` — while anonymous callers are refused outright.

## 20. Account isolation — fixed (task 1 of the correction brief)

### What "Sign in diagnostic" was displaying

The saved Diagnostic reference — a capability token plus the company name
— lived in `localStorage` under `modus:customer-context:v1` with **no
record of whose it was**. `useCustomerContext` read it unconditionally,
and `DiagnosticShell` opened the profile screen whenever it existed.

So the reference was scoped to the *browser*, not the *account*. After a
sign-out or an account switch the next person at that device saw the
previous account's company name in the navigation and on the homepage,
was offered "Continue Diagnostic"/"View Your Profile", and landed on the
previous account's profile screen at `/diagnostic`. Their capability
token also stayed in storage, readable by anyone with the device and
usable against the public context endpoint.

Guest diagnostics remain accessible, as specified: the context endpoint
is deliberately a capability-token design for submitters who have no
account, and that is unchanged.

### What changed

- **Identity is now a first-class value.** `IdentityProvider` supplies the
  Clerk user id, or `"guest"`, or `null` while Clerk is still loading.
  `null` is distinct on purpose: treating "not yet known" as "guest" is
  what would flash one account's data before the account was known.
- **Every read and write of the reference is scoped.**
  `getContextReference(identity)` returns it only to the identity that
  saved it. A reference written before scoping existed has no identity and
  is returned to nobody.
- **Foreign state is removed, not merely hidden.**
  `purgeForeignContextReference` deletes a reference belonging to another
  identity, so the token does not sit in storage after someone signs out.
  Admin-tab bookkeeping for other accounts is cleared too.
- **Cached server output is invalidated.** `AccountStateBoundary` calls
  `router.refresh()` on an identity change, so RSC payloads rendered for
  the previous account are not reused on a Back navigation. The context
  fetch is `cache: "no-store"`.
- **Late responses are discarded.** A context fetch started under one
  account cannot write into another's state; any summary already held is
  dropped the instant the identity changes.
- **Guest drafts are preserved separately**, as specified. The in-progress
  answers live in `sessionStorage` under their own key, are the work of
  whoever is at the browser, and are not account data.

### The admin tab

`AdminInboxLauncher` now opens only after `/api/admin/status` confirms
membership **for the current account**:

- the account is captured when the probe starts and compared with the
  current one when it resolves, so an answer that arrives after a switch
  is discarded;
- any conclusion reached for a previous account is cleared the moment the
  identity changes;
- it never runs for `"guest"`, and never opens merely because somebody
  signed in — only a server `admin: true` opens it.

### Verified

**Unit — 12 tests** (`src/lib/customerContext/__tests__/storage.test.ts`):
returned to its owner; **not** to a different account; **not** after
sign-out; a guest submission is not handed to an account that signs in
later; nothing returned while the identity is unknown; a pre-scoping
reference is discarded; another account's token is **removed** from
storage; the current account's own reference is kept; an unparseable
reference is removed; nothing is purged while the identity is unknown.

**Browser — 6 tests** (`e2e/accountIsolation.spec.ts`), asserting on the
actual data and storage rather than on hidden UI:

| Case | Result |
|---|---|
| Another account's company name anywhere in the page | absent |
| Navigation offer | generic "Run a Diagnostic" |
| Their token after load | **removed from `localStorage`** |
| `/diagnostic` with a foreign reference | entry screen, no "PROFILE READY" |
| Reload, and browser Back from another page | still absent, still removed |
| A **guest's own** reference | honoured and kept |
| Admin tab for an anonymous visitor | no second tab, no link |
| `/api/admin/status` unauthenticated | `{"admin": false}` |

The guest-reference case is there deliberately: a change that simply
deleted everything would pass every isolation check while removing the
feature.

### A regression this introduced, and the fix

Scoping the read broke the profile screen. The initial screen is chosen
on the first render, when Clerk has not yet reported who the visitor is,
so `getContextReference(null)` returned nothing and `/diagnostic` always
opened on the entry screen. Five scene tests caught it.

The screen is now settled once the identity arrives — only from the entry
screen, and only once, so a visitor who has already started answering is
never pulled out of the form by a late identity resolution.

### Remaining limitations

- **OUTSTANDING: real signed-in account-switch testing.** See §21 for
  what is prepared and what is blocking it.
- Tasks 2–5 of this brief (auth transition, diagnostic graphic, hero
  bubbles, `/private` redesign) are **not started**.

### Verified on production after deploying

Commit `297e728`. The isolation specs were run against
`https://www.withmodus.co` by pointing the suite at it with
`MODUS_E2E_BASE_URL` — **7 passed**, the same set that passes locally.

Three of those are *discriminating*: on the previous build a foreign
reference was used and kept, so their passing is itself evidence the new
code is live, not merely that the assertions are satisfiable.

| Check on production | Result |
|---|---|
| Foreign company name rendered anywhere | absent |
| Foreign token after load | removed from `localStorage` |
| `/diagnostic` with a foreign reference | entry screen, no profile |
| Reload and browser Back | still absent, still removed |
| A guest's own reference | honoured and kept |
| Guest draft resume | offered, answer intact |
| Admin tab for an anonymous visitor | not opened, no link |
| `/api/admin/status` unauthenticated | `{"admin": false}` |

No customer data was read or exposed: the checks use a fabricated token
and a fabricated company name, and the resume check creates no record.

**Guest resume needed a correction to the test, not the code.** The
recovery prompt appeared to be missing after a draft was saved. Overlays
are arbitrated through `useOverlaySlot`, and the consent banner holds the
slot until answered — so the prompt was queued behind it, not lost. The
test now answers consent first, as a visitor would.

## 21. Clerk test tooling — prepared, one blocker outstanding

The signed-in account-switch case still has no passing automated browser
test. This is what exists and what is in the way.

### Prepared

- **`@clerk/testing` installed** (2.2.42).
- **`scripts/create-test-users.mjs`** creates two isolated accounts,
  `modus-test-a@playwright-qa.dev` and `modus-test-b@playwright-qa.dev`.
  It **refuses to run against a production key** (`sk_live`) — test
  accounts belong in the development instance, and no production account
  is created without authorization. Passwords are generated, written to
  the gitignored `.env.test.local`, and never printed. Both accounts were
  created successfully in the development instance.
- **`e2e/accountSwitch.spec.ts`** covers the three cases that only two
  real sessions can reach: account B never sees account A's saved state;
  an ordinary signed-in account gets no admin tab and is refused by
  `/api/private/overview` with **403** on a direct API call, not merely a
  hidden control; signing out clears private state and restores the
  generic site.

### Blocker

`clerk.signIn()` does not establish a session against this development
instance. It returns without throwing, and in the page
`window.Clerk.loaded` is `true` while `Clerk.session` and `Clerk.user`
stay `null` — only `__clerk_db_jwt` and `__client_uat` cookies are set.
Tried, with no change: email as identifier, username as identifier,
`clerkSetup()` with the keys explicitly placed in `process.env`, and
`setupClerkTestingToken()` before signing in.

The spec is therefore **gated behind `MODUS_CLERK_SWITCH_TEST=1`** and
skips by default. It is deliberately not softened into something that
passes: assertions that run as a signed-out visitor would prove nothing
while looking green.

### What this does and does not leave uncovered

Covered without it: both directions of the scoping rule at unit level
(12 tests), and in a real browser with a foreign reference present —
including on production. Not covered: a genuine signed-in → signed-in
transition, where Clerk's own session teardown and the identity change
happen together.

Likely next step: the instance requires a username, which suggests its
sign-in strategies differ from the helper's default. Worth checking the
development instance's enabled identifiers and first-factor strategies
before spending further time in the test harness.

## 22. Auth transition (task 2) — shared shell, real morph

### What changed

`/sign-in` and `/sign-up` each rendered their own copy of the shell, so
moving between them unmounted everything and the whole page cross-faded.
Both routes now sit in a `(auth)` route group with a shared layout, so
the mark, the heading block and the card surface are **never unmounted**.
Only the words and the Clerk form inside change, and the surface animates
its own height to whatever the new form needs.

The route group does not change the URLs: `/sign-in` and `/sign-up` are
still real routes with real history entries.

Specifics worth recording:

- The Clerk form is **not keyed** on the route. Clerk owns that subtree,
  and re-mounting it on every navigation would discard in-progress input
  and any provider handshake. Only the copy is keyed, with
  `mode="popLayout"` so outgoing text leaves flow instead of stacking.
- **Reduced motion** gets the same screen, arrived at immediately —
  `duration: 0` and no layout animation. The request is for no motion,
  not for a different screen.
- Copy is the brief's: *"Save your progress and return with a clearer
  picture."* No invented benefits.

### Verified — 8 tests (`e2e/authTransition.spec.ts`)

"Looks animated" is not testable; what makes it a morph rather than a
crossfade is. The shared mark is **tagged in the DOM before navigating
and asserted to still carry that tag afterwards** — proving it is the
same node, never unmounted.

| Check | Result |
|---|---|
| Shared mark survives the navigation | same DOM node |
| Copy changes with the route | sign-in ↔ sign-up headings |
| Real URLs, browser Back | `/sign-up` → Back → `/sign-in` |
| Clerk form still functional after the morph | primary action present |
| Form readable throughout | `rgb(30,59,46)` on white, fully opaque |
| Keyboard focus + visible ring + Enter navigates | yes |
| Reduced motion | correct screen immediately |

Screenshots: `e2e-screens/auth-{sign-in,sign-up}-{desktop,mobile}.png`.

### Limitations

- **Hosted Clerk screens at `accounts.withmodus.co` are not styled by
  this work.** `appearance` and application CSS apply only to the
  components mounted in this app. The hosted continuation screens —
  including parts of the OAuth flow and account management — are rendered
  by Clerk on its own domain and can only be themed through the Clerk
  dashboard's appearance settings. That is a dashboard change and cannot
  be made from this repository.
- **GitHub still appears as a provider in the local screenshots.** Those
  run against the **development** instance; it was disabled in
  production. The development instance should be brought in line, or
  local captures will keep showing a provider production does not offer.

## 23. Diagnostic graphic (task 3) — one integrated composition

### What was wrong

The form screen carried two graphics. A bordered "MODUS / Initial
Profile" card held a static node map and the facts; a second WebGL scene
sat elsewhere on the page. The node map never responded to anything, and
the topic labels on the scene were filled pills pinned to layer
centroids, which lined up into what read as a vertical menu floating over
the scene rather than annotation of it.

### What it is now

**One composition**, mounted once at shell level so its points persist
across the whole journey:

- The scene carries the state — entry sphere → answer-driven topic
  structure → review stack → acknowledged-result closure.
- The profile is read out directly beneath it, in the same column, with
  no card, no second header and no second mark.
- The node-map card is **removed, not relocated**. `ProfilePanel` and its
  `SystemMap` are no longer rendered.

**Topic names are annotations.** Each label is placed against its own
layer, just beyond that layer's rightmost projected point, with a short
leader line back to it. They sit at different offsets rather than
stacking into a column, the active topic is in ink and the rest are
quiet, and none of them has a pill.

**Nothing is invented.** The facts are the visitor's own answers and the
signals come from `buildSignals` — the same scoring the rest of the
diagnostic uses, unchanged from the panel this replaces. With nothing
answered the readout says so rather than showing placeholder data.

The composition is `sticky top-24` on the form screen, so the profile
stays with the visitor through a long form — which is what the old
panel's own `sticky top-24` provided and what replacing it must not lose.
`position: fixed` is unavailable here: `PageTransition` leaves
`filter: blur(0px)` on an ancestor, and a filter creates a containing
block for fixed descendants.

### Accessibility correction

The scene wrapper was `aria-hidden`, which was right when it held only a
decorative canvas. It now also carries the profile readout — real
information about the visitor's own answers — so the wrapper is exposed
and the canvas, its labels and the fallback mark themselves hidden
inside `DiagnosticScene`. The readout's own controls re-enable pointer
events the decorative layer disables.

### A vacuous test this exposed

The scene spec asserted that the scene stayed clear of the profile panel,
via `div.rounded-md.border`. Once the panel was deleted that locator
still matched one unrelated element, so the check kept passing while
asserting nothing. It is replaced by `expectNodeMapGone`, which asserts
the card and its pill labels are absent — the claim that actually
matters now — plus a check that exactly one canvas is mounted.

### Verified

- 7 scene tests pass, including the stage journey, submission failure
  holding the review stack, reduced motion, mount thresholds, and the
  1024 / 1280 / 1440 matrix.
- A new test asserts the composition carries the **real** profile: the
  empty-state line before anything is answered, then the industry the
  visitor actually selected appearing in the composition, the signals
  section present, and still exactly one canvas.
- Full suites: **71 unit, 79 e2e passed, 3 skipped** (the gated
  account-switch spec).

Screenshots: `e2e-screens/11-composition-with-profile.png`,
`w{1024,1280,1440}-2-layers.png`.

## 24. Hero process bubbles (task 4) — they were never missing

### What was actually happening

The bubbles were reported missing on the deployed site. They were not
missing. On production the element existed, the cycle ran, the label
changed every pass, and `data-state` moved between `in` and `out` exactly
on schedule.

They were **positioned off-screen and clipped**.

The bubble is positioned by projecting a node's live world position into
**canvas pixels**. But the bubble is `absolute left-0 top-0` inside the
**anchor**, and the canvas is deliberately overscanned — `layout()` sizes
it to the whole hero and offsets it with negative `left`/`top` so it is
centred on the anchor. The two spaces were never reconciled, so the
bubble was placed up to a full overscan to the right. Measured on
production:

```
box x=1790..1990   viewport width 1440   inViewport: false
clipped by SECTION … overflow=hidden  box 0,0,1440x900
```

Every bubble, every cycle, placed outside the hero's `overflow: hidden`
box. The clamp did not save it, because that clamped against the
**canvas** width — which is the overscanned width, not the visible one.

### The fix

Add the canvas's own offset to convert into anchor space, and clamp
against the **anchor's** box — the visible scene area — rather than the
overscanned canvas. After the fix, locally:

```
x≈915..1083  y≈413..626   inViewport: true on every sample
labels cycling: "Friction detected" → "Handoff mapped"
```

### Why nothing caught it

Everything that was asserted remained true throughout: the element was
present, animating, and changing text. Nothing asserted *where it ended
up on screen*.

`e2e/heroBubbles.spec.ts` now does, in four tests: a bubble becomes
visible and is **inside the viewport** whenever it is; the label rotates
rather than repeating one; a visible bubble never overlaps the headline;
and reduced motion never runs the cycle.

**The clipping test is discriminating, and was checked against both
builds:** it **fails** when run against production, which still has the
defect, and passes locally against the fix. A test that passed on both
would have proved nothing.

Screenshots: `e2e-screens/hero-bubble-{desktop,mobile}.png`.

## 25. /private upgrade (task 5)

### Inbox — rebuilt

On the MODUS surface: warm canvas, serif heading, restrained cream rows,
green only where something is actionable. No decorative metrics, no
sample rows, no new exports.

| Capability | Before | Now |
|---|---|---|
| Search | client-triggered, server-side | unchanged, debounced, `no-store` |
| Status filter | yes | yes, with readable labels |
| Date range | **none** | `from`/`to`, inclusive of the whole `to` day |
| Pagination | **none** — flat `take: 200` | server-side, 25/page, with totals |
| Loading | blank list | skeleton rows, `aria-busy` |
| Empty | blank list | states why, and whether filters caused it |
| Error | blank list | explains, confirms nothing changed, offers **Try again** |

The old `take: 200` silently truncated — the 201st diagnostic did not
exist as far as the inbox was concerned, with nothing on screen saying
so. The API now returns `total`, `page` and `pageCount`.

Changing any filter returns to page 1; staying on page 4 of a result set
that now has one page shows an empty list that reads as "no matches".

### Status workflow — four states, without rewriting records

The brief names New / In review / Contacted / Closed. The stored
vocabulary is wider, and **production already holds `QUALIFIED`**. A
record a person marked qualified is not silently rewritten into one of
four buckets to make a redesign tidy, so:

- the four are offered as the workflow, grouped first in the control;
- any other stored value is still shown, with its own label, and is
  still filterable;
- nothing migrates existing rows.

### Detail — save and retry states

Status changes and notes were fire-and-forget `await fetch(...)` with no
check on the response. A failed status change left the new value on
screen as though it had saved; a failed note silently discarded what was
typed. Both now report:

- status: `Saving…`, and on failure reverts the control to what is
  actually stored, says **Not saved**, and offers Retry;
- notes: the composer is cleared **only after** the save is confirmed, so
  a failure never loses the text, and offers Retry.

### Verified as a real administrator

`clerk.signIn()` is still blocked (§21), so the session is established the
other way: a development Clerk session token minted through the Backend
API — which development instances allow and production does not — applied
as an `Authorization` header. A hand-set `__session` cookie is **not**
accepted by Clerk's Next integration (it reported `admin: false`); the
same token in a header is (`admin: true`). The account is a throwaway
test user holding an `AdminMember` row in the **local** database only.

`e2e/privateInbox.spec.ts`, 5 tests, all passing against the real screen:

- lists real diagnostics; a nonsense search empties the list and says so;
  clearing filters restores the previous count; a date range in the past
  yields nothing;
- paginates rather than truncating, and the control is honest when there
  is only one page;
- a 500 shows the error state, and **Try again** recovers;
- renders on a phone;
- **a revoked admin is refused on the very next request** — same session,
  no sign-out: the API answers 403 and the page redirects to sign-in.

Screenshots: `e2e-screens/private-inbox-{desktop,mobile,error}.png`.

### Not done in this pass

- **The detail view is only partly restyled.** Its save/retry behaviour
  and the status control are done; the rest of its sections keep their
  existing presentation. The structured answers and results were already
  present and are unchanged — they were not rebuilt.
- **`AdminShell` chrome** (sidebar, top bar) is not yet on the MODUS
  surface.
- Clerk membership enforcement, immediate revocation, the original
  records and the notification outbox are all preserved and, for
  revocation, re-verified above.
- **MFA remains explicitly deferred.**

### Suite stability note

A full-suite run surfaced three failures that pass in isolation:

- Two `responsive.spec.ts` cases (`diagnostic @ tablet`,
  `home @ largeDesktop`). Contention in a ~12 minute serial run, not a
  product defect; both pass when the spec is run on its own. `workers: 1`
  is already in place for the WebGL contention this suite has always had.
- The hero bubble **rotation** test, which was my own and genuinely
  flaky: it sampled a fixed number of times, and a bubble cycle only
  advances while the scene is visible and the tab active, so under load
  fewer cycles completed in the same wall-clock window. Rewritten as a
  condition-based poll with a generous timeout. `pickBubble` cannot
  repeat an index consecutively, so "two distinct labels" remains the
  right assertion — it just needed long enough to observe two bubbles.

## 26. clerk.signIn() — root cause found, and it was not the username

### What was actually wrong

The instance's own environment, captured from the browser:

```
password:      enabled=true  used_for_first_factor=FALSE  first_factors=[]
email_address: enabled=true  used_for_first_factor=true   verifications=["email_code"]
username:      enabled=true  used_for_first_factor=true   verifications=[]
auth_config.test_mode: true
```

**Password is not a first factor on this instance.** The only first
factor carrying a verification is `email_address` → `email_code`. So
`clerk.signIn({ strategy: "password" })` had no supported strategy to
use, which is why it returned without throwing and left the session null.

The earlier guess — that the username requirement was to blame — was
wrong. The username *is* a first-factor identifier; it simply has no
verification of its own, and swapping the identifier changed nothing
because the strategy was the problem.

### The fix

The instance is in **test mode**, so a Clerk test address
(`…+clerk_test@example.com`) accepts the fixed verification code without
a mailbox. `scripts/create-test-users.mjs` now creates the two isolated
accounts with those addresses, and `e2e/clerkBrowserSession.ts` drives
Clerk's own client through the real flow:

```
signIn.create → prepareFirstFactor(email_code) → attemptFirstFactor → setActive
```

### Verified — a real browser session

| Evidence | Result |
|---|---|
| Signed-in user id | matches the account that was requested |
| Cookies in the browser | `__session`, `__client_uat`, `__clerk_db_jwt` |
| Survives a reload | yes, `Clerk.user` still reports the account |
| Server view | `/api/admin/status` answers for that session |

This is what the Bearer-header approach could not show. **Those tests
have been converted**: `e2e/privateInbox.spec.ts` now signs in through
the browser, so the admin surface is exercised with real cookies rather
than a header.

### Signed-in → signed-in switching

`e2e/accountSwitch.spec.ts` is **no longer skipped** and passes with two
real sessions:

- account B never sees account A's saved diagnostic state, and A's token
  is removed from storage;
- an ordinary signed-in account gets no admin tab, and
  `/api/private/overview` answers **403** on a direct call — not merely a
  hidden control;
- signing out clears private state and restores the generic site.

## 27. Skipped tests and unexplained failures

### Skipped: none

The suite now reports **98 passed, 0 failed, 0 skipped**.

The three that were skipped were the account-switch cases above, gated
behind `MODUS_CLERK_SWITCH_TEST=1` while `clerk.signIn()` was blocked.
They are ungated and passing. The fourth, long-standing skip — the
`E2E_ADMIN_PASSWORD` test — was deleted earlier along with the password
mechanism it tested.

### The three full-suite failures, separated honestly

| Failure | Status |
|---|---|
| Hero bubble **rotation** | **Root-caused and fixed.** It sampled a fixed number of times; a bubble cycle only advances while the scene is visible and the tab active, so under load fewer cycles completed in the same wall-clock window. Rewritten as a condition-based poll. |
| `responsive.spec.ts` — `diagnostic @ tablet` | **Unexplained.** |
| `responsive.spec.ts` — `home @ largeDesktop` | **Unexplained.** |

On the two responsive cases: they passed in isolation, passed in the next
full run, and passed again at `--repeat-each=3` (48/48). **That is not a
diagnosis.** No cause was established — the artefacts were overwritten
before the failure messages were read, and "it passed afterwards" does
not explain why it failed. Recorded as an open question rather than
closed as contention. If it recurs, the failure output needs capturing
before anything else is run.

## 28. Hosted Clerk screens

Exact dashboard steps, the colour/typography/shape values mapped to the
MODUS tokens, and the limitations are in **`MODUS_CLERK_THEMING.md`**.

The short version: `appearance` and `globals.css` reach only the
components mounted in this app. `accounts.withmodus.co` is served by
Clerk and keeps its defaults until it is themed in the dashboard against
the production instance. That change cannot be made from this repository
and nothing in the suite can assert it.

## 29. /private — finished on the MODUS surface

`AdminShell` and the detail view are now on the warm canvas with cream
surfaces and green actions: no `bg-white` remains anywhere under
`src/components/admin` or `src/app/private`. The active navigation item
is MODUS green rather than ink.

Preserved and re-verified: `QUALIFIED` is still offered and still stored
(asserted directly), pagination and filtering work, a failed note is
**kept** with a retry, and a revoked admin is refused on the very next
request.

One thing the screenshots caught that nothing else would have: the
"possible duplicate" panel listed **every** match — on a busy table that
ran past twenty-five lines and pushed the actual submission off the
screen. It is now a disclosure showing the full count with the five most
recent, so nothing is hidden and the hint is no longer the page.

### Evidence

- `e2e/privateInbox.spec.ts`: **8 tests**, signed in through the browser.
- Screenshots: `private-inbox-{desktop,mobile,error}.png`,
  `private-detail-{desktop,mobile}.png`,
  `private-detail-note-retry.png`.

## 30. Auth morph — visual evidence

DOM continuity shows the shell is not re-created; it does not show what
the transition looks like. Both now exist:

- **Stills** `auth-morph-{0-before,1,2,3-during,4-after}.png`. Stated
  plainly: the mid-flight frames mostly land *after* the ~420ms swap,
  because screenshot latency exceeds the animation, so they show the
  destination more than the morph.
- **A recording**, which does show it:
  `test-results/authMorphRecording-records-sign-in-to-sign-up-and-back-chromium/video.webm`.

A detail worth recording, found while writing the recording test: during
the swap **both headings are in the DOM at once** — `AnimatePresence`
holds the outgoing copy while the incoming one arrives. That broke a
generic `h1` locator, and it is also direct evidence that the copy is
exchanged in place rather than the page being replaced.

The shared mark is asserted not to shift by more than 2px across the
navigation: it is the fixed point the rest transitions around.

## 31. Deployment — commit `c56a0d7`, 3 October 2026

Seven commits pushed (`d29bb1a..c56a0d7`) and deployed.

### Evidence preserved first — and it had already been lost once

Playwright clears `test-results/` at the start of every run. The morph
recording was **already gone** when I went to preserve it: a later
full-suite run had deleted it. It was re-recorded and, with the key
screenshots, copied to **`docs/evidence/`**, which no test run touches.
`docs/evidence/README.md` lists what each artefact shows.

### Verified on the deployment

| Area | Result |
|---|---|
| Public and guest routes, `/legal`, `/privacypolicy`, sitemap, robots | 200 |
| Auth transition (shared shell, Back, focus, reduced motion, readable form) | 6/6 |
| Diagnostic graphic — one composition, annotations, node-map gone | 2/2 |
| Hero bubbles | **16 visible samples, 0 outside the viewport** |
| Account isolation (foreign reference, reload, Back, guest resume) | 7/7 |
| Admin surface closed to anonymous callers | pages 307 → Clerk, APIs 401, no data in body |
| Password endpoint | no handler, issues no session |
| Worker rejects no-credentials / wrong secret / bare cron header | 401 / 401 / 401 |
| Guest submission + safe retry | same id, `deduplicated: true` |
| Admin allow / deny / revoke / restore | 4/4, revocation on the **next** request |
| Notification | one outbox row, `status=SENT`, `attempts=1`, to `hello@withmodus.co` |

**Hero bubbles, measured directly on production:** boxes at x≈915–925
(right edge ≈1052–1074) in a 1440px viewport, every sample inside. Before
the fix the same measurement on production read x=1790–1990, outside the
hero's `overflow: hidden`. The defect is fixed on the deployment, not
just locally.

### Two production failures, both investigated before rerunning

Artefacts for both were copied to
`docs/evidence/production-failures-2026-10-03/` before anything was
re-run.

1. **`authTransition` — "the mark survives the navigation"**:
   `Test timeout … exceeded` inside the `settle()` helper, which waited
   for `networkidle`. Against the deployment that never settles — Clerk
   holds connections open — so the test expired before reaching a single
   assertion. `settle()` now waits for `domcontentloaded` and the form
   Clerk actually renders. **A test fault, not a product fault.**

2. **`heroBubbles` — "the label changes between cycles"**: it sampled
   from Node with repeated `page.evaluate`, and each round trip over the
   network made it miss the ~3s window in which a bubble is up. A probe
   against production showed the rotation working — *Friction detected* →
   *Workflow connected* → *Progress reviewed* — so the fault was in how
   the test watched. It now records labels **inside the page** with a
   MutationObserver, which cannot miss one however slow the connection.

3. A third red appeared on the re-run and was **not** an assertion
   failure: `Tearing down "context" exceeded the test timeout`. These
   tests watch several ~5s cycles and the teardown overran a 60s budget.
   Raised to 120s. The clipping property itself was then measured
   directly, with the result in the table above.

### The two responsive failures — a measured mechanism, still not proof

See §32. A specific, measured condition has since been found that
produces exactly this symptom, but it is **not** established that it
caused those two failures, because their artefacts were lost before
being read.

### Not verifiable from here

- **Browser sign-in/sign-out on production.** The production instance is
  not in test mode and admin access is Google OAuth, which cannot be
  automated here. Browser sign-in, sign-out and account switching are
  verified against the **development** instance with two isolated
  accounts and real Clerk cookies (§26). On production, admin
  authorization is verified with a real production session token:
  anonymous 401, admin 200, revoked **403 on the next request**,
  restored 200.
- **The admin inbox and detail screens on production** are therefore not
  captured in a browser. They are captured against the local build with a
  real browser session in `docs/evidence/`.
- **Inbox receipt** at `hello@withmodus.co` remains yours to confirm; the
  provider reported `SENT`.

### Synthetic records

The verification run created a second clearly-labelled synthetic record,
`cmuslquwf0000la04ai6t9yxu`. Production now holds **6 diagnostics: the 4
originals, untouched and still unowned, plus 2 synthetic**. Both are
identifiable by the company name `SYNTHETIC TEST RECORD` or the
`synthetic-test+` email prefix, and can be removed whenever you want.

## 32. Suite runtime — measured external cause

### What was seen

After the deployment the local suite stopped completing: two full-suite
attempts were killed at a 30-minute limit without producing a result. Run
in chunks, the numbers were:

| Spec | Time | Result |
|---|---|---|
| `smoke` | 22s | 11 passed |
| `loader` | 8s | 3 passed |
| `persistence` | 1s | 3 passed |
| **`responsive`** | **1020s** | 15 passed |

`responsive.spec.ts` at 68s per test, against 48 tests in 2.5 minutes
(~3s each) earlier the same day. Nothing in those commits touches that
spec.

### Two hypotheses, both tested

1. **`networkidle` not settling**, since `IdentityProvider` now loads
   Clerk on every route — the exact cause of the production auth-spec
   failure. **Disproven by measurement:** `/`, `/diagnostic` and
   `/private/login` all reach networkidle in ~1s.
2. **The full-height viewport resize and `fullPage` screenshot.** Also
   **not** the cause: the resize is 3–7ms and the screenshot 0.1–2.1s,
   even for an 11,219px page.

Individually, the same responsive tests run in **3–7 seconds each**. The
cost only appears over a long run.

### What it actually is

The machine is under heavy load from **unrelated applications**:

```
ChatGPT / Codex Framework   52.6% + 24.2% + 6.7%  CPU
WindowServer                45.5%                 CPU
VS Code helpers             ~23%                  CPU
load average                4.77
memory                      73% free
```

The suite runs `workers: 1` because its pages hold WebGL contexts. A
single-worker, GPU-backed suite competing with ~80% sustained external
CPU use degrades exactly this way: fine per test, ruinous over a run.
Memory is not involved.

### What this does and does not establish

**Established:** the slowdown had an external cause, measured, not in the
application or the specs. Four orphaned headless browsers left by runs I
had killed were cleaned up, and the suite immediately returned to normal:

| After cleanup | Result |
|---|---|
| Heavy chunk (hero, auth ×3, scene, privateInbox, accountSwitch) | 40 passed, **4.1m** |
| **Full suite** | **100 passed, 0 failed, 0 skipped, 7.5m** |

That is the same runtime as before the slowdown, with more tests than the
98 of the previous full run. The orphans were my own doing — I killed
several runs with `pkill` while chasing this, which left headless
browsers competing for the same single worker.

**Not established:** that this same condition caused the two earlier
`responsive` failures. That remains **unexplained** — their logs, trace
and screenshots were overwritten before being read, so the actual failure
messages are gone. A plausible, measured mechanism is not the same as a
diagnosis, and this one is recorded as the former.

The instruction stands: if either recurs, copy its logs, trace and
screenshots out of `test-results/` **before** anything else runs.

## 33. MODUS OS upgrade — integrated from the bundle, 3 October 2026

The supplied `MODUS-OS-UPGRADE.patch` is based on `c56a0d7`; the branch
was three commits ahead. `git apply --check` failed on
**`PROJECT-STATUS.md` only** — every source hunk applied cleanly — so the
patch was applied with `--exclude=PROJECT-STATUS.md` and this section
written instead. No newer work was overwritten and no second copy was
applied.

### What the bundle already proved, and what it did not

The handoff's eight admin browser checks used **fixture data and mocked
API responses**. They showed layout and interaction; they could not show
that a stage change reaches the database, that history records it, or
that a filtered URL filters. Those were the gaps, and they are now
closed against the real authenticated API, the real development database
and a **real Clerk browser session**.

### 1. Mobile authentication — verified with real sessions

`e2e/mobileAuth.spec.ts`, 6 tests, at 390px:

| Check | Result |
|---|---|
| Menu offers `/sign-in` and `/sign-up`, not the demo control | pass |
| No `/app/login` link anywhere | pass |
| Guest diagnostic still reachable from the menu | pass |
| Escape closes the menu **and restores focus to the trigger** | pass |
| Navigating to sign-in closes the menu | pass |
| A **real signed-in session** shows Clerk's account control | pass |
| Signing out clears the session and restores the entry links | pass |
| **Account switch leaks nothing** — A's company name absent, token removed | pass |

### 2. `/private` workspace — verified against the real database

`e2e/privateWorkspace.spec.ts`, 5 tests:

- **A pipeline stage change persists.** Confirmed by the server (the
  board announces only after the PATCH resolves), survives a reload, and
  the record's own Activity Timeline shows `Status → …`. The stage is
  restored afterwards, so verification leaves no workflow change behind.
- **A filtered URL opens already filtered** — `?status=QUALIFIED`
  pre-selects the control *and* every listed row is that status.
- **Refresh re-reads from the server**, asserted on the actual request.
- **A failed pricing save keeps the typed inputs** (`1234` still there).
- **A successful delete returns to the inbox** and the record is gone,
  confirmed through the API.

`e2e/privateInbox.spec.ts` (8 tests) still passes against the rebuilt
workspace: search, date filters, pagination, error-and-retry, note
retention, `QUALIFIED` preserved, and **a revoked admin refused on the
very next request**.

### 3. Platform demo

`e2e/platformPricing.spec.ts` passes, including the assertion that the
demo issues **no non-GET requests** to `/api/private`, `/api/diagnostic`
or `/api/cron`.

### 4. Pricing

Anchors €200 / €700 / €1,000, Core marked best value, OS only in Core and
Partner, asserted at 390px and 1440px with no horizontal overflow and the
primary CTA pointing at `/diagnostic`.

**A coherence gap the patch missed, now fixed.** `/app` is publicly
reachable and its billing and campaigns pages rendered **"€750/month"**
from `src/lib/appDemo/data.ts`, whose own comment calls it "source of
truth for pricing shown anywhere". That is the one place the new pricing
had not reached. The displayed names and amounts now follow the owner's
anchors; the object keys are unchanged because `DEMO_CLIENT.plan` and
both pages key off them.

**Historical quotes are untouched**, confirmed in the database:

```
404 records  pricingVersion 2026.01   e.g. €1050–1600, €1400–2000
  3 records  pricingVersion 2026.10        €200–350  (new submissions)
```

### Evidence

- `tsc --noEmit` clean · **78 unit tests** · production build passed ·
  full e2e suite **118 passed, 0 failed, 0 skipped**.
- Real-session integration: 6 mobile + 5 workspace + 8 inbox/detail.
- Screenshots from the **real application with real records and a real
  admin session** (not fixtures): `e2e-screens/os-{overview,pipeline,
  inbox,detail}-{desktop,mobile}.png`, `os-demo-*`, `os-pricing-*`.

### Two failures the full run surfaced, both fixed

Artefacts preserved to
`docs/evidence/full-suite-failures-2026-10-03/` before anything re-ran.

1. **A real regression from the patch.** `PlatformMockup` wrapped its
   caption strip in a `<footer>`, putting a second one on the homepage
   beside the site footer; the existing smoke test matched two and
   failed. It is a caption, not a page footer, so it is now a `div` —
   fixing the cause rather than loosening the test.
2. **My own test fault.** The pipeline restore step asserted
   `Status → NEW` strictly, but a record accumulates one activity entry
   per change, so after repeated runs several read identically. Scoped to
   `.first()`.

### Remaining limits

- **Not pushed, not deployed.** Awaiting authorization.
- Everything above is the **development** instance and the local
  database. Production admin access remains Google OAuth, which cannot be
  driven here; production authorization is verified separately with a
  real session token (§18).
- **MFA remains intentionally deferred.**
- No schema change, no migration, no dependency change, no auth-gate or
  RLS change.

## 34. MODUS OS upgrade deployed — commit `828f12e`, 3 October 2026

Pushed `a967af3..828f12e` and deployed.

### Verified on production — read-only

Within the stated limits: **no production submission was created, no test
email sent, and no membership altered.** `scripts/verify-production.mjs`
and `scripts/verify-admin-production.mjs` were deliberately **not run** —
the first creates a diagnostic, the second revokes and restores
membership.

| Area | Result |
|---|---|
| Mobile Clerk navigation | **3/3** |
| Platform demo + pricing (390px and 1440px) | **3/3** |
| Protected-route rejection | **8/8** |
| Account isolation, diagnostic graphic, auth morph | **18/18** |

**32 production checks, 0 failures.**

Specifically on the deployment:

- The mobile menu offers `/sign-in` and `/sign-up` — the demo
  `ClientUserButton` is gone, no `/app/login` link remains, and the guest
  diagnostic stays reachable. Escape closes the menu and **returns focus
  to the trigger**; navigating closes it.
- The OS demo runs and issues **no non-GET request** to
  `/api/private`, `/api/diagnostic` or `/api/cron`.
- Pricing renders €200 / €700 / €1,000 with Core marked best value,
  Essentials stating **"No MODUS OS access"**, the comparison table, the
  bounded-scope note, and "Get your personal price" pointing at the
  diagnostic.
- `/private`, `/private/diagnostics`, `/private/pipeline` and
  `/private/settings` each **307** to Clerk sign-in; the three private
  APIs each **401** with no submission data in the body; the password
  endpoint still has no handler and issues no session.

Screenshots from the deployment: `e2e-screens/prod-demo-{desktop,mobile}
.png`, `prod-pricing-{desktop,mobile}.png`, `prod-mobile-menu.png`.

### Not verified here, by instruction

- **Google sign-in and the admin interface on production** — the owner is
  checking these manually. Production is not in test mode and admin
  access is Google OAuth, which cannot be driven from here anyway.
- Admin authorization on production was last verified in §18 with a real
  session token; it was **not** re-run, because doing so alters
  membership.
- **MFA remains intentionally deferred.**

## 35. Hero sphere notifications — integrated, 3 October 2026

`HERO-SPHERE-NOTIFICATIONS.patch` is based on `d5ca41c`, which was
exactly HEAD. `git apply --check` passed and it applied cleanly — four
hero files, no conflicts, nothing older reapplied. The earlier OS/pricing
bundle was **not** reapplied.

### What changed

Notifications now appear **only while the animation is fully settled into
its sphere**, driven by the scene's existing visible-active clock
(`elapsed`) rather than a second timer or a new loop. On the 13-second
cycle the sphere hold is **6–10s** and popup eligibility is **6.3–9.7s**,
so the entrance and exit fades finish before dispersal.

Verified against the real constants rather than taken on trust:
`CYCLE.disorderHold 3 + morphToOrder 3 = 6` is the hold start, `+
orderHold 4 = 10` its end, and the module's `margin = 0.3` yields exactly
the stated 6.3–9.7 window.

The card is a rounded cream surface with a softer shadow, a bare MODUS
mark, a restrained green accent and a brand eyebrow above the message.

### Verified — 8 hero browser checks

| Check | Result |
|---|---|
| A popup becomes visible during the sphere hold, inside the viewport | pass |
| It never overlaps the headline column | pass |
| Labels rotate without immediate repeats (in-page MutationObserver) | pass |
| **Every visible popup is in the `sphere` phase**; `network` is always hidden | pass |
| Both phases actually observed across the cycle | pass |
| Reduced motion runs no cycle | pass |
| Desktop capture is discriminating (`hidden:false`, phase `sphere`, opacity > 0.9) | pass |
| **Mobile asserts suppression** (`hidden:true`) | pass |

### One check I added

The patch hard-hides the card with the `hidden` attribute. On this card
that is not sufficient on its own: it carries a `flex` utility, and a
class-based `display` outranks the user-agent `[hidden] { display: none }`
rule — the same bug class that once left the WebGL fallback painted over
a live scene here. The card does declare `[&[hidden]]:hidden`, so it is
correct; the new test asserts the **computed** value, measuring
`display: none` and a zero-width box throughout the network phase, so a
future class change cannot silently undo it.

### Inspected, not assumed

- **Light theme**: cream card `rgba(244,244,231,0.95)` on ink text,
  sitting over the settled sphere, clear of the headline and both CTAs.
- **Dark theme**: `rgba(43,38,34,0.95)` with cream text and the green
  accent. Reaching it needed the `modus_theme` cookie — the theme is
  resolved server-side, so emulating `prefers-color-scheme` leaves
  `data-theme="light"` and would have "verified" the wrong thing.
- Captures: `e2e-screens/hero-bubble-{desktop,mobile}.png`,
  `hero-notification-dark.png`.

These remain **illustrative process messages**, not real account
notifications; the accessible description still says so.

### Evidence

`tsc --noEmit` clean · **81 unit tests** · production build compiled ·
full e2e suite **120 passed, 0 failed, 0 skipped**.

### Scope

No backend, auth, pricing, diagnostic, database or mail change. Not
pushed, not deployed. `verify-production.mjs` and
`verify-admin-production.mjs` were not run; no production submission, no
mail, no membership change.

## 36. Local environment restored to development — 4 October 2026

### What had happened

`.env.local`, modified 3 October 23:35, contained **production** values
that overrode the development ones:

| | |
|---|---|
| `DATABASE_URL` / `DIRECT_URL` | production Supabase pooler |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY` | **duplicated**: `pk_test`/`sk_test` first, then `pk_live`/`sk_live` |
| `NEXT_PUBLIC_SUPABASE_URL` / publishable key | production project |

Next prefers `.env.local` over `.env`, so the development server read and
wrote the **production database** while every test still looked local.
The visible symptom was unrelated-looking: production Clerk rejecting
localhost with *"The Request HTTP Origin header must be equal to or a
subdomain of the requesting URL"*, surfacing as `400`s that failed the
diagnostic spec's console-error assertion.

### What was done

Servers and test processes were stopped first. `.env.local` now holds
**one** Clerk instance and **one** database, both development: the
routing URLs, the `pk_test`/`sk_test` pair, and `localhost:5432/modus_dev`.
Duplicates are gone. No secret was printed at any point.

Production values were **moved**, not copied, into the files the
production scripts already load explicitly:

- `.env.supabase.local` — connection strings **plus** the Supabase
  browser URL and publishable key.
- `.env.production.local` — the production Clerk secret **and** now its
  publishable key.

All five env files are gitignored and none is tracked; only
`.env.example` is in the repository.

### Verified after restart, without printing credentials

| Check | Result |
|---|---|
| Shell/process overrides | none set; no exports in shell profiles |
| Clerk instance served to the browser | `pk_test_…` |
| Effective database host | `localhost:5432` |
| A real submission landed in | `modus_dev` ✓ |
| The same submission in production | **absent** ✓ |
| Production row count after the check | unchanged (1) |

The `400` console errors are gone, and both diagnostic journey tests pass.

### A guard, so this cannot pass silently again

`e2e/localOnlyGuard.ts` refuses to run a **writing** test unless the
environment is unmistakably local: a localhost database, no `pk_live` or
`sk_live` key, and a localhost target. It is wired into the five specs
that submit rows, and is **test-only** — nothing under `src/` imports it,
so a real deployment, where a remote database and live keys are exactly
what is wanted, is unaffected.

Proven to fire, not just to exist:

```
MODUS_E2E_BASE_URL=https://www.withmodus.co → Refusing to run a writing test:
  tests that write must target localhost, not www.withmodus.co
DATABASE_URL=…pooler.supabase.com…          → Refusing to run a writing test:
  DATABASE_URL points at aws-0-eu-west-1.pooler.supabase.com, not a local database
```

Six unit tests cover the rule, including that the refusal names the host
but never the credentials in the URL.

Also fixed: the diagnostic spec's cleanup shelled out to
`sqlite3 prisma/dev.db` and had done nothing since the move to Postgres,
so rows accumulated and the API's 60-second repeat-submission guard made
re-runs fail as "the estimate never appeared".

## 37. The missing production records — read-only findings

**No write of any kind was performed.** No restore, insert, delete,
migration or membership change; `verify-production.mjs` and
`verify-admin-production.mjs` were not run.

### What was inspected

| | |
|---|---|
| Project | `qnoxrcjiynrbwmdekggh` |
| Host | `aws-0-eu-west-1.pooler.supabase.com:5432` |
| Database / schema | `postgres` / `public` |
| Table | `"Diagnostic"` |

### Facts

`pg_stat_user_tables` for `"Diagnostic"`: **8 inserts, 7 deletes, 1 live
row**, 16 dead tuples, autovacuum never run.

`NotificationOutbox` keeps one row per submission and is **not**
cascade-deleted, so it still lists submissions whose diagnostic is gone:

| Outbox row | Diagnostic | Still exists |
|---|---|---|
| 3 Oct 12:31 | `cmusdftjk…` | **no** |
| 3 Oct 12:56 | `cmuseb2730…` | **no** |
| 3 Oct 16:24 | `cmuslquwf…` | **no** |
| 4 Oct 09:58 | `cmutnezo90…` | yes — "Bagel ALley", `CONVERTED` |

That reconciles: 8 inserts ≈ 4 imported originals + 2 authorized
synthetic records + 1 further submission on 3 Oct + "Bagel ALley"; 7 of
those 8 are deleted. No `ActivityEvent` rows are orphaned, which is
consistent with deletion through a path that cascades.

### Uncertainties, stated as such

- **Who deleted the rows cannot be determined from the database.**
  `track_commit_timestamp` is `off`, so Postgres records neither when a
  row was deleted nor by whom. `AuditEvent` holds only admin
  grant/revoke entries — the application does not write an audit row for
  a diagnostic deletion, and deletions made in the Supabase SQL editor
  would leave no application trace at all.
- A lower row count is evidence that rows were deleted. It is **not**
  evidence of who deleted them, and nothing here attributes them.
- Statistics are cumulative since the last stats reset, whose time is not
  recorded; autovacuum has never run on this table, so the counters are
  likely to span the table's whole life, but that is an inference.

### Recovery options — to be checked by the owner, not by me

`wal_level = logical` and `archive_mode = on`, which are the settings
point-in-time recovery depends on. Whether PITR is actually **available**
and how far back it retains are properties of the Supabase plan and
project settings, readable only in the Supabase dashboard
(Database → Backups). Daily backups may also exist there.

I have not attempted, staged or simulated any restore. If the originals
matter, the dashboard is where to look, and a restore should be taken on
a branch or a copy rather than over the live project.

## 38. The diagnostic graphic now has a job — 4 October 2026

### What it was

Six horizontal planes, one per step, each with an HTML label projected
beside it. The planes said "there are six steps", which the progress bar
says better, and the six labels lined up into what read as a floating
menu over the scene. Beside them sat a readout headed **Preliminary
Signals** that passed judgement on a half-finished answer set, and two
placeholder sentences — *"Your profile will build here as you answer"*
and *"MODUS is watching for signals as you answer"* — standing in for
information that did not exist yet.

### What it is

One composition that grows with the answers, and words that say why.

The points open as a loose, unresolved cloud. Every topic the visitor
actually answers is drawn into a **disc** at the centre; each topic owns
one **ring** of that disc, of equal area, filling outward in the order
the questions are asked. The picture is whole only when all six topics
are. At review the same points regroup into the review screen's own
three groups, and only after the server acknowledges persistence do they
settle onto the MODUS mark.

Rings rather than wedges, which is what it was first built with and
what the screenshots rejected: a sixth of a circle on its own does not
read as part of a circle, it reads as a clump off to one side. A ring is
already a complete, centred form, so the first answer produces something
recognisable and each one after it visibly grows the same object.

Two further corrections the screenshots forced, both invisible in unit
tests:

- Topics were assigned in **blocks** of consecutive point indices, and
  `fibonacciSphere` walks pole to pole — so topic 0 was the top of the
  opening cloud and topic 5 the bottom. With three topics answered, every
  waiting point sat in the lower hemisphere and read as a skirt of dust
  beneath the picture. Taking every sixth point gives each topic the
  whole sphere. Asserted now, so it cannot come back.
- The waiting points sat at a multiple of the opening cloud's own uneven
  radius, which put its inner points closer in than the disc's outer
  ring. Answering the last topic therefore moved points *outward*. They
  now sit on an explicit shell whose minimum radius is above the disc's
  maximum, so "answered is drawn in" is true by construction.

### The words, which are the half that carries the information

Every stage pairs the canvas with real HTML:

| Stage | What it says |
|---|---|
| Entry | why six topics are asked at all |
| Each step | one authored sentence on what that topic is for |
| Any step | the facts recorded so far, and how many topics of six |
| Review / submitting / failure | the three groups — Your work, What gets in the way, What matters first |
| Result / profile | that the answers are stored — reachable only after a real save |

The canvas is `aria-hidden` and says nothing that is not also written
beside it. That is what makes three otherwise awkward cases complete
rather than degraded: no WebGL, reduced motion, and phones — where the
canvas is **not mounted at all** and the explanation is rendered on its
own, in the page flow above the question.

The facts are the visitor's own answers and nothing else. A branch exists
per answer and each is guarded on that answer being non-empty, so "only
when actually filled" holds by construction rather than by a caller
remembering to check. Nothing is scored or concluded: a partial answer
set supports only a partial verdict, which is worse than none. The
signals engine still runs, on the result screen, after a real submission.

**"Not sure" and "not applicable" are still not findings.** The two
operations answers added in part 1 are left out of the summary entirely
when the visitor chose the honest unknown, in either language — they
record what the visitor knows, not something true of their work.

### Removed, not relocated

`DiagnosticProfile.tsx`, `ProfilePanel.tsx` and `SystemMap.tsx` are
deleted, along with the `diagnosticProfilePanel` and `diagnosticSystemMap`
dictionary blocks and the now-dead `stepTopics`. Keeping the node-map
panel on disk would have kept the exact composition the brief rules out,
and the e2e suite asserts each retired surface is **absent** — the card,
its pill menu, the signals section, the placeholder sentences, and the
projected labels.

### A real defect found on the way

On a phone the consent banner is full-bleed and `fixed` at the bottom,
which is exactly where a form's **Continue** button ends up. It made the
diagnostic's primary action unclickable — Playwright reported *"subtree
intercepts pointer events"* — and it had never been caught because no
test had walked the flow at phone width.

`SystemSurface` now reserves room at the bottom of the document while a
surface spans the viewport, via a CSS variable the consent banner opts
into. Keyed on the measured width rather than a duplicated breakpoint:
from `sm` up the banner is a 380px card and padding every page for it
would add a strip of empty space to all of them.

## 39. Homepage — "Start here" reworked, "Recently Improved" removed

### Start here (SYS / 02)

The chips read Website / Leads / Processes / Growth: categories of a
service offering, not things anyone says about their own week. They now
name the work — *Following up with customers*, *Planning work*,
*Repetitive admin*, *Getting more enquiries*, *Not sure yet* — so
choosing one is recognition rather than classification. The heading asks
a question a business owner already has an answer to, the text field is
labelled, and the CTA reads **Find my next step** with *No account needed
to start.* beside it.

The chips are real toggle buttons with `aria-pressed`, in a labelled
group, multi-select, and *Not sure yet* is exclusive in **both**
directions. Both fields are optional and neither gates the CTA.

### How the answer travels

In session storage, scoped to whoever is signed in, written **only** on
the press that navigates.

- **Not in the URL.** The old `?hint=` carried a single category. This
  carries the visitor's own sentence about where their business is stuck,
  and a URL is copied, pasted into chat and logged by everything in
  between.
- **Not in the draft key.** `modus:diagnostic:v1` holds a real
  in-progress diagnostic, and anything non-empty in it makes the
  diagnostic offer to resume a saved session — so a first-time visitor
  would have been asked to "continue where you left off" having answered
  nothing. Entry context has its own key.
- **Scoped and purged.** Same rule as the saved profile reference: read
  only for the identity that wrote it, withheld while Clerk is still
  resolving, and another account's words are removed from storage rather
  than merely hidden.
- **Nothing happens on a chip.** No request, no write. Asserted against
  MODUS's own origin, so Clerk's background traffic cannot make the test
  pass or fail for an unrelated reason.

### What happens to it in the diagnostic

It is shown back on the entry screen under **You started with**, with the
text in an editable field and each chip removable, plus a clear control.
It is never written into `DiagnosticAnswers`, never read by `canProceed`,
and no required question is pre-filled or skipped.

There is exactly one route from start context into a real answer, and it
is a press: the friction step asks the same question the homepage asked,
so the text is offered there with **Use this as my description**. An
automatic prefill would be the silent save the brief rules out, and it
could also drop a four-word sentence into a field that asks for twenty
characters, producing a validation error the visitor never caused.
"Added to the field below" is derived from the field's actual value, not
a flag, so editing or clearing the field puts the offer back instead of
leaving a stale confirmation.

### Recently Improved (SYS / 06)

Removed from the rendered homepage — from the tree, not hidden with CSS,
since a hidden section still ships its copy and still reads aloud. The
sections above and below carry their own `border-t` and padding, so they
meet as any adjacent pair does: no residual gap, no orphaned divider.
Nothing was put in its place and no replacement case or testimonial was
added.

`CasesPreview.tsx` and `dict.home.proofSection` are both kept —
`ProofSection.tsx` reads the same copy — and the section's only outbound
link, `/results`, is a page of its own, still in the main nav. No nav or
anchor link pointed at the section itself.

**On SYS numbering:** the homepage's labels are not a sequence to begin
with. In render order they read 02, 05, 07, 06, 04, 08, and the same ids
are reused by other pages' sections. Removing 06 leaves no gap in
anything, and renumbering the survivors would change identifiers other
pages share, for no gain. Left alone deliberately.

### Also

The footer's LinkedIn icon was `href="#"`, a dead placeholder like the
policy links beside it had been. It now points at
`linkedin.com/company/withmodus` and opens in a new tab.

## 40. Verification for parts 2–6

### Unit

`npm test` — **14 files, 160 tests, all passing**, including three new
groups:

- **Geometry** (23): the stage mapping; that answering draws a topic in
  and leaves an unanswered one out; that a recorded topic does not move
  when the step changes, so Back and EDIT cannot un-draw it; that every
  answered point lies inside every waiting one; that each topic gets its
  own ring, ordered outward, with equal area; that each topic is spread
  over the whole opening cloud; and that the closing composition is
  unreachable from every screen except `result` and `profile`.
- **Narration** (15): that an empty answer set produces no facts at all
  and no topic reads as recorded; that whitespace-only answers are
  ignored; that "not sure" and "I work alone" are left out in **both**
  languages; that values pass through verbatim; and that a group with
  nothing in it stays empty rather than being filled with a placeholder.
- **Entry context** (16): identity scoping in both directions, withheld
  while the account is unknown, foreign context purged from storage,
  never written to the diagnostic's draft key, and tolerant of whatever
  is actually in storage.

### Through the browser

`npx playwright test` — **130 tests, 127 passed, 1 failed, 2 did not
run.**

The real journey is walked end to end at 1440, 1280, 1024 and 390px:
intro → each step → Back → review → EDIT → review → submit → result →
reload → saved profile, plus a forced failure and a retry that then
succeeds. The assertions are about meaning, not rendering:

| Claim | How it is checked |
|---|---|
| The graphic explains why | the entry and per-step copy is asserted by its words |
| The explanation follows the real step | step 2's copy present, step 1's absent |
| Nothing is summarised before it is answered | "Recorded so far" absent at step 1, present after filling it |
| Summaries are the real answers | the typed company name and chosen industry |
| Back does not un-record | "1 of 6 topics recorded" still true after Back |
| EDIT updates the summary | the edited name appears, the old one is gone |
| Review shows the three groups | all three by name, desktop and phone |
| Closure only after a real save | "stored with MODUS" absent at review, during submit, and after a failure |
| One object, not several | the canvas element is the same node across every stage |
| Reduced motion loses nothing | the same copy and summary assert at each stage |
| Phones get text, not a hidden canvas | zero canvases, explanation present, full journey completed |
| Nothing overlaps | scene vs. every field, heading, submit control and **every** EDIT row |
| Retired surfaces are gone | the card, its pills, the signals section, both placeholders, `[data-layer]` |
| No console errors | asserted across the whole journey |

Homepage: both widths assert the new heading, labelled field, all five
chips, the CTA and its note; that "Recently Improved" is **absent** from
the rendered page; that the chips do not overflow their card; that the
CTA is full-width on a phone and not on desktop; and that the page has no
horizontal scroll.

Captures are in `e2e-screens/`: `01-entry`, `02`–`04` form,
`05-review-three-groups`, `06-edit-updates-summary`, `07-result-closure`,
`08-profile-closure`, `09-submit-error`, `10-retry-succeeded`,
`11`–`13` reduced motion, `14`–`17` phone, `w1024/w1280/w1440-*`, and
`home-start-here-{desktop,mobile}` / `home-full-{desktop,mobile}`.

### The one failure, not explained away

`privateWorkspace.spec.ts › Refresh re-reads the list from the server`
failed at position 95 of 130 with the admin list showing **"That didn't
load. The diagnostics list could not be fetched."** — the page rendered,
the fetch did not return. The file is `mode: "serial"`, so the two tests
after it did not run.

What is known: the whole file passes on its own (5/5, run twice), the
list endpoint paginates rather than taking a flat 200, and its query
returns 200 rows in 25ms against the 400 now in `modus_dev`. So it is not
a slow query and not missing data.

What is **not** known: why that one request failed mid-suite. A
dev-server recompile or connection churn after ninety-odd browser tests
is plausible and unproven. It is recorded here as unexplained rather than
fixed, alongside the two responsive failures already documented in §8 —
and its trace, screenshots and page snapshot were preserved before
anything was re-run.

An earlier full run failed on a *different* test in the same file, which
also passed in isolation. That the file, not the test, is what recurs is
the one real signal; it is not evidence of a cause.

### Not done, deliberately

No production submission, no test mail, no membership change.
`verify-production.mjs` and `verify-admin-production.mjs` were not run.
`productionGraphic.spec.ts` was updated to the new design and passes
locally; it asserts the deployed site and will only hold there once this
work is deployed.

## 41. Two automatic emails on a saved diagnostic — 4 October 2026

### What the flow already did, and what changed

A submission committed, then enqueued **one** plain-text internal
notification. `dispatchPending` sent it, retried with exponential backoff
up to five attempts, and `dedupeKey` made the event idempotent. `after()`
drove a prompt send off the response path and a cron swept the rest.

That ordering is the part worth keeping and it is untouched: mail is
still never on the critical path of a save. What changed is that a
submission now produces **two** mails, each with an HTML and a text part.

### The two mails

**To the person who filled it in** — *"We hebben je antwoorden ontvangen
· MODUS"*, in the language they were reading the site in. It says their
answers are in, what they said they most want to improve, that it will be
read, and that a conversation follows. It promises **no** response time
and claims **no** finished analysis, and the tests assert both.

Missing information is left out, never shown. No company name means the
sentence does not mention one; no stated priority means that sentence is
not there at all. A mail that says "your answers for [bedrijf]" is worse
than one that says less.

**To MODUS** — *"Nieuwe diagnose: [bedrijf]"*, to the configured internal
address, never one taken from the form. It leads with name, company,
email and phone and the **Open in MODUS** button, then what they want to
improve in their own words, then team size, tools and context, then the
stored price indication, the receipt time in Europe/Amsterdam and the
reference. A section whose rows are all empty disappears, heading
included — a heading over a blank is the empty space to avoid.

The price indication is labelled as one, and carries *"komt uit het
prijsmodel en is een indicatie, geen offerte"*. Where the model declined
to price the scope it says so rather than implying zero.

The link is a plain `/private/diagnostics/{id}`. Normal admin
authentication, no token, no bypass, no query string — a link that let its
holder in would make every forwarded notification a key.

### Independence, which is the reliability requirement

Two rows, two dedupe keys, two attempt counters, two backoff schedules,
and a dispatch loop that catches per row. A customer address that bounces
retries only the customer mail and can never cause the internal
notification to go out twice. Asserted directly: with the customer's
provider rejecting and MODUS's accepting, two dispatch passes send the
internal notification exactly once while the customer row keeps its own
PENDING state and its own attempt count.

The internal mail's dedupe key is **unchanged** from the text-only
version, so a half-deployed state cannot produce two notifications for
one submission.

Both mails are composed at **enqueue** time and stored, so a retry hours
later sends what was written then rather than re-rendering against a
record a reviewer has since edited. Asserted.

A mail failure still cannot present a saved diagnostic as a failed
submission: enqueueing never throws into the request path, and the
response is already sent before dispatch runs.

### Reusable, without building the weekly mail

A mail is a list of blocks — paragraph, heading, section, facts, button,
divider, note, signature — and the HTML and text renderers walk the same
list. Writing each mail twice by hand is how the two parts drift, and a
text part that disagrees with the HTML part is worse than none.

That is also what weekly mails would need: a different list of the same
blocks, not a different shell. **Nothing weekly is built**: no schedule,
no subscription, no additional sending.

### Design

`public/brand/email-header-v1.jpg` — 1200×400, displayed at 600, 20KB.
Versioned in the filename because mail clients and their image proxies
cache by URL, so replacing the artwork means a new file. The supplied PNG
was 892KB; as a JPEG at q90 the same image is 20KB, because its "flat"
green is textured (53 distinct colours in one sampled patch) and that is
what PNG is bad at.

The alt text is styled white on a green cell, so with images blocked the
header reads as the word MODUS rather than 200 pixels of nothing.

Below it: warm cream surface, dark text, green actions, compact
paragraphs, a quiet footer with website, contact and the existing privacy
link. Tables with `role="presentation"`, inline styles, widths as
attributes — strip the one `<style>` block and the layout still holds. No
external stylesheet, script or font. One logo, asserted.

**No tracking.** No open or click tracking is requested of the provider,
so no link is rewritten, and every link is asserted to carry no query
parameters, no `utm_`, and nothing identifying the recipient.

### Escaping

Everything submitted is escaped into the HTML part — there is no React
here, these strings are built by hand, which is exactly why it is
explicit. A `<script>` tag in a company name renders as text. The **text**
part is deliberately not escaped: it is not markup, and escaping it would
corrupt the person's own words. Subjects have CR/LF stripped, so no extra
mail header can be injected.

### Verified

**Unit — 178 tests, all passing**, including 45 for the mail: omission
without placeholders, priority fallback, both languages, no promised
response time, the estimate as an indication, the empty section dropped,
Europe/Amsterdam, escaping in HTML and verbatim text, header injection,
the `/private` link granting nothing, no personal data in links, and the
outbox's independence and compose-once properties.

**Previews** — `npx vitest run src/lib/notifications/email` writes twelve
cases to `email-previews/` as HTML and text, plus an index: both
languages, a long submission, a sparse one, a priority stated only
through the list, a scope the model would not price, and an injection
attempt. They are rendered by the same modules that send, so they cannot
drift from what would go out. Set `MODUS_EMAIL_PREVIEW_ORIGIN` to render
against a running dev server, where the header image resolves.

**The real flow, locally** — a submission through the actual API with
`modus_locale=nl` produced exactly two rows: `diagnostic.received` to the
submitter, Dutch, reply-to `joris@withmodus.co`, 4.4KB of HTML; and
`diagnostic.submitted` to the configured internal address, reply-to the
submitter, 13KB of HTML. Repeating with `modus_locale=en` produced the
English confirmation. Both stayed `PENDING` with zero attempts, because
no provider is configured locally — the dispatcher said so explicitly
rather than pretending to deliver. **No mail was sent anywhere.**

### Configuration needed before this does anything

| Variable | Status | Note |
|---|---|---|
| `RESEND_API_KEY` | already set in Vercel | unchanged |
| `MAIL_FROM` | already set in Vercel | **the verified sending domain — not changed here** |
| `FORM_NOTIFICATION_TO` | optional | defaults to `hello@withmodus.co` |
| `NEXT_PUBLIC_SITE_ORIGIN` | optional | defaults to `https://www.withmodus.co`; the header image and the admin link are built from it |

The sending domain was **not** changed, and nothing here picks a From
address: it is `MAIL_FROM`, configuration, as before. A submitter's
address goes in Reply-To only.

One migration ships with this: `20261004120000_outbox_html_and_replyto`
adds two **nullable** columns to `NotificationOutbox`. Nullable because
rows enqueued before this existed have neither and must keep sending —
the dispatcher falls back to the text part alone and omits Reply-To,
which is asserted. Applied locally; **not applied to production.**
