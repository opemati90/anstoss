-- AlterTable
ALTER TABLE "Club" ADD COLUMN     "city" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "managedById" TEXT,
ALTER COLUMN "clerkId" DROP NOT NULL,
ALTER COLUMN "email" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "Club_city_idx" ON "Club"("city");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_managedById_fkey" FOREIGN KEY ("managedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

