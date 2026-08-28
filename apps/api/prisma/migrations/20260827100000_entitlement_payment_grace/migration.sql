ALTER TABLE "EntitlementGrant"
ADD COLUMN "graceEndsAt" TIMESTAMP(3);

CREATE INDEX "EntitlementGrant_clubId_status_graceEndsAt_idx"
ON "EntitlementGrant"("clubId", "status", "graceEndsAt");
