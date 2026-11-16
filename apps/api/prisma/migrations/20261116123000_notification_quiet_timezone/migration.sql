-- No guessed timezone backfill: old preferences retain legacy interpretation
-- until the app sends the device timezone on the next preference save.
ALTER TABLE "NotificationPreference" ADD COLUMN "quietTimeZone" TEXT;
