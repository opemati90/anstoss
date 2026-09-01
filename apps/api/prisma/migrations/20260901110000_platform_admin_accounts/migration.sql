CREATE TABLE "PlatformAdminAccount" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "loginIdentifier" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "sessionVersion" INTEGER NOT NULL DEFAULT 1,
  "mustRotatePassword" BOOLEAN NOT NULL DEFAULT true,
  "disabledAt" TIMESTAMP(3),
  "lastLoginAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PlatformAdminAccount_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlatformAdminAccount_userId_key" ON "PlatformAdminAccount"("userId");
CREATE UNIQUE INDEX "PlatformAdminAccount_loginIdentifier_key" ON "PlatformAdminAccount"("loginIdentifier");
CREATE INDEX "PlatformAdminAccount_disabledAt_idx" ON "PlatformAdminAccount"("disabledAt");

ALTER TABLE "PlatformAdminAccount"
  ADD CONSTRAINT "PlatformAdminAccount_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
