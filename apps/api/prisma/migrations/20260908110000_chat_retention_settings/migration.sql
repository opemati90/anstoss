CREATE TABLE "ClubChatRetentionSettings" (
  "id" TEXT NOT NULL,
  "clubId" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "messageRetentionDays" INTEGER NOT NULL DEFAULT 365,
  "attachmentRetentionDays" INTEGER NOT NULL DEFAULT 90,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ClubChatRetentionSettings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ClubChatRetentionSettings_clubId_key" ON "ClubChatRetentionSettings"("clubId");

ALTER TABLE "ClubChatRetentionSettings"
ADD CONSTRAINT "ClubChatRetentionSettings_clubId_fkey"
FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DirectMessage"
ADD COLUMN "deletedAt" TIMESTAMP(3);
