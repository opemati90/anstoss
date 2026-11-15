CREATE TYPE "SupportTicketStatus" AS ENUM ('OPEN', 'WAITING', 'RESOLVED');
CREATE TABLE "SupportTicket" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "requesterId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "requestId" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "status" "SupportTicketStatus" NOT NULL DEFAULT 'OPEN',
  "appVersion" TEXT,
  "build" TEXT,
  "platform" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "SupportTicket_requesterId_requestId_key" ON "SupportTicket"("requesterId", "requestId");
CREATE INDEX "SupportTicket_requesterId_updatedAt_idx" ON "SupportTicket"("requesterId", "updatedAt");
CREATE INDEX "SupportTicket_status_updatedAt_idx" ON "SupportTicket"("status", "updatedAt");
CREATE TABLE "SupportMessage" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "ticketId" TEXT NOT NULL REFERENCES "SupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "requestId" TEXT NOT NULL,
  "fromSupport" BOOLEAN NOT NULL DEFAULT false,
  "body" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "SupportMessage_ticketId_requestId_key" ON "SupportMessage"("ticketId", "requestId");
CREATE INDEX "SupportMessage_ticketId_createdAt_idx" ON "SupportMessage"("ticketId", "createdAt");
