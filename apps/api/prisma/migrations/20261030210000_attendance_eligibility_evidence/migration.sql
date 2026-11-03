-- Historical responses created before authorization was enforced are left
-- unverified; existing rows cannot safely be inferred to be player responses.
ALTER TABLE "Rsvp" ADD COLUMN "playerEligibilityVerifiedAt" TIMESTAMP(3);
ALTER TABLE "event_check_ins" ADD COLUMN "playerEligibilityVerifiedAt" TIMESTAMP(3);
