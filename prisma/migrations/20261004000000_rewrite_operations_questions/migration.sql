-- The two operations questions were rewritten into categorical answers
-- that include an explicit "not sure / not applicable".
--
-- Existing rows are untouched: they keep their 1-5 value and their
-- Low/Medium/High judgement, so a historical record still reads with the
-- meaning it was recorded under.
--
-- `processStandardization` is made NULLABLE because the new answer set
-- has an honest unknown, and no value on a 1-5 scale means "not
-- answered" — writing one would be scored downstream as LOW
-- standardization, a negative conclusion the visitor never gave.
ALTER TABLE "Diagnostic" ALTER COLUMN "processStandardization" DROP NOT NULL;

-- Verbatim new answers. Null on every historical row, by design: the
-- question was not asked, and backfilling it would invent data.
ALTER TABLE "Diagnostic" ADD COLUMN IF NOT EXISTS "taskConsistency" TEXT;
ALTER TABLE "Diagnostic" ADD COLUMN IF NOT EXISTS "absenceCoverage" TEXT;
