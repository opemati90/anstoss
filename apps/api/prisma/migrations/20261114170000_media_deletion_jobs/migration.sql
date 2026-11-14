CREATE TABLE "MediaDeletionJob" (
  "id" TEXT NOT NULL,
  "objectKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MediaDeletionJob_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MediaDeletionJob_objectKey_key" ON "MediaDeletionJob"("objectKey");
CREATE INDEX "MediaDeletionJob_nextAttemptAt_idx" ON "MediaDeletionJob"("nextAttemptAt");
