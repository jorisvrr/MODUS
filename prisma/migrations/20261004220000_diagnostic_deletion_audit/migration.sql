-- A durable record of every Diagnostic deletion.
--
-- WHY A TRIGGER AND NOT JUST APPLICATION CODE
--
-- Production records have twice disappeared with no trace of who removed
-- them. `AuditEvent` holds only admin grant/revoke, the DELETE route wrote
-- nothing at all, and `track_commit_timestamp` is off — so Postgres kept
-- neither the actor nor the time. Application-side logging would still
-- have missed a deletion made from the SQL editor, a psql session, or any
-- future code path that forgets to log. A trigger cannot be bypassed by
-- any of those.
--
-- It is also atomic by construction: a trigger runs inside the deleting
-- transaction, so the audit row and the deletion commit or roll back
-- together. There is no window in which one exists without the other.
--
-- WHY A SEPARATE TABLE
--
-- It must survive what it records. No foreign key to "Diagnostic" and no
-- relation, so no cascade can take it; the row deliberately outlives the
-- record it describes.
--
-- WHAT IS NOT STORED
--
-- No answers, no company name, no contact details, no contextToken. The
-- record id, the actor, the time and the route are enough to answer "who
-- deleted what, and when", and keeping a copy of the data would defeat the
-- erasure a deletion may well have been performed to achieve.

CREATE TABLE IF NOT EXISTS "DiagnosticDeletion" (
  "id"           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "deletedAt"    TIMESTAMP(3) NOT NULL DEFAULT now(),
  -- The id of the row that was removed. Plain text, NOT a foreign key.
  "diagnosticId" TEXT NOT NULL,
  -- The Clerk user id, when the deletion came through the application and
  -- set it. Null means the deleting session did not identify itself, which
  -- is itself worth knowing.
  "actorId"      TEXT,
  -- The database role that performed it. Always available, so a deletion
  -- outside the application is still attributable to a connection.
  "dbRole"       TEXT NOT NULL,
  -- Where it came from, when the caller said so: 'admin-api', or
  -- 'unknown' for anything that did not.
  "source"       TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS "DiagnosticDeletion_deletedAt_idx" ON "DiagnosticDeletion" ("deletedAt");
CREATE INDEX IF NOT EXISTS "DiagnosticDeletion_diagnosticId_idx" ON "DiagnosticDeletion" ("diagnosticId");

-- Nobody reaches this from a browser. RLS on with no policies means the
-- PostgREST roles see nothing; the owner (which Prisma connects as) is
-- unaffected, and the trigger below runs as the owner regardless.
ALTER TABLE "DiagnosticDeletion" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "DiagnosticDeletion" FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.record_diagnostic_deletion()
RETURNS trigger
LANGUAGE plpgsql
-- SECURITY DEFINER so a role that may delete its own draft still cannot
-- choose whether the deletion is recorded. `search_path` is pinned,
-- because a definer function that resolves names through the caller's
-- path is a privilege-escalation route.
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO "DiagnosticDeletion" ("diagnosticId", "actorId", "dbRole", "source")
  VALUES (
    OLD."id",
    -- Set by the application for the duration of its transaction. Absent
    -- for a deletion from anywhere else, and recorded as absent.
    NULLIF(current_setting('modus.actor_id', true), ''),
    current_user,
    COALESCE(NULLIF(current_setting('modus.delete_source', true), ''), 'unknown')
  );
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS "diagnostic_deletion_audit" ON "Diagnostic";
CREATE TRIGGER "diagnostic_deletion_audit"
  AFTER DELETE ON "Diagnostic"
  FOR EACH ROW
  EXECUTE FUNCTION public.record_diagnostic_deletion();
