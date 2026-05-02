-- Add phone column to RosterSlot for phone-based onboarding claim flow.
ALTER TABLE "RosterSlot" ADD COLUMN "phone" TEXT;
CREATE INDEX "RosterSlot_phone_idx" ON "RosterSlot"("phone");
