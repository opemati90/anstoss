-- Existing reservations remain valid and keep NULL request IDs. PostgreSQL's
-- unique index permits multiple NULLs for historical records.
ALTER TABLE "PrivateMediaUpload"
  ADD COLUMN "reserveRequestId" TEXT,
  ADD COLUMN "reservedMessageType" TEXT,
  ADD COLUMN "reservedTeamId" TEXT;

CREATE UNIQUE INDEX "PrivateMediaUpload_clubId_ownerId_reserveRequestId_key"
  ON "PrivateMediaUpload"("clubId", "ownerId", "reserveRequestId");
