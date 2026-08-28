ALTER TABLE "Subscription"
ADD COLUMN "lastStripeEventCreated" INTEGER,
ADD COLUMN "lastStripeEventId" TEXT;

ALTER TABLE "ContributionRecord"
ADD COLUMN "manualPaidAmount" INTEGER;

UPDATE "ContributionRecord" record
SET "manualPaidAmount" = GREATEST(
  COALESCE(record."paidAmount", 0) - COALESCE(matches."confirmedAmount", 0),
  0
)
FROM (
  SELECT "recordId", SUM("amount")::INTEGER AS "confirmedAmount"
  FROM "ContributionMatch"
  WHERE "status" = 'CONFIRMED'
  GROUP BY "recordId"
) matches
WHERE matches."recordId" = record."id";

UPDATE "ContributionRecord"
SET "manualPaidAmount" = COALESCE("paidAmount", 0)
WHERE "manualPaidAmount" IS NULL;

ALTER TABLE "ContributionRecord"
ALTER COLUMN "manualPaidAmount" SET DEFAULT 0,
ALTER COLUMN "manualPaidAmount" SET NOT NULL;
