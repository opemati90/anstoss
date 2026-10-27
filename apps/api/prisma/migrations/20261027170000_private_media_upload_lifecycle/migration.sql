CREATE TYPE "PrivateMediaUploadState" AS ENUM ('RESERVED', 'INITIATING', 'UPLOADING', 'FINALIZING', 'READY', 'ATTACHED', 'ABORTING', 'REMOVING', 'REMOVED');
CREATE TABLE "PrivateMediaUpload" (
  "id" TEXT NOT NULL,
  "clubId" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "targetId" TEXT NOT NULL,
  "targetType" TEXT NOT NULL,
  "objectKey" TEXT NOT NULL,
  "contentType" TEXT NOT NULL,
  "expectedBytes" INTEGER NOT NULL,
  "state" "PrivateMediaUploadState" NOT NULL DEFAULT 'RESERVED',
  "uploadId" TEXT,
  "operationId" TEXT,
  "messageId" TEXT,
  "cancelRequestedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PrivateMediaUpload_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PrivateMediaUpload_size_check" CHECK ("expectedBytes" BETWEEN 1 AND 104857600),
  CONSTRAINT "PrivateMediaUpload_target_check" CHECK ("targetType" IN ('CHANNEL', 'DM'))
);
CREATE UNIQUE INDEX "PrivateMediaUpload_objectKey_key" ON "PrivateMediaUpload"("objectKey");
CREATE UNIQUE INDEX "PrivateMediaUpload_messageId_key" ON "PrivateMediaUpload"("messageId");
CREATE INDEX "PrivateMediaUpload_clubId_ownerId_idx" ON "PrivateMediaUpload"("clubId", "ownerId");
CREATE INDEX "PrivateMediaUpload_state_expiresAt_idx" ON "PrivateMediaUpload"("state", "expiresAt");
