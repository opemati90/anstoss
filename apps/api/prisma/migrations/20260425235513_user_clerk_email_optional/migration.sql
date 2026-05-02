-- Idempotent rewrite: 20260423000000_add_club_city already added the
-- "city" column + "Club_city_idx" index. This migration was regenerated
-- with both re-included by mistake. IF NOT EXISTS guards let fresh DBs
-- apply both migrations cleanly without breaking environments that
-- already ran this one. The User changes ran originally on prod, so
-- they're guarded too for reapply-safety.

-- AlterTable: Club
ALTER TABLE "Club" ADD COLUMN IF NOT EXISTS "city" TEXT;

-- AlterTable: User
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "managedById" TEXT;
ALTER TABLE "User" ALTER COLUMN "clerkId" DROP NOT NULL;
ALTER TABLE "User" ALTER COLUMN "email" DROP NOT NULL;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Club_city_idx" ON "Club"("city");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'User_managedById_fkey'
  ) THEN
    ALTER TABLE "User" ADD CONSTRAINT "User_managedById_fkey" FOREIGN KEY ("managedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END$$;
