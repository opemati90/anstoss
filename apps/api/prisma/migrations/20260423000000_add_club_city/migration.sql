-- AlterTable
ALTER TABLE "Club" ADD COLUMN "city" TEXT;

-- CreateIndex
CREATE INDEX "Club_city_idx" ON "Club"("city");
