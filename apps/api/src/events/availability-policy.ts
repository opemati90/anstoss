import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common'
import type { Prisma, Event } from '@prisma/client'

/** Same account/loan lifecycle lock, acquired before any event or row lock. */
export async function lockAvailabilityLifecycles(tx: Prisma.TransactionClient, userIds: string[]) {
  for (const id of [...new Set(userIds)].sort()) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${id}))`
  }
}

/** Event-row locking is shared by policy writes and RSVP persistence. */
export async function lockAvailabilityEvent(tx: Prisma.TransactionClient, id: string, clubId: string) {
  const rows = await tx.$queryRaw<Event[]>`SELECT * FROM "Event" WHERE "id" = ${id} AND "clubId" = ${clubId} FOR UPDATE`
  const event = rows[0]
  if (!event) throw new NotFoundException('Event not found')
  return event
}

/** Hold authority rows until commit, including guardian linkage where used. */
export async function lockAvailabilityAuthority(tx: Prisma.TransactionClient, clubId: string, teamId: string, userId: string, guardianId?: string) {
  for (const actor of [...new Set([userId, guardianId].filter((id): id is string => Boolean(id)))].sort()) {
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${actor} FOR SHARE`
    await tx.$queryRaw`SELECT "id" FROM "Membership" WHERE "clubId" = ${clubId} AND "userId" = ${actor} ORDER BY "id" FOR SHARE`
    await tx.$queryRaw`SELECT "id" FROM "TeamAccess" WHERE "clubId" = ${clubId} AND "teamId" = ${teamId} AND "userId" = ${actor} ORDER BY "id" FOR SHARE`
  }
  if (guardianId) {
    const links = await tx.$queryRaw<Array<{ id: string; clubId: string }>>`SELECT "id", "clubId" FROM "GuardianRelationship" WHERE "clubId" = ${clubId} AND "parentUserId" = ${guardianId} AND "playerUserId" = ${userId} ORDER BY "id" FOR SHARE`
    if (!links.some((link) => link.clubId === clubId)) throw new BadRequestException('Guardian relationship unavailable')
  }
}

export function assertAvailabilityOpen(event: {
  cancelledAt: Date | null; archivedAt?: Date | null; rsvpLocked?: boolean; rsvpDeadline?: Date | null; date: Date
}, now = new Date()) {
  if (event.cancelledAt) throw new BadRequestException('Cannot RSVP to a cancelled event')
  if (event.archivedAt) throw new BadRequestException('Cannot RSVP to an archived event')
  if (event.rsvpLocked || (event.rsvpDeadline && Math.min(event.rsvpDeadline.getTime(), event.date.getTime()) <= now.getTime())) {
    throw new ConflictException({ code: 'RSVP_LOCKED', message: 'Availability is closed. Contact your coach to update your response.' })
  }
}

export function validateAvailabilityDeadline(deadline: Date | null, startsAt: Date, now = new Date()) {
  if (deadline && (!Number.isFinite(deadline.getTime()) || deadline <= now || deadline > startsAt)) {
    throw new BadRequestException('Availability deadline must be in the future and no later than the event start')
  }
}
