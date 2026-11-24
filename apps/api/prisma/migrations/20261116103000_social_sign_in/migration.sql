CREATE TABLE "SocialIdentity" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "provider" TEXT NOT NULL,
  "subjectHash" TEXT NOT NULL,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "sealedRefreshToken" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "SocialIdentity_provider_subjectHash_key" ON "SocialIdentity"("provider", "subjectHash");
CREATE UNIQUE INDEX "SocialIdentity_provider_userId_key" ON "SocialIdentity"("provider", "userId");
CREATE INDEX "SocialIdentity_userId_idx" ON "SocialIdentity"("userId");
CREATE TABLE "SocialLoginChallenge" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tokenHash" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "subjectHash" TEXT,
  "userId" TEXT,
  "email" TEXT,
  "sealedRefreshToken" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "SocialLoginChallenge_tokenHash_key" ON "SocialLoginChallenge"("tokenHash");
CREATE INDEX "SocialLoginChallenge_expiresAt_idx" ON "SocialLoginChallenge"("expiresAt");
