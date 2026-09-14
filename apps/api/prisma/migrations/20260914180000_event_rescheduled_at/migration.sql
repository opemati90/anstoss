-- When the event date last moved. Replies older than this are shown as
-- "answered before the change" and asked for again.
ALTER TABLE "Event" ADD COLUMN "rescheduledAt" TIMESTAMP(3);
