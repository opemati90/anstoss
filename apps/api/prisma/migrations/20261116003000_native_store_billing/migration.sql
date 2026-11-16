CREATE TABLE "StorePurchaseAccount" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "clubId" TEXT NOT NULL REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "StorePurchaseAccount_clubId_userId_key" ON "StorePurchaseAccount"("clubId", "userId");

CREATE TABLE "StoreSubscription" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "clubId" TEXT NOT NULL REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "accountId" TEXT NOT NULL REFERENCES "StorePurchaseAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "store" TEXT NOT NULL CHECK ("store" IN ('APPLE', 'GOOGLE')),
  "environment" TEXT NOT NULL CHECK ("environment" IN ('PRODUCTION', 'SANDBOX')),
  "originalId" TEXT NOT NULL,
  "sealedReference" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "autoRenew" BOOLEAN NOT NULL DEFAULT false,
  "grantId" TEXT NOT NULL REFERENCES "EntitlementGrant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "observedAt" TIMESTAMP(3) NOT NULL,
  "lastCheckedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "StoreSubscription_grantId_key" ON "StoreSubscription"("grantId");
CREATE UNIQUE INDEX "StoreSubscription_store_environment_originalId_key" ON "StoreSubscription"("store", "environment", "originalId");
CREATE INDEX "StoreSubscription_clubId_expiresAt_idx" ON "StoreSubscription"("clubId", "expiresAt");
CREATE INDEX "StoreSubscription_lastCheckedAt_idx" ON "StoreSubscription"("lastCheckedAt");
