import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common'
import { EventsService } from './events.service'
import { ClerkAuthGuard } from '../auth/clerk.guard'
import { RolesGuard } from '../auth/roles.guard'
import { RequireRole } from '../auth/roles.guard'
import { CurrentUser } from '../auth/user.decorator'
import { RateLimit } from '../rate-limit/rate-limit.guard'
import {
  createEventSchema,
  updateRsvpSchema,
  MembershipRole,
} from '@anstoss/shared'

@Controller('clubs/:clubId/events')
@UseGuards(ClerkAuthGuard, RolesGuard)
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  /**
   * POST /clubs/:clubId/events — create event (coach+ only).
   */
  @Post()
  @RequireRole(MembershipRole.COACH)
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
  async listUpcoming(@Query('teamId') teamId: string) {
    return this.eventsService.listUpcoming(teamId)
  }

  /**
   * GET /clubs/:clubId/events/:eventId — event details + RSVPs.
   */
  @Get(':eventId')
  async getEvent(@Param('eventId') eventId: string) {
    return this.eventsService.findById(eventId)
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
  async getRsvpSummary(@Param('eventId') eventId: string) {
    return this.eventsService.getRsvpSummary(eventId)
  }
}
