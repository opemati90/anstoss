CREATE TYPE "ClubPlanComplianceStatus" AS ENUM ('OVER_QUOTA', 'RESOLVED');

CREATE TABLE "ClubPlanCompliance" (
  "id" TEXT NOT NULL,
  "clubId" TEXT NOT NULL,
  "status" "ClubPlanComplianceStatus" NOT NULL DEFAULT 'OVER_QUOTA',
  "tier" "PlanTier" NOT NULL,
  "excessTeams" INTEGER NOT NULL DEFAULT 0,
  "excessPlayers" INTEGER NOT NULL DEFAULT 0,
  "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "remediationEndsAt" TIMESTAMP(3) NOT NULL,
  "notifiedAt" TIMESTAMP(3),
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ClubPlanCompliance_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ClubPlanCompliance_clubId_key" ON "ClubPlanCompliance"("clubId");
ALTER TABLE "ClubPlanCompliance" ADD CONSTRAINT "ClubPlanCompliance_clubId_fkey"
  FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;
