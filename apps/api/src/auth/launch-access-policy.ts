import { ForbiddenException } from '@nestjs/common'
import { LAUNCH_FEATURES } from '@anstoss/shared'
import { getAge } from './age-gate.service'
import type { Prisma } from '@prisma/client'

export function requireYouthParticipation() {
  if (!LAUNCH_FEATURES.youthParticipation) throw new ForbiddenException({
    code: 'FEATURE_COMING_SOON',
    message: 'Youth and guardian features are coming soon. Anstoss currently supports adults aged 18 and over.',
  })
}

export function assertLaunchBirthDate(dob: Date) {
  if (!LAUNCH_FEATURES.youthParticipation && (!Number.isFinite(dob.getTime()) || getAge(dob) < LAUNCH_FEATURES.minimumAccountAge)) {
    throw new ForbiddenException({ code: 'LAUNCH_ADULT_ONLY', message: 'Anstoss currently supports adults aged 18 and over.' })
  }
}

export function assertLaunchRosterBirthDate(value?: string | Date | null) {
  if (LAUNCH_FEATURES.youthParticipation) return
  if (!value) throw new ForbiddenException({ code: 'DOB_REQUIRED', message: 'Roster records need an adult date of birth in this release. Use invitations so players can complete their own details.' })
  assertLaunchBirthDate(new Date(value))
}

export async function assertLaunchParticipant(client: Pick<Prisma.TransactionClient, 'user'>, userId: string) {
  if (LAUNCH_FEATURES.youthParticipation) return
  const user = await client.user.findFirst({ where: { id: userId, deletedAt: null }, select: { dateOfBirth: true } })
  if (!user?.dateOfBirth) throw new ForbiddenException({ code: 'DOB_REQUIRED', message: 'An adult date of birth is required before participating.' })
  assertLaunchBirthDate(user.dateOfBirth)
}

/** Operational lists omit youth/unknown-age records; exports are not filtered. */
export function launchParticipantWhere(now = new Date()): Prisma.UserWhereInput {
  if (LAUNCH_FEATURES.youthParticipation) return { deletedAt: null }
  const cutoff = new Date(now)
  const month = cutoff.getMonth()
  cutoff.setFullYear(cutoff.getFullYear() - LAUNCH_FEATURES.minimumAccountAge)
  if (cutoff.getMonth() !== month) cutoff.setDate(0)
  cutoff.setHours(23, 59, 59, 999)
  return { deletedAt: null, dateOfBirth: { lte: cutoff } }
}

/** Preserve independent adult player/staff roles even on a PARENT membership. */
export function launchClubParticipantWhere(clubId: string, now = new Date()): Prisma.UserWhereInput {
  if (LAUNCH_FEATURES.youthParticipation) return { deletedAt: null }
  return { ...launchParticipantWhere(now), memberships: { some: { clubId } }, OR: [
    { memberships: { some: { clubId, role: { not: 'PARENT' } } } },
    { teamAccess: { some: { clubId, role: { not: 'PARENT' }, phase: 'FULL', status: 'ACTIVE',
      OR: [{ loanEndDate: null }, { loanEndDate: { gt: now } }] } } },
  ] }
}
