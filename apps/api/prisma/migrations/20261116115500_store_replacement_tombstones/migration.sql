CREATE TABLE "StorePurchaseReplacement" (
  "store" TEXT NOT NULL,
  "environment" TEXT NOT NULL,
  "originalId" TEXT NOT NULL,
  "successorId" TEXT NOT NULL,
  "clubId" TEXT NOT NULL REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "accountId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("store", "environment", "originalId")
);
CREATE INDEX "StorePurchaseReplacement_clubId_idx" ON "StorePurchaseReplacement"("clubId");
INSERT INTO "StorePurchaseReplacement" ("store", "environment", "originalId", "successorId", "clubId", "accountId")
SELECT "store", "environment", "replacesOriginalId", "originalId", "clubId", "accountId"
FROM "StoreSubscription" WHERE "replacesOriginalId" IS NOT NULL
ON CONFLICT DO NOTHING;
