ALTER TABLE "PrivateMediaUpload"
  ADD COLUMN "cleanupAvailableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "cleanupClaimId" TEXT;

CREATE INDEX "PrivateMediaUpload_clubId_cleanupAvailableAt_idx"
  ON "PrivateMediaUpload"("clubId", "cleanupAvailableAt");
