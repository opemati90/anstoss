-- Events revamp: matchday logistics on the event, multi-weekday series,
-- RSVP notes + Kader nomination, and the Fahrgemeinschaft (carpool) board.

-- CreateEnum
CREATE TYPE "HomeAway" AS ENUM ('HOME', 'AWAY');

-- Event: logistics, fixture link (replaces the ±5 min kickoff heuristic), Kader, lineup
ALTER TABLE "Event" ADD COLUMN "meetingAt" TIMESTAMP(3);
ALTER TABLE "Event" ADD COLUMN "meetingPoint" TEXT;
ALTER TABLE "Event" ADD COLUMN "opponent" TEXT;
ALTER TABLE "Event" ADD COLUMN "homeAway" "HomeAway";
ALTER TABLE "Event" ADD COLUMN "fixtureId" TEXT;
ALTER TABLE "Event" ADD COLUMN "squadPublishedAt" TIMESTAMP(3);
ALTER TABLE "Event" ADD COLUMN "carpoolEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Event" ADD COLUMN "durationMin" INTEGER;
ALTER TABLE "Event" ADD COLUMN "lineup" JSONB;

CREATE UNIQUE INDEX "Event_fixtureId_key" ON "Event"("fixtureId");
ALTER TABLE "Event" ADD CONSTRAINT "Event_fixtureId_fkey" FOREIGN KEY ("fixtureId") REFERENCES "ImportedFixture"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- EventSeries: several training days per week + meeting offset + duration
ALTER TABLE "EventSeries" ADD COLUMN "weekdays" INTEGER[] DEFAULT ARRAY[]::INTEGER[];
ALTER TABLE "EventSeries" ADD COLUMN "meetingOffsetMin" INTEGER;
ALTER TABLE "EventSeries" ADD COLUMN "durationMin" INTEGER;

-- Rsvp: free-text note + Kader nomination
ALTER TABLE "Rsvp" ADD COLUMN "note" VARCHAR(200);
ALTER TABLE "Rsvp" ADD COLUMN "nominated" BOOLEAN NOT NULL DEFAULT false;

-- Legacy reason spelling
UPDATE "Rsvp" SET "reason" = 'injured' WHERE "reason" = 'injury';

-- Backfill the fixture link for events created by the fussball.de import.
UPDATE "Event" e
SET "fixtureId" = f."id"
FROM "ImportedFixture" f
WHERE e."externalMatchKey" IS NOT NULL
  AND e."fixtureId" IS NULL
  AND e."teamId" = f."teamId"
  AND e."externalMatchKey" = f."provider"::text || ':' || f."externalMatchId"
  AND NOT EXISTS (SELECT 1 FROM "Event" e2 WHERE e2."fixtureId" = f."id");

-- CreateTable
CREATE TABLE "CarpoolRide" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "driverUserId" TEXT NOT NULL,
    "seats" INTEGER NOT NULL,
    "departFrom" TEXT,
    "departAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CarpoolRide_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CarpoolSeat" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "rideId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CarpoolSeat_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CarpoolRide_eventId_driverUserId_key" ON "CarpoolRide"("eventId", "driverUserId");
CREATE INDEX "CarpoolRide_clubId_idx" ON "CarpoolRide"("clubId");
CREATE INDEX "CarpoolRide_eventId_idx" ON "CarpoolRide"("eventId");
CREATE UNIQUE INDEX "CarpoolSeat_rideId_userId_key" ON "CarpoolSeat"("rideId", "userId");
CREATE INDEX "CarpoolSeat_userId_idx" ON "CarpoolSeat"("userId");
CREATE INDEX "CarpoolSeat_clubId_idx" ON "CarpoolSeat"("clubId");

ALTER TABLE "CarpoolRide" ADD CONSTRAINT "CarpoolRide_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CarpoolRide" ADD CONSTRAINT "CarpoolRide_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CarpoolRide" ADD CONSTRAINT "CarpoolRide_driverUserId_fkey" FOREIGN KEY ("driverUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CarpoolSeat" ADD CONSTRAINT "CarpoolSeat_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CarpoolSeat" ADD CONSTRAINT "CarpoolSeat_rideId_fkey" FOREIGN KEY ("rideId") REFERENCES "CarpoolRide"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CarpoolSeat" ADD CONSTRAINT "CarpoolSeat_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
