CREATE TYPE "ClubClaimKind" AS ENUM ('FIRST_CLAIM', 'STAFF_CLAIM');
CREATE TYPE "ClubClaimStatus" AS ENUM ('SUBMITTED', 'NEEDS_INFO', 'APPROVED', 'REJECTED', 'WITHDRAWN', 'EXPIRED');
CREATE TYPE "ClubClaimEvidenceType" AS ENUM ('OFFICIAL_EMAIL', 'EXISTING_STAFF_APPROVAL', 'PUBLIC_CLUB_CONTACT', 'PLATFORM_REVIEW');
CREATE TYPE "ClubDisputeStatus" AS ENUM ('OPEN', 'FROZEN', 'RESOLVED');
CREATE TYPE "OwnershipTransferStatus" AS ENUM ('PENDING', 'ACCEPTED', 'CANCELLED', 'EXPIRED');
CREATE TYPE "InviteCampaignType" AS ENUM ('IDENTITY_BOUND', 'APPROVAL_REQUIRED');
CREATE TYPE "InviteCampaignStatus" AS ENUM ('ACTIVE', 'PAUSED', 'EXPIRED', 'REVOKED');
CREATE TYPE "PlanTier" AS ENUM ('FREE', 'PRO', 'SCALE');
CREATE TYPE "PlanInterval" AS ENUM ('SIX_MONTHS', 'TWELVE_MONTHS');
CREATE TYPE "EntitlementSource" AS ENUM ('PAID', 'COMPLIMENTARY', 'TRIAL', 'MIGRATED');
CREATE TYPE "EntitlementStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'EXPIRED', 'REVOKED');
CREATE TYPE "BankImportStatus" AS ENUM ('PARSED', 'REVIEWED', 'APPLIED', 'FAILED');
CREATE TYPE "ContributionMatchStatus" AS ENUM ('SUGGESTED', 'CONFIRMED', 'REJECTED');

ALTER TYPE "ContributionCadence" ADD VALUE IF NOT EXISTS 'QUARTERLY';
ALTER TYPE "ContributionCadence" ADD VALUE IF NOT EXISTS 'ONE_OFF';
ALTER TYPE "ContributionReminderStatus" ADD VALUE IF NOT EXISTS 'PROCESSING';
ALTER TABLE "ContributionAssignment" ADD COLUMN "amountOverride" INTEGER;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "Membership"
    WHERE "role" = 'OWNER'
    GROUP BY "clubId"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot enforce one OWNER per club: duplicate OWNER memberships exist';
  END IF;
END $$;

CREATE UNIQUE INDEX "Membership_one_owner_per_club_key"
  ON "Membership"("clubId") WHERE "role" = 'OWNER';

CREATE TABLE "ClubClaim" (
  "id" TEXT NOT NULL,
  "directoryEntryId" TEXT NOT NULL,
  "clubId" TEXT,
  "claimantUserId" TEXT NOT NULL,
  "kind" "ClubClaimKind" NOT NULL,
  "desiredRole" "MembershipRole" NOT NULL,
  "requestedTeamIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "requestedTeamRoles" "TeamRole"[] NOT NULL DEFAULT ARRAY[]::"TeamRole"[],
  "teamName" TEXT,
  "teamGroupType" "TeamGroupType",
  "requestedPrimaryColor" TEXT,
  "externalTeamUrl" TEXT,
  "status" "ClubClaimStatus" NOT NULL DEFAULT 'SUBMITTED',
  "reviewerId" TEXT,
  "reviewNote" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ClubClaim_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ClubClaimEvidence" (
  "id" TEXT NOT NULL,
  "claimId" TEXT NOT NULL,
  "submittedById" TEXT NOT NULL,
  "type" "ClubClaimEvidenceType" NOT NULL,
  "value" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ClubClaimEvidence_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ClubDispute" (
  "id" TEXT NOT NULL,
  "clubId" TEXT NOT NULL,
  "openedById" TEXT NOT NULL,
  "status" "ClubDisputeStatus" NOT NULL DEFAULT 'OPEN',
  "reason" TEXT NOT NULL,
  "resolution" TEXT,
  "resolvedById" TEXT,
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ClubDispute_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OwnershipTransfer" (
  "id" TEXT NOT NULL,
  "clubId" TEXT NOT NULL,
  "fromUserId" TEXT NOT NULL,
  "toUserId" TEXT NOT NULL,
  "status" "OwnershipTransferStatus" NOT NULL DEFAULT 'PENDING',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "acceptedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OwnershipTransfer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InviteCampaign" (
  "id" TEXT NOT NULL,
  "clubId" TEXT NOT NULL,
  "teamId" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "type" "InviteCampaignType" NOT NULL,
  "role" "TeamRole" NOT NULL DEFAULT 'PLAYER',
  "recipientEmail" TEXT,
  "code" TEXT NOT NULL,
  "maxUses" INTEGER NOT NULL DEFAULT 1,
  "useCount" INTEGER NOT NULL DEFAULT 0,
  "status" "InviteCampaignStatus" NOT NULL DEFAULT 'ACTIVE',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InviteCampaign_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InviteRedemption" (
  "id" TEXT NOT NULL,
  "clubId" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InviteRedemption_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PlanDefinition" (
  "id" TEXT NOT NULL,
  "tier" "PlanTier" NOT NULL,
  "interval" "PlanInterval" NOT NULL,
  "version" INTEGER NOT NULL,
  "priceCents" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'eur',
  "teamLimit" INTEGER NOT NULL,
  "playerLimit" INTEGER NOT NULL,
  "features" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "stripePriceId" TEXT,
  "publishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PlanDefinition_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EntitlementGrant" (
  "id" TEXT NOT NULL,
  "clubId" TEXT NOT NULL,
  "tier" "PlanTier" NOT NULL,
  "source" "EntitlementSource" NOT NULL,
  "status" "EntitlementStatus" NOT NULL DEFAULT 'ACTIVE',
  "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3),
  "reason" TEXT,
  "createdById" TEXT,
  "stripeSubscriptionId" TEXT,
  "planDefinitionId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EntitlementGrant_pkey" PRIMARY KEY ("id")
);

INSERT INTO "PlanDefinition" ("id", "tier", "interval", "version", "priceCents", "currency", "teamLimit", "playerLimit", "features", "publishedAt", "updatedAt") VALUES
  ('plan_pro_6m_v1', 'PRO', 'SIX_MONTHS', 1, 8900, 'eur', 5, 150, ARRAY['contribution_intake','bank_reconciliation','fixture_sync','sponsor_logos','lineup_builder_pro'], CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('plan_pro_12m_v1', 'PRO', 'TWELVE_MONTHS', 1, 14900, 'eur', 5, 150, ARRAY['contribution_intake','bank_reconciliation','fixture_sync','sponsor_logos','lineup_builder_pro'], CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('plan_scale_6m_v1', 'SCALE', 'SIX_MONTHS', 1, 14900, 'eur', 20, 600, ARRAY['contribution_intake','bank_reconciliation','fixture_sync','sponsor_logos','lineup_builder_pro','priority_support','custom_domain'], CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('plan_scale_12m_v1', 'SCALE', 'TWELVE_MONTHS', 1, 24900, 'eur', 20, 600, ARRAY['contribution_intake','bank_reconciliation','fixture_sync','sponsor_logos','lineup_builder_pro','priority_support','custom_domain'], CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- Preserve access for subscriptions that predate versioned plan definitions. Future
-- webhook events keep this explicit tier unless their Stripe price maps to a plan.
INSERT INTO "EntitlementGrant" (
  "id", "clubId", "tier", "source", "status", "startsAt", "expiresAt",
  "reason", "stripeSubscriptionId", "planDefinitionId", "createdAt", "updatedAt"
)
SELECT
  'migrated_' || md5("stripeSubscriptionId"),
  "clubId",
  'PRO'::"PlanTier",
  'MIGRATED'::"EntitlementSource",
  CASE
    WHEN "status" IN ('active', 'trialing') THEN 'ACTIVE'::"EntitlementStatus"
    WHEN "status" IN ('canceled', 'unpaid', 'incomplete_expired') THEN 'REVOKED'::"EntitlementStatus"
    ELSE 'SUSPENDED'::"EntitlementStatus"
  END,
  "currentPeriodStart",
  "currentPeriodEnd",
  'Migrated legacy Stripe subscription',
  "stripeSubscriptionId",
  'plan_pro_12m_v1',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Subscription";

CREATE TABLE "BankImportBatch" (
  "id" TEXT NOT NULL,
  "clubId" TEXT NOT NULL,
  "importedById" TEXT NOT NULL,
  "contentHash" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "format" TEXT NOT NULL,
  "status" "BankImportStatus" NOT NULL DEFAULT 'PARSED',
  "rowCount" INTEGER NOT NULL DEFAULT 0,
  "error" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BankImportBatch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BankTransaction" (
  "id" TEXT NOT NULL,
  "clubId" TEXT NOT NULL,
  "batchId" TEXT NOT NULL,
  "bookedAt" TIMESTAMP(3) NOT NULL,
  "amount" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'eur',
  "payerName" TEXT,
  "ibanLast4" TEXT,
  "reference" TEXT,
  "externalId" TEXT,
  "fingerprint" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BankTransaction_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ContributionMatch" (
  "id" TEXT NOT NULL,
  "clubId" TEXT NOT NULL,
  "transactionId" TEXT NOT NULL,
  "recordId" TEXT NOT NULL,
  "amount" INTEGER NOT NULL,
  "confidence" INTEGER NOT NULL,
  "status" "ContributionMatchStatus" NOT NULL DEFAULT 'SUGGESTED',
  "confirmedById" TEXT,
  "confirmedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ContributionMatch_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ClubClaim_directoryEntryId_status_idx" ON "ClubClaim"("directoryEntryId", "status");
CREATE INDEX "ClubClaim_clubId_status_idx" ON "ClubClaim"("clubId", "status");
CREATE INDEX "ClubClaim_claimantUserId_status_idx" ON "ClubClaim"("claimantUserId", "status");
CREATE INDEX "ClubClaimEvidence_claimId_idx" ON "ClubClaimEvidence"("claimId");
CREATE INDEX "ClubDispute_clubId_status_idx" ON "ClubDispute"("clubId", "status");
CREATE INDEX "OwnershipTransfer_clubId_status_idx" ON "OwnershipTransfer"("clubId", "status");
CREATE INDEX "OwnershipTransfer_toUserId_status_idx" ON "OwnershipTransfer"("toUserId", "status");
CREATE UNIQUE INDEX "InviteCampaign_code_key" ON "InviteCampaign"("code");
CREATE INDEX "InviteCampaign_clubId_status_idx" ON "InviteCampaign"("clubId", "status");
CREATE INDEX "InviteCampaign_teamId_status_idx" ON "InviteCampaign"("teamId", "status");
CREATE INDEX "InviteCampaign_recipientEmail_idx" ON "InviteCampaign"("recipientEmail");
CREATE UNIQUE INDEX "InviteRedemption_campaignId_userId_key" ON "InviteRedemption"("campaignId", "userId");
CREATE INDEX "InviteRedemption_clubId_userId_idx" ON "InviteRedemption"("clubId", "userId");
CREATE UNIQUE INDEX "PlanDefinition_stripePriceId_key" ON "PlanDefinition"("stripePriceId");
CREATE UNIQUE INDEX "PlanDefinition_tier_interval_version_key" ON "PlanDefinition"("tier", "interval", "version");
CREATE INDEX "PlanDefinition_tier_publishedAt_idx" ON "PlanDefinition"("tier", "publishedAt");
CREATE INDEX "EntitlementGrant_clubId_status_startsAt_expiresAt_idx" ON "EntitlementGrant"("clubId", "status", "startsAt", "expiresAt");
CREATE UNIQUE INDEX "EntitlementGrant_stripeSubscriptionId_key" ON "EntitlementGrant"("stripeSubscriptionId");
CREATE INDEX "EntitlementGrant_planDefinitionId_idx" ON "EntitlementGrant"("planDefinitionId");
CREATE UNIQUE INDEX "BankImportBatch_clubId_contentHash_key" ON "BankImportBatch"("clubId", "contentHash");
CREATE INDEX "BankImportBatch_clubId_createdAt_idx" ON "BankImportBatch"("clubId", "createdAt");
CREATE UNIQUE INDEX "BankTransaction_clubId_fingerprint_key" ON "BankTransaction"("clubId", "fingerprint");
CREATE INDEX "BankTransaction_batchId_idx" ON "BankTransaction"("batchId");
CREATE INDEX "BankTransaction_clubId_bookedAt_idx" ON "BankTransaction"("clubId", "bookedAt");
CREATE UNIQUE INDEX "ContributionMatch_transactionId_recordId_key" ON "ContributionMatch"("transactionId", "recordId");
CREATE INDEX "ContributionMatch_clubId_status_idx" ON "ContributionMatch"("clubId", "status");
CREATE INDEX "ContributionMatch_recordId_idx" ON "ContributionMatch"("recordId");

ALTER TABLE "ClubClaim" ADD CONSTRAINT "ClubClaim_directoryEntryId_fkey" FOREIGN KEY ("directoryEntryId") REFERENCES "ClubDirectoryEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClubClaim" ADD CONSTRAINT "ClubClaim_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClubClaim" ADD CONSTRAINT "ClubClaim_claimantUserId_fkey" FOREIGN KEY ("claimantUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClubClaimEvidence" ADD CONSTRAINT "ClubClaimEvidence_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "ClubClaim"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClubClaimEvidence" ADD CONSTRAINT "ClubClaimEvidence_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClubDispute" ADD CONSTRAINT "ClubDispute_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OwnershipTransfer" ADD CONSTRAINT "OwnershipTransfer_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OwnershipTransfer" ADD CONSTRAINT "OwnershipTransfer_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OwnershipTransfer" ADD CONSTRAINT "OwnershipTransfer_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InviteCampaign" ADD CONSTRAINT "InviteCampaign_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InviteCampaign" ADD CONSTRAINT "InviteCampaign_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InviteCampaign" ADD CONSTRAINT "InviteCampaign_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InviteRedemption" ADD CONSTRAINT "InviteRedemption_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InviteRedemption" ADD CONSTRAINT "InviteRedemption_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "InviteCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InviteRedemption" ADD CONSTRAINT "InviteRedemption_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EntitlementGrant" ADD CONSTRAINT "EntitlementGrant_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EntitlementGrant" ADD CONSTRAINT "EntitlementGrant_planDefinitionId_fkey" FOREIGN KEY ("planDefinitionId") REFERENCES "PlanDefinition"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BankImportBatch" ADD CONSTRAINT "BankImportBatch_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "BankImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContributionMatch" ADD CONSTRAINT "ContributionMatch_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContributionMatch" ADD CONSTRAINT "ContributionMatch_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "BankTransaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContributionMatch" ADD CONSTRAINT "ContributionMatch_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "ContributionRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
