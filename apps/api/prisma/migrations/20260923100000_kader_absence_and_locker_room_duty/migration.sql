-- Kader revamp: a squad member can be away (holiday) or suspended (Sperre)
-- without being injured or inactive. The date is optional ("bis …").
CREATE TYPE "TeamMemberAbsence" AS ENUM ('NONE', 'SUSPENDED', 'AWAY');

ALTER TABLE "TeamMember"
  ADD COLUMN "absence" "TeamMemberAbsence" NOT NULL DEFAULT 'NONE',
  ADD COLUMN "absenceUntil" TIMESTAMP(3);

-- Aufgaben: Kabinendienst joins Trikotwäsche and Leibchen in the team rota.
ALTER TYPE "TeamDutyKind" ADD VALUE IF NOT EXISTS 'LOCKER_ROOM';
