-- Club-admin revamp: compliance records (Führungszeugnis for youth staff,
-- Spielerpass, certificates, SEPA mandate, data consent). One row per
-- member + kind per club.
CREATE TYPE "ComplianceKind" AS ENUM (
  'FUEHRUNGSZEUGNIS',
  'SPIELERPASS',
  'MEDICAL_CHECK',
  'VACCINATION_TETANUS',
  'FIRST_AID_CERT',
  'SEPA_MANDATE',
  'DATA_CONSENT'
);

CREATE TABLE "ComplianceRecord" (
  "id" TEXT NOT NULL,
  "clubId" TEXT NOT NULL,
  "memberUserId" TEXT NOT NULL,
  "kind" "ComplianceKind" NOT NULL,
  "issuedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  "documentUrl" TEXT,
  "note" VARCHAR(500),
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ComplianceRecord_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ComplianceRecord_clubId_memberUserId_kind_key"
  ON "ComplianceRecord"("clubId", "memberUserId", "kind");
CREATE INDEX "ComplianceRecord_clubId_kind_idx" ON "ComplianceRecord"("clubId", "kind");

ALTER TABLE "ComplianceRecord"
  ADD CONSTRAINT "ComplianceRecord_clubId_fkey"
  FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ComplianceRecord"
  ADD CONSTRAINT "ComplianceRecord_memberUserId_fkey"
  FOREIGN KEY ("memberUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ComplianceRecord"
  ADD CONSTRAINT "ComplianceRecord_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
