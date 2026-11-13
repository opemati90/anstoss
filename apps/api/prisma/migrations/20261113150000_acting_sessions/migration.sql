-- CreateEnum
CREATE TYPE "ActingSessionRole" AS ENUM ('COACH');

-- CreateTable
CREATE TABLE "ActingSession" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "role" "ActingSessionRole" NOT NULL DEFAULT 'COACH',
    "reason" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "ActingSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ActingSession_actorUserId_endedAt_expiresAt_idx" ON "ActingSession"("actorUserId", "endedAt", "expiresAt");

-- CreateIndex
CREATE INDEX "ActingSession_clubId_teamId_idx" ON "ActingSession"("clubId", "teamId");

-- AddForeignKey
ALTER TABLE "ActingSession" ADD CONSTRAINT "ActingSession_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActingSession" ADD CONSTRAINT "ActingSession_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActingSession" ADD CONSTRAINT "ActingSession_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

