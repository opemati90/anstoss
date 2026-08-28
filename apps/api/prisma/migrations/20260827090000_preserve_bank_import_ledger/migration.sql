-- Raw bank uploads are parsed in memory and never persisted. Keep the
-- normalized transactions/matches as financial audit evidence; only raw
-- object metadata is eligible for the 24-hour retention sweep.
ALTER TABLE "BankImportBatch"
  ADD COLUMN "rawObjectKey" TEXT,
  ADD COLUMN "rawPurgedAt" TIMESTAMP(3);

UPDATE "BankImportBatch"
SET "rawPurgedAt" = "createdAt"
WHERE "rawPurgedAt" IS NULL;
