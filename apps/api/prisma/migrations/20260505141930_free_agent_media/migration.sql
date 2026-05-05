-- CreateEnum
CREATE TYPE "FreeAgentMediaType" AS ENUM ('PHOTO', 'VIDEO');

-- CreateTable
CREATE TABLE "FreeAgentMedia" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "type" "FreeAgentMediaType" NOT NULL,
    "url" TEXT NOT NULL,
    "thumbnailUrl" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FreeAgentMedia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FreeAgentMedia_profileId_sortOrder_idx" ON "FreeAgentMedia"("profileId", "sortOrder");

-- AddForeignKey
ALTER TABLE "FreeAgentMedia" ADD CONSTRAINT "FreeAgentMedia_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "FreeAgentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
