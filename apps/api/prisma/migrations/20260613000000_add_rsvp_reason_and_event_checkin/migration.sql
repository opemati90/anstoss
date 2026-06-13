-- Add Rsvp.reason (nullable enum string for INJURED/SUSPENDED/AWAY/OTHER)
ALTER TABLE "Rsvp" ADD COLUMN IF NOT EXISTS "reason" TEXT;

-- Create EventCheckIn table for player self check-in at events
CREATE TABLE IF NOT EXISTS "event_check_ins" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "checkedInAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_check_ins_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "event_check_ins_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "event_check_ins_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "event_check_ins_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "event_check_ins_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Create unique constraint on (eventId, userId)
CREATE UNIQUE INDEX IF NOT EXISTS "event_check_ins_eventId_userId_key" ON "event_check_ins"("eventId", "userId");

-- Create index on (clubId, checkedInAt)
CREATE INDEX IF NOT EXISTS "event_check_ins_clubId_checkedInAt_idx" ON "event_check_ins"("clubId", "checkedInAt");
