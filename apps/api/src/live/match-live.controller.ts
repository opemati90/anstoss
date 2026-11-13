import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common'
import { recordMatchLiveEventSchema, updateMatchLiveStateSchema } from '@anstoss/shared'
import { ClerkAuthGuard } from '../auth/clerk.guard'
import { AgeGateGuard } from '../auth/age-gate.guard'
import { CurrentUser } from '../auth/user.decorator'
import { RateLimit } from '../rate-limit/rate-limit.guard'
import { MatchLiveService } from './match-live.service'

/**
 * Coach-recorded live match for a MATCH event (screen 14 Live-Spiel).
 * Reading needs team access; recording needs event-management rights.
 */
@Controller('clubs/:clubId/events/:eventId/live')
@UseGuards(ClerkAuthGuard, AgeGateGuard)
export class MatchLiveController {
  constructor(private readonly live: MatchLiveService) {}

  /** GET …/live — score, clock, timeline (newest first) and `canRecord`. */
  @Get()
  get(
    @CurrentUser() user: { id: string },
    @Param('clubId') clubId: string,
    @Param('eventId') eventId: string,
  ) {
    return this.live.getState(clubId, eventId, user.id)
  }

  /** PATCH …/live — kick-off, half time, second half, final whistle. */
  @Patch()
  @RateLimit('write')
  updateState(
    @CurrentUser() user: { id: string },
    @Param('clubId') clubId: string,
    @Param('eventId') eventId: string,
    @Body() body: unknown,
  ) {
    return this.live.updateState(clubId, eventId, user.id, updateMatchLiveStateSchema.parse(body))
  }

  /** POST …/live/events — goal, goal against, card or substitution. */
  @Post('events')
  @RateLimit('write')
  record(
    @CurrentUser() user: { id: string },
    @Param('clubId') clubId: string,
    @Param('eventId') eventId: string,
    @Body() body: unknown,
  ) {
    return this.live.recordEvent(clubId, eventId, user.id, recordMatchLiveEventSchema.parse(body))
  }

  /** DELETE …/live/events/:liveEventId — undo a recorded entry. */
  @Delete('events/:liveEventId')
  @RateLimit('write')
  remove(
    @CurrentUser() user: { id: string },
    @Param('clubId') clubId: string,
    @Param('eventId') eventId: string,
    @Param('liveEventId') liveEventId: string,
  ) {
    return this.live.deleteEvent(clubId, eventId, liveEventId, user.id)
  }
}
