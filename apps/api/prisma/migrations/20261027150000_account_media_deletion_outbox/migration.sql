CREATE TABLE "AccountMediaDeletion" (
    "objectKey" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastFailureAt" TIMESTAMP(3),
    CONSTRAINT "AccountMediaDeletion_pkey" PRIMARY KEY ("objectKey")
);
CREATE INDEX "AccountMediaDeletion_availableAt_idx" ON "AccountMediaDeletion"("availableAt");
