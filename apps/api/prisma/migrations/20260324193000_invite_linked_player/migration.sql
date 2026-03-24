ALTER TABLE "Invite"
ADD COLUMN "linkedPlayerUserId" TEXT;

CREATE INDEX "Invite_linkedPlayerUserId_idx" ON "Invite"("linkedPlayerUserId");
