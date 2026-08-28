CREATE TYPE "OwnershipTransferChallengeAction" AS ENUM ('INITIATE', 'ACCEPT');

CREATE TABLE "OwnershipTransferChallenge" (
  "id" TEXT NOT NULL,
  "clubId" TEXT NOT NULL,
  "transferId" TEXT,
  "actorUserId" TEXT NOT NULL,
  "targetUserId" TEXT NOT NULL,
  "action" "OwnershipTransferChallengeAction" NOT NULL,
  "codeHash" TEXT NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OwnershipTransferChallenge_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OwnershipTransferChallenge_actorUserId_action_createdAt_idx"
  ON "OwnershipTransferChallenge"("actorUserId", "action", "createdAt");
CREATE INDEX "OwnershipTransferChallenge_transferId_action_idx"
  ON "OwnershipTransferChallenge"("transferId", "action");
