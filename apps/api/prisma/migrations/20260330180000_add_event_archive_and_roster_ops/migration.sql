-- CreateEnum
CREATE TYPE "TeamMemberOperationalStatus" AS ENUM ('ACTIVE', 'NEW_PLAYER', 'INACTIVE');

-- CreateEnum
CREATE TYPE "InjuryAvailabilityStatus" AS ENUM ('OUT', 'DOUBTFUL', 'DAY_TO_DAY');

-- CreateEnum
CREATE TYPE "TeamDutyKind" AS ENUM ('JERSEY_CLEANUP', 'BIB_CLEANUP');

-- CreateEnum
CREATE TYPE "TeamDutyStatus" AS ENUM ('PENDING', 'COMPLETED', 'SKIPPED');

-- AlterTable
ALTER TABLE "Event" ADD COLUMN "archivedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "TeamMember"
ADD COLUMN "operationalStatus" "TeamMemberOperationalStatus" NOT NULL DEFAULT 'ACTIVE';

-- CreateTable
CREATE TABLE "InjuryReport" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reportedById" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "status" "InjuryAvailabilityStatus" NOT NULL DEFAULT 'OUT',
    "expectedReturnAt" TIMESTAMP(3),
    "expectedReturnLabel" TEXT,
    "clearedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InjuryReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamDutyAssignment" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "assignedUserId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "kind" "TeamDutyKind" NOT NULL,
    "status" "TeamDutyStatus" NOT NULL DEFAULT 'PENDING',
    "dueDate" TIMESTAMP(3),
    "notes" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeamDutyAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Event_archivedAt_idx" ON "Event"("archivedAt");

-- CreateIndex
CREATE INDEX "TeamMember_operationalStatus_idx" ON "TeamMember"("operationalStatus");

-- CreateIndex
CREATE INDEX "InjuryReport_clubId_teamId_clearedAt_idx" ON "InjuryReport"("clubId", "teamId", "clearedAt");

-- CreateIndex
CREATE INDEX "InjuryReport_userId_clearedAt_idx" ON "InjuryReport"("userId", "clearedAt");

-- CreateIndex
CREATE INDEX "TeamDutyAssignment_clubId_teamId_status_idx" ON "TeamDutyAssignment"("clubId", "teamId", "status");

-- CreateIndex
CREATE INDEX "TeamDutyAssignment_teamId_kind_createdAt_idx" ON "TeamDutyAssignment"("teamId", "kind", "createdAt");

-- AddForeignKey
ALTER TABLE "InjuryReport" ADD CONSTRAINT "InjuryReport_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InjuryReport" ADD CONSTRAINT "InjuryReport_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InjuryReport" ADD CONSTRAINT "InjuryReport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InjuryReport" ADD CONSTRAINT "InjuryReport_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamDutyAssignment" ADD CONSTRAINT "TeamDutyAssignment_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamDutyAssignment" ADD CONSTRAINT "TeamDutyAssignment_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamDutyAssignment" ADD CONSTRAINT "TeamDutyAssignment_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamDutyAssignment" ADD CONSTRAINT "TeamDutyAssignment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
