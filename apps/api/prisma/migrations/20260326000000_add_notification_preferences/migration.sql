-- CreateTable
CREATE TABLE "NotificationPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "teamId" TEXT,
    "mutedChat" BOOLEAN NOT NULL DEFAULT false,
    "mutedEvents" BOOLEAN NOT NULL DEFAULT false,
    "mutedAnnouncements" BOOLEAN NOT NULL DEFAULT false,
    "quietStart" TEXT,
    "quietEnd" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreference_userId_clubId_teamId_key" ON "NotificationPreference"("userId", "clubId", "teamId");

-- CreateIndex
CREATE INDEX "NotificationPreference_userId_clubId_idx" ON "NotificationPreference"("userId", "clubId");

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
