-- Preserve the Apple proof time while email ownership is being confirmed.
-- Existing pending Apple links fail closed and must be started again.
ALTER TABLE "SocialLoginChallenge" ADD COLUMN "providerAuthenticatedAt" TIMESTAMP(3);
