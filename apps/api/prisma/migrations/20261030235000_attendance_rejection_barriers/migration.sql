CREATE TABLE "CoachAttendanceRejection" (
  "operationId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CoachAttendanceRejection_pkey" PRIMARY KEY ("operationId"),
  CONSTRAINT "CoachAttendanceRejection_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CoachAttendanceRejection_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "CoachAttendanceRejection_actorId_idx" ON "CoachAttendanceRejection"("actorId");
