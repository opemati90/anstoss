-- DropForeignKey
ALTER TABLE "ConversationParticipant" DROP CONSTRAINT "ConversationParticipant_userId_fkey";

-- DropForeignKey
ALTER TABLE "DirectMessage" DROP CONSTRAINT "DirectMessage_senderId_fkey";

-- DropIndex
DROP INDEX "Event_archivedAt_idx";

-- DropIndex
DROP INDEX "InjuryReport_clubId_teamId_clearedAt_idx";

-- DropIndex
DROP INDEX "InjuryReport_userId_clearedAt_idx";

-- DropIndex
DROP INDEX "TeamDutyAssignment_clubId_teamId_status_idx";

-- DropIndex
DROP INDEX "TeamDutyAssignment_teamId_kind_createdAt_idx";

-- DropIndex
DROP INDEX "TeamMember_operationalStatus_idx";

-- AlterTable
ALTER TABLE "ContributionPlan" ADD COLUMN     "nameDe" TEXT,
ADD COLUMN     "nameEn" TEXT;

-- CreateIndex
CREATE INDEX "InjuryReport_clubId_teamId_idx" ON "InjuryReport"("clubId", "teamId");

-- CreateIndex
CREATE INDEX "InjuryReport_userId_idx" ON "InjuryReport"("userId");

-- CreateIndex
CREATE INDEX "InjuryReport_reportedById_idx" ON "InjuryReport"("reportedById");

-- CreateIndex
CREATE INDEX "InjuryReport_clearedAt_idx" ON "InjuryReport"("clearedAt");

-- CreateIndex
CREATE INDEX "TeamDutyAssignment_clubId_teamId_idx" ON "TeamDutyAssignment"("clubId", "teamId");

-- CreateIndex
CREATE INDEX "TeamDutyAssignment_assignedUserId_idx" ON "TeamDutyAssignment"("assignedUserId");

-- CreateIndex
CREATE INDEX "TeamDutyAssignment_createdById_idx" ON "TeamDutyAssignment"("createdById");

-- AddForeignKey
ALTER TABLE "ConversationParticipant" ADD CONSTRAINT "ConversationParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectMessage" ADD CONSTRAINT "DirectMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
