-- Manual bank-transfer ("pin the club IBAN") payment instructions for member
-- contributions. All nullable — clubs that use Stripe or no manual transfer
-- simply leave them unset.
ALTER TABLE "ClubContributionSettings" ADD COLUMN "bankAccountHolder" TEXT;
ALTER TABLE "ClubContributionSettings" ADD COLUMN "bankIban" TEXT;
ALTER TABLE "ClubContributionSettings" ADD COLUMN "bankReference" TEXT;
