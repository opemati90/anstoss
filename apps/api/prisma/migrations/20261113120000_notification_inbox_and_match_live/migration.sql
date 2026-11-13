-- CreateEnum
CREATE TYPE "MatchLiveStatus" AS ENUM ('NOT_STARTED', 'FIRST_HALF', 'HALF_TIME', 'SECOND_HALF', 'FINISHED');

-- CreateEnum
CREATE TYPE "MatchLiveEventKind" AS ENUM ('GOAL', 'CONCEDED', 'YELLOW', 'RED', 'SUB');

-- CreateTable
CREATE TABLE "InboxNotification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clubId" TEXT,
    "teamId" TEXT,
    "type" TEXT NOT NULL,
    "data" JSONB,
    "title" TEXT,
    "body" TEXT,
    "target" JSONB,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InboxNotification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchLive" (
    "eventId" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "status" "MatchLiveStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "goalsFor" INTEGER NOT NULL DEFAULT 0,
    "goalsAgainst" INTEGER NOT NULL DEFAULT 0,
    "kickoffAt" TIMESTAMP(3),
    "halfTimeAt" TIMESTAMP(3),
    "secondHalfAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MatchLive_pkey" PRIMARY KEY ("eventId")
);

-- CreateTable
CREATE TABLE "MatchLiveEvent" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "kind" "MatchLiveEventKind" NOT NULL,
    "minute" INTEGER NOT NULL,
    "playerUserId" TEXT,
    "playerName" TEXT,
    "relatedUserId" TEXT,
    "relatedName" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "MatchLiveEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InboxNotification_userId_createdAt_id_idx" ON "InboxNotification"("userId", "createdAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "InboxNotification_userId_readAt_idx" ON "InboxNotification"("userId", "readAt");

-- CreateIndex
CREATE INDEX "InboxNotification_createdAt_idx" ON "InboxNotification"("createdAt");

-- CreateIndex
CREATE INDEX "MatchLive_clubId_status_idx" ON "MatchLive"("clubId", "status");

-- CreateIndex
CREATE INDEX "MatchLiveEvent_eventId_deletedAt_minute_idx" ON "MatchLiveEvent"("eventId", "deletedAt", "minute");

-- CreateIndex
CREATE INDEX "MatchLiveEvent_clubId_idx" ON "MatchLiveEvent"("clubId");

-- AddForeignKey
ALTER TABLE "InboxNotification" ADD CONSTRAINT "InboxNotification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchLive" ADD CONSTRAINT "MatchLive_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchLive" ADD CONSTRAINT "MatchLive_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchLiveEvent" ADD CONSTRAINT "MatchLiveEvent_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchLiveEvent" ADD CONSTRAINT "MatchLiveEvent_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

