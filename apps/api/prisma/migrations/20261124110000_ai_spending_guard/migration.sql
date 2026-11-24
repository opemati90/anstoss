CREATE TABLE "AiMonthlyBudget" (
  "period" TEXT NOT NULL PRIMARY KEY,
  "reservedMicros" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "AiMonthlyBudget_bounds" CHECK ("reservedMicros" BETWEEN 0 AND 30000000)
);

CREATE TABLE "AiSpendReservation" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "period" TEXT NOT NULL,
  "purpose" TEXT NOT NULL,
  "reservedMicros" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiSpendReservation_positive" CHECK ("reservedMicros" > 0)
);
CREATE INDEX "AiSpendReservation_period_idx" ON "AiSpendReservation"("period");

ALTER TABLE "MessageTranslation" ADD COLUMN "originalHash" TEXT, ADD COLUMN "sourceLanguage" TEXT;
ALTER TABLE "DirectMessageTranslation" ADD COLUMN "originalHash" TEXT, ADD COLUMN "sourceLanguage" TEXT;
