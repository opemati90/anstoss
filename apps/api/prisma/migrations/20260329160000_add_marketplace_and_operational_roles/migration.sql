-- CreateEnum
CREATE TYPE "RegistrationRole" AS ENUM ('PLAYER', 'PARENT', 'COACH', 'CLUB_ADMIN', 'FREE_AGENT');

-- CreateEnum
CREATE TYPE "ClubOperationalRole" AS ENUM ('SECRETARY', 'TREASURER', 'CAPTAIN', 'TEAM_COORDINATOR', 'BOARD_MEMBER', 'SUPPORT_STAFF');

-- CreateEnum
CREATE TYPE "PlayerPosition" AS ENUM ('GK', 'DEF', 'MID', 'FWD');

-- CreateEnum
CREATE TYPE "PreferredFoot" AS ENUM ('LEFT', 'RIGHT', 'BOTH');

-- CreateEnum
CREATE TYPE "FreeAgentVisibility" AS ENUM ('PUBLIC', 'CLUB_ONLY', 'PRIVATE');

-- CreateEnum
CREATE TYPE "TrialInviteStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'REVOKED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "registrationRole" "RegistrationRole" NOT NULL DEFAULT 'PLAYER';

-- AlterTable
ALTER TABLE "Membership" ADD COLUMN     "operationalRoles" "ClubOperationalRole"[] DEFAULT ARRAY[]::"ClubOperationalRole"[];

-- CreateTable
CREATE TABLE "FreeAgentProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "position" "PlayerPosition",
    "preferredFoot" "PreferredFoot",
    "city" TEXT,
    "bio" TEXT,
    "isOnTransferList" BOOLEAN NOT NULL DEFAULT false,
    "visibility" "FreeAgentVisibility" NOT NULL DEFAULT 'PRIVATE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FreeAgentProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FreeAgentExperience" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "clubName" TEXT NOT NULL,
    "roleLabel" TEXT NOT NULL,
    "fromYear" INTEGER,
    "toYear" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FreeAgentExperience_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrialInvite" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "freeAgentProfileId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "sentByUserId" TEXT NOT NULL,
    "message" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "status" "TrialInviteStatus" NOT NULL DEFAULT 'PENDING',
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrialInvite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FreeAgentProfile_userId_key" ON "FreeAgentProfile"("userId");

-- CreateIndex
CREATE INDEX "FreeAgentProfile_isOnTransferList_visibility_idx" ON "FreeAgentProfile"("isOnTransferList", "visibility");

-- CreateIndex
CREATE INDEX "FreeAgentProfile_city_idx" ON "FreeAgentProfile"("city");

-- CreateIndex
CREATE INDEX "FreeAgentProfile_position_idx" ON "FreeAgentProfile"("position");

-- CreateIndex
CREATE INDEX "FreeAgentExperience_profileId_sortOrder_idx" ON "FreeAgentExperience"("profileId", "sortOrder");

-- CreateIndex
CREATE INDEX "TrialInvite_clubId_status_idx" ON "TrialInvite"("clubId", "status");

-- CreateIndex
CREATE INDEX "TrialInvite_freeAgentProfileId_status_idx" ON "TrialInvite"("freeAgentProfileId", "status");

-- CreateIndex
CREATE INDEX "TrialInvite_teamId_status_idx" ON "TrialInvite"("teamId", "status");

-- AddForeignKey
ALTER TABLE "FreeAgentProfile" ADD CONSTRAINT "FreeAgentProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FreeAgentExperience" ADD CONSTRAINT "FreeAgentExperience_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "FreeAgentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrialInvite" ADD CONSTRAINT "TrialInvite_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrialInvite" ADD CONSTRAINT "TrialInvite_freeAgentProfileId_fkey" FOREIGN KEY ("freeAgentProfileId") REFERENCES "FreeAgentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrialInvite" ADD CONSTRAINT "TrialInvite_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrialInvite" ADD CONSTRAINT "TrialInvite_sentByUserId_fkey" FOREIGN KEY ("sentByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
