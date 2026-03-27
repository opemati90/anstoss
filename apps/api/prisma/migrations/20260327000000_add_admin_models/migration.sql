-- CreateTable
CREATE TABLE "SupportAction" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorEmail" TEXT NOT NULL,
    "note" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "clubId" TEXT,
    "type" TEXT NOT NULL,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT,
    "actorLabel" TEXT,
    "summary" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SupportAction_clubId_idx" ON "SupportAction"("clubId");

-- CreateIndex
CREATE INDEX "SupportAction_actorId_idx" ON "SupportAction"("actorId");

-- CreateIndex
CREATE INDEX "SupportAction_createdAt_idx" ON "SupportAction"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_clubId_createdAt_idx" ON "AuditLog"("clubId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "AuditLog_actorId_idx" ON "AuditLog"("actorId");

-- CreateIndex
CREATE INDEX "AuditLog_type_idx" ON "AuditLog"("type");

-- AddForeignKey
ALTER TABLE "SupportAction" ADD CONSTRAINT "SupportAction_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;
