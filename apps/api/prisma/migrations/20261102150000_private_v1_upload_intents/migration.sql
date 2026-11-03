BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '15s';

ALTER TABLE "AccountMediaDeletion"
  ADD COLUMN "uploadOwnerId" TEXT,
  ADD COLUMN "uploadRequestId" TEXT,
  ADD COLUMN "uploadFingerprint" TEXT,
  ADD COLUMN "uploadExpiresAt" TIMESTAMP(3),
  ADD COLUMN "uploadState" TEXT,
  ADD COLUMN "uploadMessageId" TEXT;

ALTER TABLE "AccountMediaDeletion" ADD CONSTRAINT "AccountMediaDeletion_upload_state_check" CHECK (
  ("uploadState" IS NULL AND "uploadOwnerId" IS NULL AND "uploadRequestId" IS NULL
    AND "uploadFingerprint" IS NULL AND "uploadExpiresAt" IS NULL AND "uploadMessageId" IS NULL)
  OR ("uploadState" = 'PENDING' AND "uploadOwnerId" IS NOT NULL AND "uploadRequestId" IS NOT NULL
    AND "uploadFingerprint" IS NOT NULL AND "uploadExpiresAt" IS NOT NULL AND "uploadMessageId" IS NULL)
  OR ("uploadState" = 'BOUND' AND "uploadOwnerId" IS NOT NULL AND "uploadRequestId" IS NOT NULL
    AND "uploadFingerprint" IS NOT NULL AND "uploadExpiresAt" IS NOT NULL AND "uploadMessageId" IS NOT NULL)
);

CREATE INDEX "AccountMediaDeletion_uploadOwnerId_uploadState_idx" ON "AccountMediaDeletion"("uploadOwnerId", "uploadState");
CREATE UNIQUE INDEX "AccountMediaDeletion_uploadOwnerId_uploadRequestId_key" ON "AccountMediaDeletion"("uploadOwnerId", "uploadRequestId");
COMMIT;
