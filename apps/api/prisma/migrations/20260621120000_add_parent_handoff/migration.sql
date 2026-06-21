-- Under-16 sign-up parent handoff: persist the child's first name + DOB and a
-- redeemable code so a guardian can create a managed sub-profile for them. The
-- child's self-created account is removed at mint time (handled in app code).

-- CreateEnum
CREATE TYPE "ParentHandoffStatus" AS ENUM ('PENDING', 'REDEEMED', 'EXPIRED');

-- CreateTable
CREATE TABLE "ParentHandoff" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "childFirstName" TEXT NOT NULL,
    "childDateOfBirth" TIMESTAMP(3) NOT NULL,
    "guardianEmail" TEXT NOT NULL,
    "sourceUserId" TEXT,
    "status" "ParentHandoffStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "redeemedByUserId" TEXT,
    "redeemedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ParentHandoff_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ParentHandoff_code_key" ON "ParentHandoff"("code");

-- CreateIndex
CREATE INDEX "ParentHandoff_guardianEmail_idx" ON "ParentHandoff"("guardianEmail");

-- CreateIndex
CREATE UNIQUE INDEX "ParentHandoff_sourceUserId_key" ON "ParentHandoff"("sourceUserId");

-- CreateIndex
CREATE INDEX "ParentHandoff_status_idx" ON "ParentHandoff"("status");

-- AddForeignKey
ALTER TABLE "ParentHandoff" ADD CONSTRAINT "ParentHandoff_sourceUserId_fkey" FOREIGN KEY ("sourceUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParentHandoff" ADD CONSTRAINT "ParentHandoff_redeemedByUserId_fkey" FOREIGN KEY ("redeemedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
