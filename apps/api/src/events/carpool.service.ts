import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import type { CarpoolBoard, CarpoolRideItem, CreateCarpoolRideInput } from '@anstoss/shared'
import { TeamAccessDeniedError } from '@anstoss/shared'
import { PrismaService } from '../prisma/prisma.service'
import { PushService } from '../push/push.service'
import { TeamsService } from '../teams/teams.service'
import { activeTeamAccessWhere } from '../teams/active-team-access'
import { eventTitleFor, formatEventDateFor, resolveEventLocale, rideCancelledCopy } from './event-copy'

/** A unique-constraint race (two taps, two devices) is a conflict, not a 500. */
function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'
}

const rideInclude = {
  driver: { select: { id: true, name: true, avatarUrl: true } },
  seatsTaken: {
    orderBy: { createdAt: 'asc' as const },
    select: { userId: true, user: { select: { name: true } } },
  },
}

type RideRecord = {
  id: string
  eventId: string
  seats: number
  departFrom: string | null
  departAt: Date | null
  note: string | null
  createdAt: Date
  driverUserId: string
  driver: { id: string; name: string | null; avatarUrl: string | null }
  seatsTaken: Array<{ userId: string; user: { name: string | null } | null }>
}

/**
 * Fahrgemeinschaft for one event: drivers offer seats, players (or parents
 * for their children) take them. A person rides in at most one car per
 * event, and a driver offers at most one ride per event.
 */
@Injectable()
export class CarpoolService {
  private readonly logger = new Logger(CarpoolService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly teamsService: TeamsService,
    private readonly pushService: PushService,
  ) {}

  /** Tenant-scoped: an event of another club is a 404, never a leak. */
  private async loadEvent(clubId: string, eventId: string) {
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, clubId },
      select: {
        id: true,
        clubId: true,
        teamId: true,
        date: true,
        cancelledAt: true,
        carpoolEnabled: true,
        title: true,
        type: true,
        opponent: true,
        homeAway: true,
        autoTitle: true,
      },
    })
    if (!event) throw new NotFoundException('Event not found')
    return event
  }

  /** L1: offering or taking seats needs the coach to have opened Fahrten. */
  private assertCarpoolOn(event: { carpoolEnabled?: boolean | null }) {
    if (!event.carpoolEnabled) {
      throw new ConflictException('Carpooling is turned off for this event')
    }
  }

  private toItem(ride: RideRecord, viewerId: string): CarpoolRideItem {
    return {
      id: ride.id,
      eventId: ride.eventId,
      driver: {
        id: ride.driver.id,
        name: ride.driver.name ?? '',
        avatarUrl: ride.driver.avatarUrl ?? null,
      },
      seats: ride.seats,
      departFrom: ride.departFrom,
      departAt: ride.departAt?.toISOString() ?? null,
      note: ride.note,
      passengers: ride.seatsTaken.map((seat) => ({
        userId: seat.userId,
        name: seat.user?.name ?? '',
      })),
      isMine: ride.driverUserId === viewerId,
      createdAt: ride.createdAt.toISOString(),
    }
  }

  private async board(eventId: string, viewerId: string): Promise<CarpoolBoard> {
    const rides = (await this.prisma.carpoolRide.findMany({
      where: { eventId },
      include: rideInclude,
      orderBy: { createdAt: 'asc' },
    })) as unknown as RideRecord[]
    return { eventId, rides: rides.map((ride) => this.toItem(ride, viewerId)) }
  }

  private assertOpen(event: { cancelledAt: Date | null; date: Date }) {
    if (event.cancelledAt) throw new BadRequestException('Event is cancelled')
    if (event.date.getTime() < Date.now()) throw new BadRequestException('Event is in the past')
  }

  /** The person taking/leaving a seat: the caller or a child they guard on the team. */
  private async resolveRider(userId: string, teamId: string, childUserId?: string) {
    if (!childUserId || childUserId === userId) return userId
    const link = await this.prisma.guardianRelationship.findFirst({
      where: {
        parentUserId: userId,
        playerUserId: childUserId,
        player: { teamAccess: { some: { teamId, ...activeTeamAccessWhere() } } },
      },
      select: { id: true },
    })
    if (!link) throw new ForbiddenException('No guardian relationship with this player')
    return childUserId
  }

  private async canManage(userId: string, teamId: string) {
    try {
      await this.teamsService.assertEventManagementAccess(userId, teamId)
      return true
    } catch (err) {
      if (err instanceof TeamAccessDeniedError) return false
      throw err
    }
  }

  async list(clubId: string, eventId: string, userId: string): Promise<CarpoolBoard> {
    const event = await this.loadEvent(clubId, eventId)
    await this.teamsService.assertReadableAccess(userId, event.teamId)
    return this.board(event.id, userId)
  }

  async offer(
    clubId: string,
    eventId: string,
    userId: string,
    input: CreateCarpoolRideInput,
  ): Promise<CarpoolRideItem> {
    const event = await this.loadEvent(clubId, eventId)
    await this.teamsService.assertReadableAccess(userId, event.teamId)
    this.assertOpen(event)
    this.assertCarpoolOn(event)

    const existing = await this.prisma.carpoolRide.findFirst({
      where: { eventId, driverUserId: userId },
      select: { id: true },
    })
    if (existing) throw new ConflictException('You already offer a ride for this event')

    try {
      const ride = (await this.prisma.carpoolRide.create({
        data: {
          clubId: event.clubId,
          eventId,
          driverUserId: userId,
          seats: input.seats,
          departFrom: input.departFrom?.trim() || null,
          departAt: input.departAt ? new Date(input.departAt) : null,
          note: input.note?.trim() || null,
        },
        include: rideInclude,
      })) as unknown as RideRecord
      return this.toItem(ride, userId)
    } catch (err) {
      // L4: a double tap passed the check above twice; @@unique caught it.
      if (isUniqueViolation(err)) {
        throw new ConflictException('You already offer a ride for this event')
      }
      throw err
    }
  }

  async remove(clubId: string, eventId: string, rideId: string, userId: string) {
    const event = await this.loadEvent(clubId, eventId)
    await this.teamsService.assertReadableAccess(userId, event.teamId)
    const ride = await this.prisma.carpoolRide.findFirst({
      where: { id: rideId, eventId },
      select: {
        id: true,
        driverUserId: true,
        driver: { select: { name: true } },
        seatsTaken: { select: { userId: true } },
      },
    })
    if (!ride) throw new NotFoundException('Ride not found')
    if (ride.driverUserId !== userId && !(await this.canManage(userId, event.teamId))) {
      throw new ForbiddenException('Only the driver can withdraw this ride')
    }
    await this.prisma.carpoolRide.delete({ where: { id: ride.id } })
    // L3: whoever had a seat has to find another car; tell them (and the
    // parents of a child rider). Fire-and-forget: the withdrawal stands.
    const riderIds = (ride.seatsTaken ?? [])
      .map((seat: { userId: string }) => seat.userId)
      .filter((id: string) => id !== userId)
    if (riderIds.length > 0 && event.date.getTime() > Date.now()) {
      void this.notifyRideCancelled(event, ride.driver?.name ?? '', riderIds).catch((err) => {
        this.logger.warn(
          `Ride-cancelled push failed for event ${event.id}: ${
            err instanceof Error ? err.message : 'unknown error'
          }`,
        )
      })
    }
    return this.board(event.id, userId)
  }

  private async notifyRideCancelled(
    event: Awaited<ReturnType<CarpoolService['loadEvent']>>,
    driverName: string,
    riderIds: string[],
  ) {
    const guardians = (await this.prisma.guardianRelationship.findMany({
      where: { playerUserId: { in: riderIds } },
      select: {
        parentUserId: true,
        playerUserId: true,
        childName: true,
        player: { select: { name: true } },
      },
    })) as Array<{
      parentUserId: string
      playerUserId: string | null
      childName: string | null
      player?: { name: string | null } | null
    }>
    const recipients = [
      ...riderIds.map((id) => ({ userId: id, childName: null as string | null })),
      ...(guardians ?? [])
        .filter((row) => row.parentUserId !== row.playerUserId)
        .map((row) => ({
          userId: row.parentUserId,
          childName: (row.player?.name || row.childName || '').trim().split(/\s+/)[0] || null,
        })),
    ]
    const users = await this.prisma.user.findMany({
      where: { id: { in: Array.from(new Set(recipients.map((r) => r.userId))) } },
      select: { id: true, preferredLanguage: true },
    })
    const localeOf = new Map(
      (users ?? []).map((u: { id: string; preferredLanguage: string | null }) => [
        u.id,
        resolveEventLocale(u.preferredLanguage),
      ]),
    )
    const payload = {
      type: 'event_carpool',
      eventId: event.id,
      clubId: event.clubId,
      url: `anstoss:///event-detail?eventId=${event.id}&tab=rides`,
    }
    await Promise.all(
      recipients.map((recipient) => {
        const locale = localeOf.get(recipient.userId) ?? 'de'
        const copy = rideCancelledCopy(locale, {
          driverName: driverName.trim().split(/\s+/)[0] || driverName,
          eventTitle: eventTitleFor(event, locale),
          date: formatEventDateFor(event.date, locale),
          childName: recipient.childName,
        })
        return this.pushService.sendToUser(recipient.userId, copy.title, copy.body, payload, {
          clubId: event.clubId,
          category: 'events',
        })
      }),
    )
  }

  async takeSeat(
    clubId: string,
    eventId: string,
    rideId: string,
    userId: string,
    childUserId?: string,
  ): Promise<CarpoolBoard> {
    const event = await this.loadEvent(clubId, eventId)
    await this.teamsService.assertReadableAccess(userId, event.teamId)
    this.assertOpen(event)
    this.assertCarpoolOn(event)
    const riderId = await this.resolveRider(userId, event.teamId, childUserId)

    // M1: two riders racing for the last seat, or one rider tapping two cars
    // at once, must not overbook. Inside the transaction we take (1) an
    // advisory lock per rider and event, so one person is only ever booking
    // one car at a time, then (2) a row lock on the ride, so the seat count
    // read below is the one we write against.
    await this.prisma.$transaction(async (tx) => {
      // $executeRaw: pg_advisory_xact_lock returns void, which $queryRaw
      // cannot deserialize.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`carpool:${eventId}:${riderId}`}))`
      await tx.$queryRaw`SELECT "id" FROM "CarpoolRide" WHERE "id" = ${rideId} AND "eventId" = ${eventId} FOR UPDATE`
      const ride = await tx.carpoolRide.findFirst({
        where: { id: rideId, eventId },
        select: {
          id: true,
          seats: true,
          driverUserId: true,
          seatsTaken: { select: { userId: true } },
        },
      })
      if (!ride) throw new NotFoundException('Ride not found')
      if (ride.driverUserId === riderId) {
        throw new BadRequestException('Drivers cannot take a seat in their own car')
      }
      if (ride.seatsTaken.some((seat: { userId: string }) => seat.userId === riderId)) return
      if (ride.seatsTaken.length >= ride.seats) throw new ConflictException('Ride is full')

      // One car per person per event: taking this seat frees any other one.
      await tx.carpoolSeat.deleteMany({
        where: { userId: riderId, ride: { eventId }, rideId: { not: ride.id } },
      })
      try {
        await tx.carpoolSeat.create({
          data: { clubId: event.clubId, rideId: ride.id, userId: riderId },
        })
      } catch (err) {
        if (isUniqueViolation(err)) throw new ConflictException('Seat already taken')
        throw err
      }
    })

    return this.board(event.id, userId)
  }

  async leaveSeat(
    clubId: string,
    eventId: string,
    rideId: string,
    userId: string,
    childUserId?: string,
  ): Promise<CarpoolBoard> {
    const event = await this.loadEvent(clubId, eventId)
    await this.teamsService.assertReadableAccess(userId, event.teamId)
    const riderId = await this.resolveRider(userId, event.teamId, childUserId)
    const ride = await this.prisma.carpoolRide.findFirst({
      where: { id: rideId, eventId },
      select: { id: true },
    })
    if (!ride) throw new NotFoundException('Ride not found')
    await this.prisma.carpoolSeat.deleteMany({ where: { rideId: ride.id, userId: riderId } })
    return this.board(event.id, userId)
  }
}
