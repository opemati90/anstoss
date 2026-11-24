ALTER TABLE "SocialIdentity" ADD COLUMN "cleanupNextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "SocialLoginChallenge" ADD COLUMN "cleanupNextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
CREATE INDEX "SocialIdentity_cleanupNextAttemptAt_id_idx" ON "SocialIdentity"("cleanupNextAttemptAt", "id");
CREATE INDEX "SocialLoginChallenge_provider_cleanupNextAttemptAt_id_idx" ON "SocialLoginChallenge"("provider", "cleanupNextAttemptAt", "id");
