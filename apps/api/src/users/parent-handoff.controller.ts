import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common'
import { redeemParentHandoffSchema } from '@anstoss/shared'
import { ClerkAuthGuard } from '../auth/clerk.guard'
import { CurrentUser } from '../auth/user.decorator'
import { RateLimit } from '../rate-limit/rate-limit.guard'
import { ParentHandoffService } from './parent-handoff.service'

@Controller('parent-handoff')
@UseGuards(ClerkAuthGuard)
export class ParentHandoffController {
  constructor(private readonly service: ParentHandoffService) {}

  /** GET /parent-handoff/:code/team/:joinCode — preview team + open slots. */
  @Get(':code/team/:joinCode')
  @RateLimit('read')
  getTeamForCode(
    @CurrentUser() user: { id: string },
    @Param('code') code: string,
    @Param('joinCode') joinCode: string,
  ) {
    return this.service.getTeamForCode(user.id, code, joinCode)
  }

  /** GET /parent-handoff/:code — preview whom this code sets up. */
  @Get(':code')
  @RateLimit('read')
  getByCode(@CurrentUser() user: { id: string }, @Param('code') code: string) {
    return this.service.getByCode(user.id, code)
  }

  /** POST /parent-handoff/redeem — create the child's managed sub-profile. */
  @Post('redeem')
  @RateLimit('write')
  redeem(@CurrentUser() user: { id: string }, @Body() body: unknown) {
    const data = redeemParentHandoffSchema.parse(body)
    return this.service.redeem(user.id, data)
  }
}
