-- Email OTP authentication codes (custom auth, replaces Clerk).
-- Stores only an HMAC-SHA256 hash of the 6-digit code; plaintext is emailed.
-- Single-use, expiring, attempt-capped. Not tenant-scoped.
CREATE TABLE "OtpCode" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "OtpCode_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OtpCode_email_idx" ON "OtpCode"("email");
