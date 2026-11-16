ALTER TABLE "StoreSubscription" ADD COLUMN "deferredFromProductId" TEXT;
ALTER TABLE "StoreSubscription" ADD COLUMN "deferredToProductId" TEXT;

CREATE TABLE "StoreCheckoutOwner" (
  "clubId" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "store" TEXT NOT NULL CHECK ("store" IN ('APPLE', 'GOOGLE')),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StoreCheckoutOwner_pkey" PRIMARY KEY ("clubId"),
  CONSTRAINT "StoreCheckoutOwner_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "StoreCheckoutOwner_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "StorePurchaseAccount"("id") ON DELETE NO ACTION ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "StoreCheckoutOwner_accountId_key" ON "StoreCheckoutOwner"("accountId");
