ALTER TABLE "Event"
  ADD COLUMN "rsvpAutoReminder" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "rsvpAutoReminderFor" TIMESTAMP(3);

CREATE INDEX "Event_rsvpAutoReminder_date_idx" ON "Event"("rsvpAutoReminder", "date");
