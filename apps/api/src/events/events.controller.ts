import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common'
import { EventsService } from './events.service'
import { ClerkAuthGuard } from '../auth/clerk.guard'
import { CurrentUser } from '../auth/user.decorator'
import { RateLimit } from '../rate-limit/rate-limit.guard'
import {
  createEventSchema,
  updateEventSchema,
  updateRsvpSchema,
  MembershipRole,
} from '@anstoss/shared'
import { RequireRole } from '../auth/roles.guard'

@Controller('clubs/:clubId/events')
@UseGuards(ClerkAuthGuard)
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
   */
  @Get()
  async listUpcoming(
    @CurrentUser() user: { id: string },
    @Query('teamId') teamId: string,
  ) {
    return this.eventsService.listUpcoming(teamId, user.id)
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
  @RequireRole(MembershipRole.COACH)
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
  @RequireRole(MembershipRole.COACH)
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
    const { status } = updateRsvpSchema.parse(body)
    return this.eventsService.upsertRsvp(eventId, user.id, status)
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
}
