-- Wechselbörse: trials pipeline, Gesuche and Vereinswechsel tracking.

-- TrialInviteStatus: new pipeline states. PENDING stays "Eingeladen",
-- ACCEPTED stays "Termin zugesagt".
ALTER TYPE "TrialInviteStatus" ADD VALUE IF NOT EXISTS 'REQUESTED';
ALTER TYPE "TrialInviteStatus" ADD VALUE IF NOT EXISTS 'OFFERED';
ALTER TYPE "TrialInviteStatus" ADD VALUE IF NOT EXISTS 'JOINED';
ALTER TYPE "TrialInviteStatus" ADD VALUE IF NOT EXISTS 'REJECTED';
ALTER TYPE "TrialInviteStatus" ADD VALUE IF NOT EXISTS 'WITHDRAWN';

-- CreateEnum
CREATE TYPE "TrialInitiator" AS ENUM ('CLUB', 'PLAYER');
CREATE TYPE "PlayerSearchStatus" AS ENUM ('OPEN', 'FILLED', 'CLOSED');
CREATE TYPE "WechselReleaseStatus" AS ENUM ('PENDING', 'GRANTED', 'REFUSED', 'NOT_NEEDED');

-- FreeAgentProfile: search fields
ALTER TABLE "FreeAgentProfile"
  ADD COLUMN "postalCode" VARCHAR(5),
  ADD COLUMN "searchRadiusKm" INTEGER,
  ADD COLUMN "highestLeague" VARCHAR(32),
  ADD COLUMN "currentClubName" VARCHAR(100),
  ADD COLUMN "availableFrom" DATE;
CREATE INDEX "FreeAgentProfile_postalCode_idx" ON "FreeAgentProfile"("postalCode");

-- PlayerSearch (Gesuch)
CREATE TABLE "PlayerSearch" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "positions" "PlayerPosition"[],
    "note" VARCHAR(500),
    "status" "PlayerSearchStatus" NOT NULL DEFAULT 'OPEN',
    "createdByUserId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlayerSearch_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PlayerSearch_clubId_status_idx" ON "PlayerSearch"("clubId", "status");
CREATE INDEX "PlayerSearch_status_expiresAt_idx" ON "PlayerSearch"("status", "expiresAt");
CREATE INDEX "PlayerSearch_teamId_idx" ON "PlayerSearch"("teamId");
ALTER TABLE "PlayerSearch" ADD CONSTRAINT "PlayerSearch_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlayerSearch" ADD CONSTRAINT "PlayerSearch_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlayerSearch" ADD CONSTRAINT "PlayerSearch_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- TrialInvite: pipeline fields
ALTER TABLE "TrialInvite"
  ADD COLUMN "initiatedBy" "TrialInitiator" NOT NULL DEFAULT 'CLUB',
  ADD COLUMN "playerSearchId" TEXT,
  ADD COLUMN "sessionEventIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "feedback" VARCHAR(1000),
  ADD COLUMN "rating" INTEGER,
  ADD COLUMN "attended" BOOLEAN,
  ADD COLUMN "decisionMessage" VARCHAR(500),
  ADD COLUMN "decidedAt" TIMESTAMP(3),
  ADD COLUMN "decidedByUserId" TEXT;
CREATE INDEX "TrialInvite_playerSearchId_idx" ON "TrialInvite"("playerSearchId");
ALTER TABLE "TrialInvite" ADD CONSTRAINT "TrialInvite_playerSearchId_fkey" FOREIGN KEY ("playerSearchId") REFERENCES "PlayerSearch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- JoinRequest: Aufnahmeantrag + Wechsel tracking
ALTER TABLE "JoinRequest"
  ADD COLUMN "trialInviteId" TEXT,
  ADD COLUMN "street" VARCHAR(120),
  ADD COLUMN "postalCode" VARCHAR(5),
  ADD COLUMN "city" VARCHAR(80),
  ADD COLUMN "phone" VARCHAR(40),
  ADD COLUMN "nationality" VARCHAR(60),
  ADD COLUMN "previousClubName" VARCHAR(120),
  ADD COLUMN "lastMatchDate" DATE,
  ADD COLUMN "sepaConsentAt" TIMESTAMP(3),
  ADD COLUMN "parentalConsentAt" TIMESTAMP(3),
  ADD COLUMN "releaseStatus" "WechselReleaseStatus",
  ADD COLUMN "passApplicationAt" DATE,
  ADD COLUMN "eligibleFrom" DATE;
CREATE UNIQUE INDEX "JoinRequest_trialInviteId_key" ON "JoinRequest"("trialInviteId");
ALTER TABLE "JoinRequest" ADD CONSTRAINT "JoinRequest_trialInviteId_fkey" FOREIGN KEY ("trialInviteId") REFERENCES "TrialInvite"("id") ON DELETE SET NULL ON UPDATE CASCADE;
