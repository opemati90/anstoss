-- Recurring events: a series remembers the rule; each occurrence is a real Event.
CREATE TABLE "EventSeries" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" "EventType" NOT NULL DEFAULT 'TRAINING',
    "intervalWeeks" INTEGER NOT NULL DEFAULT 1,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "until" TIMESTAMP(3) NOT NULL,
    "location" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventSeries_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EventSeries_teamId_idx" ON "EventSeries"("teamId");
CREATE INDEX "EventSeries_clubId_idx" ON "EventSeries"("clubId");

ALTER TABLE "Event" ADD COLUMN "seriesId" TEXT;
CREATE INDEX "Event_seriesId_idx" ON "Event"("seriesId");
ALTER TABLE "Event" ADD CONSTRAINT "Event_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "EventSeries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
