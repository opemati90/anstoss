CREATE TABLE "CoachAttendance" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "status" TEXT NOT NULL CHECK ("status" IN ('PRESENT', 'ABSENT', 'UNKNOWN')),
  "actorId" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CoachAttendance_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CoachAttendance_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CoachAttendance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "CoachAttendance_eventId_userId_key" ON "CoachAttendance"("eventId", "userId");
CREATE INDEX "CoachAttendance_userId_idx" ON "CoachAttendance"("userId");

CREATE TABLE "CoachAttendanceChange" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "actorId" TEXT,
  "previous" TEXT CHECK ("previous" IS NULL OR "previous" IN ('PRESENT', 'ABSENT', 'UNKNOWN')),
  "status" TEXT NOT NULL CHECK ("status" IN ('PRESENT', 'ABSENT', 'UNKNOWN')),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CoachAttendanceChange_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CoachAttendanceChange_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CoachAttendanceChange_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "CoachAttendanceChange_eventId_userId_createdAt_idx" ON "CoachAttendanceChange"("eventId", "userId", "createdAt");
CREATE INDEX "CoachAttendanceChange_userId_idx" ON "CoachAttendanceChange"("userId");
CREATE INDEX "CoachAttendanceChange_actorId_idx" ON "CoachAttendanceChange"("actorId");
