import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common'
import { ClerkAuthGuard } from '../auth/clerk.guard'
import { AgeGateGuard } from '../auth/age-gate.guard'
import { CurrentUser } from '../auth/user.decorator'
import {
  EntitlementGuard,
  RequireFeature,
} from '../billing/entitlement.guard'
import { MotmService } from './motm.service'

@Controller()
@UseGuards(ClerkAuthGuard, AgeGateGuard)
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

  /**
   * Read-only MOTM archive for a club, scoped to a season. Gated behind
   * the `motm_archive` entitlement (Anstoss Plus). Without a `season`
   * query param the service defaults to the current German season
   * (Aug → May).
   */
  @Get('clubs/:clubId/motm/archive')
  @UseGuards(EntitlementGuard)
  @RequireFeature('motm_archive')
  async archive(
    @CurrentUser() user: { id: string },
    @Param('clubId') clubId: string,
    @Query('season') season?: string,
  ) {
    return this.motmService.getArchive(user.id, clubId, season)
  }
}
