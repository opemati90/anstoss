import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common'
import { ClerkAuthGuard } from '../auth/clerk.guard'
import { CurrentUser } from '../auth/user.decorator'
import { MotmService } from './motm.service'

@Controller()
@UseGuards(ClerkAuthGuard)
export class MotmController {
  constructor(private readonly motmService: MotmService) {}

  @Get('fixtures/:fixtureId/motm')
  async tally(
    @CurrentUser() user: { id: string },
    @Param('fixtureId') fixtureId: string,
  ) {
    return this.motmService.getTally(user.id, fixtureId)
  }

  @Post('fixtures/:fixtureId/motm/vote')
  async vote(
    @CurrentUser() user: { id: string },
    @Param('fixtureId') fixtureId: string,
    @Body() body: { userId: string },
  ) {
    return this.motmService.vote(user.id, fixtureId, body.userId)
  }
}
