import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { TeamsService } from '../teams/teams.service'
import { EventsService } from './events.service'
import { lockAvailabilityAuthority, lockAvailabilityEvent, lockAvailabilityLifecycles } from './availability-policy'
import { launchParticipantWhere } from '../auth/launch-access-policy'

export type CoachAttendanceStatus = 'PRESENT' | 'ABSENT' | 'UNKNOWN'

/** Separate coach observation; never modifies player RSVP or self check-in. */
@Injectable()
export class CoachAttendanceService {
  constructor(private readonly prisma: PrismaService, private readonly teams: TeamsService, private readonly events: EventsService) {}

  async list(clubId: string, eventId: string, actorId: string) {
    const event = await this.prisma.event.findFirst({ where: { id: eventId, clubId }, select: { teamId: true } })
    if (!event) throw new NotFoundException('Event not found')
    await this.teams.assertEventManagementAccess(actorId, event.teamId)
    return this.prisma.coachAttendance.findMany({ where: { eventId, user: launchParticipantWhere() },
      select: { userId: true, status: true, actorId: true, updatedAt: true, version: true } })
  }

  async record(clubId: string, eventId: string, actorId: string, userId: string, status: CoachAttendanceStatus, expectedVersion: number | null, operationId: string) {
    const event = await this.prisma.event.findFirst({ where: { id: eventId, clubId }, select: { teamId: true } })
    if (!event) throw new NotFoundException('Event not found')
    await this.teams.assertEventManagementAccess(actorId, event.teamId)
    return this.prisma.$transaction(async (tx) => {
      await lockAvailabilityLifecycles(tx, [actorId, userId])
      const current = await lockAvailabilityEvent(tx, eventId, clubId)
      if (current.teamId !== event.teamId) throw new BadRequestException('Event is unavailable')
      for (const id of [...new Set([actorId, userId])].sort()) {
        await lockAvailabilityAuthority(tx, clubId, current.teamId, id)
      }
      await this.teams.assertEventManagementAccess(actorId, current.teamId)
      // An operation UUID is global across applied and rejected receipts.
      // Keep both tables serialized before testing either one.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`coach-attendance:${operationId}`}))`
      const prior = await tx.coachAttendanceChange.findUnique({ where: { operationId } })
      if (prior) {
        if (prior.eventId !== eventId || prior.userId !== userId || prior.actorId !== actorId || prior.status !== status || prior.expectedVersion !== expectedVersion) {
          throw new ConflictException('Attendance operation does not match the original request')
        }
        // The target may have left since the write. A receipt confirms the
        // operation without disclosing the former member's current record.
        return { settled: true }
      }
      const rejection = await tx.coachAttendanceRejection.findUnique({ where: { operationId } })
      if (rejection) {
        if (rejection.eventId !== eventId || rejection.actorId !== actorId) throw new ConflictException('Attendance operation unavailable')
        return { settled: true, rejected: true }
      }
      const reject = async () => {
        // No target identity or attendance details belong in this barrier.
        // Never evict a barrier to make room: an older request may still replay.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`attendance-rejection-quota:${actorId}`}))`
        const count = await tx.coachAttendanceRejection.count({ where: { actorId } })
        if (count >= 10_000) throw new ServiceUnavailableException('Attendance recovery capacity reached')
        await tx.coachAttendanceRejection.create({ data: { operationId, eventId, actorId } })
        return { settled: true as const, rejected: true as const }
      }
      if (current.cancelledAt || current.archivedAt || new Date(current.date).getTime() > Date.now()) return reject()
      try {
        await this.events.assertCurrentPlayerEligibility(tx, clubId, current.teamId, eventId, userId)
      } catch (error) {
        if (error instanceof ForbiddenException || error instanceof BadRequestException) return reject()
        throw error
      }
      const existing = await tx.coachAttendance.findUnique({ where: { eventId_userId: { eventId, userId } } })
      if ((existing?.version ?? null) !== expectedVersion) {
        throw new ConflictException('Attendance changed. Reload before saving.')
      }
      const result = await tx.coachAttendance.upsert({
        where: { eventId_userId: { eventId, userId } },
        create: { eventId, userId, status, actorId }, update: { status, actorId, version: { increment: 1 } },
      })
      await tx.coachAttendanceChange.create({ data: { eventId, userId, actorId, previous: existing?.status ?? null, status, operationId, expectedVersion } })
      return result
    })
  }
}
