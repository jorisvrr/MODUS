# Production migration plan — prepared, not executed

Three migrations are unapplied on production. **Nothing in this document
has been run against production.** Every figure below comes from
read-only `SELECT`, `SHOW` and `information_schema` queries.

Target: Supabase project `qnoxrcjiynrbwmdekggh`, database `postgres`,
schema `public`, PostgreSQL 17.11.

---

## 1. The three migrations

Production's `_prisma_migrations` lists four, all from 2 October:
`20261002164848_init_postgres`, `20261002185112_accounts_admin_outbox`,
`20261002185220_rls_policies`, `20261002231221_harden_migration_history`.

### `20261004000000_rewrite_operations_questions`

```sql
ALTER TABLE "Diagnostic" ALTER COLUMN "processStandardization" DROP NOT NULL;
ALTER TABLE "Diagnostic" ADD COLUMN IF NOT EXISTS "taskConsistency" TEXT;
ALTER TABLE "Diagnostic" ADD COLUMN IF NOT EXISTS "absenceCoverage" TEXT;
```

### `20261004120000_outbox_html_and_replyto`

```sql
ALTER TABLE "NotificationOutbox" ADD COLUMN IF NOT EXISTS "html" TEXT;
ALTER TABLE "NotificationOutbox" ADD COLUMN IF NOT EXISTS "replyTo" TEXT;
```

### `20261004140000_diagnostic_locale`

```sql
ALTER TABLE "Diagnostic" ADD COLUMN IF NOT EXISTS "locale" TEXT;
```

Five nullable `TEXT` columns, and one `NOT NULL` dropped. In PostgreSQL 11+
`ADD COLUMN` with no default is a catalogue-only change, and `DROP NOT NULL`
drops a constraint without touching rows. Each takes a brief
`ACCESS EXCLUSIVE` lock; the tables hold **1** and **4** rows (200 kB and
64 kB), and **0 locks** are currently held, so the pause is not
measurable.

---

## 2. Does the deployed build keep working?

The live build is `d5ca41c` (`origin/main`). Its schema declares
`processStandardization Int` — **not null** — and knows none of the five
new columns.

This was **tested, not reasoned about**: a Prisma client was generated
from `origin/main`'s schema and run against the local database, which
already has all three migrations applied. That is exactly the
"schema ahead of code" state production will be in between step 1 and
step 3.

| Operation (old client, new schema) | Result |
|---|---|
| `Diagnostic.count()` | PASS |
| `Diagnostic.findUnique()` on a row **with** a value | PASS |
| `Diagnostic.create()` with the old field set | PASS |
| `NotificationOutbox.findMany()` | PASS — returns its own 13 columns, ignores `html`/`replyTo` |
| `NotificationOutbox.create()` without `html`/`replyTo` | PASS |
| `Diagnostic.findUnique()` on a row where it **is NULL** | **FAIL** |

Prisma generates an explicit column list from the schema it was built
with, so columns it has never heard of are simply not selected. The one
failure is specific and worth stating exactly:

```
Error converting field "processStandardization" of expected
non-nullable type "Int", found incompatible value of "null".
```

**This does not affect the migration.** Production has
`processStandardization IS NULL` on **0 of 1** rows today, and the column
is still `NOT NULL` there. Only the *new* code ever writes a NULL — when a
visitor answers the rewritten operations question with "Not sure / not
applicable". So between migration and deploy, no such row can exist.

### The one real constraint: rollback

Once the new build is live and **one** visitor chooses that answer, a NULL
appears. From that moment, rolling back to `d5ca41c` would break every
admin list read whose page includes that row.

So: **roll forward, not back.** If the new build has to be reverted, the
safe revert is a build that still tolerates a nullable
`processStandardization`, not `d5ca41c`. Until the first such answer
arrives, rollback is still clean — and
`SELECT COUNT(*) FROM "Diagnostic" WHERE "processStandardization" IS NULL`
says precisely whether that window is still open.

### RLS and grants

`GRANT SELECT ON "Diagnostic"` is table-level, so the new columns are
readable under the existing row policies with no change. The
`INSERT, UPDATE` grant is a **column list**, so the three new `Diagnostic`
columns are *not* writable by the `authenticated` PostgREST role. That is
the correct outcome and needs no action: the application writes them
through Prisma on `DATABASE_URL`, not through PostgREST.

---

## 3. No reset, no delete, no backfill

Every statement is `ALTER TABLE`. There is no `DROP`, no `TRUNCATE`, no
`DELETE`, no `UPDATE`, no `CREATE TABLE`, no reset and no backfill.

```
$ grep -icE 'drop table|truncate|delete|update |insert ' \
    prisma/migrations/2026100400*/migration.sql \
    prisma/migrations/2026100412*/migration.sql \
    prisma/migrations/2026100414*/migration.sql
prisma/migrations/20261004000000_rewrite_operations_questions/migration.sql:0
prisma/migrations/20261004120000_outbox_html_and_replyto/migration.sql:0
prisma/migrations/20261004140000_diagnostic_locale/migration.sql:0
```

No existing value is rewritten:

- `locale` stays **null** on every historical row. The documented fallback
  is English, the site default, applied at read time — which is how those
  records were already treated.
- `taskConsistency` / `absenceCoverage` stay **null** on pre-rewrite rows.
  The legacy columns remain authoritative for them, and the admin view
  shows such a record as `3 / 5` under the question it was actually asked.
- `html` / `replyTo` stay **null** on the four existing outbox rows, all
  of which are already `SENT`.

The three deleted diagnostics and their outbox rows are untouched.
**0 `PENDING`, 0 `FAILED`** in production's outbox, so nothing can send as
a side effect of any of this.

---

## 4. Backup and recovery

Readable from SQL, and healthy:

| Setting | Value |
|---|---|
| `archive_mode` | `on` |
| `archive_timeout` | `2min` |
| `wal_level` | `logical` |
| WAL segments archived | 56 |
| archiver failures | **0**, last failure: never |
| last archived | 4 Oct 2026, 19:42 |

Continuous WAL archiving — what point-in-time recovery rests on — is
running and has never failed.

**What SQL cannot tell us:** whether PITR is enabled for this project and
how far back it retains. Those are properties of the Supabase plan and
project settings, visible only in the dashboard under
**Database → Backups**. Daily backups may also be listed there.

Before step 1, confirm in the dashboard: *(a)* PITR is on, or a recent
daily backup exists; *(b)* its retention window. Note the exact timestamp
immediately before the migration — with a tiny dataset and additive DDL,
restoring to that point is the complete undo.

A manual belt, if wanted — it is 1 row and 4 rows:

```bash
# Reads DIRECT_URL from the env file rather than putting it on the
# command line, where it would land in shell history.
set -a; . ./.env.supabase.local; set +a
pg_dump "$DIRECT_URL" --data-only \
  --table='public."Diagnostic"' --table='public."NotificationOutbox"' \
  --file="pre-migration-$(date +%Y%m%d-%H%M).sql"
```

A SQL-level undo also exists, though it is only correct while no NULL has
been written:

```sql
ALTER TABLE "Diagnostic"          DROP COLUMN IF EXISTS "taskConsistency";
ALTER TABLE "Diagnostic"          DROP COLUMN IF EXISTS "absenceCoverage";
ALTER TABLE "Diagnostic"          DROP COLUMN IF EXISTS "locale";
ALTER TABLE "NotificationOutbox"  DROP COLUMN IF EXISTS "html";
ALTER TABLE "NotificationOutbox"  DROP COLUMN IF EXISTS "replyTo";
ALTER TABLE "Diagnostic" ALTER COLUMN "processStandardization" SET NOT NULL;
DELETE FROM "_prisma_migrations" WHERE migration_name IN (
  '20261004000000_rewrite_operations_questions',
  '20261004120000_outbox_html_and_replyto',
  '20261004140000_diagnostic_locale');
```

The last `SET NOT NULL` fails if any NULL exists — which is the same
boundary as the rollback window above, and failing is the right behaviour.

---

## 5. Execution

Run from the repository root.

The production connection strings live in **`.env.supabase.local`**
(`DATABASE_URL`, `DIRECT_URL`) — not `.env.production.local`, which holds
the Clerk keys. Both are gitignored and neither is printed.

`dotenv-cli` is **not** installed, and `prisma` reads only `.env`, so the
file is loaded by Node itself. Node sets `process.env` before Prisma's own
dotenv runs, and dotenv does not overwrite what is already set, so these
values win.

### Step 1 — dry run (reads only)

```bash
node --env-file=.env.supabase.local node_modules/prisma/build/index.js migrate status
```

**Already run.** It reads `_prisma_migrations` and writes nothing. Output:

```
Datasource "db": PostgreSQL database "postgres", schema "public"
  at "aws-0-eu-west-1.pooler.supabase.com:5432"

7 migrations found in prisma/migrations
Following migrations have not yet been applied:
20261004000000_rewrite_operations_questions
20261004120000_outbox_html_and_replyto
20261004140000_diagnostic_locale
```

### Step 2 — apply

```bash
node --env-file=.env.supabase.local node_modules/prisma/build/index.js migrate deploy
```

`migrate deploy` applies only unapplied migrations, in timestamp order,
and records each in `_prisma_migrations`. It never resets and never
generates new SQL.

### Step 3 — verify the schema

```bash
node --env-file=.env.supabase.local node_modules/prisma/build/index.js migrate status
```

Expect: *"Database schema is up to date!"* and 7 applied migrations. Then:

```sql
SELECT table_name, column_name, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND ((table_name = 'Diagnostic'
        AND column_name IN ('taskConsistency','absenceCoverage','locale','processStandardization'))
    OR (table_name = 'NotificationOutbox'
        AND column_name IN ('html','replyTo')))
ORDER BY table_name, column_name;
```

Expect six rows: the five new columns `is_nullable = YES`, and
`processStandardization` now `YES` as well.

```sql
SELECT COUNT(*) FROM "Diagnostic";              -- expect 1, unchanged
SELECT status, COUNT(*) FROM "NotificationOutbox" GROUP BY status;  -- expect SENT 4
SELECT COUNT(*) FROM "Diagnostic" WHERE "processStandardization" IS NULL;  -- expect 0
```

### Step 4 — confirm the live site is still fine, before deploying

The old build is still serving at this point. Load the public site and the
admin inbox and confirm both work. This is the step that proves the
"schema ahead of code" window is safe in production and not only in the
local reproduction.

### Step 5 — deploy the application

Only after step 4. Deploying first is what would break: the new client
against the old schema fails with
`P2022 — The column NotificationOutbox.html does not exist`, which was
observed, not assumed, and would take out the cron sweep and the dispatch
after every submission.

### Step 6 — verify after deploy

```sql
SELECT kind, status, attempts, "replyTo" IS NOT NULL AS has_reply_to,
       "html" IS NOT NULL AS has_html, "createdAt"
FROM "NotificationOutbox" ORDER BY "createdAt" DESC LIMIT 10;
```

Expect the four historical rows unchanged, with `has_html = false`. A new
submission should add two rows — `diagnostic.received` and
`diagnostic.submitted` — both with `has_html = true`.

```sql
SELECT COUNT(*) FROM "NotificationOutbox" WHERE status = 'FAILED';  -- expect 0
```

---

## 6. Language, confirmed

- The customer confirmation is written in the site language **at the
  moment of submission**, read from `modus_locale` — the same cookie the
  site's own language switch sets. Not a browser header, not a country,
  not the email domain.
- That value is **stored on the record** (`Diagnostic.locale`), and the
  mail is composed in it **at enqueue** and stored as HTML and text. A
  retry sends the stored message, so changing the site preference
  afterwards cannot change a mail already queued. Asserted directly: the
  HTML a retry sends is byte-identical to the HTML that was stored.
- Verified through the real submit flow: `nl` → Dutch, stored `"nl"`;
  `en` → English, stored `"en"`; no cookie → English, stored `null`.
- **The internal notification is Dutch in all three cases.**
- Submissions with no recorded language fall back to English, the site
  default, decided in one place (`emailLocaleOf`).

---

## 7. Still open: the admin auth fault

**Not resolved, and not closed by this plan.**

A list request answered **401 in 8 ms** carrying a session token issued one
second earlier, with the same `sub`, `sid` and `role` as a call that had
answered 200 a second before. `requireAuth` answers 403 for a signed-in
non-admin and 401 only when no user resolves at all — so Clerk's
server-side verification saw no session for a token that was valid.

The obvious race hypothesis was tested and **did not reproduce** in eight
attempts. A later full run failed differently in the same file, waiting
25 seconds for a PATCH that never resolved. Both happen only deep into a
143-test serial run against a dev server, never in isolation. The cause
remains **unknown** and is carried as an open item.

### The 401 retry does not weaken authorization

The list retries **once** on a 401 before showing an error. Three
properties, each asserted in `e2e/adminRetrySafety.spec.ts`:

1. A persistent 401 still fails, after **exactly two** requests — not one,
   not a loop — and renders no record.
2. A **403 is not retried at all**: one request. There is nothing
   transient about "authenticated, not an admin", and asking again would
   be asking twice for permission just refused.
3. The authority is the server. Both attempts go through
   `requireAdminSession`, which re-reads the `AdminMember` row on every
   request; an anonymous caller is refused twice over. The retry is a
   second call to the same gate, never a second answer from it.

---

# Round 2 — prepared, not executed

Three further migrations. **Nothing has been applied to production, pushed
or deployed.** All three are applied and tested locally.

## The migrations

### `20261004200000_outbox_provider_message_id`

```sql
ALTER TABLE "NotificationOutbox" ADD COLUMN IF NOT EXISTS "providerMessageId" TEXT;
ALTER TABLE "NotificationOutbox" ADD COLUMN IF NOT EXISTS "deliveryState" TEXT;
ALTER TABLE "NotificationOutbox" ADD COLUMN IF NOT EXISTS "deliveryStateAt" TIMESTAMP(3);
```

Three nullable columns. **Nothing is backfilled** — the six existing rows
have no provider id and nothing is known about their delivery, and writing
`ACCEPTED` into them retroactively would invent a fact we never recorded.
The one historical delivery we *do* know about, the re-sent internal
notification, is recorded in PROJECT-STATUS, not in the database, because
the column did not exist when it was sent.

### `20261004210000_restrict_authenticated_grants`

Privileges only — **no schema change**. Revokes everything from `anon` and
`authenticated` on the ten application tables, then re-grants exactly the
surface the RLS design described, and finally revokes Supabase's *default*
privileges so the next table created does not get the blanket grant again.

Measured on production before writing it:

| Table | Role | Currently holds |
|---|---|---|
| Diagnostic | authenticated | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, **TRUNCATE**, UPDATE |
| Note | authenticated | same |
| Profile | authenticated | same |
| ActivityEvent | authenticated | same |
| ActivityEvent | **anon** | same |

**TRUNCATE is the serious one**: row-level security does not constrain it,
so any role holding it can empty the table whatever the policies say.
`anon` holding writes on `ActivityEvent` is next — the design granted that
table `SELECT`, to `authenticated`, and nothing else.

After, locally:

```
ActivityEvent   authenticated  SELECT
Diagnostic      authenticated  DELETE, SELECT        (+ column-limited INSERT/UPDATE)
Note            authenticated  DELETE, INSERT, SELECT, UPDATE
Profile         authenticated  INSERT, SELECT        (+ column-limited UPDATE)
anon            nothing, anywhere
TRUNCATE        held by nobody
```

A bug in the original was found while verifying this: `GRANT INSERT,
UPDATE (cols)` binds the column list to `UPDATE` only, so **INSERT was
granted on every column** — a visitor could insert their own draft with a
chosen `status`, `contextToken` or pricing band. INSERT now has its own
column list, and `status`, `contextToken`, `pricingBand` and
`calculatedEstimateMin` are confirmed to have neither INSERT nor UPDATE.

### `20261004220000_diagnostic_deletion_audit`

A new table, a `SECURITY DEFINER` function with a pinned `search_path`,
and an `AFTER DELETE ... FOR EACH ROW` trigger on `Diagnostic`.

```
DiagnosticDeletion(id, deletedAt, diagnosticId, actorId, dbRole, source)
```

A trigger rather than application code, because application code would
still have missed a deletion made from the SQL editor — which is exactly
the case that left no trace twice. It is atomic by construction: a trigger
runs inside the deleting transaction, so the audit row and the deletion
commit together or not at all. The table has **no foreign key**, so no
cascade can take the record of what was cascaded.

It holds no answers, no contact details and no capability token. The
DELETE route now runs in a transaction that sets `modus.actor_id` with
`set_config(..., true)` — transaction-local, so it cannot leak across a
pooled connection — and uses `requireAdminApi`, which returns the verified
admin's id.

## Tested locally

| Claim | Result |
|---|---|
| A route deletion records actor, time, record id, role and source | **PASS** — a real browser deletion recorded `user_3KBmr6…`, `source=admin-api` |
| A deletion from outside the app is still recorded | **PASS** — raw SQL delete produced a row |
| …with the actor honestly null, not invented | **PASS** — `actorId=null`, `source='unknown'` |
| The audit survives the cascade it records | **PASS** — child rows cascaded, audit row did not |
| No foreign key exists for a future cascade to follow | **PASS** |
| A rolled-back deletion leaves no audit row | **PASS** — record intact, no row |
| No answers, contact details or tokens stored | **PASS** — six columns, none of them |
| TRUNCATE revoked, `anon` reduced to nothing | **PASS** |
| Intended access preserved | **PASS** — `companyName` INSERT/UPDATE still granted |

201 unit tests pass; lint unchanged from baseline.

## Impact, and what could break

| Migration | Blast radius |
|---|---|
| `…provider_message_id` | none. Additive, nullable, unread by the deployed build |
| `…restrict_authenticated_grants` | **none in this codebase** — nothing imports `src/lib/supabase/client.ts`, and every database access runs through Prisma as the owner role, which these statements do not touch |
| `…diagnostic_deletion_audit` | new table and trigger. The deployed build never queries the table; the trigger fires for its deletions too, recording them with `actorId=null, source='unknown'`, which is accurate for a build that does not set an actor |

**The one thing to confirm before applying the grants migration:** whether
anything *outside this repository* reaches the database through PostgREST
with the anon or publishable key — an automation, a no-code tool, a
dashboard. I can see that nothing in this codebase does. I cannot see
what else exists. If something does, it will stop working, and it should
be granted explicitly rather than relying on the blanket default.

The trigger starts protecting before the new code ships, which is an
argument for applying these promptly rather than holding them for the
deploy.

## Deployment order

Same shape as round 1, and for the same reason: schema ahead of code is
safe, code ahead of schema is not.

1. **Back up both tables and the schema**, as before, and verify the dump
   restores. The earlier backup is at `~/modus-backups/20261004-201432`; a
   fresh one belongs to this change.
2. **Apply all three**, in timestamp order:
   ```bash
   node --env-file=.env.supabase.local node_modules/prisma/build/index.js migrate deploy
   ```
3. **Verify** — ten migrations applied, the three new columns present and
   nullable, `DiagnosticDeletion` present and empty, the trigger attached,
   `TRUNCATE` held by nobody, `anon` holding nothing:
   ```sql
   SELECT tgname FROM pg_trigger WHERE tgrelid = '"Diagnostic"'::regclass AND NOT tgisinternal;
   SELECT table_name, grantee, privilege_type FROM information_schema.table_privileges
   WHERE table_schema='public' AND grantee IN ('anon','authenticated') ORDER BY 1,2,3;
   SELECT count(*) FROM "Diagnostic";             -- expect 1, unchanged
   SELECT count(*) FROM "NotificationOutbox";     -- expect 6, unchanged
   ```
4. **Confirm the live build still works** while still on the old code —
   public routes, the admin inbox, and one admin action.
5. **Deploy.**
6. **Verify after:** a new submission stores `providerMessageId` and
   `deliveryState='ACCEPTED'`; an admin deletion writes a
   `DiagnosticDeletion` row carrying the Clerk actor.

## Rollback

All three are reversible without data loss, and none of them writes to an
existing row.

```sql
-- 20261004220000
DROP TRIGGER IF EXISTS "diagnostic_deletion_audit" ON "Diagnostic";
DROP FUNCTION IF EXISTS public.record_diagnostic_deletion();
DROP TABLE IF EXISTS "DiagnosticDeletion";       -- discards the audit trail

-- 20261004200000
ALTER TABLE "NotificationOutbox"
  DROP COLUMN IF EXISTS "providerMessageId",
  DROP COLUMN IF EXISTS "deliveryState",
  DROP COLUMN IF EXISTS "deliveryStateAt";
```

Reverting `20261004210000` means restoring `GRANT ALL ... TO anon,
authenticated`, i.e. deliberately restoring the over-permissive state. No
script is provided for that on purpose; if something external turns out to
need access, grant that thing what it needs rather than restoring the
blanket.

The `processStandardization` rollback note from round 1 still applies and
is unaffected by any of this.
