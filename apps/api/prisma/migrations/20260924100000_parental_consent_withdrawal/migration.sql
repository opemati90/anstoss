-- Privacy: guardian consent withdrawal (GDPR Art. 7(3)).

ALTER TYPE "ParentalConsentStatus" ADD VALUE IF NOT EXISTS 'WITHDRAWN';

ALTER TABLE "ParentalConsent"
  ADD COLUMN "withdrawnAt" TIMESTAMP(3),
  ADD COLUMN "withdrawnByUserId" TEXT,
  ADD COLUMN "withdrawalReason" TEXT,
  ADD COLUMN "withdrawalNote" TEXT;
