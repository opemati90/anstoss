import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common'
import { EventsService } from './events.service'
import { ClerkAuthGuard } from '../auth/clerk.guard'
import { AgeGateGuard } from '../auth/age-gate.guard'
import { CurrentUser } from '../auth/user.decorator'
import { RateLimit } from '../rate-limit/rate-limit.guard'
import {
  createEventSeriesSchema,
  createEventSchema,
  eventFilterSchema,
  updateEventSchema,
  cancelEventSchema,
  updateRsvpSchema,
  proxyRsvpSchema,
  toggleEventReminderSchema,
  updateEventSquadSchema,
  saveEventLineupSchema,
} from '@anstoss/shared'

/** Logistics fields shared by create / series / update; ISO strings → Date. */
function logisticsFrom(data: {
  meetingAt?: string | null
  meetingPoint?: string | null
  opponent?: string | null
  homeAway?: 'HOME' | 'AWAY' | null
  carpoolEnabled?: boolean
  durationMin?: number | null
}) {
  return {
    meetingAt:
      data.meetingAt === undefined ? undefined : data.meetingAt ? new Date(data.meetingAt) : null,
    meetingPoint: data.meetingPoint,
    opponent: data.opponent,
    homeAway: data.homeAway,
    carpoolEnabled: data.carpoolEnabled,
    durationMin: data.durationMin,
  }
}

@Controller('clubs/:clubId/events')
@UseGuards(ClerkAuthGuard, AgeGateGuard)
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  /**
   * POST /clubs/:clubId/events — create event (coach+ only).
   */
  @Post()
  @RateLimit('write')
  async create(
    @CurrentUser() user: { id: string },
    @Param('clubId') clubId: string,
    @Body() body: unknown,
  ) {
    const data = createEventSchema.parse(body)

    return this.eventsService.create({
      title: data.title,
      type: data.type,
      date: new Date(data.date),
      location: data.location,
      notes: data.notes,
      teamId: data.teamId,
      createdById: user.id,
      clubId,
      ...logisticsFrom(data),
    })
  }

  /**
   * GET /clubs/:clubId/events?teamId=X — list upcoming events.
   * When mine=1 and teamId is omitted, returns events from ALL of the
   * caller's active teams in the club (multi-team home view, up to 4,
   * includes team badge metadata). Single-team path is unchanged.
   */
  @Get()
  async listUpcoming(
    @CurrentUser() user: { id: string },
    @Param('clubId') clubId: string,
    @Query('teamId') teamId?: string,
    @Query('type') type?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('scope') scope?: string,
    @Query('mine') mine?: string,
    @Query('limit') limit?: string,
  ) {
    const filters = eventFilterSchema.parse({
      type,
      dateFrom,
      dateTo,
      scope,
      mine,
      limit,
    })

    // Multi-team path: mine=1 with no teamId → all user's teams in club
    if (filters.mine && !teamId) {
      return this.eventsService.listUpcomingAllTeams(clubId, user.id, filters)
    }

    if (!teamId) {
      return this.eventsService.listUpcomingManagedClub(clubId, user.id, filters)
    }

    return this.eventsService.listUpcoming(teamId!, user.id, filters)
  }

  /**
   * GET /clubs/:clubId/events/:eventId — event details + RSVPs.
   */
  @Get(':eventId')
  async getEvent(
    @CurrentUser() user: { id: string },
    @Param('clubId') clubId: string,
    @Param('eventId') eventId: string,
  ) {
    return this.eventsService.findById(clubId, eventId, user.id)
  }

  /**
   * PATCH /clubs/:clubId/events/:eventId — update event (any event manager).
   */
  /**
   * POST /clubs/:clubId/events/series — a recurring event. Body is the
   * create payload plus `repeat: { intervalWeeks, until }`.
   */
  @Post('series')
  @RateLimit('write')
  async createSeries(
    @CurrentUser() user: { id: string },
    @Param('clubId') clubId: string,
    @Body() body: unknown,
  ) {
    const data = createEventSeriesSchema.parse(body)
    return this.eventsService.createSeries({
      title: data.title,
      type: data.type,
      date: new Date(data.date),
      location: data.location,
      notes: data.notes,
      teamId: data.teamId,
      createdById: user.id,
      clubId,
      intervalWeeks: data.repeat.intervalWeeks,
      until: new Date(data.repeat.until),
      weekdays: data.repeat.weekdays,
      ...logisticsFrom(data),
    })
  }

  @Patch(':eventId')
  @RateLimit('write')
  async update(
    @CurrentUser() user: { id: string },
    @Param('clubId') clubId: string,
    @Param('eventId') eventId: string,
    @Body() body: unknown,
  ) {
    const data = updateEventSchema.parse(body)
    return this.eventsService.update(
      eventId,
      user.id,
      {
        title: data.title,
        type: data.type,
        date: data.date ? new Date(data.date) : undefined,
        location: data.location,
        notes: data.notes,
        ...logisticsFrom(data),
      },
      data.scope ?? 'this',
      clubId,
    )
  }

  /**
   * DELETE /clubs/:clubId/events/:eventId — cancel event (any event manager).
   * Accepts an optional `{ reason }` body that is shown to the squad.
   */
  @Delete(':eventId')
  @RateLimit('write')
  async cancel(
    @CurrentUser() user: { id: string },
    @Param('clubId') clubId: string,
    @Param('eventId') eventId: string,
    @Body() body: unknown,
  ) {
    const data = cancelEventSchema.parse(body ?? {})
    return this.eventsService.cancel(eventId, user.id, data.reason, data.scope ?? 'this', clubId)
  }

  /**
   * PUT /clubs/:clubId/events/:eventId/rsvp — upsert RSVP.
   */
  @Put(':eventId/rsvp')
  @RateLimit('write')
  async upsertRsvp(
    @CurrentUser() user: { id: string },
    @Param('eventId') eventId: string,
    @Body() body: unknown,
  ) {
    const { status, reason, note, childUserId } = updateRsvpSchema.parse(body)
    return this.eventsService.upsertRsvp(eventId, user.id, status, reason, note, childUserId)
  }

  /**
   * PUT /clubs/:clubId/events/:eventId/rsvp-proxy — parent RSVPs on behalf of child.
   */
  @Put(':eventId/rsvp-proxy')
  @RateLimit('write')
  async upsertRsvpProxy(
    @CurrentUser() user: { id: string },
    @Param('clubId') clubId: string,
    @Param('eventId') eventId: string,
    @Body() body: unknown,
  ) {
    const { status, reason, note, childUserId } = proxyRsvpSchema.parse(body)
    return this.eventsService.upsertRsvpProxy(eventId, user.id, childUserId, status, reason, note)
  }

  /**
   * PUT /clubs/:clubId/events/:eventId/reminder — toggle event reminder.
   */
  @Put(':eventId/reminder')
  @RateLimit('write')
  async toggleReminder(
    @CurrentUser() user: { id: string },
    @Param('eventId') eventId: string,
    @Body() body: unknown,
  ) {
    const { enabled } = toggleEventReminderSchema.parse(body)
    return this.eventsService.toggleReminder(eventId, user.id, enabled)
  }

  /**
   * GET /clubs/:clubId/events/:eventId/rsvp-summary — counts by status.
   */
  @Get(':eventId/rsvp-summary')
  async getRsvpSummary(
    @CurrentUser() user: { id: string },
    @Param('eventId') eventId: string,
  ) {
    return this.eventsService.getRsvpSummary(eventId, user.id)
  }

  /**
   * POST /clubs/:clubId/events/:eventId/remind-rsvp — send push reminders
   * to all team members who haven't RSVPed. 24h rate limit per event.
   * Requires event management access (OWNER, ADMIN, COACH).
   */
  @Post(':eventId/remind-rsvp')
  @HttpCode(200)
  @RateLimit('write')
  remindRsvp(
    @Param('clubId') clubId: string,
    @Param('eventId') eventId: string,
    @CurrentUser() user: { id: string },
  ): Promise<{ sent: number; nextAvailableAt: string }> {
    return this.eventsService.remindRsvp(clubId, eventId, user.id)
  }

  /**
   * POST /clubs/:clubId/events/:eventId/check-in — player self check-in.
   * Idempotent — second tap returns existing record.
   * Window: 2 hours before start → 3 hours after start.
   */
  @Post(':eventId/check-in')
  @HttpCode(200)
  @RateLimit('write')
  checkIn(
    @Param('clubId') clubId: string,
    @Param('eventId') eventId: string,
    @CurrentUser() user: { id: string },
  ): Promise<{ checkedInAt: string }> {
    return this.eventsService.checkIn(clubId, eventId, user.id)
  }

  /**
   * GET /clubs/:clubId/events/:eventId/squad — the Kader (event managers).
   */
  @Get(':eventId/squad')
  getSquad(
    @CurrentUser() user: { id: string },
    @Param('clubId') clubId: string,
    @Param('eventId') eventId: string,
  ) {
    return this.eventsService.getSquad(clubId, eventId, user.id)
  }

  /**
   * PUT /clubs/:clubId/events/:eventId/squad — set the Kader; `publish`
   * notifies the players who are newly in it.
   */
  @Put(':eventId/squad')
  @RateLimit('write')
  updateSquad(
    @CurrentUser() user: { id: string },
    @Param('clubId') clubId: string,
    @Param('eventId') eventId: string,
    @Body() body: unknown,
  ) {
    const input = updateEventSquadSchema.parse(body)
    return this.eventsService.updateSquad(clubId, eventId, user.id, input)
  }

  /**
   * GET /clubs/:clubId/events/:eventId/lineup — the saved Aufstellung or null.
   */
  @Get(':eventId/lineup')
  getLineup(
    @CurrentUser() user: { id: string },
    @Param('clubId') clubId: string,
    @Param('eventId') eventId: string,
  ) {
    return this.eventsService.getLineup(clubId, eventId, user.id)
  }

  /**
   * PUT /clubs/:clubId/events/:eventId/lineup — save the Aufstellung.
   */
  @Put(':eventId/lineup')
  @RateLimit('write')
  saveLineup(
    @CurrentUser() user: { id: string },
    @Param('clubId') clubId: string,
    @Param('eventId') eventId: string,
    @Body() body: unknown,
  ) {
    const input = saveEventLineupSchema.parse(body)
    return this.eventsService.saveLineup(clubId, eventId, user.id, input)
  }

  /**
   * GET /clubs/:clubId/events/:eventId/attendance — attendance report.
   * Requires event management access (OWNER, ADMIN, COACH).
   */
  @Get(':eventId/attendance')
  getAttendance(
    @Param('clubId') clubId: string,
    @Param('eventId') eventId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.eventsService.getAttendance(clubId, eventId, user.id)
  }
}
