-- CreateTable
CREATE TABLE "RosterSlot" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "dateOfBirth" TIMESTAMP(3),
    "position" "PlayerPosition",
    "jerseyNumber" INTEGER,
    "claimedByUserId" TEXT,
    "claimedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RosterSlot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RosterSlot_claimedByUserId_key" ON "RosterSlot"("claimedByUserId");

-- CreateIndex
CREATE INDEX "RosterSlot_teamId_idx" ON "RosterSlot"("teamId");

-- CreateIndex
CREATE INDEX "RosterSlot_teamId_claimedByUserId_idx" ON "RosterSlot"("teamId", "claimedByUserId");

-- AddForeignKey
ALTER TABLE "RosterSlot" ADD CONSTRAINT "RosterSlot_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RosterSlot" ADD CONSTRAINT "RosterSlot_claimedByUserId_fkey" FOREIGN KEY ("claimedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
