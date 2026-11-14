-- Keep legacy six-month rows intact while enabling the current monthly offering.
ALTER TYPE "PlanInterval" ADD VALUE IF NOT EXISTS 'MONTHLY';
