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
  createEventSchema,
  eventFilterSchema,
  updateEventSchema,
  updateRsvpSchema,
  proxyRsvpSchema,
  toggleEventReminderSchema,
} from '@anstoss/shared'

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

    return this.eventsService.listUpcoming(teamId!, user.id, filters)
  }

  /**
   * GET /clubs/:clubId/events/:eventId — event details + RSVPs.
   */
  @Get(':eventId')
  async getEvent(
    @CurrentUser() user: { id: string },
    @Param('eventId') eventId: string,
  ) {
    return this.eventsService.findById(eventId, user.id)
  }

  /**
   * PATCH /clubs/:clubId/events/:eventId — update event (creator only).
   */
  @Patch(':eventId')
  @RateLimit('write')
  async update(
    @CurrentUser() user: { id: string },
    @Param('eventId') eventId: string,
    @Body() body: unknown,
  ) {
    const data = updateEventSchema.parse(body)
    return this.eventsService.update(eventId, user.id, {
      title: data.title,
      type: data.type,
      date: data.date ? new Date(data.date) : undefined,
      location: data.location,
      notes: data.notes,
    })
  }

  /**
   * DELETE /clubs/:clubId/events/:eventId — cancel event (creator only).
   */
  @Delete(':eventId')
  @RateLimit('write')
  async cancel(
    @CurrentUser() user: { id: string },
    @Param('eventId') eventId: string,
  ) {
    return this.eventsService.cancel(eventId, user.id)
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
    const { status, reason } = updateRsvpSchema.parse(body)
    return this.eventsService.upsertRsvp(eventId, user.id, status, reason)
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
    const { status, reason, childUserId } = proxyRsvpSchema.parse(body)
    return this.eventsService.upsertRsvpProxy(eventId, user.id, childUserId, status, reason)
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
