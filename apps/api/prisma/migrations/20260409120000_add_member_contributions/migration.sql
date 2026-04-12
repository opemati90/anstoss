-- CreateEnum
CREATE TYPE "ContributionCadence" AS ENUM ('MONTHLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "ContributionTargetRole" AS ENUM ('PLAYER', 'PARENT', 'COACH', 'ADMIN', 'CUSTOM');

-- CreateEnum
CREATE TYPE "ContributionRecordStatus" AS ENUM ('PENDING', 'PAID', 'PARTIAL', 'WAIVED', 'EXEMPT');

-- CreateEnum
CREATE TYPE "ContributionReminderTrigger" AS ENUM ('AUTOMATIC', 'MANUAL');

-- CreateEnum
CREATE TYPE "ContributionReminderStatus" AS ENUM ('SENT', 'SKIPPED', 'FAILED');

-- CreateTable
CREATE TABLE "ClubContributionSettings" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "autoRemindersEnabled" BOOLEAN NOT NULL DEFAULT true,
    "defaultCurrency" TEXT NOT NULL DEFAULT 'eur',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClubContributionSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContributionPlan" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'eur',
    "cadence" "ContributionCadence" NOT NULL,
    "targetRole" "ContributionTargetRole" NOT NULL,
    "dueDay" INTEGER NOT NULL,
    "dueMonth" INTEGER,
    "graceDays" INTEGER NOT NULL DEFAULT 0,
    "reminderDaysBefore" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "reminderDaysAfter" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContributionPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContributionAssignment" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "memberUserId" TEXT NOT NULL,
    "assignedById" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endDate" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContributionAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContributionRecord" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "memberUserId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'eur',
    "status" "ContributionRecordStatus" NOT NULL DEFAULT 'PENDING',
    "paidAmount" INTEGER,
    "paidAt" TIMESTAMP(3),
    "note" TEXT,
    "lastReminderKey" TEXT,
    "lastReminderSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContributionRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContributionReminder" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "memberUserId" TEXT NOT NULL,
    "trigger" "ContributionReminderTrigger" NOT NULL,
    "reminderKey" TEXT NOT NULL,
    "emailSent" BOOLEAN NOT NULL DEFAULT false,
    "pushSent" BOOLEAN NOT NULL DEFAULT false,
    "status" "ContributionReminderStatus" NOT NULL DEFAULT 'SKIPPED',
    "message" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContributionReminder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClubContributionSettings_clubId_key" ON "ClubContributionSettings"("clubId");

-- CreateIndex
CREATE INDEX "ContributionPlan_clubId_active_idx" ON "ContributionPlan"("clubId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "ContributionAssignment_planId_memberUserId_key" ON "ContributionAssignment"("planId", "memberUserId");

-- CreateIndex
CREATE INDEX "ContributionAssignment_clubId_memberUserId_idx" ON "ContributionAssignment"("clubId", "memberUserId");

-- CreateIndex
CREATE INDEX "ContributionAssignment_clubId_endDate_idx" ON "ContributionAssignment"("clubId", "endDate");

-- CreateIndex
CREATE UNIQUE INDEX "ContributionRecord_assignmentId_periodStart_key" ON "ContributionRecord"("assignmentId", "periodStart");

-- CreateIndex
CREATE INDEX "ContributionRecord_clubId_memberUserId_dueDate_idx" ON "ContributionRecord"("clubId", "memberUserId", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "ContributionReminder_recordId_reminderKey_key" ON "ContributionReminder"("recordId", "reminderKey");

-- CreateIndex
CREATE INDEX "ContributionReminder_clubId_memberUserId_sentAt_idx" ON "ContributionReminder"("clubId", "memberUserId", "sentAt");

-- AddForeignKey
ALTER TABLE "ClubContributionSettings" ADD CONSTRAINT "ClubContributionSettings_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContributionPlan" ADD CONSTRAINT "ContributionPlan_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContributionPlan" ADD CONSTRAINT "ContributionPlan_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContributionAssignment" ADD CONSTRAINT "ContributionAssignment_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContributionAssignment" ADD CONSTRAINT "ContributionAssignment_planId_fkey" FOREIGN KEY ("planId") REFERENCES "ContributionPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContributionAssignment" ADD CONSTRAINT "ContributionAssignment_memberUserId_fkey" FOREIGN KEY ("memberUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContributionAssignment" ADD CONSTRAINT "ContributionAssignment_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContributionRecord" ADD CONSTRAINT "ContributionRecord_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContributionRecord" ADD CONSTRAINT "ContributionRecord_planId_fkey" FOREIGN KEY ("planId") REFERENCES "ContributionPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContributionRecord" ADD CONSTRAINT "ContributionRecord_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "ContributionAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContributionRecord" ADD CONSTRAINT "ContributionRecord_memberUserId_fkey" FOREIGN KEY ("memberUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContributionReminder" ADD CONSTRAINT "ContributionReminder_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContributionReminder" ADD CONSTRAINT "ContributionReminder_planId_fkey" FOREIGN KEY ("planId") REFERENCES "ContributionPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContributionReminder" ADD CONSTRAINT "ContributionReminder_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "ContributionAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContributionReminder" ADD CONSTRAINT "ContributionReminder_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "ContributionRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContributionReminder" ADD CONSTRAINT "ContributionReminder_memberUserId_fkey" FOREIGN KEY ("memberUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
