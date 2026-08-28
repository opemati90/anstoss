CREATE TABLE "DirectMessageReport" (
    "id" TEXT NOT NULL,
    "directMessageId" TEXT NOT NULL,
    "reporterUserId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "evidenceContent" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "resolution" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DirectMessageReport_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DirectMessageReport_directMessageId_reporterUserId_key" ON "DirectMessageReport"("directMessageId", "reporterUserId");
CREATE INDEX "DirectMessageReport_directMessageId_idx" ON "DirectMessageReport"("directMessageId");
CREATE INDEX "DirectMessageReport_reporterUserId_idx" ON "DirectMessageReport"("reporterUserId");
CREATE INDEX "DirectMessageReport_resolvedAt_idx" ON "DirectMessageReport"("resolvedAt");
ALTER TABLE "DirectMessageReport" ADD CONSTRAINT "DirectMessageReport_directMessageId_fkey" FOREIGN KEY ("directMessageId") REFERENCES "DirectMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DirectMessageReport" ADD CONSTRAINT "DirectMessageReport_reporterUserId_fkey" FOREIGN KEY ("reporterUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
