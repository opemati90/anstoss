-- CreateTable
CREATE TABLE "EventReminderPreference" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "remindAt" TIMESTAMP(3) NOT NULL,
    "sent" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventReminderPreference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EventReminderPreference_remindAt_sent_idx" ON "EventReminderPreference"("remindAt", "sent");

-- CreateIndex
CREATE UNIQUE INDEX "EventReminderPreference_eventId_userId_key" ON "EventReminderPreference"("eventId", "userId");

-- AddForeignKey
ALTER TABLE "EventReminderPreference" ADD CONSTRAINT "EventReminderPreference_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventReminderPreference" ADD CONSTRAINT "EventReminderPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
