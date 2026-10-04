-- The outbox gains an HTML part and a reply address.
--
-- Both nullable, because rows enqueued before this existed have neither
-- and must keep sending: the dispatcher falls back to the text part alone
-- and omits Reply-To. No existing row is rewritten.
ALTER TABLE "NotificationOutbox" ADD COLUMN IF NOT EXISTS "html" TEXT;
ALTER TABLE "NotificationOutbox" ADD COLUMN IF NOT EXISTS "replyTo" TEXT;
