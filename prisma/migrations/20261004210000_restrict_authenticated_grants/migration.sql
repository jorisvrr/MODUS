-- Bring the PostgREST roles back to the access the RLS design intended.
--
-- WHY THIS IS NEEDED
--
-- `20261002185220_rls_policies` granted a deliberately narrow surface —
-- its own comment says "RLS cannot stop an owner updating `status` or the
-- pricing fields on a row they legitimately own, so those columns are
-- simply not granted". That column list never constrained anything,
-- because Supabase's default privileges had already granted ALL on every
-- table in `public` to `anon` and `authenticated`, and a table-level grant
-- subsumes a column-level one.
--
-- Measured before writing this, on production:
--
--   Diagnostic      authenticated  DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
--   Note            authenticated  DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
--   Profile         authenticated  DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
--   ActivityEvent   anon           DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
--   ActivityEvent   authenticated  DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
--
-- TRUNCATE is the serious one: row-level security does not constrain it at
-- all, so a role holding it can empty a table whatever the policies say.
-- `anon` holding write rights on `ActivityEvent` is next: the design
-- granted that table SELECT, to `authenticated`, and nothing else.
--
-- WHAT IS PRESERVED
--
-- Exactly the surface the RLS migration described, so every policy still
-- has the privilege it needs to be meaningful:
--   Diagnostic     SELECT; INSERT/UPDATE on visitor-writable columns only;
--                  DELETE (already row-restricted to own drafts)
--   Profile        SELECT, INSERT; UPDATE on four columns
--   Note           SELECT, INSERT, UPDATE, DELETE
--   ActivityEvent  SELECT
--
-- No application behaviour depends on any of this today: nothing imports
-- `src/lib/supabase/client.ts`, and every database access goes through
-- Prisma as the owner role, which these statements do not touch.

-- 1. Blanket revoke, including the tables that should never have been
--    reachable from a browser at all.
REVOKE ALL ON TABLE
  "Diagnostic", "Profile", "Note", "ActivityEvent",
  "AdminMember", "AuditEvent", "NotificationOutbox",
  "GuestClaimToken", "ClientEntitlement", "LoginAttempt"
  FROM anon, authenticated;

-- 2. Re-grant precisely the intended surface.
GRANT SELECT ON "Diagnostic" TO authenticated;
-- The column list binds to the privilege it follows, so INSERT and UPDATE
-- each need their own. `GRANT INSERT, UPDATE (cols)` — which is what the
-- original migration wrote — grants INSERT on EVERY column and only
-- restricts UPDATE, so a visitor could still insert their own draft with a
-- chosen `status`, `contextToken` or pricing band. Verified: after the
-- first draft of this migration those four were still INSERT-able.
GRANT INSERT ("ownerId", lifecycle, "schemaVersion", "idempotencyKey",
  "companyName", website, industry, employees, locations, "revenueRange",
  "customerChannels", "enquiryHandling", "adminWorkload", "processStandardization",
  "keyEmployeeDependency", "taskConsistency", "absenceCoverage", locale,
  systems, "specificTools", "systemConnectivity",
  "spreadsheetDependency", "automationUsage", "frictionAreas", "primaryPainPoint",
  "problemDescription", "problemFrequency", "impactAreas", "primaryInterest",
  priorities, timing, "decisionContext", "firstName", "lastName", email, phone,
  role, "privacyConsent", "updatedAt")
  ON "Diagnostic" TO authenticated;
GRANT UPDATE ("ownerId", lifecycle, "schemaVersion", "idempotencyKey",
  "companyName", website, industry, employees, locations, "revenueRange",
  "customerChannels", "enquiryHandling", "adminWorkload", "processStandardization",
  "keyEmployeeDependency", "taskConsistency", "absenceCoverage", locale,
  systems, "specificTools", "systemConnectivity",
  "spreadsheetDependency", "automationUsage", "frictionAreas", "primaryPainPoint",
  "problemDescription", "problemFrequency", "impactAreas", "primaryInterest",
  priorities, timing, "decisionContext", "firstName", "lastName", email, phone,
  role, "privacyConsent", "updatedAt")
  ON "Diagnostic" TO authenticated;
-- Restricted to the caller's own DRAFT rows by diagnostic_delete_own_draft.
GRANT DELETE ON "Diagnostic" TO authenticated;

GRANT SELECT, INSERT ON "Profile" TO authenticated;
GRANT UPDATE (email, "displayName", "companyName", "updatedAt") ON "Profile" TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON "Note" TO authenticated;

GRANT SELECT ON "ActivityEvent" TO authenticated;

-- 3. Stop the blanket grant returning on the next table.
--    Supabase's default privileges are what produced this in the first
--    place; without this, the very next migration that creates a table
--    hands `anon` and `authenticated` everything on it again.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
