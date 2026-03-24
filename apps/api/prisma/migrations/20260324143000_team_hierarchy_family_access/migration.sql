-- CreateEnum
CREATE TYPE "TeamGroupType" AS ENUM ('SENIOR', 'YOUTH', 'MINI', 'CUSTOM');

-- CreateEnum
CREATE TYPE "TeamRole" AS ENUM ('HEAD_COACH', 'ASSISTANT_COACH', 'PLAYER', 'PARENT');

-- CreateEnum
CREATE TYPE "TeamAccessPhase" AS ENUM ('FULL', 'TRIAL');

-- CreateEnum
CREATE TYPE "TeamAccessStatus" AS ENUM ('PENDING', 'ACTIVE', 'REJECTED', 'REVOKED');

-- CreateEnum
CREATE TYPE "InviteKind" AS ENUM ('MEMBER_INVITE', 'PARENT_APPROVAL');

-- CreateEnum
CREATE TYPE "InviteDeliveryChannel" AS ENUM ('EMAIL', 'LINK');

-- CreateEnum
CREATE TYPE "InviteStatus" AS ENUM ('PENDING', 'SENT', 'ACCEPTED', 'EXPIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "ParentalConsentStatus" AS ENUM ('REQUIRED', 'PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ExternalDataProvider" AS ENUM ('API_FUSSBALL', 'FUSSBALL_PUBLIC_PAGE', 'OPENLIGADB', 'CLUB_MANUAL', 'WIDGET_EMBED', 'WEATHER', 'MAPS', 'VEO_MANUAL');

-- CreateEnum
CREATE TYPE "ExternalTeamLinkStatus" AS ENUM ('ACTIVE', 'NEEDS_REVIEW', 'ERROR', 'DISCONNECTED');

-- CreateEnum
CREATE TYPE "ImportedFixtureStatus" AS ENUM ('SCHEDULED', 'LIVE', 'FINISHED', 'POSTPONED', 'CANCELLED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "FixtureDataConfidence" AS ENUM ('OFFICIAL_PARTNER', 'OFFICIAL_WIDGET', 'UNOFFICIAL_PUBLIC', 'COMMUNITY_OPEN', 'CLUB_ENTERED', 'MIXED');

-- CreateEnum
CREATE TYPE "SyncRunStatus" AS ENUM ('SUCCESS', 'PARTIAL', 'FAILED');

-- CreateTable
CREATE TABLE "TeamGroup" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "type" "TeamGroupType" NOT NULL,
    "displayName" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeamGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamAccess" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "TeamRole" NOT NULL,
    "phase" "TeamAccessPhase" NOT NULL DEFAULT 'FULL',
    "status" "TeamAccessStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeamAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuardianRelationship" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "teamId" TEXT,
    "parentUserId" TEXT NOT NULL,
    "playerUserId" TEXT,
    "childName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuardianRelationship_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParentalConsent" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "playerUserId" TEXT NOT NULL,
    "guardianEmail" TEXT NOT NULL,
    "guardianUserId" TEXT,
    "status" "ParentalConsentStatus" NOT NULL DEFAULT 'REQUIRED',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ParentalConsent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalTeamLink" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "provider" "ExternalDataProvider" NOT NULL,
    "externalTeamId" TEXT NOT NULL,
    "externalClubId" TEXT,
    "externalUrl" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "status" "ExternalTeamLinkStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalTeamLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportedFixture" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "teamLinkId" TEXT NOT NULL,
    "provider" "ExternalDataProvider" NOT NULL,
    "externalMatchId" TEXT NOT NULL,
    "competition" TEXT NOT NULL,
    "season" TEXT,
    "kickoffAt" TIMESTAMP(3) NOT NULL,
    "status" "ImportedFixtureStatus" NOT NULL DEFAULT 'SCHEDULED',
    "homeTeam" TEXT NOT NULL,
    "awayTeam" TEXT NOT NULL,
    "homeLogo" TEXT,
    "awayLogo" TEXT,
    "venueName" TEXT,
    "pitchAddress" TEXT,
    "resultHome" INTEGER,
    "resultAway" INTEGER,
    "tableSnapshot" JSONB,
    "rawPayload" JSONB NOT NULL,
    "sourceConfidence" "FixtureDataConfidence" NOT NULL DEFAULT 'UNOFFICIAL_PUBLIC',
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportedFixture_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FixtureOverlay" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "fixtureId" TEXT NOT NULL,
    "arrivalTime" TIMESTAMP(3),
    "meetingPoint" TEXT,
    "kitColor" TEXT,
    "travelNotes" TEXT,
    "squadDeadline" TIMESTAMP(3),
    "veoLink" TEXT,
    "fieldLocks" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FixtureOverlay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncRun" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "teamLinkId" TEXT NOT NULL,
    "provider" "ExternalDataProvider" NOT NULL,
    "status" "SyncRunStatus" NOT NULL,
    "importedCount" INTEGER NOT NULL DEFAULT 0,
    "updatedCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "parserVersion" TEXT NOT NULL,
    "errorSummary" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SyncRun_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Team"
    ADD COLUMN "displayName" TEXT,
    ADD COLUMN "groupId" TEXT,
    ADD COLUMN "leagueName" TEXT,
    ADD COLUMN "squadLabel" TEXT,
    ADD COLUMN "updatedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Event"
    ADD COLUMN "externalMatchKey" TEXT;

-- AlterTable
ALTER TABLE "Invite"
    ADD COLUMN "acceptedAt" TIMESTAMP(3),
    ADD COLUMN "acceptedByUserId" TEXT,
    ADD COLUMN "childName" TEXT,
    ADD COLUMN "createdById" TEXT,
    ADD COLUMN "deliveryChannel" "InviteDeliveryChannel",
    ADD COLUMN "guardianEmail" TEXT,
    ADD COLUMN "kind" "InviteKind" NOT NULL DEFAULT 'MEMBER_INVITE',
    ADD COLUMN "parentalConsentId" TEXT,
    ADD COLUMN "phase" "TeamAccessPhase" NOT NULL DEFAULT 'FULL',
    ADD COLUMN "recipientEmail" TEXT,
    ADD COLUMN "revokedAt" TIMESTAMP(3),
    ADD COLUMN "role" "TeamRole",
    ADD COLUMN "status" "InviteStatus" NOT NULL DEFAULT 'PENDING',
    ADD COLUMN "teamId" TEXT,
    ADD COLUMN "updatedAt" TIMESTAMP(3);

-- Seed umbrella groups from legacy teams so existing clubs keep their structure.
WITH normalized_groups AS (
    SELECT DISTINCT
        t."clubId",
        COALESCE(NULLIF(BTRIM(t."ageGroup"), ''), 'Senior') AS "displayName"
    FROM "Team" t
)
INSERT INTO "TeamGroup" (
    "id",
    "clubId",
    "type",
    "displayName",
    "sortOrder",
    "createdAt",
    "updatedAt"
)
SELECT
    'tg_' || md5(ng."clubId" || ':' || ng."displayName"),
    ng."clubId",
    CASE
        WHEN ng."displayName" ~* '^(u[0-9]{1,2}|[a-f]-jugend)$' OR ng."displayName" ~* 'jugend'
            THEN 'YOUTH'::"TeamGroupType"
        WHEN ng."displayName" ~* 'bambini|g-jugend|mini'
            THEN 'MINI'::"TeamGroupType"
        WHEN ng."displayName" ~* 'herren|damen|senior'
            THEN 'SENIOR'::"TeamGroupType"
        ELSE 'CUSTOM'::"TeamGroupType"
    END,
    ng."displayName",
    0,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM normalized_groups ng;

-- Every club needs at least one group, even if it only had invites before teams existed.
INSERT INTO "TeamGroup" (
    "id",
    "clubId",
    "type",
    "displayName",
    "sortOrder",
    "createdAt",
    "updatedAt"
)
SELECT
    'tg_' || md5(c."id" || ':Senior'),
    c."id",
    'SENIOR'::"TeamGroupType",
    'Senior',
    0,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "Club" c
WHERE NOT EXISTS (
    SELECT 1
    FROM "TeamGroup" tg
    WHERE tg."clubId" = c."id"
);

-- Backfill teams into the new hierarchy and keep duplicate legacy names unique per group.
WITH ranked_teams AS (
    SELECT
        t."id",
        t."clubId",
        COALESCE(NULLIF(BTRIM(t."ageGroup"), ''), 'Senior') AS "groupDisplayName",
        COALESCE(NULLIF(BTRIM(t."name"), ''), 'Team') AS "baseName",
        COUNT(*) OVER (
            PARTITION BY
                t."clubId",
                COALESCE(NULLIF(BTRIM(t."ageGroup"), ''), 'Senior'),
                COALESCE(NULLIF(BTRIM(t."name"), ''), 'Team')
        ) AS "displayCount",
        ROW_NUMBER() OVER (
            PARTITION BY
                t."clubId",
                COALESCE(NULLIF(BTRIM(t."ageGroup"), ''), 'Senior'),
                COALESCE(NULLIF(BTRIM(t."name"), ''), 'Team')
            ORDER BY t."createdAt", t."id"
        ) AS "displayOrdinal"
    FROM "Team" t
)
UPDATE "Team" t
SET
    "groupId" = tg."id",
    "displayName" = CASE
        WHEN rt."displayCount" > 1
            THEN rt."baseName" || ' ' || rt."displayOrdinal"
        ELSE rt."baseName"
    END,
    "updatedAt" = COALESCE(t."createdAt", CURRENT_TIMESTAMP)
FROM ranked_teams rt
JOIN "TeamGroup" tg
    ON tg."clubId" = rt."clubId"
   AND tg."displayName" = rt."groupDisplayName"
WHERE t."id" = rt."id";

-- Clubs with legacy invites but no teams get a default senior squad so invite history can map cleanly.
INSERT INTO "Team" (
    "id",
    "clubId",
    "groupId",
    "name",
    "displayName",
    "ageGroup",
    "squadLabel",
    "leagueName",
    "seasonStart",
    "createdAt",
    "updatedAt"
)
SELECT
    'team_' || md5(c."id" || ':default'),
    c."id",
    tg."id",
    tg."displayName",
    tg."displayName",
    tg."displayName",
    NULL,
    NULL,
    NULL,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "Club" c
JOIN "Invite" i
    ON i."clubId" = c."id"
JOIN LATERAL (
    SELECT
        "id",
        "displayName"
    FROM "TeamGroup"
    WHERE "clubId" = c."id"
    ORDER BY "sortOrder" ASC, "displayName" ASC
    LIMIT 1
) tg ON TRUE
WHERE NOT EXISTS (
    SELECT 1
    FROM "Team" t
    WHERE t."clubId" = c."id"
)
GROUP BY c."id", tg."id", tg."displayName";

ALTER TABLE "Team"
    ALTER COLUMN "displayName" SET NOT NULL,
    ALTER COLUMN "groupId" SET NOT NULL,
    ALTER COLUMN "updatedAt" SET NOT NULL;

-- Preserve legacy team access. Players come from roster membership; old club-wide managers retain access to every squad.
INSERT INTO "TeamAccess" (
    "id",
    "clubId",
    "teamId",
    "userId",
    "role",
    "phase",
    "status",
    "createdAt",
    "updatedAt"
)
SELECT
    'ta_' || md5(tm."teamId" || ':' || tm."userId" || ':PLAYER'),
    t."clubId",
    tm."teamId",
    tm."userId",
    'PLAYER'::"TeamRole",
    'FULL'::"TeamAccessPhase",
    'ACTIVE'::"TeamAccessStatus",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "TeamMember" tm
JOIN "Team" t
    ON t."id" = tm."teamId";

INSERT INTO "TeamAccess" (
    "id",
    "clubId",
    "teamId",
    "userId",
    "role",
    "phase",
    "status",
    "createdAt",
    "updatedAt"
)
SELECT
    'ta_' || md5(t."id" || ':' || m."userId" || ':HEAD_COACH'),
    t."clubId",
    t."id",
    m."userId",
    'HEAD_COACH'::"TeamRole",
    'FULL'::"TeamAccessPhase",
    'ACTIVE'::"TeamAccessStatus",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "Membership" m
JOIN "Team" t
    ON t."clubId" = m."clubId"
WHERE m."role" IN ('OWNER', 'ADMIN', 'COACH');

-- Map legacy club-level invites into the new scoped invite model.
WITH creator_candidates AS (
    SELECT
        m."clubId",
        m."userId",
        ROW_NUMBER() OVER (
            PARTITION BY m."clubId"
            ORDER BY
                CASE m."role"
                    WHEN 'OWNER' THEN 0
                    WHEN 'ADMIN' THEN 1
                    WHEN 'COACH' THEN 2
                    ELSE 3
                END,
                m."createdAt",
                m."userId"
        ) AS "choice"
    FROM "Membership" m
)
UPDATE "Invite" i
SET
    "teamId" = (
        SELECT t."id"
        FROM "Team" t
        WHERE t."clubId" = i."clubId"
        ORDER BY t."createdAt" ASC, t."id" ASC
        LIMIT 1
    ),
    "createdById" = (
        SELECT cc."userId"
        FROM creator_candidates cc
        WHERE cc."clubId" = i."clubId"
          AND cc."choice" = 1
    ),
    "role" = 'PLAYER'::"TeamRole",
    "deliveryChannel" = 'LINK'::"InviteDeliveryChannel",
    "status" = CASE
        WHEN i."consumedAt" IS NOT NULL THEN 'ACCEPTED'::"InviteStatus"
        WHEN i."expiresAt" < CURRENT_TIMESTAMP THEN 'EXPIRED'::"InviteStatus"
        ELSE 'PENDING'::"InviteStatus"
    END,
    "acceptedAt" = i."consumedAt",
    "updatedAt" = COALESCE(i."consumedAt", i."createdAt", CURRENT_TIMESTAMP);

ALTER TABLE "Invite"
    DROP COLUMN "consumedAt";

ALTER TABLE "Invite"
    ALTER COLUMN "createdById" SET NOT NULL,
    ALTER COLUMN "deliveryChannel" SET NOT NULL,
    ALTER COLUMN "role" SET NOT NULL,
    ALTER COLUMN "teamId" SET NOT NULL,
    ALTER COLUMN "updatedAt" SET NOT NULL;

-- CreateIndex
CREATE INDEX "TeamGroup_clubId_sortOrder_idx" ON "TeamGroup"("clubId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "TeamGroup_clubId_displayName_key" ON "TeamGroup"("clubId", "displayName");

-- CreateIndex
CREATE INDEX "TeamAccess_clubId_idx" ON "TeamAccess"("clubId");

-- CreateIndex
CREATE INDEX "TeamAccess_teamId_idx" ON "TeamAccess"("teamId");

-- CreateIndex
CREATE INDEX "TeamAccess_userId_idx" ON "TeamAccess"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TeamAccess_teamId_userId_role_key" ON "TeamAccess"("teamId", "userId", "role");

-- CreateIndex
CREATE INDEX "GuardianRelationship_clubId_idx" ON "GuardianRelationship"("clubId");

-- CreateIndex
CREATE INDEX "GuardianRelationship_teamId_idx" ON "GuardianRelationship"("teamId");

-- CreateIndex
CREATE INDEX "GuardianRelationship_parentUserId_idx" ON "GuardianRelationship"("parentUserId");

-- CreateIndex
CREATE INDEX "GuardianRelationship_playerUserId_idx" ON "GuardianRelationship"("playerUserId");

-- CreateIndex
CREATE INDEX "ParentalConsent_clubId_idx" ON "ParentalConsent"("clubId");

-- CreateIndex
CREATE INDEX "ParentalConsent_guardianEmail_idx" ON "ParentalConsent"("guardianEmail");

-- CreateIndex
CREATE INDEX "ParentalConsent_guardianUserId_idx" ON "ParentalConsent"("guardianUserId");

-- CreateIndex
CREATE UNIQUE INDEX "ParentalConsent_teamId_playerUserId_guardianEmail_key" ON "ParentalConsent"("teamId", "playerUserId", "guardianEmail");

-- CreateIndex
CREATE INDEX "ExternalTeamLink_clubId_teamId_idx" ON "ExternalTeamLink"("clubId", "teamId");

-- CreateIndex
CREATE INDEX "ExternalTeamLink_clubId_status_idx" ON "ExternalTeamLink"("clubId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalTeamLink_teamId_provider_externalTeamId_key" ON "ExternalTeamLink"("teamId", "provider", "externalTeamId");

-- CreateIndex
CREATE INDEX "ImportedFixture_clubId_teamId_kickoffAt_idx" ON "ImportedFixture"("clubId", "teamId", "kickoffAt");

-- CreateIndex
CREATE INDEX "ImportedFixture_clubId_lastSeenAt_idx" ON "ImportedFixture"("clubId", "lastSeenAt");

-- CreateIndex
CREATE UNIQUE INDEX "ImportedFixture_teamLinkId_externalMatchId_key" ON "ImportedFixture"("teamLinkId", "externalMatchId");

-- CreateIndex
CREATE UNIQUE INDEX "FixtureOverlay_fixtureId_key" ON "FixtureOverlay"("fixtureId");

-- CreateIndex
CREATE INDEX "FixtureOverlay_clubId_updatedAt_idx" ON "FixtureOverlay"("clubId", "updatedAt");

-- CreateIndex
CREATE INDEX "SyncRun_clubId_createdAt_idx" ON "SyncRun"("clubId", "createdAt");

-- CreateIndex
CREATE INDEX "SyncRun_teamLinkId_createdAt_idx" ON "SyncRun"("teamLinkId", "createdAt");

-- CreateIndex
CREATE INDEX "Team_groupId_idx" ON "Team"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "Team_groupId_displayName_key" ON "Team"("groupId", "displayName");

-- CreateIndex
CREATE UNIQUE INDEX "Event_externalMatchKey_key" ON "Event"("externalMatchKey");

-- CreateIndex
CREATE INDEX "Invite_teamId_idx" ON "Invite"("teamId");

-- CreateIndex
CREATE INDEX "Invite_recipientEmail_idx" ON "Invite"("recipientEmail");

-- CreateIndex
CREATE INDEX "Invite_guardianEmail_idx" ON "Invite"("guardianEmail");

-- AddForeignKey
ALTER TABLE "TeamGroup" ADD CONSTRAINT "TeamGroup_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "TeamGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamAccess" ADD CONSTRAINT "TeamAccess_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamAccess" ADD CONSTRAINT "TeamAccess_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamAccess" ADD CONSTRAINT "TeamAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuardianRelationship" ADD CONSTRAINT "GuardianRelationship_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuardianRelationship" ADD CONSTRAINT "GuardianRelationship_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuardianRelationship" ADD CONSTRAINT "GuardianRelationship_parentUserId_fkey" FOREIGN KEY ("parentUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuardianRelationship" ADD CONSTRAINT "GuardianRelationship_playerUserId_fkey" FOREIGN KEY ("playerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParentalConsent" ADD CONSTRAINT "ParentalConsent_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParentalConsent" ADD CONSTRAINT "ParentalConsent_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParentalConsent" ADD CONSTRAINT "ParentalConsent_playerUserId_fkey" FOREIGN KEY ("playerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParentalConsent" ADD CONSTRAINT "ParentalConsent_guardianUserId_fkey" FOREIGN KEY ("guardianUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invite" ADD CONSTRAINT "Invite_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invite" ADD CONSTRAINT "Invite_parentalConsentId_fkey" FOREIGN KEY ("parentalConsentId") REFERENCES "ParentalConsent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invite" ADD CONSTRAINT "Invite_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invite" ADD CONSTRAINT "Invite_acceptedByUserId_fkey" FOREIGN KEY ("acceptedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalTeamLink" ADD CONSTRAINT "ExternalTeamLink_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalTeamLink" ADD CONSTRAINT "ExternalTeamLink_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportedFixture" ADD CONSTRAINT "ImportedFixture_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportedFixture" ADD CONSTRAINT "ImportedFixture_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportedFixture" ADD CONSTRAINT "ImportedFixture_teamLinkId_fkey" FOREIGN KEY ("teamLinkId") REFERENCES "ExternalTeamLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixtureOverlay" ADD CONSTRAINT "FixtureOverlay_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixtureOverlay" ADD CONSTRAINT "FixtureOverlay_fixtureId_fkey" FOREIGN KEY ("fixtureId") REFERENCES "ImportedFixture"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncRun" ADD CONSTRAINT "SyncRun_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncRun" ADD CONSTRAINT "SyncRun_teamLinkId_fkey" FOREIGN KEY ("teamLinkId") REFERENCES "ExternalTeamLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;
