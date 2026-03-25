import { Controller, Get, Param } from '@nestjs/common'
import { PublicService } from './public.service'

@Controller()
export class PublicController {
  constructor(private readonly publicService: PublicService) {}

  @Get('public/platform')
  getPlatformInfo() {
    return this.publicService.getPlatformInfo()
  }

  @Get('public/invites/:code')
  async getInvite(@Param('code') code: string) {
    return this.publicService.getInvite(code)
  }

  @Get('clubs/:clubId/public/summary')
  async getClubSummary(@Param('clubId') clubId: string) {
    return this.publicService.getClubSummary(clubId)
  }
}
