-- Onboarding revamp: coaches, parents and club admins confirm they are at
-- least 16 instead of entering a date of birth. Players keep the DOB (under-16
-- gate). A real DOB on file always takes precedence over this declaration.
ALTER TABLE "User" ADD COLUMN "adultConfirmedAt" TIMESTAMP(3);
