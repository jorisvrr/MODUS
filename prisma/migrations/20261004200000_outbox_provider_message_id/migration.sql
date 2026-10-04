-- Record what the provider said when it accepted a message, and keep
-- acceptance separate from delivery.
--
-- All three nullable and nothing backfilled: rows accepted before this
-- existed genuinely have no provider id and nothing is known about their
-- delivery. Writing "ACCEPTED" into them retroactively would be inventing
-- a fact we did not record at the time.
ALTER TABLE "NotificationOutbox" ADD COLUMN IF NOT EXISTS "providerMessageId" TEXT;
ALTER TABLE "NotificationOutbox" ADD COLUMN IF NOT EXISTS "deliveryState" TEXT;
ALTER TABLE "NotificationOutbox" ADD COLUMN IF NOT EXISTS "deliveryStateAt" TIMESTAMP(3);
