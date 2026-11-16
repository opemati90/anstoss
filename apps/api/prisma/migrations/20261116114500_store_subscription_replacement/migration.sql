ALTER TABLE "StoreSubscription" ADD COLUMN "replacesOriginalId" TEXT;
CREATE INDEX "StoreSubscription_store_environment_replacesOriginalId_idx"
ON "StoreSubscription"("store", "environment", "replacesOriginalId");
