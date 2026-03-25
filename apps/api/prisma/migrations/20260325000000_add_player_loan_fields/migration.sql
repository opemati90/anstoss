-- AlterTable
ALTER TABLE "TeamAccess" ADD COLUMN "loanedFromTeamId" TEXT,
ADD COLUMN "loanStartDate" TIMESTAMP(3),
ADD COLUMN "loanEndDate" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "TeamAccess_loanedFromTeamId_idx" ON "TeamAccess"("loanedFromTeamId");

-- AddForeignKey
ALTER TABLE "TeamAccess" ADD CONSTRAINT "TeamAccess_loanedFromTeamId_fkey" FOREIGN KEY ("loanedFromTeamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;
