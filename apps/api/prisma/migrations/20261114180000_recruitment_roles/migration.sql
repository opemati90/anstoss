CREATE TYPE "RecruitmentRole" AS ENUM ('PLAYER', 'COACH');
ALTER TABLE "FreeAgentProfile" ADD COLUMN "recruitmentRole" "RecruitmentRole" NOT NULL DEFAULT 'PLAYER';
ALTER TABLE "TrialInvite" ADD COLUMN "recruitmentRole" "RecruitmentRole" NOT NULL DEFAULT 'PLAYER';
ALTER TABLE "PlayerSearch" ADD COLUMN "recruitmentRole" "RecruitmentRole" NOT NULL DEFAULT 'PLAYER';
