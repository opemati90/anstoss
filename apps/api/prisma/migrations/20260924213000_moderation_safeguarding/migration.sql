-- Safeguarding review (2026-09-24): report escalation to the platform queue,
-- overdue (>24h) alerting and evidence retention bookkeeping.
ALTER TABLE "MessageReport"
  ADD COLUMN "escalatedAt" TIMESTAMP(3),
  ADD COLUMN "escalationReason" TEXT,
  ADD COLUMN "overdueAlertedAt" TIMESTAMP(3),
  ADD COLUMN "evidencePurgedAt" TIMESTAMP(3);

ALTER TABLE "DirectMessageReport"
  ADD COLUMN "escalatedAt" TIMESTAMP(3),
  ADD COLUMN "escalationReason" TEXT,
  ADD COLUMN "overdueAlertedAt" TIMESTAMP(3),
  ADD COLUMN "evidencePurgedAt" TIMESTAMP(3);

CREATE INDEX "MessageReport_resolvedAt_createdAt_idx" ON "MessageReport"("resolvedAt", "createdAt");
CREATE INDEX "DirectMessageReport_resolvedAt_createdAt_idx" ON "DirectMessageReport"("resolvedAt", "createdAt");
