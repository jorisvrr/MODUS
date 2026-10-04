-- The site language the visitor was reading when they submitted.
--
-- Nullable, and NOT backfilled: a historical submission genuinely has no
-- recorded language, and writing one in would be inventing a fact. Those
-- rows fall back to the site default at read time, which is how they were
-- already treated.
ALTER TABLE "Diagnostic" ADD COLUMN IF NOT EXISTS "locale" TEXT;
