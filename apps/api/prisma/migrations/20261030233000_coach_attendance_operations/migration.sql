ALTER TABLE "CoachAttendanceChange" ADD COLUMN "operationId" TEXT, ADD COLUMN "expectedVersion" INTEGER;
CREATE UNIQUE INDEX "CoachAttendanceChange_operationId_key" ON "CoachAttendanceChange"("operationId");
