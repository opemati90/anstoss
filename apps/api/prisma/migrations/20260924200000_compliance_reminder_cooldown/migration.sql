-- Club-admin review fixes: persisted 24h cooldown for compliance reminders
-- (one push per club + member + document kind per day).
CREATE TABLE "ComplianceReminder" (
  "id" TEXT NOT NULL,
  "clubId" TEXT NOT NULL,
  "memberUserId" TEXT NOT NULL,
  "kind" "ComplianceKind" NOT NULL,
  "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ComplianceReminder_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ComplianceReminder_clubId_memberUserId_kind_key"
  ON "ComplianceReminder"("clubId", "memberUserId", "kind");

ALTER TABLE "ComplianceReminder"
  ADD CONSTRAINT "ComplianceReminder_clubId_fkey"
  FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ComplianceReminder"
  ADD CONSTRAINT "ComplianceReminder_memberUserId_fkey"
  FOREIGN KEY ("memberUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
