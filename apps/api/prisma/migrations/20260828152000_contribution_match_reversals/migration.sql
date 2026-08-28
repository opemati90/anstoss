ALTER TYPE "ContributionMatchStatus" ADD VALUE IF NOT EXISTS 'REVERSED';

ALTER TABLE "ContributionMatch"
  ADD COLUMN "reversedById" TEXT,
  ADD COLUMN "reversedAt" TIMESTAMP(3),
  ADD COLUMN "reversalReason" TEXT;
