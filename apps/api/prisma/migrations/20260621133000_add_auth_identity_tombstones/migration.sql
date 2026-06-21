-- Tombstone deleted external auth identities so a still-valid upstream token
-- cannot JIT-create a fresh Anstoss user after local account deletion.
CREATE TABLE "AuthIdentityTombstone" (
  "id" TEXT NOT NULL,
  "provider" TEXT NOT NULL DEFAULT 'clerk',
  "subjectHash" TEXT NOT NULL,
  "deletedUserId" TEXT,
  "reason" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AuthIdentityTombstone_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AuthIdentityTombstone_provider_subjectHash_key"
  ON "AuthIdentityTombstone"("provider", "subjectHash");

CREATE INDEX "AuthIdentityTombstone_deletedUserId_idx"
  ON "AuthIdentityTombstone"("deletedUserId");
