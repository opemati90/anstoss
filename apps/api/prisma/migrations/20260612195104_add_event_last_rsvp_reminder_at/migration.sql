-- AlterTable (idempotent: IF NOT EXISTS guards against drift from db push)
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "lastRsvpReminderAt" TIMESTAMP(3);
