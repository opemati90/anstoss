import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common'
import { bulkRosterSlotsInputSchema } from '@anstoss/shared'
import { ClerkAuthGuard } from '../auth/clerk.guard'
import { CurrentUser } from '../auth/user.decorator'
import { RateLimit } from '../rate-limit/rate-limit.guard'
import { RosterSlotsService } from './roster-slots.service'

@Controller('clubs/:clubId/teams/:teamId/roster-slots')
@UseGuards(ClerkAuthGuard)
export class RosterSlotsController {
  constructor(private readonly service: RosterSlotsService) {}

  @Get()
  @RateLimit('read')
  list(
    @Param('clubId') clubId: string,
    @Param('teamId') teamId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.service.list(clubId, teamId, user.id)
  }

  @Post()
  @RateLimit('write')
  bulkCreate(
    @Param('clubId') clubId: string,
    @Param('teamId') teamId: string,
    @CurrentUser() user: { id: string },
    @Body() body: unknown,
  ) {
    const parsed = bulkRosterSlotsInputSchema.parse(body)
    return this.service.bulkCreate(clubId, teamId, user.id, parsed)
  }

  @Post(':slotId/claim')
  @RateLimit('write')
  claim(
    @Param('clubId') clubId: string,
    @Param('teamId') teamId: string,
    @Param('slotId') slotId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.service.claim(clubId, teamId, slotId, user.id)
  }
}
